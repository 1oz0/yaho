/**
 * 챌린지 플랜 계산 — 순수 함수 (§6-3, §12-2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * §12-2 로 바뀐 것: 목표액을 여행지가 정한다
 * ─────────────────────────────────────────────────────────────────────────────
 * 예전에는 사용자가 T(4주 기준 절약 목표)를 정하면 2/4/8주 플랜 3개가 파생됐다.
 * 이제는 **여행지가 목표액과 기간을 정하고**, 사용자는 그 금액을 카테고리에 나눈다.
 *
 * 그래서 `GoalItem.targetAmount` 의 의미가 바뀌었다:
 *   [예전] 4주 기준액  → 기간 목표 = targetAmount × 주수/4
 *   [지금] **기간 전체 금액** → 기간 목표 = targetAmount 그대로
 *
 * 화면 S12 가 `266,000 / 280,000원` 처럼 **기간 목표액을 그대로** 보여주므로,
 * 슬라이더 값도 기간 금액이어야 사용자가 더할 수 있다. 내부만 4주 기준으로 두면
 * 화면과 DB 사이에 ×0.5, ×2 환산이 끼어들어 언젠가 어긋난다.
 *
 * 대신 **상한은 기간 환산이 필요하다**: 2주 챌린지에서 월평균만큼 줄이겠다고 하면
 * 예산이 음수가 된다. 상한 = 월평균 × 주수/4 (= baseline).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 명세 §6-3 수식의 불일치 (기존 판단 유지)
 * ─────────────────────────────────────────────────────────────────────────────
 * 주차별 예산에 4.345 를 쓰면 예산을 정확히 지켜도 목표의 92% 에서 멈춘다.
 * 그래서 기간 환산은 `주수/4` 를 쓰고, 4.345 는 **난이도 판정의 예상 지출**에만 쓴다.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  WEEKS_PER_MONTH,
  blocksOfWeeks,
  difficultyOfRate,
  planTypeOfWeeks,
  type Difficulty,
  type PlanType,
} from '../common/constants/challenge';
import { addDays, startOfKstDay } from '../common/utils/date-kst';
import { splitEvenlyWithRemainderLast, sum, toWon } from '../common/utils/money';
import { safeRatio } from '../common/utils/ratio';

export interface GoalItem {
  category: string;
  /** 산정 시점 월평균 지출 (원) */
  monthlyAvgAmount: number;
  /** 사용자가 지정한 절약 희망액 — **기간 전체 금액** (원) */
  targetAmount: number;
}

export interface GoalViolation {
  category: string;
  targetAmount: number;
  monthlyAvgAmount: number;
  /** 이 기간의 상한 = 월평균 × 주수/4 (원) */
  periodMaxAmount: number;
}

/**
 * 절약 목표가 **해당 기간의 평소 지출**을 넘는지 검사한다.
 *
 * 넘으면 `SAVING_GOAL_EXCEEDS_AVERAGE` 로 거절하고 어떤 카테고리가 문제인지 알려준다 (§6-3).
 * 상한이 월평균이 아니라 `월평균 × 주수/4` 인 이유: 2주 챌린지에서 월평균만큼 줄이겠다고
 * 하면 그 기간에 쓸 수 있는 예산이 음수가 된다.
 */
export function findGoalViolations(items: readonly GoalItem[], weeks: number): GoalViolation[] {
  const blocks = blocksOfWeeks(weeks);
  return items
    .map((i) => ({ item: i, periodMaxAmount: toWon(i.monthlyAvgAmount * blocks) }))
    .filter(({ item, periodMaxAmount }) => item.targetAmount > periodMaxAmount)
    .map(({ item, periodMaxAmount }) => ({
      category: item.category,
      targetAmount: item.targetAmount,
      monthlyAvgAmount: item.monthlyAvgAmount,
      periodMaxAmount,
    }));
}

export interface PlanCategoryBudget {
  category: string;
  /** 산정 시점 월평균 (원) */
  monthlyAvgAmount: number;
  /** 이 기간의 절약 목표 (원) */
  periodTargetAmount: number;
  /** 이 기간에 써도 되는 금액 (원) */
  periodBudgetAmount: number;
  /** 절약하지 않았다면 썼을 금액 = 예산 + 목표 (원) */
  baselineAmount: number;
}

export interface WeeklyCategoryBudget {
  category: string;
  budgetAmount: number;
}

export interface WeeklyBudget {
  weekNo: number;
  startsAt: Date;
  endsAt: Date;
  budgetAmount: number;
  byCategory: WeeklyCategoryBudget[];
}

export interface PlanCandidate {
  planType: PlanType;
  weeks: number;
  /** 이 기간의 목표 절약액 (원) */
  targetSavingAmount: number;
  /** 난이도 판정용 예상 지출 = 월평균 총지출 × 주수/4.345 (원) */
  expectedSpendAmount: number;
  /** 절감률 = 목표 절약액 / 예상 지출 */
  reductionRate: number;
  difficulty: Difficulty;
  startedAt: Date;
  endsAt: Date;
  /** 절약하지 않았다면 썼을 총액 */
  baselineTotalAmount: number;
  /** 이 기간에 써도 되는 총액 */
  budgetTotalAmount: number;
  categories: PlanCategoryBudget[];
  weeklyBudgets: WeeklyBudget[];
}

export interface BuildPlansInput {
  items: readonly GoalItem[];
  /** 챌린지 기간(주). 여행지가 정한다 (§12-2). */
  weeks: number;
  /** 월평균 총지출 (목표에 없는 카테고리도 포함) — 난이도 판정에 쓴다 */
  monthlyAvgTotalAmount: number;
  /** 챌린지 시작 시각 */
  startedAt: Date;
}

export function buildPlan(input: BuildPlansInput): PlanCandidate {
  const { weeks } = input;
  const planType = planTypeOfWeeks(weeks);
  const blocks = blocksOfWeeks(weeks); // 0.5 / 1 / 2

  const startsAt = startOfKstDay(input.startedAt);
  const endsAt = addDays(startsAt, weeks * 7);

  // --- 카테고리별 기간 환산 -------------------------------------------------
  // targetAmount 는 **이미 기간 금액**이라 곱하지 않는다 (§12-2).
  // baseline − budget == periodTarget 이 정확히 성립하도록 baseline 을 먼저 반올림하고,
  // 예산은 그 차이로 구한다. (반올림 오차가 새지 않는다)
  const categories: PlanCategoryBudget[] = input.items.map((item) => {
    const periodTargetAmount = item.targetAmount;
    const baselineAmount = toWon(item.monthlyAvgAmount * blocks);
    return {
      category: item.category,
      monthlyAvgAmount: item.monthlyAvgAmount,
      periodTargetAmount,
      baselineAmount,
      periodBudgetAmount: Math.max(0, baselineAmount - periodTargetAmount),
    };
  });

  const targetSavingAmount = sum(categories.map((c) => c.periodTargetAmount));
  const baselineTotalAmount = sum(categories.map((c) => c.baselineAmount));
  const budgetTotalAmount = sum(categories.map((c) => c.periodBudgetAmount));

  // --- 난이도 (명세 수식 그대로 4.345 사용) ---------------------------------
  const expectedSpendAmount = toWon((input.monthlyAvgTotalAmount * weeks) / WEEKS_PER_MONTH);
  const reductionRate = safeRatio(targetSavingAmount, expectedSpendAmount);

  return {
    planType,
    weeks,
    targetSavingAmount,
    expectedSpendAmount,
    reductionRate,
    difficulty: difficultyOfRate(reductionRate),
    startedAt: startsAt,
    endsAt,
    baselineTotalAmount,
    budgetTotalAmount,
    categories,
    weeklyBudgets: buildWeeklyBudgets(categories, weeks, startsAt),
  };
}

// ---------------------------------------------------------------------------
// S10 처방 선택 — 여행지가 곧 플랜이다 (§12-2)
// ---------------------------------------------------------------------------

export interface DestinationPlanInput {
  destinationId: string;
  code: string;
  name: string;
  province: string;
  heroImageUrl: string;
  catchphrase: string;
  tagline: string;
  weeks: number;
  targetSavingAmount: number;
}

export interface DestinationPlan extends DestinationPlanInput {
  planType: PlanType;
  label: string;
  /** 난이도 판정용 예상 지출 = 월평균 총지출 × 주수/4.345 (원) */
  expectedSpendAmount: number;
  reductionRate: number;
  difficulty: Difficulty;
  /**
   * 이 목표액을 9종 슬라이더로 배분할 수 있는가.
   *
   * false 면 지금 소비 규모로는 달성 자체가 불가능하다 —
   * 화면 S10 은 이런 카드를 **목록에서 빼야 한다** ("달성 불가능한 선택지를 보여주지 않는다").
   */
  achievable: boolean;
  /** 배분 상한 합계 (원). 기간 환산된 값이다. */
  allocatableAmount: number;
  /** 목표액 − 배분 상한. 달성 가능하면 0. */
  shortfallAmount: number;
}

export interface BuildDestinationPlansInput {
  destinations: readonly DestinationPlanInput[];
  /** 절약 대상 9종의 월평균 (원). 기간 환산은 이 함수가 한다. */
  savingTargetMonthlyAvgTotal: number;
  /** 월평균 총지출 12종 전체 (원) — 난이도 판정에 쓴다 */
  monthlyAvgTotalAmount: number;
}

/**
 * S10 처방 선택 카드 목록.
 *
 * 여행지마다 기간과 목표액이 고정돼 있으므로, 계산할 것은 **난이도와 달성 가능 여부**뿐이다.
 * 사용자의 절약 목표를 요구하지 않는다 — S10 은 S12 보다 **앞**에 오기 때문이다.
 */
export function buildDestinationPlans(
  input: BuildDestinationPlansInput,
): DestinationPlan[] {
  return input.destinations
    .map((d) => {
      const blocks = blocksOfWeeks(d.weeks);
      const expectedSpendAmount = toWon((input.monthlyAvgTotalAmount * d.weeks) / WEEKS_PER_MONTH);
      const reductionRate = safeRatio(d.targetSavingAmount, expectedSpendAmount);
      const allocatableAmount = toWon(input.savingTargetMonthlyAvgTotal * blocks);

      return {
        ...d,
        planType: planTypeOfWeeks(d.weeks),
        label: `${d.weeks}주 챌린지`,
        expectedSpendAmount,
        reductionRate,
        difficulty: difficultyOfRate(reductionRate),
        achievable: d.targetSavingAmount <= allocatableAmount,
        allocatableAmount,
        shortfallAmount: Math.max(0, d.targetSavingAmount - allocatableAmount),
      };
    })
    // 기간 오름차순 → 목표액 오름차순. 화면이 "2주 / 4주 / 8주" 섹션으로 묶기 좋다.
    .sort((a, b) => a.weeks - b.weeks || a.targetSavingAmount - b.targetSavingAmount);
}

/**
 * 주차별 예산을 만든다.
 *
 * 카테고리별 기간 예산을 주 단위로 균등 배분하되, **반올림 잔액은 마지막 주에 몰아넣어**
 * 주차 합계가 기간 예산과 정확히 일치하게 한다 (§6-3).
 */
export function buildWeeklyBudgets(
  categories: readonly PlanCategoryBudget[],
  weeks: number,
  startsAt: Date,
): WeeklyBudget[] {
  // 카테고리마다 주별 배분을 먼저 구한다
  const splitByCategory = categories.map((c) => ({
    category: c.category,
    weekly: splitEvenlyWithRemainderLast(c.periodBudgetAmount, weeks),
  }));

  return Array.from({ length: weeks }, (_, index) => {
    const byCategory = splitByCategory.map((s) => ({
      category: s.category,
      budgetAmount: s.weekly[index],
    }));

    return {
      weekNo: index + 1,
      startsAt: addDays(startsAt, index * 7),
      endsAt: addDays(startsAt, (index + 1) * 7),
      budgetAmount: sum(byCategory.map((b) => b.budgetAmount)),
      byCategory,
    };
  });
}
