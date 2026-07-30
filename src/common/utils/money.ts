/**
 * 금액 유틸 — 순수 함수.
 *
 * 모든 금액은 원 단위 정수(Int)다. KRW 는 소수점이 없으므로
 * Decimal 없이도 정확하고, 부동소수 오차도 생기지 않는다 (§2-2).
 */

/** 원 단위 반올림. 계산 중간에 소수가 생기면 반드시 이걸 통과시킨다. */
export function toWon(value: number): number {
  return Math.round(value);
}

export function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * total 을 buckets 개로 균등 분배하되, **반올림 잔액을 마지막 칸에 몰아넣어**
 * 합계가 정확히 total 과 일치하게 한다 (§6-3 주차별 예산 규칙).
 *
 * 예) splitEvenlyWithRemainderLast(100_000, 3) → [33_333, 33_333, 33_334]
 *
 * 음수 total 도 안전하다 (Math.trunc 기반이라 부호에 대칭적).
 */
export function splitEvenlyWithRemainderLast(total: number, buckets: number): number[] {
  if (!Number.isInteger(buckets) || buckets <= 0) {
    throw new Error(`buckets 는 1 이상의 정수여야 합니다: ${buckets}`);
  }
  const rounded = toWon(total);
  const base = Math.trunc(rounded / buckets);
  const parts = new Array<number>(buckets).fill(base);
  parts[buckets - 1] = rounded - base * (buckets - 1);
  return parts;
}

/**
 * 비율에 따라 total 을 나누되 합계를 보존한다 (최대 잔여 방식).
 * weights 합이 0이면 균등 분배로 폴백한다.
 */
export function distributeByWeight(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const weightSum = sum(weights);
  if (weightSum <= 0) return splitEvenlyWithRemainderLast(total, weights.length);

  const rounded = toWon(total);
  const raw = weights.map((w) => (rounded * w) / weightSum);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = rounded - sum(floored);

  // 소수부가 큰 순서대로 1원씩 나눠준다 → 합계가 정확히 맞는다
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floored];
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    result[order[cursor % order.length].i] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return result;
}

/** "1,234,567원" — 로그·시드 검증 출력용 */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
