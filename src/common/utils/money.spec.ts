import { distributeByWeight, splitEvenlyWithRemainderLast, sum } from './money';

describe('splitEvenlyWithRemainderLast', () => {
  it('나누어떨어지면 균등 분배한다', () => {
    expect(splitEvenlyWithRemainderLast(100_000, 4)).toEqual([25_000, 25_000, 25_000, 25_000]);
  });

  it('반올림 잔액을 마지막 칸에 몰아넣어 합계를 정확히 보존한다', () => {
    const parts = splitEvenlyWithRemainderLast(100_000, 3);
    expect(parts).toEqual([33_333, 33_333, 33_334]);
    expect(sum(parts)).toBe(100_000);
  });

  it('§6-3 주차 예산: 2/4/8주 어떤 경우에도 합계가 어긋나지 않는다', () => {
    for (const weeks of [2, 4, 8]) {
      for (const total of [1, 999, 137_531, 1_000_000, 4_345_678]) {
        const parts = splitEvenlyWithRemainderLast(total, weeks);
        expect(parts).toHaveLength(weeks);
        expect(sum(parts)).toBe(total);
      }
    }
  });

  it('총액이 칸 수보다 작아도 합계를 보존한다', () => {
    const parts = splitEvenlyWithRemainderLast(2, 4);
    expect(sum(parts)).toBe(2);
    expect(parts).toEqual([0, 0, 0, 2]);
  });

  it('음수 총액도 합계를 보존한다 (초과 지출 시나리오)', () => {
    const parts = splitEvenlyWithRemainderLast(-100_000, 3);
    expect(sum(parts)).toBe(-100_000);
  });

  it('buckets 가 0 이하면 예외', () => {
    expect(() => splitEvenlyWithRemainderLast(1000, 0)).toThrow();
  });
});

describe('distributeByWeight', () => {
  it('가중치 비율대로 나누되 합계를 보존한다', () => {
    const parts = distributeByWeight(100_000, [1, 1, 2]);
    expect(sum(parts)).toBe(100_000);
    expect(parts[2]).toBeGreaterThan(parts[0]);
  });

  it('가중치 합이 0이면 균등 분배로 폴백한다', () => {
    const parts = distributeByWeight(90_000, [0, 0, 0]);
    expect(sum(parts)).toBe(90_000);
  });

  it('나누어떨어지지 않아도 1원 오차가 남지 않는다', () => {
    const parts = distributeByWeight(100, [3, 3, 3]);
    expect(sum(parts)).toBe(100);
  });
});
