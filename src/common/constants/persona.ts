/** 페르소나 3축 정의 (§6-2) */

/** 시간대 축 — 승인 "건수" 최다 구간, KST 기준 */
export const TIME_BANDS = ['MORNING', 'LUNCH', 'EVENING', 'NIGHT'] as const;
export type TimeBand = (typeof TIME_BANDS)[number];

/**
 * 시간대 경계 (KST 시각, 양끝 포함).
 * NIGHT 는 자정을 넘어가므로 wrap = true.
 */
export const TIME_BAND_RANGES: Record<TimeBand, { fromHour: number; toHour: number; wrap: boolean; label: string }> = {
  MORNING: { fromHour: 5, toHour: 10, wrap: false, label: '아침형' },
  LUNCH: { fromHour: 11, toHour: 16, wrap: false, label: '점심형' },
  EVENING: { fromHour: 17, toHour: 21, wrap: false, label: '저녁형' },
  NIGHT: { fromHour: 22, toHour: 4, wrap: true, label: '심야형' },
};

/** KST 시각(0~23) → 시간대 축 */
export function timeBandOfHour(hour: number): TimeBand {
  if (hour >= 5 && hour <= 10) return 'MORNING';
  if (hour >= 11 && hour <= 16) return 'LUNCH';
  if (hour >= 17 && hour <= 21) return 'EVENING';
  return 'NIGHT'; // 22~23, 0~4
}

/** 소비량 축 — 연령대 벤치마크 대비 */
export const SPENDING_LEVELS = ['LOW', 'NORMAL', 'OVER'] as const;
export type SpendingLevel = (typeof SPENDING_LEVELS)[number];

/**
 * 소비량 축 경계.
 *   LOW    : ratio < 0.80
 *   NORMAL : 0.80 <= ratio <= 1.20   ← 경계값 정확히 0.80 / 1.20 은 NORMAL
 *   OVER   : ratio > 1.20
 */
export const SPENDING_LEVEL_THRESHOLDS = {
  lowUpperExclusive: 0.8,
  overLowerExclusive: 1.2,
} as const;

export function spendingLevelOfRatio(ratio: number): SpendingLevel {
  if (ratio < SPENDING_LEVEL_THRESHOLDS.lowUpperExclusive) return 'LOW';
  if (ratio > SPENDING_LEVEL_THRESHOLDS.overLowerExclusive) return 'OVER';
  return 'NORMAL';
}

/** 연령대 구분 — SpendingBenchmark 조회 키 */
export const AGE_BANDS = [
  '10S',
  '20S_EARLY',
  '20S_LATE',
  '30S_EARLY',
  '30S_LATE',
  '40S',
  '50S',
  '60S_PLUS',
] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** 벤치마크 scope — 'TOTAL' 또는 개별 카테고리 코드 */
export const BENCHMARK_SCOPE_TOTAL = 'TOTAL';
