/**
 * AI 거래 분류 — Claude 호출과 검증을 담당한다.
 *
 * ── 이 서비스가 지키는 계약 ─────────────────────────────────────────────────
 * **절대 throw 하지 않는다.** 무슨 일이 있어도 Map 을 돌려주고, 최악의 경우 빈 Map 이다.
 * 빈 Map 은 "AI 단계 없음"과 같은 뜻이라 규칙 엔진이 예전 그대로 동작한다.
 * 동기화가 AI 때문에 실패하는 일은 없어야 한다 — 거래 수집은 서비스의 첫 관문이다.
 *
 * ── 호출 단위 ───────────────────────────────────────────────────────────────
 * 거래가 아니라 **정규화 가맹점** 단위다. 424건 → 가맹점 80여 개 → 60개씩 2회 호출.
 * 자세한 이유는 ai-classify-prompt.ts 머리말에 적어 뒀다.
 *
 * ── 이미 아는 것은 묻지 않는다 ───────────────────────────────────────────────
 * 사용자 규칙에 이미 있는 가맹점은 애초에 후보에서 뺀다. 어차피 2순위에서 이기므로
 * 물어봐야 결과가 안 바뀌고 토큰만 쓴다. 거래유형 가드에 걸리는 건(수입·이체·취소)도
 * 같은 이유로 뺀다.
 */
import { Injectable, Logger } from '@nestjs/common';

import { ClaudeService } from '../../ai/claude.service';
import type { TxCategory } from '../../common/constants/tx-category';
import { kstHour } from '../../common/utils/date-kst';
import { AppConfigService } from '../../config/app-config.service';
import {
  AI_CLASSIFY_JSON_SCHEMA,
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  chunkMerchants,
  validateVerdicts,
  type AiClassifyDraft,
  type MerchantForClassification,
} from './ai-classify-prompt';
import type { ClassifiableTransaction } from './rule-engine';

/**
 * 판정 JSON 이 가맹점당 60토큰 남짓이고, claude-opus-5 는 thinking 이 기본 on 이라
 * 그 토큰도 max_tokens 에 포함된다. 잘리면 배치 전체가 버려지므로 넉넉히 잡는다.
 */
const MAX_TOKENS = 16_000;

/**
 * 분류는 "본죽이 뭐 파는 곳인가" 같은 지식 조회에 가깝다.
 * 오래 생각한다고 정답률이 오르지 않고 응답만 느려지므로 추론 강도를 낮춘다.
 * (여행코스 설계는 후보를 견줘야 해서 반대다 — 거기는 기본값을 쓴다.)
 */
const CLASSIFY_EFFORT = 'low' as const;

/**
 * 분류 전용 타임아웃 (ms).
 *
 * 전역 기본값(30초)은 "화면이 멈추면 안 된다"를 기준으로 짧게 잡혀 있는데,
 * 동기화는 이미 로딩 화면이 떠 있는 배치 작업이라 조금 더 기다려도 된다.
 * 오히려 여기서 타임아웃이 나면 SDK 재시도까지 겹쳐 전체가 두 배로 느려진다.
 */
const CLASSIFY_TIMEOUT_MS = 90_000;

/** 거래유형만 보고 분류가 끝나는 건 — 모델에게 물어볼 필요가 없다 */
const GUARDED_TX_TYPES = new Set(['TRANSFER_IN', 'CANCEL']);

export interface AiClassificationOutcome {
  /** 정규화 가맹점명 → 카테고리. 규칙 엔진 컨텍스트에 그대로 꽂는다. */
  categories: Map<string, TxCategory>;
  /** 실제로 Claude 가 판정했는가 */
  usedAi: boolean;
  /** AI 를 못 썼거나 중간에 실패했다면 그 이유 */
  fallbackReason: string | null;
  /** 물어본 가맹점 수 */
  askedCount: number;
  /** 모델이 확신해서 채택된 가맹점 수 */
  acceptedCount: number;
  /** 모델이 "모르겠다"고 해서 규칙 엔진으로 넘긴 가맹점 수 */
  deferredCount: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

function emptyOutcome(reason: string | null): AiClassificationOutcome {
  return {
    categories: new Map(),
    usedAi: false,
    fallbackReason: reason,
    askedCount: 0,
    acceptedCount: 0,
    deferredCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  };
}

@Injectable()
export class AiClassifierService {
  private readonly logger = new Logger(AiClassifierService.name);

  constructor(
    private readonly claude: ClaudeService,
    private readonly config: AppConfigService,
  ) {}

  get enabled(): boolean {
    return this.config.aiClassifyEnabled;
  }

  /**
   * 분류 대상 거래들에서 가맹점 후보를 뽑아 Claude 에 묻는다.
   *
   * @param transactions 이번에 분류할 거래 (정규화 완료 상태)
   * @param alreadyKnown 사용자 규칙이 이미 커버하는 가맹점 — 후보에서 뺀다
   */
  async classifyMerchants(
    transactions: readonly ClassifiableTransaction[],
    alreadyKnown: ReadonlySet<string>,
  ): Promise<AiClassificationOutcome> {
    if (!this.enabled) return emptyOutcome('DISABLED');

    const merchants = buildMerchantProfiles(transactions, alreadyKnown);
    if (merchants.length === 0) return emptyOutcome(null);

    const batches = chunkMerchants(merchants, this.config.aiClassifyBatchSize);
    const categories = new Map<string, TxCategory>();

    let acceptedCount = 0;
    let deferredCount = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let okBatches = 0;
    let firstFailure: string | null = null;

    // 배치를 **동시에** 던진다.
    //
    // 처음에는 분당 한도가 걱정돼 순차로 돌렸는데, 실측해 보니 그쪽이 더 위험했다.
    // 배치 4개가 각 15초면 순차는 60초라 동기화 화면이 1분간 멈춘다. 게다가 한 배치가
    // 타임아웃 나면 SDK 재시도까지 겹쳐 그 뒤 배치들이 줄줄이 밀린다.
    // 동시 요청 서너 개는 어떤 한도에도 걸리지 않고, 벽시계 시간은 가장 느린 배치 하나로 끝난다.
    const startedAt = performance.now();
    const results = await Promise.all(
      batches.map((batch) =>
        this.claude.generateJson<AiClassifyDraft>({
          system: buildClassifySystemPrompt(),
          user: buildClassifyUserPrompt({ merchants: batch }),
          schema: AI_CLASSIFY_JSON_SCHEMA,
          maxTokens: MAX_TOKENS,
          effort: CLASSIFY_EFFORT,
          timeoutMs: CLASSIFY_TIMEOUT_MS,
        }),
      ),
    );
    // 병렬이므로 개별 호출 시간의 합이 아니라 전체 경과가 실제로 기다린 시간이다.
    const latencyMs = Math.round(performance.now() - startedAt);

    for (const [index, result] of results.entries()) {
      const batch = batches[index];

      if (!result.ok) {
        // 배치 하나가 실패해도 나머지는 그대로 쓴다. 절반이라도 AI 분류가 낫다.
        firstFailure ??= result.reason;
        this.logger.warn(
          `AI 분류 배치 실패 (${result.reason}) — 이 배치 ${batch.length}곳은 규칙 엔진으로 넘깁니다.`,
        );
        continue;
      }

      okBatches += 1;
      inputTokens += result.usage.inputTokens;
      outputTokens += result.usage.outputTokens;

      const validated = validateVerdicts(result.data, batch.map((m) => m.normalizedMerchant));
      for (const v of validated.accepted) {
        categories.set(v.normalizedMerchant, v.category as TxCategory);
      }
      acceptedCount += validated.accepted.length;
      deferredCount += validated.lowConfidence.length;

      if (validated.missing.length > 0) {
        this.logger.warn(
          `AI 가 ${validated.missing.length}곳을 빠뜨렸습니다: ${validated.missing.slice(0, 5).join(', ')}`,
        );
      }
      if (validated.unknown.length > 0) {
        // 입력에 없던 가맹점을 지어냈다는 뜻. 프롬프트 튜닝 근거로 남긴다.
        this.logger.warn(
          `AI 가 요청하지 않은 가맹점을 만들어냈습니다: ${validated.unknown.slice(0, 5).join(', ')}`,
        );
      }
    }

    const usedAi = okBatches > 0;
    if (usedAi) {
      this.logger.log(
        `AI 분류 완료: ${merchants.length}곳 중 ${acceptedCount}곳 확정 / ${deferredCount}곳 규칙 위임 ` +
          `(배치 ${okBatches}/${batches.length}, ${latencyMs}ms, in=${inputTokens} out=${outputTokens})`,
      );
    } else {
      this.logger.warn(`AI 분류 전부 실패 (${firstFailure}) — 규칙 엔진으로 진행합니다.`);
    }

    return {
      categories,
      usedAi,
      fallbackReason: usedAi && okBatches === batches.length ? null : firstFailure,
      askedCount: merchants.length,
      acceptedCount,
      deferredCount,
      inputTokens,
      outputTokens,
      latencyMs,
    };
  }
}

/**
 * 거래 목록에서 가맹점별 프로필을 만든다 — 순수 로직.
 *
 * 결정론적 순서를 보장한다: 건수 많은 순 → 정규화명 사전순.
 * 순서가 흔들리면 배치 경계가 달라져 같은 데이터인데 다른 결과가 나온다.
 */
export function buildMerchantProfiles(
  transactions: readonly ClassifiableTransaction[],
  alreadyKnown: ReadonlySet<string>,
): MerchantForClassification[] {
  interface Acc {
    normalizedMerchant: string;
    sampleMerchantName: string;
    txCount: number;
    totalAmount: number;
    hourCounts: Map<number, number>;
    mcc: string | null;
  }

  const byMerchant = new Map<string, Acc>();

  for (const tx of transactions) {
    if (GUARDED_TX_TYPES.has(tx.txType)) continue;
    if (tx.normalizedMerchant.length === 0) continue;
    if (alreadyKnown.has(tx.normalizedMerchant)) continue;

    const hour = kstHour(tx.approvedAt);

    const acc = byMerchant.get(tx.normalizedMerchant);
    if (acc) {
      acc.txCount += 1;
      acc.totalAmount += tx.amount;
      acc.hourCounts.set(hour, (acc.hourCounts.get(hour) ?? 0) + 1);
      acc.mcc ??= tx.mcc;
    } else {
      byMerchant.set(tx.normalizedMerchant, {
        normalizedMerchant: tx.normalizedMerchant,
        sampleMerchantName: tx.merchantName,
        txCount: 1,
        totalAmount: tx.amount,
        hourCounts: new Map([[hour, 1]]),
        mcc: tx.mcc,
      });
    }
  }

  return [...byMerchant.values()]
    .sort((a, b) => b.txCount - a.txCount || a.normalizedMerchant.localeCompare(b.normalizedMerchant))
    .map((a) => ({
      normalizedMerchant: a.normalizedMerchant,
      sampleMerchantName: a.sampleMerchantName,
      txCount: a.txCount,
      avgAmount: Math.round(a.totalAmount / a.txCount),
      peakHour: pickPeakHour(a.hourCounts),
      mcc: a.mcc,
    }));
}

/** 결제가 가장 잦은 시각. 동점이면 이른 시각을 택한다 (결정론성). */
function pickPeakHour(counts: Map<number, number>): number | null {
  let bestHour: number | null = null;
  let bestCount = 0;
  for (const [hour, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > bestCount) {
      bestHour = hour;
      bestCount = count;
    }
  }
  return bestHour;
}
