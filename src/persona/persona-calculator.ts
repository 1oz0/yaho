/**
 * 페르소나 산출 — 순수 함수. AI 를 쓰지 않는다.
 *
 * `페르소나 완성.xlsx` 확정안 기준: **시간대(4) × 카테고리(12) = 48종**
 *   코드 형식: `{TIME}_{CATEGORY}`  예) `NIGHT_DELIVERY_FOOD`
 *
 *   시간대 축   승인 건수 최다 구간 (KST)
 *               22~05 심야새벽 / 05~11 아침 / 11~17 낮 / 17~22 저녁
 *   카테고리 축  월평균 지출 최다 (페르소나 카테고리 기준)
 *
 * 소비량 축(LOW/NORMAL/OVER)은 **페르소나 코드에서 빠졌다.**
 * 다만 "또래보다 얼마나 쓰는가"는 서비스의 출발점이므로 계속 계산해
 * `spendingLevel` / `spendingRatio` 로 진단 근거에 싣는다.
 *
 * 계산은 여기서, **표시 문구는 DB(Persona 테이블)에서** 가져온다.
 */
import {
  TIME_BANDS,
  spendingLevelOfRatio,
  type SpendingLevel,
  type TimeBand,
} from '../common/constants/persona';
import {
  PERSONA_CATEGORIES,
  isPersonaCategory,
  type PersonaCategory,
} from '../common/constants/persona-category';
import { safeRatio } from '../common/utils/ratio';

export interface PersonaInput {
  /** 시간대별 승인 건수 */
  timeBandCounts: Record<TimeBand, number>;
  /** 분류 엔진 카테고리별 월평균 지출 (원) */
  monthlyAvgByCategory: Record<string, number>;
  /** 월평균 총 지출 (원) */
  monthlyAvgTotalAmount: number;
  /** 연령대 벤치마크 월평균 지출 (원) */
  benchmarkAmount: number;
}

export interface PersonaAxes {
  /** `{TIME}_{CATEGORY}` */
  code: string;
  timeBand: TimeBand;
  category: PersonaCategory;
  /** 최다 카테고리의 월평균 지출 */
  topCategoryAmount: number;
  /** 진단용 — 페르소나 코드에는 포함되지 않는다 */
  spendingLevel: SpendingLevel;
  /** 실지출 / 벤치마크 */
  spendingRatio: number;
  /** 지출이 전혀 없어 카테고리를 특정하지 못했는가 */
  hasNoSpending: boolean;
}

/**
 * 페르소나 축에 해당하는 카테고리만 남긴다.
 *
 * 분류 엔진 카테고리와 페르소나 카테고리가 **같은 12종**이라 변환은 필요 없고,
 * 축이 아닌 것(FIXED_BILLS / UNCLASSIFIED / EXCLUDED)만 걸러내면 된다.
 */
export function foldToPersonaCategories(
  monthlyAvgByCategory: Record<string, number>,
): Record<string, number> {
  const folded: Record<string, number> = {};
  for (const [category, amount] of Object.entries(monthlyAvgByCategory)) {
    if (!isPersonaCategory(category)) continue;
    folded[category] = (folded[category] ?? 0) + amount;
  }
  return folded;
}

/**
 * 시간대 축.
 * 동점이면 TIME_BANDS 선언 순서가 앞선 것을 택한다 (결정론성 확보).
 */
export function resolveTimeBand(counts: Record<TimeBand, number>): TimeBand {
  let best: TimeBand = TIME_BANDS[0];
  let bestCount = -1;
  for (const band of TIME_BANDS) {
    const count = counts[band] ?? 0;
    if (count > bestCount) {
      best = band;
      bestCount = count;
    }
  }
  return best;
}

/**
 * 카테고리 축.
 * 동점이면 PERSONA_CATEGORIES 선언 순서가 앞선 것을 택한다.
 */
export function resolvePersonaCategory(personaCategoryAmounts: Record<string, number>): {
  category: PersonaCategory;
  amount: number;
  hasNoSpending: boolean;
} {
  let best: PersonaCategory = PERSONA_CATEGORIES[0];
  let bestAmount = -1;

  for (const category of PERSONA_CATEGORIES) {
    const amount = personaCategoryAmounts[category] ?? 0;
    if (amount > bestAmount) {
      best = category;
      bestAmount = amount;
    }
  }

  return { category: best, amount: Math.max(bestAmount, 0), hasNoSpending: bestAmount <= 0 };
}

/** 소비량 진단 (페르소나 코드와 무관) */
export function resolveSpendingLevel(
  monthlyAvgTotalAmount: number,
  benchmarkAmount: number,
): { level: SpendingLevel; ratio: number } {
  const ratio = safeRatio(monthlyAvgTotalAmount, benchmarkAmount);
  return { level: spendingLevelOfRatio(ratio), ratio };
}

export function buildPersonaCode(timeBand: TimeBand, category: PersonaCategory): string {
  return `${timeBand}_${category}`;
}

export function evaluatePersona(input: PersonaInput): PersonaAxes {
  const timeBand = resolveTimeBand(input.timeBandCounts);
  const folded = foldToPersonaCategories(input.monthlyAvgByCategory);
  const category = resolvePersonaCategory(folded);
  const { level, ratio } = resolveSpendingLevel(
    input.monthlyAvgTotalAmount,
    input.benchmarkAmount,
  );

  return {
    code: buildPersonaCode(timeBand, category.category),
    timeBand,
    category: category.category,
    topCategoryAmount: category.amount,
    spendingLevel: level,
    spendingRatio: ratio,
    hasNoSpending: category.hasNoSpending,
  };
}

/** 카탈로그에 있어야 할 전체 페르소나 코드 (검증용) */
export function allPersonaCodes(): string[] {
  const codes: string[] = [];
  for (const t of TIME_BANDS) {
    for (const c of PERSONA_CATEGORIES) codes.push(buildPersonaCode(t, c));
  }
  return codes;
}
