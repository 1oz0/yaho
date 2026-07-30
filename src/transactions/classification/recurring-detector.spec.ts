import { kstDate, kstDayOfMonth } from '../../common/utils/date-kst';
import {
  detectRecurring,
  toRecurringMerchantSet,
  type RecurringCandidate,
} from './recurring-detector';

/** 매월 같은 날 같은 금액 결제를 n건 만든다 */
function monthly(
  merchant: string,
  amount: number,
  dayOfMonth: number,
  months: number[],
  amountOverrides: Record<number, number> = {},
): RecurringCandidate[] {
  return months.map((m) => ({
    normalizedMerchant: merchant,
    amount: amountOverrides[m] ?? amount,
    approvedAt: kstDate(2026, m, dayOfMonth, 3, 0),
  }));
}

const detect = (txs: RecurringCandidate[]) => detectRecurring(txs, kstDayOfMonth);

describe('detectRecurring — 3회 이상 규칙', () => {
  it('3회면 정기결제로 탐지된다', () => {
    const groups = detect(monthly('넷플릭스', 13_500, 15, [4, 5, 6]));
    expect(groups).toHaveLength(1);
    expect(groups[0].normalizedMerchant).toBe('넷플릭스');
    expect(groups[0].occurrences).toBe(3);
  });

  it('2회면 탐지되지 않는다 (주기가 한 번밖에 관측되지 않아 우연일 수 있다)', () => {
    expect(detect(monthly('넷플릭스', 13_500, 15, [5, 6]))).toHaveLength(0);
  });

  it('1회는 당연히 탐지되지 않는다', () => {
    expect(detect(monthly('넷플릭스', 13_500, 15, [6]))).toHaveLength(0);
  });

  it('6개월 연속이면 occurrences 가 6이다', () => {
    const groups = detect(monthly('멜론', 10_900, 7, [1, 2, 3, 4, 5, 6]));
    expect(groups[0].occurrences).toBe(6);
  });
});

describe('detectRecurring — 금액 편차 5% 규칙', () => {
  it('편차 5% 이내면 같은 정기결제로 본다', () => {
    // 10,000 기준 ±5% = 9,500 ~ 10,500
    const groups = detect(
      monthly('구독서비스', 10_000, 10, [4, 5, 6], { 5: 10_400, 6: 9_700 }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].occurrences).toBe(3);
  });

  it('편차가 5%를 크게 넘으면 묶이지 않아 탐지되지 않는다', () => {
    const groups = detect(
      monthly('변동가맹점', 10_000, 10, [4, 5, 6], { 5: 30_000, 6: 70_000 }),
    );
    expect(groups).toHaveLength(0);
  });

  it('같은 가맹점에 정기결제와 일회성 고액 결제가 섞여도 정기분만 잡는다', () => {
    const txs = [
      ...monthly('쿠팡', 7_890, 22, [4, 5, 6]), // 와우 멤버십
      { normalizedMerchant: '쿠팡', amount: 156_000, approvedAt: kstDate(2026, 5, 3, 21, 0) },
      { normalizedMerchant: '쿠팡', amount: 89_000, approvedAt: kstDate(2026, 6, 18, 22, 0) },
    ];
    const groups = detect(txs);
    expect(groups).toHaveLength(1);
    expect(groups[0].typicalAmount).toBe(7_890);
    expect(groups[0].occurrences).toBe(3);
  });
});

describe('detectRecurring — 주기 25~35일 규칙', () => {
  it('매월 같은 날이면 주기가 28~31일이라 통과한다', () => {
    const groups = detect(monthly('넷플릭스', 13_500, 15, [3, 4, 5, 6]));
    expect(groups[0].averageIntervalDays).toBeGreaterThanOrEqual(28);
    expect(groups[0].averageIntervalDays).toBeLessThanOrEqual(31);
  });

  it('주 단위(7일) 반복은 정기결제로 보지 않는다', () => {
    const txs: RecurringCandidate[] = [0, 7, 14, 21].map((d) => ({
      normalizedMerchant: '주간반복',
      amount: 5_000,
      approvedAt: kstDate(2026, 6, 1 + d, 12, 0),
    }));
    expect(detect(txs)).toHaveLength(0);
  });

  it('분기(90일) 주기는 정기결제로 보지 않는다', () => {
    const groups = detect(monthly('분기결제', 50_000, 10, [1, 4, 7]));
    expect(groups).toHaveLength(0);
  });

  it('중간에 결제가 끊기면 연속 구간만 센다', () => {
    // 1,2,3월 연속 → 3회. 6월은 간격이 벌어져 끊긴다.
    const groups = detect(monthly('구독', 9_900, 5, [1, 2, 3, 6]));
    expect(groups).toHaveLength(1);
    expect(groups[0].occurrences).toBe(3);
  });
});

describe('detectRecurring — 오탐 방지 (실제로 겪은 케이스)', () => {
  it('대중교통처럼 자주 쓰는 가맹점은 정기결제가 아니다', () => {
    // 시드 데이터에서 "광주시내버스"가 정기결제로 오탐된 적이 있다.
    // 금액이 고만고만해서, 그중 일부만 뽑으면 25~35일 간격 3회가 우연히 성립한다.
    const txs: RecurringCandidate[] = [];
    for (let month = 1; month <= 6; month += 1) {
      for (const day of [2, 5, 8, 11, 14, 17, 20, 23, 26, 29]) {
        txs.push({
          normalizedMerchant: '광주시내버스',
          amount: 1_500,
          approvedAt: kstDate(2026, month, day, 8, 0),
        });
      }
    }
    expect(detect(txs)).toHaveLength(0);
  });

  it('결제일이 제멋대로 흩어지면 정기결제가 아니다', () => {
    // 간격은 25~35일 안에 들지만 결제일이 3 → 31 → 27 로 튄다
    const txs: RecurringCandidate[] = [
      { normalizedMerchant: '들쭉날쭉', amount: 20_000, approvedAt: kstDate(2026, 1, 3, 12, 0) },
      { normalizedMerchant: '들쭉날쭉', amount: 20_000, approvedAt: kstDate(2026, 1, 31, 12, 0) },
      { normalizedMerchant: '들쭉날쭉', amount: 20_000, approvedAt: kstDate(2026, 2, 27, 12, 0) },
    ];
    expect(detect(txs)).toHaveLength(0);
  });

  it('월말 청구가 다음 달 초로 밀리는 것은 허용한다', () => {
    // 31일 → 2일은 순환 거리로 2일 차이. 흔한 이월이므로 정기결제로 인정해야 한다.
    const txs: RecurringCandidate[] = [
      { normalizedMerchant: '월말청구', amount: 30_000, approvedAt: kstDate(2026, 1, 31, 9, 0) },
      { normalizedMerchant: '월말청구', amount: 30_000, approvedAt: kstDate(2026, 3, 2, 9, 0) },
      { normalizedMerchant: '월말청구', amount: 30_000, approvedAt: kstDate(2026, 4, 1, 9, 0) },
    ];
    expect(detect(txs)).toHaveLength(1);
  });

  it('편의점 소액 다건도 정기결제로 잡히지 않는다', () => {
    const txs: RecurringCandidate[] = [];
    for (let month = 1; month <= 6; month += 1) {
      for (const day of [4, 9, 13, 18, 22, 27]) {
        txs.push({
          normalizedMerchant: 'gs25',
          amount: 5_000,
          approvedAt: kstDate(2026, month, day, 8, 0),
        });
      }
    }
    expect(detect(txs)).toHaveLength(0);
  });
});

describe('detectRecurring — 결과 형태', () => {
  it('대표 금액·결제일·주기를 함께 준다', () => {
    const groups = detect(monthly('SK텔레콤', 55_000, 26, [3, 4, 5, 6]));
    expect(groups[0]).toMatchObject({
      normalizedMerchant: 'SK텔레콤',
      typicalAmount: 55_000,
      dayOfMonth: 26,
    });
  });

  it('여러 정기결제를 금액 큰 순으로 반환한다', () => {
    const groups = detect([
      ...monthly('SK텔레콤', 55_000, 26, [4, 5, 6]),
      ...monthly('넷플릭스', 13_500, 15, [4, 5, 6]),
      ...monthly('멜론', 10_900, 7, [4, 5, 6]),
    ]);
    expect(groups.map((g) => g.normalizedMerchant)).toEqual(['SK텔레콤', '넷플릭스', '멜론']);
  });

  it('가맹점명이 빈 거래는 무시한다', () => {
    const txs = monthly('', 10_000, 10, [4, 5, 6]);
    expect(detect(txs)).toHaveLength(0);
  });

  it('toRecurringMerchantSet 이 rule-engine 입력 형태로 변환한다', () => {
    const groups = detect([
      ...monthly('넷플릭스', 13_500, 15, [4, 5, 6]),
      ...monthly('멜론', 10_900, 7, [4, 5, 6]),
    ]);
    const set = toRecurringMerchantSet(groups);
    expect(set.has('넷플릭스')).toBe(true);
    expect(set.has('멜론')).toBe(true);
    expect(set.has('스타벅스')).toBe(false);
  });

  it('빈 입력을 안전하게 처리한다', () => {
    expect(detect([])).toEqual([]);
  });

  it('결정론적이다 — 입력 순서가 달라도 같은 결과', () => {
    const txs = [
      ...monthly('넷플릭스', 13_500, 15, [4, 5, 6]),
      ...monthly('멜론', 10_900, 7, [4, 5, 6]),
    ];
    const forward = detect(txs);
    const reversed = detect([...txs].reverse());
    expect(reversed).toEqual(forward);
  });
});
