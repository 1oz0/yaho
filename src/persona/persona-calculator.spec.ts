import { TIME_BANDS, type TimeBand } from '../common/constants/persona';
import { PERSONA_CATEGORIES } from '../common/constants/persona-category';
import {
  allPersonaCodes,
  buildPersonaCode,
  evaluatePersona,
  foldToPersonaCategories,
  resolvePersonaCategory,
  resolveSpendingLevel,
  resolveTimeBand,
  type PersonaInput,
} from './persona-calculator';

const bands = (partial: Partial<Record<TimeBand, number>>): Record<TimeBand, number> => ({
  MORNING: 0,
  LUNCH: 0,
  EVENING: 0,
  NIGHT: 0,
  ...partial,
});

// ---------------------------------------------------------------------------
// 카탈로그 — 페르소나 완성.xlsx 확정안
// ---------------------------------------------------------------------------

describe('allPersonaCodes — 48종 카탈로그', () => {
  it('시간대 4 × 카테고리 12 = 48종', () => {
    expect(TIME_BANDS).toHaveLength(4);
    expect(PERSONA_CATEGORIES).toHaveLength(12);
    expect(allPersonaCodes()).toHaveLength(48);
  });

  it('중복 코드가 없다', () => {
    expect(new Set(allPersonaCodes()).size).toBe(48);
  });

  it('코드 형식은 {TIME}_{CATEGORY} 이며 소비량 축이 들어가지 않는다', () => {
    expect(buildPersonaCode('NIGHT', 'DELIVERY_FOOD')).toBe('NIGHT_DELIVERY_FOOD');
    for (const code of allPersonaCodes()) {
      expect(code).not.toMatch(/_(LOW|NORMAL|OVER)_/);
    }
  });
});

// ---------------------------------------------------------------------------
// 카테고리 접기 (분류 9종 → 페르소나 12종)
// ---------------------------------------------------------------------------

describe('foldToPersonaCategories', () => {
  it('분류 카테고리와 페르소나 축이 같으므로 그대로 통과한다', () => {
    const input = {
      DELIVERY_FOOD: 180_000,
      DINING_OUT: 110_000,
      CAFE_SNACK: 80_000,
      SHOPPING: 130_000,
      TRANSPORT_CAR: 70_000,
      HEALTH_FITNESS: 55_000,
    };
    expect(foldToPersonaCategories(input)).toEqual(input);
  });

  it('12종 전부가 축으로 인정된다', () => {
    const all = Object.fromEntries(PERSONA_CATEGORIES.map((c, i) => [c, (i + 1) * 1000]));
    expect(Object.keys(foldToPersonaCategories(all))).toHaveLength(12);
  });

  it('FIXED_BILLS / UNCLASSIFIED / EXCLUDED 는 축에서 제외한다', () => {
    const folded = foldToPersonaCategories({
      FIXED_BILLS: 900_000, // 통신·보험은 생활 성향을 대표하지 않는다
      UNCLASSIFIED: 500_000,
      EXCLUDED: 3_000_000,
      SHOPPING: 10_000,
    });
    expect(folded).toEqual({ SHOPPING: 10_000 });
  });

  it('구독(SUBSCRIPTION_OTT)은 축에 포함된다 — 줄일 수 있는 지출이다', () => {
    expect(foldToPersonaCategories({ SUBSCRIPTION_OTT: 47_000 })).toEqual({
      SUBSCRIPTION_OTT: 47_000,
    });
  });

  it('빈 입력을 안전하게 처리한다', () => {
    expect(foldToPersonaCategories({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 시간대 축 — 엑셀의 22~05 / 05~11 / 11~17 / 17~22 와 동일
// ---------------------------------------------------------------------------

describe('resolveTimeBand', () => {
  it('건수가 가장 많은 구간을 고른다', () => {
    expect(resolveTimeBand(bands({ MORNING: 10, LUNCH: 20, EVENING: 45, NIGHT: 12 }))).toBe('EVENING');
    expect(resolveTimeBand(bands({ NIGHT: 60, EVENING: 20 }))).toBe('NIGHT');
  });

  it('동점이면 선언 순서가 앞선 것 (결정론성)', () => {
    expect(resolveTimeBand(bands({ MORNING: 10, LUNCH: 10, EVENING: 10, NIGHT: 10 }))).toBe('MORNING');
    expect(resolveTimeBand(bands({ EVENING: 4, NIGHT: 4 }))).toBe('EVENING');
  });

  it('전부 0이어도 안전하다', () => {
    expect(resolveTimeBand(bands({}))).toBe('MORNING');
  });
});

// ---------------------------------------------------------------------------
// 카테고리 축
// ---------------------------------------------------------------------------

describe('resolvePersonaCategory', () => {
  it('월평균이 가장 큰 카테고리를 고른다', () => {
    const r = resolvePersonaCategory({
      DELIVERY_FOOD: 180_000,
      SHOPPING: 130_000,
      TRANSPORT_CAR: 70_000,
    });
    expect(r.category).toBe('DELIVERY_FOOD');
    expect(r.amount).toBe(180_000);
    expect(r.hasNoSpending).toBe(false);
  });

  it('동점이면 PERSONA_CATEGORIES 선언 순서가 앞선 것', () => {
    // DELIVERY_FOOD → DINING_OUT → CAFE_SNACK → ALCOHOL_NIGHTLIFE → TRANSPORT_CAR → SHOPPING …
    const r = resolvePersonaCategory({ SHOPPING: 100_000, DINING_OUT: 100_000 });
    expect(r.category).toBe('DINING_OUT');
  });

  it('지출이 전혀 없으면 hasNoSpending 으로 알린다', () => {
    const r = resolvePersonaCategory({});
    expect(r.hasNoSpending).toBe(true);
    expect(r.amount).toBe(0);
    expect(PERSONA_CATEGORIES).toContain(r.category);
  });

  it('아직 분류기가 못 만드는 카테고리도 값이 오면 정상 선택된다', () => {
    // 술+유흥 / 게임 / 교육 등은 지금 산출되지 않지만, 분류기가 세분화되면 바로 동작해야 한다
    for (const category of PERSONA_CATEGORIES) {
      const r = resolvePersonaCategory({ [category]: 500_000 });
      expect(r.category).toBe(category);
    }
  });
});

// ---------------------------------------------------------------------------
// 소비량 진단 — 페르소나 코드와 분리되었지만 경계값은 그대로 유효하다
// ---------------------------------------------------------------------------

describe('resolveSpendingLevel — 진단용 (코드에 포함되지 않음)', () => {
  it('정확히 80% 는 NORMAL, 정확히 120% 도 NORMAL', () => {
    expect(resolveSpendingLevel(800_000, 1_000_000).level).toBe('NORMAL');
    expect(resolveSpendingLevel(1_200_000, 1_000_000).level).toBe('NORMAL');
  });

  it('경계 바로 바깥은 LOW / OVER', () => {
    expect(resolveSpendingLevel(799_999, 1_000_000).level).toBe('LOW');
    expect(resolveSpendingLevel(1_200_001, 1_000_000).level).toBe('OVER');
  });

  it('벤치마크가 0이어도 NaN/Infinity 가 새지 않는다', () => {
    const r = resolveSpendingLevel(500_000, 0);
    expect(Number.isFinite(r.ratio)).toBe(true);
    expect(r.level).toBe('LOW');
  });
});

// ---------------------------------------------------------------------------
// 조합
// ---------------------------------------------------------------------------

describe('evaluatePersona', () => {
  const input = (overrides: Partial<PersonaInput> = {}): PersonaInput => ({
    timeBandCounts: bands({ MORNING: 82, LUNCH: 89, EVENING: 112, NIGHT: 52 }),
    monthlyAvgByCategory: {
      DELIVERY_FOOD: 183_617,
      FIXED_BILLS: 97_000,
      SHOPPING: 130_617,
      DINING_OUT: 114_750,
      CAFE_SNACK: 80_717,
      TRANSPORT_CAR: 74_483,
    },
    monthlyAvgTotalAmount: 739_606,
    benchmarkAmount: 580_000,
    ...overrides,
  });

  it('데모 계정은 EVENING_DELIVERY_FOOD 로 떨어진다', () => {
    const r = evaluatePersona(input());
    expect(r.code).toBe('EVENING_DELIVERY_FOOD');
    expect(r.timeBand).toBe('EVENING');
    expect(r.category).toBe('DELIVERY_FOOD');
    expect(r.topCategoryAmount).toBe(183_617);
  });

  it('소비량은 코드에 들어가지 않지만 진단으로 함께 나온다', () => {
    const r = evaluatePersona(input());
    expect(r.spendingLevel).toBe('OVER');
    expect(r.spendingRatio).toBeCloseTo(1.275, 3);
    expect(r.code).not.toContain('OVER');
  });

  it('소비량이 달라져도 페르소나 코드는 바뀌지 않는다', () => {
    const rich = evaluatePersona(input({ monthlyAvgTotalAmount: 2_000_000 }));
    const frugal = evaluatePersona(input({ monthlyAvgTotalAmount: 200_000 }));
    expect(rich.code).toBe(frugal.code);
    expect(rich.spendingLevel).not.toBe(frugal.spendingLevel);
  });

  it('심야 쇼핑러 조합', () => {
    const r = evaluatePersona(
      input({
        timeBandCounts: bands({ NIGHT: 60, EVENING: 20 }),
        monthlyAvgByCategory: { SHOPPING: 400_000, DELIVERY_FOOD: 100_000 },
      }),
    );
    expect(r.code).toBe('NIGHT_SHOPPING');
  });

  it.each([
    ['ALCOHOL_NIGHTLIFE', 'NIGHT', 'NIGHT_ALCOHOL_NIGHTLIFE'],
    ['GAME_INAPP', 'NIGHT', 'NIGHT_GAME_INAPP'],
    ['CONVENIENCE_STORE', 'MORNING', 'MORNING_CONVENIENCE_STORE'],
    ['EDUCATION', 'MORNING', 'MORNING_EDUCATION'],
    ['TRAVEL_STAY', 'LUNCH', 'LUNCH_TRAVEL_STAY'],
    ['SUBSCRIPTION_OTT', 'NIGHT', 'NIGHT_SUBSCRIPTION_OTT'],
  ])('새로 도달 가능해진 축 %s 도 정상 산출된다', (category, band, expected) => {
    const r = evaluatePersona(
      input({
        timeBandCounts: bands({ [band as TimeBand]: 100 }),
        monthlyAvgByCategory: { [category]: 300_000 },
      }),
    );
    expect(r.code).toBe(expected);
  });

  it('FIXED_BILLS 만 있으면 카테고리를 특정하지 못한다', () => {
    const r = evaluatePersona(input({ monthlyAvgByCategory: { FIXED_BILLS: 500_000 } }));
    expect(r.hasNoSpending).toBe(true);
  });

  it('12종 × 4시간대 = 48개 조합이 전부 카탈로그 안에 있다', () => {
    const catalog = new Set(allPersonaCodes());
    const produced = new Set<string>();
    for (const band of TIME_BANDS) {
      for (const category of PERSONA_CATEGORIES) {
        const r = evaluatePersona(
          input({
            timeBandCounts: bands({ [band]: 100 }),
            monthlyAvgByCategory: { [category]: 200_000 },
          }),
        );
        expect(catalog.has(r.code)).toBe(true);
        produced.add(r.code);
      }
    }
    // 모든 조합이 실제로 산출된다 — 도달 불가능한 페르소나가 없다
    expect(produced.size).toBe(48);
  });

  it('결정론적이다', () => {
    const i = input();
    const first = evaluatePersona(i);
    for (let n = 0; n < 50; n += 1) expect(evaluatePersona(i)).toEqual(first);
  });
});
