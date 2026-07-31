import { kstDate, toKstIso } from '../common/utils/date-kst';
import {
  buildSummary,
  findTopCategory,
  summarizeRecurring,
  type SummaryTransaction,
} from './summary-calculator';

/** 기준 시각: 2026-07-30 → 직전 6개 완결 월 = 2026-01 ~ 2026-06 */
const NOW = kstDate(2026, 7, 30, 12, 0);

function tx(overrides: Partial<SummaryTransaction> = {}): SummaryTransaction {
  return {
    approvedAt: kstDate(2026, 6, 15, 19, 0),
    amount: 10_000,
    category: 'DELIVERY_FOOD',
    txType: 'APPROVAL',
    isRecurring: false,
    merchantName: '테스트',
    normalizedMerchant: '테스트',
    ...overrides,
  };
}

/** month 월에 amount 원짜리 거래 1건 */
const at = (month: number, amount: number, category = 'DELIVERY_FOOD', day = 15, hour = 19) =>
  tx({ approvedAt: kstDate(2026, month, day, hour, 0), amount, category });

describe('buildSummary — 기준 기간과 monthsCovered (§6-1)', () => {
  it('6개월 데이터가 있으면 monthsCovered 는 6', () => {
    const txs = [1, 2, 3, 4, 5, 6].map((m) => at(m, 100_000));
    const s = buildSummary(txs, NOW);
    expect(s.monthsCovered).toBe(6);
    expect(toKstIso(s.periodFrom!)).toBe('2026-01-01T00:00:00.000+09:00');
    expect(toKstIso(s.periodTo!)).toBe('2026-07-01T00:00:00.000+09:00');
  });

  it('3개월치만 있으면 n=3 으로 평균낸다', () => {
    const txs = [4, 5, 6].map((m) => at(m, 90_000));
    const s = buildSummary(txs, NOW);
    expect(s.monthsCovered).toBe(3);
    expect(s.monthlyAvgTotalAmount).toBe(90_000); // 270,000 / 3
  });

  it('1개월치만 있어도 동작한다', () => {
    const s = buildSummary([at(6, 50_000)], NOW);
    expect(s.monthsCovered).toBe(1);
    expect(s.monthlyAvgTotalAmount).toBe(50_000);
  });

  it('중간에 무지출 월이 있어도 그 월을 분모에 포함한다', () => {
    // 4월 12만, 5월 0원, 6월 12만 → 3개월 평균 8만원 (2개월 평균 12만원이 아니다)
    const s = buildSummary([at(4, 120_000), at(6, 120_000)], NOW);
    expect(s.monthsCovered).toBe(3);
    expect(s.monthlyAvgTotalAmount).toBe(80_000);
  });

  it('진행 중인 부분 월(7월)은 평균에서 제외한다', () => {
    const txs = [at(6, 100_000), at(7, 900_000)];
    const s = buildSummary(txs, NOW);
    expect(s.monthsCovered).toBe(1);
    expect(s.totalAmount).toBe(100_000); // 7월 90만원은 빠진다
  });

  it('진행 중인 달이라도 이력이 월말까지 닿아 있으면 완결로 본다', () => {
    // 7월 30일까지 거래가 있으면 커버리지 30/31 = 97% → 7월을 창에 넣고 가장 오래된 1월을 뺀다.
    // 이게 없으면 멀쩡한 한 달을 버리고 반년 전(1월) 소비를 대신 끌어와 진단한다.
    const txs = [
      ...[1, 2, 3, 4, 5, 6].map((m) => at(m, 100_000)),
      at(7, 100_000, 'DELIVERY_FOOD', 30),
    ];
    const s = buildSummary(txs, NOW);
    expect(s.monthsCovered).toBe(6);
    expect(toKstIso(s.periodFrom!)).toBe('2026-02-01T00:00:00.000+09:00');
    expect(toKstIso(s.periodTo!)).toBe('2026-08-01T00:00:00.000+09:00');
    expect(s.monthlyTrend.map((m) => m.month)).toEqual([
      '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    ]);
    expect(s.totalAmount).toBe(600_000); // 1월 10만원은 빠진다
  });

  it('6개월보다 오래된 거래는 제외한다', () => {
    const txs = [at(6, 100_000), tx({ approvedAt: kstDate(2025, 11, 10, 12, 0), amount: 500_000 })];
    const s = buildSummary(txs, NOW);
    expect(s.totalAmount).toBe(100_000);
  });

  it('거래가 전혀 없으면 빈 요약을 반환한다', () => {
    const s = buildSummary([], NOW);
    expect(s.monthsCovered).toBe(0);
    expect(s.monthlyAvgTotalAmount).toBe(0);
    expect(s.periodFrom).toBeNull();
    expect(s.byCategory).toEqual([]);
  });
});

describe('buildSummary — EXCLUDED 처리', () => {
  it('EXCLUDED 는 모든 집계에서 빠진다', () => {
    const txs = [
      at(6, 100_000, 'DELIVERY_FOOD'),
      tx({ approvedAt: kstDate(2026, 6, 25, 10, 0), amount: 2_850_000, category: 'EXCLUDED', txType: 'TRANSFER_IN' }),
    ];
    const s = buildSummary(txs, NOW);
    expect(s.totalAmount).toBe(100_000);
    expect(s.byCategory.map((c) => c.category)).not.toContain('EXCLUDED');
  });

  it('월급(TRANSFER_IN)이 지출 총액을 오염시키지 않는다', () => {
    const txs = [1, 2, 3, 4, 5, 6].flatMap((m) => [
      at(m, 100_000),
      tx({ approvedAt: kstDate(2026, m, 25, 10, 0), amount: 2_850_000, category: 'EXCLUDED', txType: 'TRANSFER_IN' }),
    ]);
    expect(buildSummary(txs, NOW).monthlyAvgTotalAmount).toBe(100_000);
  });

  it('UNCLASSIFIED 는 집계에 포함한다 (실제로 나간 돈이므로)', () => {
    const txs = [at(6, 100_000, 'DELIVERY_FOOD'), at(6, 50_000, 'UNCLASSIFIED')];
    const s = buildSummary(txs, NOW);
    expect(s.totalAmount).toBe(150_000);
    expect(s.byCategory.map((c) => c.category)).toContain('UNCLASSIFIED');
  });
});

describe('buildSummary — 카테고리 집계', () => {
  it('카테고리별 월평균·비중·건수를 낸다', () => {
    const txs = [
      ...[1, 2, 3, 4, 5, 6].map((m) => at(m, 180_000, 'DELIVERY_FOOD')),
      ...[1, 2, 3, 4, 5, 6].map((m) => at(m, 60_000, 'TRANSPORT_CAR')),
    ];
    const s = buildSummary(txs, NOW);
    const delivery = s.byCategory.find((c) => c.category === 'DELIVERY_FOOD')!;
    expect(delivery.monthlyAvgAmount).toBe(180_000);
    expect(delivery.totalAmount).toBe(1_080_000);
    expect(delivery.txCount).toBe(6);
    expect(delivery.shareRate).toBeCloseTo(0.75, 4);
  });

  it('월평균 큰 순으로 정렬한다', () => {
    const txs = [at(6, 50_000, 'TRANSPORT_CAR'), at(6, 200_000, 'SHOPPING'), at(6, 100_000, 'DINING_OUT')];
    const s = buildSummary(txs, NOW);
    expect(s.byCategory.map((c) => c.category)).toEqual(['SHOPPING', 'DINING_OUT', 'TRANSPORT_CAR']);
  });

  it('monthlyAvgByCategory 를 함께 제공한다 (절약 목표 슬라이더 상한)', () => {
    const txs = [1, 2].map((m) => at(m, 100_000, 'SHOPPING'));
    const s = buildSummary(txs, NOW);
    // 1~6월 중 1월부터 데이터가 있으므로 monthsCovered = 6
    expect(s.monthsCovered).toBe(6);
    expect(s.monthlyAvgByCategory.SHOPPING).toBe(Math.round(200_000 / 6));
  });
});

describe('buildSummary — 월별 추이', () => {
  it('거래 없는 월도 0으로 채워 그래프에 구멍이 없다', () => {
    const s = buildSummary([at(1, 100_000), at(6, 100_000)], NOW);
    expect(s.monthlyTrend).toHaveLength(6);
    expect(s.monthlyTrend.map((p) => p.month)).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    ]);
    expect(s.monthlyTrend[1].totalAmount).toBe(0);
  });
});

describe('buildSummary — 시간대 분포 (페르소나 시간대 축의 입력)', () => {
  it('KST 기준으로 시간대를 나눈다', () => {
    const txs = [
      at(6, 5_000, 'CAFE_SNACK', 1, 8), // MORNING
      at(6, 5_000, 'CAFE_SNACK', 2, 12), // LUNCH
      at(6, 20_000, 'DELIVERY_FOOD', 3, 19), // EVENING
      at(6, 20_000, 'DELIVERY_FOOD', 4, 23), // NIGHT
      at(6, 20_000, 'DELIVERY_FOOD', 5, 2), // NIGHT (새벽)
    ];
    const s = buildSummary(txs, NOW);
    expect(s.timeBandCounts).toEqual({ MORNING: 1, LUNCH: 1, EVENING: 1, NIGHT: 2 });
  });

  it('시간대 축은 승인 건수 기준이라 이체는 세지 않는다', () => {
    const txs = [
      at(6, 20_000, 'DELIVERY_FOOD', 1, 19),
      tx({ approvedAt: kstDate(2026, 6, 2, 8, 0), amount: 500_000, category: 'UNCLASSIFIED', txType: 'TRANSFER_OUT' }),
    ];
    const s = buildSummary(txs, NOW);
    expect(s.timeBandCounts.MORNING).toBe(0);
    expect(s.timeBandCounts.EVENING).toBe(1);
    // 다만 금액 집계에는 포함된다
    expect(s.totalAmount).toBe(520_000);
  });

  it('시간별 분포는 항상 24칸이다', () => {
    const s = buildSummary([at(6, 10_000, 'DELIVERY_FOOD', 1, 19)], NOW);
    expect(s.hourlyDistribution).toHaveLength(24);
    expect(s.hourlyDistribution[19].txCount).toBe(1);
    expect(s.hourlyDistribution[3].txCount).toBe(0);
  });
});

describe('findTopCategory', () => {
  const summaryOf = (txs: SummaryTransaction[]) => buildSummary(txs, NOW);

  it('최다 지출 카테고리를 반환한다', () => {
    const r = findTopCategory(summaryOf([at(6, 200_000, 'DELIVERY_FOOD'), at(6, 100_000, 'SHOPPING')]));
    expect(r.category).toBe('DELIVERY_FOOD');
    expect(r.runnerUpCategory).toBe('SHOPPING');
    expect(r.isTie).toBe(false);
  });

  it('FIXED 는 후보에서 뺀다 (줄일 수 있는 소비가 아니므로)', () => {
    const r = findTopCategory(summaryOf([at(6, 500_000, 'FIXED_BILLS'), at(6, 100_000, 'SHOPPING')]));
    expect(r.category).toBe('SHOPPING');
  });

  it('UNCLASSIFIED 도 후보에서 뺀다', () => {
    const r = findTopCategory(summaryOf([at(6, 500_000, 'UNCLASSIFIED'), at(6, 100_000, 'DINING_OUT')]));
    expect(r.category).toBe('DINING_OUT');
  });

  it('동점이면 isTie 를 알려준다', () => {
    const r = findTopCategory(summaryOf([at(6, 100_000, 'SHOPPING'), at(6, 100_000, 'DINING_OUT')]));
    expect(r.isTie).toBe(true);
  });

  it('후보가 없으면 null', () => {
    expect(findTopCategory(summaryOf([])).category).toBeNull();
  });
});

describe('summarizeRecurring', () => {
  it('정기결제만 모아 금액 큰 순으로 준다', () => {
    const txs = [
      tx({ category: 'FIXED_BILLS', isRecurring: true, merchantName: '넷플릭스', normalizedMerchant: '넷플릭스', amount: 13_500 }),
      tx({ category: 'FIXED_BILLS', isRecurring: true, merchantName: 'SK텔레콤', normalizedMerchant: 'sk텔레콤', amount: 55_000 }),
      tx({ category: 'CAFE_SNACK', isRecurring: false, merchantName: '스타벅스', normalizedMerchant: '스타벅스', amount: 5_800 }),
    ];
    const r = summarizeRecurring(txs);
    expect(r).toHaveLength(2);
    expect(r[0].merchantName).toBe('SK텔레콤');
  });
});
