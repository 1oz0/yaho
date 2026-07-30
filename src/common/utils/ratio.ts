/**
 * 비율 유틸.
 *
 * Prisma Decimal 을 쓸 수 없으므로(SQLite 미지원) 비율은 DB 에 basis point 정수로
 * 저장한다. 100% = 10000. API 응답에서는 사람이 읽기 좋은 소수로 되돌린다.
 * 이 변환은 반드시 여기를 거친다 — 계산 지점마다 흩어지면 반올림이 어긋난다.
 */

export const BP_SCALE = 10_000;

/** 0.8234 → 8234 */
export function toBp(ratio: number): number {
  return Math.round(ratio * BP_SCALE);
}

/** 8234 → 0.8234 */
export function fromBp(bp: number): number {
  return bp / BP_SCALE;
}

/** 분모가 0이면 0을 반환한다. 데이터가 없을 때 NaN/Infinity 가 응답에 새는 걸 막는다. */
export function safeRatio(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

/** 응답용 소수 자릿수 정리. 기본 4자리. */
export function roundRatio(ratio: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(ratio * f) / f;
}
