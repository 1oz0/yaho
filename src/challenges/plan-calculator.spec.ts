import { WEEKS_PER_MONTH, difficultyOfRate, planTypeOfWeeks } from '../common/constants/challenge';
import { kstDate, toKstIso } from '../common/utils/date-kst';
import { sum } from '../common/utils/money';
import {
  buildDestinationPlans,
  buildPlan,
  buildWeeklyBudgets,
  findGoalViolations,
  type DestinationPlanInput,
  type GoalItem,
} from './plan-calculator';

const START = kstDate(2026, 7, 30, 0, 0);

/**
 * ⚠️ targetAmount 는 **기간 전체 금액**이다 (§12-2).
 * 예전에는 "4주 기준액"이었고 buildPlan 이 주수/4 를 곱했지만, 이제 곱하지 않는다.
 */
const ITEMS: GoalItem[] = [
  { category: 'DELIVERY_FOOD', monthlyAvgAmount: 200_000, targetAmount: 80_000 },
  { category: 'SHOPPING', monthlyAvgAmount: 130_000, targetAmount: 50_000 },
];

const input = (overrides: Partial<Parameters<typeof buildPlan>[0]> = {}) => ({
  items: ITEMS,
  weeks: 4,
  monthlyAvgTotalAmount: 800_000,
  startedAt: START,
  ...overrides,
});

describe('findGoalViolations — 기간 환산 상한 초과 거절 (§6-3, §12-2)', () => {
  it('4주 챌린지에서 목표가 월평균을 넘으면 위반', () => {
    const v = findGoalViolations(
      [
        { category: 'SHOPPING', monthlyAvgAmount: 143_000, targetAmount: 200_000 },
        { category: 'TRANSPORT_CAR', monthlyAvgAmount: 70_000, targetAmount: 20_000 },
      ],
      4,
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toEqual({
      category: 'SHOPPING',
      targetAmount: 200_000,
      monthlyAvgAmount: 143_000,
      periodMaxAmount: 143_000,
    });
  });

  /**
   * 이게 핵심이다. 2주 챌린지에서 상한을 월평균으로 두면
   * "2주 동안 월평균만큼 줄이겠다" 가 통과해 그 기간 예산이 음수가 된다.
   */
  it('2주 챌린지의 상한은 월평균의 절반이다', () => {
    const items = [{ category: 'SHOPPING', monthlyAvgAmount: 100_000, targetAmount: 60_000 }];
    expect(findGoalViolations(items, 2)).toHaveLength(1); // 60,000 > 50,000
    expect(findGoalViolations(items, 4)).toHaveLength(0); // 60,000 < 100,000
  });

  it('8주 챌린지의 상한은 월평균의 두 배다', () => {
    const items = [{ category: 'SHOPPING', monthlyAvgAmount: 100_000, targetAmount: 180_000 }];
    expect(findGoalViolations(items, 8)).toHaveLength(0); // 180,000 < 200,000
    expect(findGoalViolations(items, 4)).toHaveLength(1); // 180,000 > 100,000
  });

  it('상한과 정확히 같으면 허용한다 (초과가 아니다)', () => {
    expect(
      findGoalViolations(
        [{ category: 'SHOPPING', monthlyAvgAmount: 100_000, targetAmount: 100_000 }],
        4,
      ),
    ).toHaveLength(0);
  });

  it('문제가 없으면 빈 배열', () => {
    expect(findGoalViolations(ITEMS, 4)).toHaveLength(0);
  });
});

describe('buildPlan — 목표액을 곱하지 않는다 (§12-2)', () => {
  it('기간이 달라도 목표액은 입력 그대로다', () => {
    for (const weeks of [2, 4, 8]) {
      expect(buildPlan(input({ weeks })).targetSavingAmount).toBe(130_000);
    }
  });

  it('planType 은 기간에서 파생된다', () => {
    expect(buildPlan(input({ weeks: 2 })).planType).toBe('SHORT');
    expect(buildPlan(input({ weeks: 4 })).planType).toBe('STANDARD');
    expect(buildPlan(input({ weeks: 8 })).planType).toBe('LONG');
  });

  it('지원하지 않는 기간은 즉시 실패한다', () => {
    expect(() => planTypeOfWeeks(3)).toThrow();
    expect(() => buildPlan(input({ weeks: 6 }))).toThrow();
  });

  it('기간은 각각 14 / 28 / 56 일이다', () => {
    expect(toKstIso(buildPlan(input({ weeks: 2 })).endsAt)).toBe('2026-08-13T00:00:00.000+09:00');
    expect(toKstIso(buildPlan(input({ weeks: 4 })).endsAt)).toBe('2026-08-27T00:00:00.000+09:00');
    expect(toKstIso(buildPlan(input({ weeks: 8 })).endsAt)).toBe('2026-09-24T00:00:00.000+09:00');
  });

  /** baseline 은 여전히 기간 환산된다 — 목표만 그대로다 */
  it('baseline 은 기간에 비례한다', () => {
    expect(buildPlan(input({ weeks: 2 })).baselineTotalAmount).toBe(165_000); // 330k × 0.5
    expect(buildPlan(input({ weeks: 4 })).baselineTotalAmount).toBe(330_000);
    expect(buildPlan(input({ weeks: 8 })).baselineTotalAmount).toBe(660_000);
  });
});

describe('buildPlan — 예산과 목표의 정합성', () => {
  it('예산을 정확히 지키면 목표를 달성한다 (baseline − budget == target)', () => {
    for (const weeks of [2, 4, 8]) {
      const plan = buildPlan(input({ weeks }));
      const baseline = sum(plan.categories.map((c) => c.baselineAmount));
      const budget = sum(plan.categories.map((c) => c.periodBudgetAmount));
      expect(baseline - budget).toBe(plan.targetSavingAmount);
    }
  });

  it('카테고리마다도 baseline = 예산 + 목표 가 정확히 성립한다', () => {
    for (const weeks of [2, 4, 8]) {
      for (const c of buildPlan(input({ weeks })).categories) {
        expect(c.baselineAmount).toBe(c.periodBudgetAmount + c.periodTargetAmount);
      }
    }
  });

  it('목표가 기간 baseline 과 같으면 예산이 0 이 된다 (음수로 내려가지 않는다)', () => {
    const plan = buildPlan({
      items: [{ category: 'SHOPPING', monthlyAvgAmount: 100_000, targetAmount: 100_000 }],
      weeks: 4,
      monthlyAvgTotalAmount: 500_000,
      startedAt: START,
    });
    expect(plan.categories[0].periodBudgetAmount).toBe(0);
    expect(plan.targetSavingAmount).toBe(100_000);
  });
});

describe('buildPlan — 난이도 (§6-3)', () => {
  const difficultyOf = (targetAmount: number, monthlyAvgTotalAmount: number) =>
    buildPlan({
      items: [{ category: 'SHOPPING', monthlyAvgAmount: 1_000_000, targetAmount }],
      weeks: 4,
      monthlyAvgTotalAmount,
      startedAt: START,
    });

  it('예상 지출은 월평균 × 주수/4.345 다 (명세 수식 그대로)', () => {
    expect(difficultyOf(100_000, 1_000_000).expectedSpendAmount).toBe(
      Math.round((1_000_000 * 4) / WEEKS_PER_MONTH),
    );
  });

  it('절감률 10% 미만 → EASY', () => {
    const plan = difficultyOf(50_000, 1_000_000); // 50k / 920,598 ≈ 5.4%
    expect(plan.difficulty).toBe('EASY');
    expect(plan.reductionRate).toBeLessThan(0.1);
  });

  it('10~25% → NORMAL', () => {
    expect(difficultyOf(150_000, 1_000_000).difficulty).toBe('NORMAL'); // ≈ 16.3%
  });

  it('25% 초과 → HARD', () => {
    expect(difficultyOf(400_000, 1_000_000).difficulty).toBe('HARD'); // ≈ 43.4%
  });

  /**
   * 경계값은 규칙이 사는 곳(difficultyOfRate)에서 직접 확인한다.
   * buildPlan 을 거치면 반올림 때문에 비율이 0.2500005 처럼 어긋나 정확한 경계를 못 만든다.
   */
  it('경계값 정확히 10% 와 25% 는 NORMAL 이다', () => {
    expect(difficultyOfRate(0.1)).toBe('NORMAL');
    expect(difficultyOfRate(0.25)).toBe('NORMAL');
  });

  it('경계 바로 바깥은 EASY / HARD', () => {
    expect(difficultyOfRate(0.0999)).toBe('EASY');
    expect(difficultyOfRate(0.2501)).toBe('HARD');
  });
});

// ---------------------------------------------------------------------------
// S10 처방 선택 — 여행지가 곧 플랜 (§12-2)
// ---------------------------------------------------------------------------

describe('buildDestinationPlans', () => {
  const dest = (
    code: string,
    weeks: 2 | 4 | 8,
    targetSavingAmount: number,
  ): DestinationPlanInput => ({
    destinationId: `id-${code}`,
    code,
    name: code,
    province: '전라남도',
    heroImageUrl: '',
    catchphrase: '',
    tagline: '',
    weeks,
    targetSavingAmount,
  });

  /** 시드와 같은 구성 */
  const DESTINATIONS = [
    dest('SINAN', 8, 280_000),
    dest('GANGJIN', 2, 60_000),
    dest('GOCHANG', 4, 200_000),
    dest('BOSEONG', 2, 90_000),
    dest('GOHEUNG', 4, 130_000),
  ];

  const plans = buildDestinationPlans({
    destinations: DESTINATIONS,
    savingTargetMonthlyAvgTotal: 678_757,
    monthlyAvgTotalAmount: 975_940,
  });

  it('기간 오름차순 → 목표액 오름차순으로 정렬한다 (화면이 섹션으로 묶기 좋게)', () => {
    expect(plans.map((p) => p.code)).toEqual([
      'GANGJIN', // 2주 60,000
      'BOSEONG', // 2주 90,000
      'GOHEUNG', // 4주 130,000
      'GOCHANG', // 4주 200,000
      'SINAN', // 8주 280,000
    ]);
  });

  it('planType 과 label 이 기간에서 파생된다', () => {
    const gangjin = plans.find((p) => p.code === 'GANGJIN')!;
    expect(gangjin.planType).toBe('SHORT');
    expect(gangjin.label).toBe('2주 챌린지');
    expect(plans.find((p) => p.code === 'SINAN')!.planType).toBe('LONG');
  });

  it('목표액은 여행지 값 그대로다 (사용자 입력에서 파생되지 않는다)', () => {
    expect(plans.find((p) => p.code === 'SINAN')!.targetSavingAmount).toBe(280_000);
  });

  it('배분 상한은 기간에 비례한다', () => {
    expect(plans.find((p) => p.code === 'GANGJIN')!.allocatableAmount).toBe(339_379); // ×0.5
    expect(plans.find((p) => p.code === 'GOHEUNG')!.allocatableAmount).toBe(678_757); // ×1
    expect(plans.find((p) => p.code === 'SINAN')!.allocatableAmount).toBe(1_357_514); // ×2
  });

  it('데모 시드 구성에서는 5곳 전부 달성 가능하다', () => {
    expect(plans.every((p) => p.achievable)).toBe(true);
    expect(plans.every((p) => p.shortfallAmount === 0)).toBe(true);
  });

  /** "달성 불가능한 선택지를 보여주지 않는다" 규칙의 근거 */
  it('소비가 적으면 비싼 여행지를 달성 불가로 표시하고 부족분을 알린다', () => {
    const poor = buildDestinationPlans({
      destinations: DESTINATIONS,
      savingTargetMonthlyAvgTotal: 50_000,
      monthlyAvgTotalAmount: 80_000,
    });
    const sinan = poor.find((p) => p.code === 'SINAN')!; // 상한 100,000 < 목표 280,000
    expect(sinan.achievable).toBe(false);
    expect(sinan.shortfallAmount).toBe(180_000);
  });

  it('난이도는 기간 예상 지출 대비로 판정한다', () => {
    for (const p of plans) {
      const expected = Math.round((975_940 * p.weeks) / WEEKS_PER_MONTH);
      expect(p.expectedSpendAmount).toBe(expected);
      expect(p.difficulty).toBe(difficultyOfRate(p.targetSavingAmount / expected));
    }
  });

  it('절약 목표 없이도 계산된다 (S10 은 S12 보다 앞이다)', () => {
    expect(plans).toHaveLength(5);
  });

  it('결정론적이다', () => {
    const first = JSON.stringify(
      buildDestinationPlans({
        destinations: DESTINATIONS,
        savingTargetMonthlyAvgTotal: 678_757,
        monthlyAvgTotalAmount: 975_940,
      }),
    );
    for (let i = 0; i < 10; i += 1) {
      expect(
        JSON.stringify(
          buildDestinationPlans({
            destinations: DESTINATIONS,
            savingTargetMonthlyAvgTotal: 678_757,
            monthlyAvgTotalAmount: 975_940,
          }),
        ),
      ).toBe(first);
    }
  });
});

// ---------------------------------------------------------------------------
// 주차별 예산 — 반올림 잔액이 마지막 주에 들어가 합계가 정확히 맞는가 (§9 필수 항목)
// ---------------------------------------------------------------------------

describe('buildWeeklyBudgets — 반올림 잔액 처리', () => {
  it('주차 수만큼 만든다', () => {
    for (const weeks of [2, 4, 8]) {
      const plan = buildPlan(input({ weeks }));
      expect(plan.weeklyBudgets).toHaveLength(plan.weeks);
      expect(plan.weeklyBudgets.map((w) => w.weekNo)).toEqual(
        Array.from({ length: plan.weeks }, (_, i) => i + 1),
      );
    }
  });

  it('카테고리별 주차 합계가 기간 예산과 정확히 일치한다', () => {
    for (const weeks of [2, 4, 8]) {
      const plan = buildPlan(input({ weeks }));
      for (const category of plan.categories) {
        const weeklySum = sum(
          plan.weeklyBudgets.map(
            (w) => w.byCategory.find((b) => b.category === category.category)!.budgetAmount,
          ),
        );
        expect(weeklySum).toBe(category.periodBudgetAmount);
      }
    }
  });

  it('전체 주차 합계가 기간 예산 총액과 일치한다', () => {
    for (const weeks of [2, 4, 8]) {
      const plan = buildPlan(input({ weeks }));
      expect(sum(plan.weeklyBudgets.map((w) => w.budgetAmount))).toBe(plan.budgetTotalAmount);
    }
  });

  it('나누어떨어지지 않는 금액도 1원 오차 없이 맞는다', () => {
    const budgets = buildWeeklyBudgets(
      [
        {
          category: 'SHOPPING',
          monthlyAvgAmount: 0,
          periodTargetAmount: 0,
          periodBudgetAmount: 100_001,
          baselineAmount: 100_001,
        },
      ],
      3,
      START,
    );
    const amounts = budgets.map((w) => w.budgetAmount);
    expect(sum(amounts)).toBe(100_001);
    expect(amounts[2]).toBeGreaterThan(amounts[0]); // 잔액이 마지막 주에
  });

  it('여러 금액 × 여러 주차 조합에서 항상 합계가 보존된다', () => {
    for (const weeks of [2, 4, 8]) {
      for (const budget of [1, 7, 999, 123_457, 1_000_000, 4_345_678]) {
        const result = buildWeeklyBudgets(
          [
            {
              category: 'X',
              monthlyAvgAmount: 0,
              periodTargetAmount: 0,
              periodBudgetAmount: budget,
              baselineAmount: budget,
            },
          ],
          weeks,
          START,
        );
        expect(sum(result.map((w) => w.budgetAmount))).toBe(budget);
      }
    }
  });

  it('주차 구간이 7일씩 이어붙는다', () => {
    const plan = buildPlan(input());
    for (let i = 1; i < plan.weeklyBudgets.length; i += 1) {
      expect(plan.weeklyBudgets[i].startsAt.getTime()).toBe(
        plan.weeklyBudgets[i - 1].endsAt.getTime(),
      );
    }
    expect(plan.weeklyBudgets[0].startsAt.getTime()).toBe(plan.startedAt.getTime());
    expect(plan.weeklyBudgets[plan.weeks - 1].endsAt.getTime()).toBe(plan.endsAt.getTime());
  });
});

describe('buildPlan — 결정론성', () => {
  it('같은 입력이면 항상 같은 결과', () => {
    const first = JSON.stringify(buildPlan(input()));
    for (let i = 0; i < 20; i += 1) {
      expect(JSON.stringify(buildPlan(input()))).toBe(first);
    }
  });
});
