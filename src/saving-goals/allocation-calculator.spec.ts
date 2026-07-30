import {
  autoAllocate,
  toUnitCount,
  unitPriceOf,
  type AllocationCandidate,
} from './allocation-calculator';
import {
  CATEGORY_UNIT_LABEL,
  SAVING_EXCLUSION_REASONS,
  SAVING_TARGET_CATEGORIES,
  isSavingTargetCategory,
} from '../common/constants/saving-target';
import { PERSONA_CATEGORIES } from '../common/constants/persona-category';
import { SPENDABLE_CATEGORIES } from '../common/constants/tx-category';

const STEP = 1_000;

/** 데모 시드에 가까운 분포 */
const CANDIDATES: AllocationCandidate[] = [
  { category: 'DELIVERY_FOOD', monthlyAvgAmount: 203_867 },
  { category: 'SHOPPING', monthlyAvgAmount: 139_917 },
  { category: 'DINING_OUT', monthlyAvgAmount: 95_133 },
  { category: 'TRANSPORT_CAR', monthlyAvgAmount: 82_817 },
  { category: 'ALCOHOL_NIGHTLIFE', monthlyAvgAmount: 69_550 },
  { category: 'SUBSCRIPTION_OTT', monthlyAvgAmount: 67_572 },
  { category: 'CONVENIENCE_STORE', monthlyAvgAmount: 45_550 },
  { category: 'CAFE_SNACK', monthlyAvgAmount: 33_500 },
  { category: 'GAME_INAPP', monthlyAvgAmount: 28_567 },
];

describe('절약 대상 카테고리 상수 (§12-1)', () => {
  it('9종이다', () => {
    expect(SAVING_TARGET_CATEGORIES).toHaveLength(9);
  });

  it('의료·건강 / 교육 / 여행·숙박 3종이 빠져 있다', () => {
    expect(SAVING_TARGET_CATEGORIES).not.toContain('HEALTH_FITNESS');
    expect(SAVING_TARGET_CATEGORIES).not.toContain('EDUCATION');
    expect(SAVING_TARGET_CATEGORIES).not.toContain('TRAVEL_STAY');
  });

  it('제외 3종에는 이유가 붙어 있다', () => {
    expect(Object.keys(SAVING_EXCLUSION_REASONS).sort()).toEqual(
      ['EDUCATION', 'HEALTH_FITNESS', 'TRAVEL_STAY'].sort(),
    );
    for (const reason of Object.values(SAVING_EXCLUSION_REASONS)) {
      expect(reason && reason.length).toBeGreaterThan(0);
    }
  });

  /**
   * 이 테스트가 §12-1 의 핵심 사고 방지다.
   * 슬라이더가 9종으로 줄었다고 페르소나 축까지 9종이 되면 48종 중 12종이 죽는다.
   */
  it('페르소나 축은 여전히 12종이다 (슬라이더 축소에 딸려가지 않는다)', () => {
    expect(PERSONA_CATEGORIES).toHaveLength(12);
    expect(SPENDABLE_CATEGORIES).toHaveLength(12);
    expect(PERSONA_CATEGORIES).toContain('HEALTH_FITNESS');
    expect(PERSONA_CATEGORIES).toContain('EDUCATION');
    expect(PERSONA_CATEGORIES).toContain('TRAVEL_STAY');
  });

  it('SPENDABLE 순서를 그대로 따른다', () => {
    const filtered = SPENDABLE_CATEGORIES.filter((c) => isSavingTargetCategory(c));
    expect([...SAVING_TARGET_CATEGORIES]).toEqual(filtered);
  });

  it('12종 전부에 환산 단위가 있다', () => {
    for (const c of SPENDABLE_CATEGORIES) {
      expect(CATEGORY_UNIT_LABEL[c]).toBeTruthy();
    }
  });
});

describe('autoAllocate', () => {
  /** 이게 깨지면 화면의 `266,000 / 280,000원` 합계가 어긋난다 */
  it('합계가 목표액과 정확히 일치한다', () => {
    for (const target of [60_000, 90_000, 130_000, 200_000, 280_000]) {
      const r = autoAllocate(target, CANDIDATES, STEP);
      expect(r.allocatedAmount).toBe(target);
      expect(r.shortfallAmount).toBe(0);
    }
  });

  it('어떤 카테고리도 자기 월평균을 넘지 않는다', () => {
    const r = autoAllocate(280_000, CANDIDATES, STEP);
    for (const item of r.items) {
      const cap = CANDIDATES.find((c) => c.category === item.category)!.monthlyAvgAmount;
      expect(item.targetAmount).toBeLessThanOrEqual(cap);
    }
  });

  it('월평균이 큰 카테고리가 더 많이 부담한다', () => {
    const r = autoAllocate(200_000, CANDIDATES, STEP);
    const byCat = new Map(r.items.map((i) => [i.category, i.targetAmount]));
    expect(byCat.get('DELIVERY_FOOD')!).toBeGreaterThan(byCat.get('SHOPPING')!);
    expect(byCat.get('SHOPPING')!).toBeGreaterThan(byCat.get('GAME_INAPP')!);
  });

  it('결정론적이다 — 같은 입력이면 항상 같은 결과', () => {
    const runs = Array.from({ length: 5 }, () =>
      JSON.stringify(autoAllocate(130_000, CANDIDATES, STEP).items),
    );
    expect(new Set(runs).size).toBe(1);
  });

  it('목표액이 상한 합계를 넘으면 전부 채우고 부족분을 알린다', () => {
    const small: AllocationCandidate[] = [
      { category: 'CAFE_SNACK', monthlyAvgAmount: 30_000 },
      { category: 'GAME_INAPP', monthlyAvgAmount: 20_000 },
    ];
    const r = autoAllocate(100_000, small, STEP);
    expect(r.allocatedAmount).toBe(50_000);
    expect(r.shortfallAmount).toBe(50_000);
  });

  it('목표액이 0이면 전부 0', () => {
    const r = autoAllocate(0, CANDIDATES, STEP);
    expect(r.allocatedAmount).toBe(0);
    expect(r.items.every((i) => i.targetAmount === 0)).toBe(true);
  });

  it('후보가 없으면 전액이 부족분이 된다', () => {
    const r = autoAllocate(50_000, [], STEP);
    expect(r.allocatedAmount).toBe(0);
    expect(r.shortfallAmount).toBe(50_000);
  });

  it('월평균이 0인 카테고리에는 배분하지 않는다', () => {
    const withZero = [...CANDIDATES, { category: 'TRAVEL_STAY', monthlyAvgAmount: 0 }];
    const r = autoAllocate(100_000, withZero, STEP);
    expect(r.items.find((i) => i.category === 'TRAVEL_STAY')!.targetAmount).toBe(0);
    expect(r.allocatedAmount).toBe(100_000);
  });

  /** step 으로 안 떨어지는 목표액도 합계는 정확해야 한다 */
  it('목표액이 step 배수가 아니어도 합계가 맞는다', () => {
    const r = autoAllocate(60_500, CANDIDATES, STEP);
    expect(r.allocatedAmount).toBe(60_500);
  });

  it('결과에 모든 후보 카테고리가 들어 있다 (배분 0원이어도)', () => {
    const r = autoAllocate(10_000, CANDIDATES, STEP);
    expect(r.items).toHaveLength(CANDIDATES.length);
  });

  it('배분액은 step 배수이거나, 마지막 잔액을 얹은 한 곳뿐이다', () => {
    const r = autoAllocate(130_000, CANDIDATES, STEP);
    const offGrid = r.items.filter((i) => i.targetAmount % STEP !== 0);
    expect(offGrid.length).toBeLessThanOrEqual(1);
  });
});

describe('환산 힌트', () => {
  it('금액을 평균 결제액으로 나눠 소수 한 자리로 준다', () => {
    // 배달 6개월 총 1,223,200원 / 53건 = 약 23,079원/끼
    expect(toUnitCount(58_000, 1_223_200, 53)).toBeCloseTo(2.5, 1);
  });

  it('단가가 싼 카테고리는 같은 금액이 더 많은 횟수가 된다', () => {
    const 배달 = toUnitCount(30_000, 1_223_200, 53)!;
    const 카페 = toUnitCount(30_000, 201_000, 51)!;
    expect(카페).toBeGreaterThan(배달);
  });

  it('건수가 0이면 null (화면이 힌트를 숨긴다)', () => {
    expect(toUnitCount(30_000, 0, 0)).toBeNull();
    expect(unitPriceOf(0, 0)).toBeNull();
  });

  it('금액이 0이면 null', () => {
    expect(toUnitCount(0, 100_000, 10)).toBeNull();
  });

  it('평균 결제액은 원 단위 정수', () => {
    const p = unitPriceOf(1_223_200, 53)!;
    expect(Number.isInteger(p)).toBe(true);
    expect(p).toBe(23_079);
  });
});
