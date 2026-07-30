/**
 * 챌린지 진척 계산 — 순수 함수 (§6-4).
 *
 * 절약액 = Σ(그 시점까지의 기준 지출 − 실제 지출)
 *
 *  - "기준 지출(baseline)" 은 절약하지 않았다면 썼을 금액이다. 예산 + 목표 와 같다.
 *    명세는 "기간 예산 − 실제 지출" 이라고 썼지만, 그대로 두면 예산을 정확히 지켰을 때
 *    절약액이 0 이 되어 진척률이 오르지 않는다. baseline 기준이어야
 *    "예산대로 쓰면 목표 달성" 이 성립한다. (plan-calculator 상단 주석 참조)
 *
 *  - **음수 카테고리는 0 으로 자르지 않고 음수 그대로 합산한다.**
 *    한 카테고리에서 초과한 만큼이 다른 카테고리의 절약분을 깎아야 정직하다 (§6-4).
 *
 *  - 진행 중에는 경과 비율만큼 baseline 을 안분한다. 그렇게 하지 않으면
 *    1주차에 "4주치 예산 − 1주치 지출" 이 되어 진척률이 터무니없이 높게 나온다.
 *
 * progressRate = clamp(절약액 / 목표 절약액, 0, 1)
 */
import type { ChallengeStatus } from '../common/constants/challenge';
import { diffKstDays } from '../common/utils/date-kst';
import { clamp, sum, toWon } from '../common/utils/money';
import { safeRatio } from '../common/utils/ratio';

export interface ProgressCategoryInput {
  category: string;
  /** 기간 전체 기준 지출 (절약 안 했을 때) */
  baselineAmount: number;
  /** 기간 전체 예산 */
  periodBudgetAmount: number;
  /** 기간 전체 절약 목표 */
  periodTargetAmount: number;
  /** 챌린지 시작 이후 실제 지출 */
  spentAmount: number;
}

export interface ProgressCategoryResult {
  category: string;
  /** 지금까지 안분된 기준 지출 */
  baselineSoFarAmount: number;
  /** 지금까지 안분된 예산 */
  budgetSoFarAmount: number;
  /** 기간 전체 예산 (화면 표시용) */
  periodBudgetAmount: number;
  spentAmount: number;
  /** 절약액 = 안분 기준 지출 − 실제 지출. 음수 가능. */
  savedAmount: number;
  /** 예산을 초과했는가 — 프론트가 빨강 처리 */
  isOver: boolean;
}

export interface ProgressInput {
  categories: readonly ProgressCategoryInput[];
  targetSavingAmount: number;
  startedAt: Date;
  endsAt: Date;
  now: Date;
}

export interface ProgressResult {
  /** 0.0~1.0 — 기간이 얼마나 지났는가 */
  elapsedRatio: number;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  currentWeekNo: number;
  /** 현재 절약액 (음수 가능) */
  currentSavedAmount: number;
  targetSavingAmount: number;
  /** clamp(절약액 / 목표, 0, 1) */
  progressRate: number;
  /** clamp 하지 않은 원본 비율 — 초과 달성 표시에 쓴다 */
  rawProgressRate: number;
  isEnded: boolean;
  byCategory: ProgressCategoryResult[];
}

export function calcProgress(input: ProgressInput): ProgressResult {
  const daysTotal = Math.max(1, diffKstDays(input.startedAt, input.endsAt));
  const daysElapsedRaw = diffKstDays(input.startedAt, input.now);
  const daysElapsed = clamp(daysElapsedRaw, 0, daysTotal);
  const elapsedRatio = clamp(daysElapsed / daysTotal, 0, 1);
  const isEnded = input.now.getTime() >= input.endsAt.getTime();

  const byCategory: ProgressCategoryResult[] = input.categories.map((c) => {
    const baselineSoFarAmount = toWon(c.baselineAmount * elapsedRatio);
    const budgetSoFarAmount = toWon(c.periodBudgetAmount * elapsedRatio);
    return {
      category: c.category,
      baselineSoFarAmount,
      budgetSoFarAmount,
      periodBudgetAmount: c.periodBudgetAmount,
      spentAmount: c.spentAmount,
      // 음수 그대로 둔다 — 초과분이 다른 카테고리 절약분을 상쇄해야 정직하다
      savedAmount: baselineSoFarAmount - c.spentAmount,
      isOver: c.spentAmount > budgetSoFarAmount,
    };
  });

  const currentSavedAmount = sum(byCategory.map((c) => c.savedAmount));
  const rawProgressRate = safeRatio(currentSavedAmount, input.targetSavingAmount);

  return {
    elapsedRatio,
    daysElapsed,
    daysTotal,
    daysRemaining: Math.max(0, daysTotal - daysElapsed),
    currentWeekNo: clamp(Math.floor(daysElapsed / 7) + 1, 1, Math.ceil(daysTotal / 7)),
    currentSavedAmount,
    targetSavingAmount: input.targetSavingAmount,
    progressRate: clamp(rawProgressRate, 0, 1),
    rawProgressRate,
    isEnded,
    byCategory,
  };
}

/**
 * 상태 지연 평가 (docs/design.md §1-⑤).
 *
 * 백그라운드 스케줄러를 두지 않고, 조회·완료 호출 시점에 판정한다.
 * demo/fast-forward 직후 화면을 열면 그 자리에서 성공으로 바뀐다.
 */
export function evaluateStatus(
  current: ChallengeStatus,
  progress: ProgressResult,
): ChallengeStatus {
  // 이미 종결된 챌린지는 건드리지 않는다
  if (current !== 'IN_PROGRESS') return current;
  if (!progress.isEnded) return 'IN_PROGRESS';
  return progress.progressRate >= 1 ? 'SUCCEEDED' : 'FAILED';
}

/** 주차별 실적 — 체크인·그래프에 쓴다 */
export interface WeekProgressInput {
  weekNo: number;
  startsAt: Date;
  endsAt: Date;
  budgetAmount: number;
  spentAmount: number;
  checkedIn: boolean;
}

export interface WeekProgressResult extends WeekProgressInput {
  savedAmount: number;
  isCurrent: boolean;
  isPast: boolean;
  isOver: boolean;
}

export function buildWeekProgress(
  weeks: readonly WeekProgressInput[],
  now: Date,
): WeekProgressResult[] {
  return weeks.map((w) => ({
    ...w,
    savedAmount: w.budgetAmount - w.spentAmount,
    isCurrent: now.getTime() >= w.startsAt.getTime() && now.getTime() < w.endsAt.getTime(),
    isPast: now.getTime() >= w.endsAt.getTime(),
    isOver: w.spentAmount > w.budgetAmount,
  }));
}
