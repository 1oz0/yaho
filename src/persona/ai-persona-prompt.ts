/**
 * AI 페르소나 매칭 프롬프트 · 출력 스키마 — 순수 함수. NestJS 의존 없음.
 *
 * ── 모델에게 무엇을 맡기고 무엇을 안 맡기는가 ────────────────────────────────
 * 맡긴다   : 두 축(시간대 · 카테고리)을 무엇으로 볼 것인가, 그리고 개인화 문구
 * 안 맡긴다 : 페르소나 코드 조합, 카탈로그 문구, 소비량 진단, 모든 금액
 *
 * **모델은 페르소나 이름을 짓지 않는다.** 축 두 개만 고르고, 그 조합을 코드로 바꿔
 * `Persona` 테이블에서 이름·태그라인·설명을 꺼내는 것은 서버다. 이렇게 해야
 *   - 48종 카탈로그 밖의 존재하지 않는 페르소나가 나오지 않고,
 *   - 기획이 문구를 바꿔도 코드를 안 고쳐도 되며,
 *   - 같은 사람이 두 번 조회했을 때 이름이 달라지지 않는다.
 *
 * 그럼 AI 는 왜 쓰는가. 규칙은 "월평균 최다 카테고리 × 승인 건수 최다 시간대"라
 * 1위와 2위가 3% 차이여도 무조건 1위를 집는다. 배달 18% · 외식 17% 인 사람은
 * 어느 쪽으로 불러도 이상한데, 규칙은 그 애매함을 못 본다. 모델은 비중 분포를
 * 통째로 보고 "이 사람을 무엇으로 부르는 게 가장 자연스러운가"를 판단할 수 있다.
 *
 * ── 소비량 축은 왜 안 맡기는가 ───────────────────────────────────────────────
 * `실지출 ÷ 또래 벤치마크` 나눗셈 하나다. 판단할 여지가 없고, 모델이 계산하면
 * 화면에 뜬 배수와 근거 숫자가 어긋날 수 있다.
 */
import { TIME_BANDS, TIME_BAND_RANGES } from '../common/constants/persona';
import {
  PERSONA_CATEGORIES,
  PERSONA_CATEGORY_LABELS,
  type PersonaCategory,
} from '../common/constants/persona-category';
import type { TimeBand } from '../common/constants/persona';

export interface CategoryShare {
  category: string;
  label: string;
  /** 월평균 지출 (원) */
  monthlyAvgAmount: number;
  /** 전체 지출 대비 비중 0~1 */
  shareRate: number;
  txCount: number;
}

export interface TimeBandShare {
  timeBand: TimeBand;
  label: string;
  /** 이 시간대 승인 건수 */
  txCount: number;
  /** 전체 건수 대비 비중 0~1 */
  shareRate: number;
}

export interface PersonaPromptInput {
  categories: CategoryShare[];
  timeBands: TimeBandShare[];
  /** 월평균 총 지출 (원) */
  monthlyAvgTotalAmount: number;
  /** 또래 벤치마크 월평균 (원) */
  benchmarkAmount: number;
  /** 실지출 ÷ 벤치마크. 1.48 이면 또래의 1.48배 */
  spendingRatio: number;
  /** 평균 계산에 쓴 완결 월 수 */
  monthsCovered: number;
  /** 지출이 큰 대표 가맹점 몇 곳 — 문구에 구체성을 준다 */
  topMerchants: { name: string; category: string; txCount: number; totalAmount: number }[];
  /** 규칙 기반으로 계산했을 때의 축. 모델이 참고만 하고 따를 의무는 없다. */
  ruleBaseline: { timeBand: TimeBand; category: PersonaCategory };
}

export interface AiPersonaDraft {
  timeBand: string;
  category: string;
  reason: string;
  headline: string;
}

// ---------------------------------------------------------------------------
// 프롬프트
// ---------------------------------------------------------------------------

function timeBandGuide(): string {
  return TIME_BANDS.map((b) => {
    const r = TIME_BAND_RANGES[b];
    const range = r.wrap
      ? `${r.fromHour}시~다음날 ${r.toHour}시`
      : `${r.fromHour}시~${r.toHour}시`;
    return `${b} (${r.label}, ${range})`;
  }).join(' · ');
}

function categoryGuide(): string {
  return PERSONA_CATEGORIES.map((c) => `${c} (${PERSONA_CATEGORY_LABELS[c]})`).join(' · ');
}

export function buildPersonaSystemPrompt(): string {
  return [
    '당신은 소비 데이터를 읽고 그 사람의 소비 성향을 한마디로 규정하는 분석가입니다.',
    '6개월 카드·계좌 내역 집계를 받아 **두 개의 축**을 고르세요.',
    '',
    '## 축 1 — 시간대',
    `  ${timeBandGuide()}`,
    '',
    '## 축 2 — 소비 카테고리',
    `  ${categoryGuide()}`,
    '',
    '## 판단 기준',
    '1. **기본은 비중이 가장 높은 것입니다.** 1위가 뚜렷하면 그냥 1위를 고르세요.',
    '2. 다만 1위와 2위가 거의 붙어 있을 때는 숫자만 보지 말고 판단하세요.',
    '   - 그 사람의 생활을 더 잘 설명하는 쪽',
    '   - 건수가 더 많아 습관에 가까운 쪽 (금액이 큰 단발성 지출보다 반복이 성향을 말합니다)',
    '   - 대표 가맹점 목록이 어느 쪽 이야기를 하고 있는지',
    '3. 시간대는 **건수** 기준입니다. 금액이 큰 한 건보다 자주 결제한 시간대가 그 사람의 리듬입니다.',
    '4. 참고용으로 규칙 기반 계산 결과를 함께 드립니다. **따를 의무는 없습니다.** 다르게 볼',
    '   근거가 있으면 다르게 고르고, 왜 그렇게 봤는지 reason 에 쓰세요.',
    '',
    '## 문구 작성',
    '- `reason` — 왜 이 두 축인지. 한국어 두세 문장, 120자 이내. **구체적인 숫자를 넣으세요.**',
    '  ("배달음식이 18.9%로 가장 높고, 저녁 시간대 결제가 전체의 41%입니다")',
    '- `headline` — 이 사람의 소비를 한 줄로. 한국어 40자 이내.',
    '  판단하거나 훈계하지 말고 관찰만 하세요. 이 서비스는 사용자를 나무라지 않습니다.',
    '  좋은 예: "퇴근길에 하루를 보상하는 소비"',
    '  나쁜 예: "충동적인 과소비를 줄이셔야 합니다"',
    '',
    '## 반드시 지킬 것',
    '- `timeBand` 와 `category` 는 위에 나열한 **영문 코드 그대로** 쓰세요. 한글 라벨이 아닙니다.',
    '- 페르소나 이름을 짓지 마세요. 축 두 개만 고르면 이름은 서버가 붙입니다.',
    '- 금액을 새로 계산하지 마세요. 주어진 숫자를 인용만 하세요.',
  ].join('\n');
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function won(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

export function buildPersonaUserPrompt(input: PersonaPromptInput): string {
  const categoryLines = input.categories
    .filter((c) => c.monthlyAvgAmount > 0)
    .map(
      (c) =>
        `  ${c.category} (${c.label}): 월평균 ${won(c.monthlyAvgAmount)} · 비중 ${pct(c.shareRate)} · ${c.txCount}건`,
    );

  const timeLines = input.timeBands.map(
    (t) => `  ${t.timeBand} (${t.label}): ${t.txCount}건 · 비중 ${pct(t.shareRate)}`,
  );

  const merchantLines = input.topMerchants.map(
    (m) => `  ${m.name} — ${m.category} · ${m.txCount}건 · 합계 ${won(m.totalAmount)}`,
  );

  const sections = [
    `## 집계 기간`,
    `  최근 완결 ${input.monthsCovered}개월`,
    '',
    '## 카테고리별 지출 (비중 큰 순)',
    ...categoryLines,
    '',
    '## 시간대별 결제 건수',
    ...timeLines,
    '',
    '## 전체 지출',
    `  월평균 ${won(input.monthlyAvgTotalAmount)}`,
    `  또래 평균 ${won(input.benchmarkAmount)} 대비 ${input.spendingRatio.toFixed(2)}배`,
  ];

  if (merchantLines.length > 0) {
    sections.push('', '## 대표 가맹점', ...merchantLines);
  }

  sections.push(
    '',
    '## 참고 — 규칙 기반 계산 결과',
    `  ${input.ruleBaseline.timeBand} × ${input.ruleBaseline.category}`,
    '  (단순히 각 축의 1위를 집은 값입니다. 동의하지 않으면 다르게 고르세요.)',
    '',
    '두 축을 고르고 문구를 써 주세요.',
  );

  return sections.join('\n');
}

export const AI_PERSONA_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['timeBand', 'category', 'reason', 'headline'],
  properties: {
    timeBand: { type: 'string', enum: [...TIME_BANDS] },
    category: { type: 'string', enum: [...PERSONA_CATEGORIES] },
    reason: { type: 'string', description: '한국어 두세 문장, 120자 이내. 숫자를 인용할 것.' },
    headline: { type: 'string', description: '한국어 40자 이내. 관찰만, 훈계 금지.' },
  },
} as const satisfies Record<string, unknown>;

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

export interface ValidatedPersonaAxes {
  timeBand: TimeBand;
  category: PersonaCategory;
  reason: string;
  headline: string;
}

export type PersonaValidation =
  | { ok: true; axes: ValidatedPersonaAxes }
  | { ok: false; reason: 'BAD_TIME_BAND' | 'BAD_CATEGORY' | 'EMPTY' };

function isTimeBand(value: unknown): value is TimeBand {
  return typeof value === 'string' && (TIME_BANDS as readonly string[]).includes(value);
}

function isPersonaCategoryValue(value: unknown): value is PersonaCategory {
  return typeof value === 'string' && (PERSONA_CATEGORIES as readonly string[]).includes(value);
}

/**
 * 모델 출력을 검증한다.
 *
 * 축이 열거값 밖이면 통째로 실패시킨다 — 반쪽만 살려 쓰면 규칙 결과와 AI 결과가
 * 섞인 정체불명의 페르소나가 나온다. 그 경우엔 규칙 기반으로 깔끔하게 되돌리는 편이 낫다.
 * 반면 문구가 비는 것은 실패가 아니다. 축만 멀쩡하면 페르소나는 성립하고,
 * 카탈로그의 기본 문구가 화면을 채운다.
 */
export function validatePersonaDraft(
  draft: AiPersonaDraft | null | undefined,
): PersonaValidation {
  if (!draft) return { ok: false, reason: 'EMPTY' };
  if (!isTimeBand(draft.timeBand)) return { ok: false, reason: 'BAD_TIME_BAND' };
  if (!isPersonaCategoryValue(draft.category)) return { ok: false, reason: 'BAD_CATEGORY' };

  return {
    ok: true,
    axes: {
      timeBand: draft.timeBand,
      category: draft.category,
      reason: typeof draft.reason === 'string' ? draft.reason.trim().slice(0, 300) : '',
      headline: typeof draft.headline === 'string' ? draft.headline.trim().slice(0, 100) : '',
    },
  };
}
