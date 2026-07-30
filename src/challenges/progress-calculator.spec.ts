import { addDays, kstDate } from '../common/utils/date-kst';
import {
  buildWeekProgress,
  calcProgress,
  evaluateStatus,
  type ProgressCategoryInput,
} from './progress-calculator';

const START = kstDate(2026, 7, 1, 0, 0);
const END = addDays(START, 28); // 4주

/** baseline = 예산 + 목표 */
const cat = (
  category: string,
  budget: number,
  target: number,
  spent: number,
): ProgressCategoryInput => ({
  category,
  periodBudgetAmount: budget,
  periodTargetAmount: target,
  baselineAmount: budget + target,
  spentAmount: spent,
});

const progress = (categories: ProgressCategoryInput[], now: Date, targetSaving?: number) =>
  calcProgress({
    categories,
    targetSavingAmount: targetSaving ?? categories.reduce((s, c) => s + c.periodTargetAmount, 0),
    startedAt: START,
    endsAt: END,
    now,
  });

describe('calcProgress — 기본 동작', () => {
  it('기간이 끝난 시점에 예산을 정확히 지키면 진척률 100%', () => {
    const r = progress([cat('DELIVERY_FOOD', 120_000, 80_000, 120_000)], END);
    expect(r.currentSavedAmount).toBe(80_000);
    expect(r.progressRate).toBe(1);
  });

  it('한 푼도 안 쓰면 목표를 초과 달성한다 (clamp 는 1)', () => {
    const r = progress([cat('DELIVERY_FOOD', 120_000, 80_000, 0)], END);
    expect(r.currentSavedAmount).toBe(200_000);
    expect(r.rawProgressRate).toBeCloseTo(2.5, 4);
    expect(r.progressRate).toBe(1); // clamp(0,1)
  });

  it('평소대로 쓰면(baseline 만큼) 절약액 0, 진척률 0', () => {
    const r = progress([cat('DELIVERY_FOOD', 120_000, 80_000, 200_000)], END);
    expect(r.currentSavedAmount).toBe(0);
    expect(r.progressRate).toBe(0);
  });

  it('과소비하면 절약액이 음수가 되고 진척률은 0 으로 잘린다', () => {
    const r = progress([cat('DELIVERY_FOOD', 120_000, 80_000, 300_000)], END);
    expect(r.currentSavedAmount).toBe(-100_000);
    expect(r.rawProgressRate).toBeLessThan(0);
    expect(r.progressRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §6-4 의 핵심: 초과 지출 카테고리의 음수 상쇄
// ---------------------------------------------------------------------------

describe('calcProgress — 초과 카테고리의 음수 상쇄 (§6-4)', () => {
  it('한 카테고리 초과분이 다른 카테고리 절약분을 깎는다', () => {
    const r = progress(
      [
        cat('DELIVERY_FOOD', 120_000, 80_000, 50_000), // baseline 200k → +150k 절약
        cat('SHOPPING', 80_000, 50_000, 230_000), // baseline 130k → -100k 초과
      ],
      END,
    );
    const delivery = r.byCategory.find((c) => c.category === 'DELIVERY_FOOD')!;
    const shopping = r.byCategory.find((c) => c.category === 'SHOPPING')!;

    expect(delivery.savedAmount).toBe(150_000);
    expect(shopping.savedAmount).toBe(-100_000); // 0 으로 자르지 않는다
    expect(r.currentSavedAmount).toBe(50_000); // 150k + (-100k)
  });

  it('음수를 0 으로 잘랐다면 나왔을 값과 다르다 (상쇄가 실제로 일어난다)', () => {
    const r = progress(
      [
        cat('DELIVERY_FOOD', 120_000, 80_000, 0), // +200k
        cat('SHOPPING', 80_000, 50_000, 400_000), // -270k
      ],
      END,
    );
    expect(r.currentSavedAmount).toBe(-70_000);
    // 음수를 0 으로 잘랐다면 +200,000 이 됐을 것이다
    const clamped = r.byCategory.reduce((s, c) => s + Math.max(0, c.savedAmount), 0);
    expect(clamped).toBe(200_000);
    expect(r.currentSavedAmount).not.toBe(clamped);
  });

  it('초과한 카테고리에 isOver 플래그를 준다', () => {
    const r = progress(
      [cat('DELIVERY_FOOD', 120_000, 80_000, 50_000), cat('SHOPPING', 80_000, 50_000, 230_000)],
      END,
    );
    expect(r.byCategory.find((c) => c.category === 'DELIVERY_FOOD')!.isOver).toBe(false);
    expect(r.byCategory.find((c) => c.category === 'SHOPPING')!.isOver).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 경과 안분
// ---------------------------------------------------------------------------

describe('calcProgress — 진행 중 안분', () => {
  it('시작 직후에는 baseline 도 0 이라 절약액이 0 이다', () => {
    const r = progress([cat('DELIVERY_FOOD', 120_000, 80_000, 0)], START);
    expect(r.elapsedRatio).toBe(0);
    expect(r.currentSavedAmount).toBe(0);
    expect(r.progressRate).toBe(0);
  });

  it('절반 지났으면 baseline 도 절반만 인정한다', () => {
    // 14일 경과, baseline 200k → 100k 인정. 지출 0 → 절약 100k
    const r = progress([cat('DELIVERY_FOOD', 120_000, 80_000, 0)], addDays(START, 14));
    expect(r.elapsedRatio).toBeCloseTo(0.5, 4);
    expect(r.currentSavedAmount).toBe(100_000);
  });

  it('안분하지 않으면 1주차에 진척률이 터무니없이 높아진다 (안분의 이유)', () => {
    // 7일 경과, 지출 0. 안분하면 baseline 50k → 절약 50k (목표 80k 의 62.5%)
    const r = progress([cat('DELIVERY_FOOD', 120_000, 80_000, 0)], addDays(START, 7));
    expect(r.currentSavedAmount).toBe(50_000);
    expect(r.progressRate).toBeCloseTo(0.625, 3);
    // 안분 없이 전체 baseline(200k)을 썼다면 250% 가 됐을 것이다
  });

  it('종료일을 지나도 경과 비율은 1 을 넘지 않는다', () => {
    const r = progress([cat('DELIVERY_FOOD', 120_000, 80_000, 120_000)], addDays(END, 30));
    expect(r.elapsedRatio).toBe(1);
    expect(r.daysRemaining).toBe(0);
    expect(r.currentSavedAmount).toBe(80_000);
  });

  it('남은 일수와 현재 주차를 계산한다', () => {
    const r = progress([cat('DELIVERY_FOOD', 120_000, 80_000, 0)], addDays(START, 10));
    expect(r.daysTotal).toBe(28);
    expect(r.daysElapsed).toBe(10);
    expect(r.daysRemaining).toBe(18);
    expect(r.currentWeekNo).toBe(2); // 10일차 = 2주차
  });

  it('주차 경계에서 주차 번호가 올바르다', () => {
    expect(progress([cat('A', 100, 100, 0)], addDays(START, 0)).currentWeekNo).toBe(1);
    expect(progress([cat('A', 100, 100, 0)], addDays(START, 6)).currentWeekNo).toBe(1);
    expect(progress([cat('A', 100, 100, 0)], addDays(START, 7)).currentWeekNo).toBe(2);
    expect(progress([cat('A', 100, 100, 0)], addDays(START, 27)).currentWeekNo).toBe(4);
  });
});

describe('calcProgress — 방어', () => {
  it('목표가 0 이어도 NaN/Infinity 가 새지 않는다', () => {
    const r = progress([cat('A', 0, 0, 0)], END, 0);
    expect(Number.isFinite(r.progressRate)).toBe(true);
    expect(r.progressRate).toBe(0);
  });

  it('카테고리가 없어도 안전하다', () => {
    const r = progress([], END, 100_000);
    expect(r.currentSavedAmount).toBe(0);
    expect(r.byCategory).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 상태 지연 평가
// ---------------------------------------------------------------------------

describe('evaluateStatus — 지연 평가 (docs/design.md §1-⑤)', () => {
  const p = (rate: number, isEnded: boolean) =>
    ({ progressRate: rate, isEnded }) as ReturnType<typeof calcProgress>;

  it('기간 중에는 진척률과 무관하게 IN_PROGRESS', () => {
    expect(evaluateStatus('IN_PROGRESS', p(1, false))).toBe('IN_PROGRESS');
    expect(evaluateStatus('IN_PROGRESS', p(0, false))).toBe('IN_PROGRESS');
  });

  it('종료일 이후 100% 이상이면 SUCCEEDED', () => {
    expect(evaluateStatus('IN_PROGRESS', p(1, true))).toBe('SUCCEEDED');
  });

  it('종료일 이후 100% 미만이면 FAILED', () => {
    expect(evaluateStatus('IN_PROGRESS', p(0.99, true))).toBe('FAILED');
  });

  it('이미 종결된 챌린지는 다시 판정하지 않는다', () => {
    expect(evaluateStatus('SUCCEEDED', p(0, true))).toBe('SUCCEEDED');
    expect(evaluateStatus('FAILED', p(1, true))).toBe('FAILED');
    expect(evaluateStatus('ABANDONED', p(1, true))).toBe('ABANDONED');
  });
});

describe('buildWeekProgress', () => {
  const weeks = [1, 2, 3, 4].map((weekNo) => ({
    weekNo,
    startsAt: addDays(START, (weekNo - 1) * 7),
    endsAt: addDays(START, weekNo * 7),
    budgetAmount: 50_000,
    spentAmount: weekNo === 2 ? 70_000 : 30_000,
    checkedIn: weekNo === 1,
  }));

  it('주차별 절약액과 초과 여부를 낸다', () => {
    const r = buildWeekProgress(weeks, addDays(START, 10));
    expect(r[0].savedAmount).toBe(20_000);
    expect(r[1].savedAmount).toBe(-20_000);
    expect(r[1].isOver).toBe(true);
  });

  it('현재 주차와 지난 주차를 표시한다', () => {
    const r = buildWeekProgress(weeks, addDays(START, 10)); // 2주차
    expect(r[0].isPast).toBe(true);
    expect(r[1].isCurrent).toBe(true);
    expect(r[2].isCurrent).toBe(false);
    expect(r[2].isPast).toBe(false);
  });
});
