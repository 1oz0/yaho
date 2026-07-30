/** 챌린지 플랜·난이도·상태 (§6-3, §6-4) */

export const PLAN_TYPES = ['SHORT', 'STANDARD', 'LONG'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/**
 * 플랜별 기간과 목표 배수.
 * 사용자가 지정한 카테고리별 절약 희망액 합계 T 는 "4주 기준액"이다.
 */
export const PLAN_SPECS: Record<PlanType, { weeks: number; targetMultiplier: number; label: string }> = {
  SHORT: { weeks: 2, targetMultiplier: 0.5, label: '2주 챌린지' },
  STANDARD: { weeks: 4, targetMultiplier: 1, label: '4주 챌린지' },
  LONG: { weeks: 8, targetMultiplier: 2, label: '8주 챌린지' },
};

/** 기간(주)에 대응하는 플랜 타입. 여행지가 기간을 정하므로 역방향 조회가 필요하다 (§12-2). */
export const PLAN_TYPE_BY_WEEKS: Record<number, PlanType> = {
  2: 'SHORT',
  4: 'STANDARD',
  8: 'LONG',
};

/** 지원하는 챌린지 기간(주). 여행지 시드가 이 중 하나여야 한다. */
export const SUPPORTED_WEEKS = [2, 4, 8] as const;

export function planTypeOfWeeks(weeks: number): PlanType {
  const planType = PLAN_TYPE_BY_WEEKS[weeks];
  if (!planType) {
    throw new Error(`지원하지 않는 챌린지 기간입니다: ${weeks}주 (2 | 4 | 8 만 가능)`);
  }
  return planType;
}

/** 4주를 1블록으로 본다. 월평균을 기간 금액으로 환산할 때 쓴다. */
export const WEEKS_PER_BLOCK = 4;

/** 월평균 → 해당 기간 환산 배수. 2주 = 0.5, 8주 = 2. */
export function blocksOfWeeks(weeks: number): number {
  return weeks / WEEKS_PER_BLOCK;
}

/**
 * 한 달의 평균 주 수. 월평균 지출을 주 단위로 환산할 때 쓴다.
 * 365 / 12 / 7 = 4.345...
 */
export const WEEKS_PER_MONTH = 4.345;

export const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * 난이도 경계. 절감률 = 목표 절약액 / 해당 기간 예상 지출.
 *   EASY   : rate < 0.10
 *   NORMAL : 0.10 <= rate <= 0.25   ← 경계값 포함
 *   HARD   : rate > 0.25
 */
export const DIFFICULTY_THRESHOLDS = {
  easyUpperExclusive: 0.1,
  hardLowerExclusive: 0.25,
} as const;

export function difficultyOfRate(reductionRate: number): Difficulty {
  if (reductionRate < DIFFICULTY_THRESHOLDS.easyUpperExclusive) return 'EASY';
  if (reductionRate > DIFFICULTY_THRESHOLDS.hardLowerExclusive) return 'HARD';
  return 'NORMAL';
}

export const CHALLENGE_STATUSES = ['IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'ABANDONED'] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export const SAVING_GOAL_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type SavingGoalStatus = (typeof SAVING_GOAL_STATUSES)[number];

/** 절약 목표 슬라이더 단위 (원) */
export const SAVING_GOAL_STEP_AMOUNT = 1000;
