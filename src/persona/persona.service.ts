import { Injectable, Logger } from '@nestjs/common';

import { AnalysisService } from '../analysis/analysis.service';
import type { AnalysisSummary } from '../analysis/summary-calculator';
import { ClockService } from '../common/clock/clock.service';
import {
  BENCHMARK_SCOPE_TOTAL,
  TIME_BANDS,
  TIME_BAND_RANGES,
  type TimeBand,
} from '../common/constants/persona';
import {
  PERSONA_CATEGORY_LABELS,
  isPersonaCategory,
  type PersonaCategory,
} from '../common/constants/persona-category';
import { CATEGORY_LABELS, type TxCategory } from '../common/constants/tx-category';
import { AppException } from '../common/errors/app.exception';
import { toKstIso } from '../common/utils/date-kst';
import { fromBp, roundRatio, toBp } from '../common/utils/ratio';
import { PrismaService } from '../prisma/prisma.service';
import { AiPersonaService } from './ai-persona.service';
import type { CategoryShare, TimeBandShare } from './ai-persona-prompt';
import { PersonaDto } from './dto/persona.dto';
import { buildPersonaCode, evaluatePersona } from './persona-calculator';

/** 연령대 벤치마크가 없을 때 쓰는 최후 기본값 */
const FALLBACK_BENCHMARK = {
  monthlyAvgAmount: 620_000,
  source: '기본값 (해당 연령대 벤치마크 미등록)',
};

/** 프롬프트에 실을 대표 가맹점 수. 많이 넣어도 판단이 좋아지지 않고 토큰만 는다. */
const TOP_MERCHANT_LIMIT = 8;

@Injectable()
export class PersonaService {
  private readonly logger = new Logger(PersonaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly analysis: AnalysisService,
    private readonly aiPersona: AiPersonaService,
  ) {}

  /**
   * 페르소나를 산출하고 저장한다.
   *
   * ── 흐름 ────────────────────────────────────────────────────────────────
   *   1. 6개월 집계               ← 산술
   *   2. 규칙 기반 축 계산         ← 산술. AI 에게 참고로 주고, 폴백으로도 쓴다
   *   3. Claude 에 축 선정 요청    ← 여기만 AI
   *   4. 코드 조합 → 카탈로그 조회 ← 서버. 48종 밖의 페르소나는 나올 수 없다
   *   5. 스냅샷 저장
   *
   * 3번이 실패하면 2번 결과를 그대로 쓴다. 응답 형태는 완전히 같고
   * `ai.generatedBy` 만 `RULE` 이 된다 — 프론트는 분기할 필요가 없다.
   *
   * 소비량 축(spendingLevel)과 모든 금액은 어느 경로로 가든 **항상 산술**이다.
   */
  async evaluate(userId: string, ageBand: string): Promise<PersonaDto> {
    const summary = await this.analysis.computeSummary(userId);
    if (summary.monthsCovered === 0) {
      throw new AppException('NO_TRANSACTION_DATA');
    }

    const benchmark =
      (await this.prisma.spendingBenchmark.findUnique({
        where: { ageBand_scope: { ageBand, scope: BENCHMARK_SCOPE_TOTAL } },
      })) ?? FALLBACK_BENCHMARK;

    // --- 2) 규칙 기반 축 — 참고값이자 폴백 ------------------------------------
    const ruleAxes = evaluatePersona({
      timeBandCounts: summary.timeBandCounts,
      monthlyAvgByCategory: summary.monthlyAvgByCategory,
      monthlyAvgTotalAmount: summary.monthlyAvgTotalAmount,
      benchmarkAmount: benchmark.monthlyAvgAmount,
    });

    // --- 3) AI 축 선정 --------------------------------------------------------
    // 지출이 전혀 없으면 고를 근거가 없다. 물어봐야 지어낼 뿐이라 규칙으로 간다.
    const ai = ruleAxes.hasNoSpending
      ? ({ ok: false, reason: 'NO_SPENDING' } as const)
      : await this.aiPersona.selectAxes({
          categories: this.toCategoryShares(summary),
          timeBands: this.toTimeBandShares(summary),
          monthlyAvgTotalAmount: summary.monthlyAvgTotalAmount,
          benchmarkAmount: benchmark.monthlyAvgAmount,
          spendingRatio: ruleAxes.spendingRatio,
          monthsCovered: summary.monthsCovered,
          topMerchants: await this.topMerchants(userId),
          ruleBaseline: { timeBand: ruleAxes.timeBand, category: ruleAxes.category },
        });

    // --- 4) 축 확정 → 카탈로그 조회 -------------------------------------------
    const timeBand: TimeBand = ai.ok ? ai.axes.timeBand : ruleAxes.timeBand;
    const category: PersonaCategory = ai.ok ? ai.axes.category : ruleAxes.category;
    const code = buildPersonaCode(timeBand, category);

    const persona = await this.prisma.persona.findUnique({ where: { code } });
    if (!persona) {
      // 카탈로그가 시드되지 않았거나 PERSONA_CATEGORIES 를 바꾸고 재시드하지 않은 경우.
      // 축이 열거값 안이므로 AI 가 원인일 수는 없다 — 시드 문제다.
      throw new AppException(
        'NOT_FOUND',
        `페르소나 카탈로그에 '${code}' 가 없습니다. \`npm run db:seed\` 로 재시드해 주세요.`,
        [{ code }],
      );
    }

    const now = this.clock.now();
    const diverged = ai.ok && code !== ruleAxes.code;

    // AI 가 카테고리를 바꿨으면 그 카테고리의 월평균으로 근거 금액도 같이 바꿔야
    // 화면의 "배달음식 181,050원" 과 페르소나 이름이 어긋나지 않는다.
    const topCategoryAmount = ai.ok
      ? Math.round(summary.monthlyAvgByCategory[category] ?? 0)
      : ruleAxes.topCategoryAmount;

    // 이전 산출 이력은 남기되 현재 플래그만 옮긴다 (변화 추이를 보여줄 수 있도록)
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.userPersona.updateMany({ where: { userId, isCurrent: true }, data: { isCurrent: false } });
      return tx.userPersona.create({
        data: {
          userId,
          personaId: persona.id,
          timeBand,
          // 소비량 축과 배수는 어느 경로로 가든 산술 결과 그대로다
          spendingLevel: ruleAxes.spendingLevel,
          topCategory: category,
          topCategoryAmount,
          actualMonthlyAvgAmount: summary.monthlyAvgTotalAmount,
          benchmarkAmount: benchmark.monthlyAvgAmount,
          spendingRatioBp: toBp(ruleAxes.spendingRatio),
          monthsCovered: summary.monthsCovered,
          topTimeBandTxCount: summary.timeBandCounts[timeBand] ?? 0,
          // 지출이 전혀 없어 카테고리를 특정하지 못한 경우를 그대로 남긴다
          fallbackApplied: ruleAxes.hasNoSpending,
          actualTopCategory: diverged ? ruleAxes.category : null,
          generatedBy: ai.ok ? 'CLAUDE' : 'RULE',
          aiReason: ai.ok ? ai.axes.reason : null,
          aiHeadline: ai.ok ? ai.axes.headline : null,
          fallbackReason: ai.ok ? null : ai.reason,
          aiDivergedFromRule: diverged,
          ruleBaselineCode: ruleAxes.code,
          isCurrent: true,
          evaluatedAt: now,
        },
      });
    });

    this.logger.log(
      `페르소나 산출: ${persona.code} (${persona.displayName}) ` +
        `— ${ai.ok ? `AI ${ai.latencyMs}ms` : `규칙 폴백 (${ai.reason})`}`,
    );

    return this.toDto(persona, saved, {
      benchmarkSource: 'source' in benchmark ? benchmark.source : FALLBACK_BENCHMARK.source,
    });
  }

  // ---------------------------------------------------------------------------
  // 프롬프트 입력 만들기
  // ---------------------------------------------------------------------------

  /** 페르소나 축에 해당하는 12종만, 비중 큰 순으로 */
  private toCategoryShares(summary: AnalysisSummary): CategoryShare[] {
    return summary.byCategory
      .filter((c) => isPersonaCategory(c.category))
      .map((c) => ({
        category: c.category,
        label: CATEGORY_LABELS[c.category as TxCategory] ?? c.category,
        monthlyAvgAmount: Math.round(summary.monthlyAvgByCategory[c.category] ?? 0),
        shareRate: c.shareRate,
        txCount: c.txCount,
      }))
      .sort((a, b) => b.shareRate - a.shareRate || a.category.localeCompare(b.category));
  }

  private toTimeBandShares(summary: AnalysisSummary): TimeBandShare[] {
    const total = TIME_BANDS.reduce((s, b) => s + (summary.timeBandCounts[b] ?? 0), 0);
    return TIME_BANDS.map((band) => {
      const txCount = summary.timeBandCounts[band] ?? 0;
      return {
        timeBand: band,
        label: TIME_BAND_RANGES[band].label,
        txCount,
        shareRate: total > 0 ? txCount / total : 0,
      };
    }).sort((a, b) => b.txCount - a.txCount);
  }

  /**
   * 지출이 큰 대표 가맹점.
   * 집계 제외·미분류는 뺀다 — 모델에게 "(주)야호컴퍼니 285만원"을 보여주면
   * 그게 소비인 줄 알고 판단이 흔들린다.
   */
  private async topMerchants(userId: string) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['normalizedMerchant', 'category'],
      where: { userId, category: { notIn: ['EXCLUDED', 'UNCLASSIFIED'] } },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: TOP_MERCHANT_LIMIT,
    });

    return rows.map((r) => ({
      name: r.normalizedMerchant,
      category: CATEGORY_LABELS[r.category as TxCategory] ?? r.category,
      txCount: r._count._all,
      totalAmount: r._sum.amount ?? 0,
    }));
  }

  /** 현재 페르소나 조회. 아직 산출하지 않았으면 NO_PERSONA. */
  async getCurrent(userId: string): Promise<PersonaDto> {
    const current = await this.prisma.userPersona.findFirst({
      where: { userId, isCurrent: true },
      include: { persona: true },
      orderBy: { evaluatedAt: 'desc' },
    });

    if (!current) {
      throw new AppException(
        'NO_PERSONA',
        '아직 페르소나가 산출되지 않았습니다. POST /persona/evaluate 를 먼저 호출해 주세요.',
      );
    }

    const benchmark = await this.prisma.spendingBenchmark.findFirst({
      where: { monthlyAvgAmount: current.benchmarkAmount, scope: BENCHMARK_SCOPE_TOTAL },
    });

    // 근거 수치는 전부 산출 시점 스냅샷에서 읽는다 — POST 응답과 GET 응답이 항상 일치한다.
    return this.toDto(current.persona, current, {
      benchmarkSource: benchmark?.source ?? FALLBACK_BENCHMARK.source,
    });
  }

  private toDto(
    persona: {
      code: string;
      displayName: string;
      tagline: string;
      description: string;
      iconKey: string;
    },
    userPersona: {
      timeBand: string;
      spendingLevel: string;
      topCategory: string;
      topCategoryAmount: number;
      actualMonthlyAvgAmount: number;
      benchmarkAmount: number;
      spendingRatioBp: number;
      monthsCovered: number;
      topTimeBandTxCount: number;
      fallbackApplied: boolean;
      actualTopCategory: string | null;
      generatedBy: string;
      aiReason: string | null;
      aiHeadline: string | null;
      fallbackReason: string | null;
      aiDivergedFromRule: boolean;
      ruleBaselineCode: string | null;
      evaluatedAt: Date;
    },
    extra: { benchmarkSource: string },
  ): PersonaDto {
    return {
      code: persona.code,
      displayName: persona.displayName,
      tagline: persona.tagline,
      description: persona.description,
      iconKey: persona.iconKey,
      axes: {
        timeBand: userPersona.timeBand,
        spendingLevel: userPersona.spendingLevel,
        category: userPersona.topCategory,
      },
      ai: {
        generatedBy: userPersona.generatedBy,
        reason: userPersona.aiReason,
        headline: userPersona.aiHeadline,
        fallbackReason: userPersona.fallbackReason,
        divergedFromRule: userPersona.aiDivergedFromRule,
        ruleBaselineCode: userPersona.ruleBaselineCode,
      },
      evidence: {
        topCategoryAmount: userPersona.topCategoryAmount,
        topCategoryLabel:
          PERSONA_CATEGORY_LABELS[userPersona.topCategory as PersonaCategory] ??
          userPersona.topCategory,
        monthlyAvgTotalAmount: userPersona.actualMonthlyAvgAmount,
        benchmarkAmount: userPersona.benchmarkAmount,
        benchmarkSource: extra.benchmarkSource,
        spendingRatio: roundRatio(fromBp(userPersona.spendingRatioBp)),
        topTimeBandTxCount: userPersona.topTimeBandTxCount,
        monthsCovered: userPersona.monthsCovered,
        fallbackApplied: userPersona.fallbackApplied,
        actualTopCategory: userPersona.actualTopCategory,
      },
      evaluatedAt: toKstIso(userPersona.evaluatedAt),
    };
  }
}
