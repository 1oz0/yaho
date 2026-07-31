/**
 * 소비 집계 — 순수 함수. NestJS 의존 없음. `now` 는 인자로 받는다.
 *
 * 기준 규칙 (§6-1)
 *  - 기준 기간은 **직전 6개 완결 월**. 월 경계는 KST 매월 1일 00:00.
 *  - 이력이 6개월 미만이면 **존재하는 월 수 n** 으로만 평균을 낸다.
 *  - `EXCLUDED`(수입·계좌간이체·취소 상계분)는 모든 집계에서 뺀다.
 *  - 진행 중인 부분 월은 **평균 계산에서 제외**한다. (챌린지 진척 계산에서는 쓴다)
 *    단, 그 달의 거래 이력이 이미 월말까지 닿아 있으면 완결로 본다 — 아래 참조.
 *
 * UNCLASSIFIED 는 집계에 **포함**한다. 실제로 나간 돈이기 때문이다.
 * 다만 페르소나 카테고리 축과 절약 목표 대상에서는 빠진다(각각 PERSONA_CATEGORIES /
 * SPENDABLE_CATEGORIES 가 통제). 사용자가 미분류를 확정하면 총액은 그대로인 채
 * 카테고리 분포만 또렷해진다.
 */
import { TIME_BANDS, timeBandOfHour, type TimeBand } from '../common/constants/persona';
import { TX_CATEGORIES, type TxCategory } from '../common/constants/tx-category';
import {
  addDays,
  currentPartialMonth,
  kstDayOfMonth,
  kstHour,
  kstMonthKey,
  lastNCompleteMonths,
  type MonthWindow,
} from '../common/utils/date-kst';
import { safeRatio } from '../common/utils/ratio';

export interface SummaryTransaction {
  approvedAt: Date;
  amount: number;
  category: string;
  txType: string;
  isRecurring: boolean;
  merchantName: string;
  normalizedMerchant: string;
}

export interface CategorySummary {
  category: TxCategory;
  /** 완결 월 기준 월평균 (원) */
  monthlyAvgAmount: number;
  /** 기간 총액 (원) */
  totalAmount: number;
  /** 전체 지출 대비 비중 0~1 */
  shareRate: number;
  txCount: number;
}

export interface MonthlyPoint {
  /** "2026-06" */
  month: string;
  totalAmount: number;
  txCount: number;
}

export interface HourPoint {
  /** 0~23 (KST) */
  hour: number;
  txCount: number;
  totalAmount: number;
}

export interface TimeBandPoint {
  timeBand: TimeBand;
  txCount: number;
  totalAmount: number;
}

export interface AnalysisSummary {
  /** 평균 계산에 사용한 완결 월 수. 데이터가 짧으면 6보다 작다. */
  monthsCovered: number;
  /** 집계 구간 시작 (첫 완결 월 1일 00:00 KST) */
  periodFrom: Date | null;
  /** 집계 구간 끝 (마지막 완결 월의 다음 달 1일 00:00 KST, exclusive) */
  periodTo: Date | null;
  /** 기간 총 지출 */
  totalAmount: number;
  /** 월평균 총 지출 — 페르소나 소비량 축의 분자 */
  monthlyAvgTotalAmount: number;
  byCategory: CategorySummary[];
  monthlyTrend: MonthlyPoint[];
  hourlyDistribution: HourPoint[];
  timeBandDistribution: TimeBandPoint[];
  /** 시간대별 승인 건수 — 페르소나 시간대 축의 입력 */
  timeBandCounts: Record<TimeBand, number>;
  /** 카테고리별 월평균 — 절약 목표 슬라이더 최대값의 근거 */
  monthlyAvgByCategory: Record<string, number>;
  totalTxCount: number;
}

const DEFAULT_MONTHS = 6;

/**
 * 진행 중인 달을 완결 월로 인정할 최소 데이터 커버리지.
 *
 * "부분 월 제외" 규칙이 막으려는 것은 **3일치를 한 달로 나눠 평균이 무너지는 일**이지,
 * 달력상 1일이 안 지났다는 사실 자체가 아니다. 그래서 달력이 아니라 **데이터**로 판정한다.
 *   · 7월 5일에 연동 → 7월 데이터가 4일치(13%) → 제외 (원래 의도 그대로)
 *   · 7월 31일에 연동 → 7월 데이터가 30일치(97%) → 포함
 *
 * 후자를 제외하면 멀쩡한 한 달을 통째로 버리면서 그만큼 더 오래된 달을 끌어와,
 * "최근 6개월" 이라면서 반년 전 소비로 진단하게 된다.
 */
const PARTIAL_MONTH_MIN_COVERAGE = 0.8;

/** 집계에서 완전히 빠지는 카테고리 */
function isAggregated(category: string): boolean {
  return category !== 'EXCLUDED';
}

/** 그 달의 며칠까지 거래가 있는지 ÷ 그 달의 일수 */
function monthCoverage(
  transactions: readonly SummaryTransaction[],
  window: MonthWindow,
): number {
  let lastDay = 0;
  for (const tx of transactions) {
    if (kstMonthKey(tx.approvedAt) !== window.key) continue;
    const day = kstDayOfMonth(tx.approvedAt);
    if (day > lastDay) lastDay = day;
  }
  if (lastDay === 0) return 0;
  // window.end 는 다음 달 1일 00:00 이므로 하루 빼면 이 달의 마지막 날이다
  const daysInMonth = kstDayOfMonth(addDays(window.end, -1));
  return lastDay / daysInMonth;
}

/**
 * 6개월(또는 존재하는 만큼) 소비 요약을 만든다.
 *
 * @param transactions 사용자 거래 전체 (기간 필터는 여기서 한다)
 * @param now 기준 시각 — ClockService.now() 를 넘긴다
 */
export function buildSummary(
  transactions: readonly SummaryTransaction[],
  now: Date,
  months = DEFAULT_MONTHS,
): AnalysisSummary {
  const spendable = transactions.filter((t) => isAggregated(t.category));

  // 진행 중인 달이 사실상 다 찼으면 창에 넣고, 창 길이를 지키려 가장 오래된 달을 뺀다.
  const partial = currentPartialMonth(now);
  const windows =
    monthCoverage(spendable, partial) >= PARTIAL_MONTH_MIN_COVERAGE
      ? [...lastNCompleteMonths(now, months - 1), partial]
      : lastNCompleteMonths(now, months);

  // --- monthsCovered ---------------------------------------------------------
  // 데이터가 시작된 월부터 마지막 완결 월까지를 센다.
  // "거래가 있는 월만" 세면 중간의 진짜 무지출 월이 빠져 평균이 부풀려진다.
  const monthKeysWithData = new Set(spendable.map((t) => kstMonthKey(t.approvedAt)));
  const firstIndex = windows.findIndex((w) => monthKeysWithData.has(w.key));

  if (firstIndex === -1) {
    return emptySummary();
  }

  const covered: MonthWindow[] = windows.slice(firstIndex);
  const monthsCovered = covered.length;
  const coveredKeys = new Set(covered.map((w) => w.key));

  // 완결 월에 속한 거래만 평균 계산에 쓴다 (진행 중인 부분 월 제외)
  const inPeriod = spendable.filter((t) => coveredKeys.has(kstMonthKey(t.approvedAt)));

  // --- 카테고리별 집계 -------------------------------------------------------
  const totals = new Map<string, { amount: number; count: number }>();
  for (const tx of inPeriod) {
    const entry = totals.get(tx.category) ?? { amount: 0, count: 0 };
    entry.amount += tx.amount;
    entry.count += 1;
    totals.set(tx.category, entry);
  }

  const totalAmount = [...totals.values()].reduce((s, v) => s + v.amount, 0);

  const byCategory: CategorySummary[] = TX_CATEGORIES.filter(
    (c) => c !== 'EXCLUDED' && totals.has(c),
  )
    .map((category) => {
      const entry = totals.get(category)!;
      return {
        category,
        monthlyAvgAmount: Math.round(entry.amount / monthsCovered),
        totalAmount: entry.amount,
        shareRate: safeRatio(entry.amount, totalAmount),
        txCount: entry.count,
      };
    })
    .sort((a, b) => b.monthlyAvgAmount - a.monthlyAvgAmount);

  const monthlyAvgByCategory: Record<string, number> = {};
  for (const c of byCategory) monthlyAvgByCategory[c.category] = c.monthlyAvgAmount;

  // --- 월별 추이 -------------------------------------------------------------
  // 거래가 없는 월도 0으로 채워야 그래프에 구멍이 생기지 않는다.
  const monthlyTrend: MonthlyPoint[] = covered.map((w) => {
    const rows = inPeriod.filter((t) => kstMonthKey(t.approvedAt) === w.key);
    return {
      month: w.key,
      totalAmount: rows.reduce((s, t) => s + t.amount, 0),
      txCount: rows.length,
    };
  });

  // --- 시간대 분포 -----------------------------------------------------------
  // 페르소나 시간대 축은 "승인 건수" 기준이므로 APPROVAL 만 센다 (§6-2).
  // 이체는 소비 시각을 대표하지 않는다.
  const approvals = inPeriod.filter((t) => t.txType === 'APPROVAL');

  const hourlyDistribution: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    txCount: 0,
    totalAmount: 0,
  }));
  const timeBandCounts = Object.fromEntries(TIME_BANDS.map((b) => [b, 0])) as Record<
    TimeBand,
    number
  >;
  const timeBandAmounts = Object.fromEntries(TIME_BANDS.map((b) => [b, 0])) as Record<
    TimeBand,
    number
  >;

  for (const tx of approvals) {
    const hour = kstHour(tx.approvedAt);
    hourlyDistribution[hour].txCount += 1;
    hourlyDistribution[hour].totalAmount += tx.amount;

    const band = timeBandOfHour(hour);
    timeBandCounts[band] += 1;
    timeBandAmounts[band] += tx.amount;
  }

  const timeBandDistribution: TimeBandPoint[] = TIME_BANDS.map((timeBand) => ({
    timeBand,
    txCount: timeBandCounts[timeBand],
    totalAmount: timeBandAmounts[timeBand],
  }));

  return {
    monthsCovered,
    periodFrom: covered[0].start,
    periodTo: covered[covered.length - 1].end,
    totalAmount,
    monthlyAvgTotalAmount: Math.round(totalAmount / monthsCovered),
    byCategory,
    monthlyTrend,
    hourlyDistribution,
    timeBandDistribution,
    timeBandCounts,
    monthlyAvgByCategory,
    totalTxCount: inPeriod.length,
  };
}

function emptySummary(): AnalysisSummary {
  return {
    monthsCovered: 0,
    periodFrom: null,
    periodTo: null,
    totalAmount: 0,
    monthlyAvgTotalAmount: 0,
    byCategory: [],
    monthlyTrend: [],
    hourlyDistribution: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      txCount: 0,
      totalAmount: 0,
    })),
    timeBandDistribution: TIME_BANDS.map((timeBand) => ({
      timeBand,
      txCount: 0,
      totalAmount: 0,
    })),
    timeBandCounts: Object.fromEntries(TIME_BANDS.map((b) => [b, 0])) as Record<TimeBand, number>,
    monthlyAvgByCategory: {},
    totalTxCount: 0,
  };
}

export interface TopCategoryResult {
  category: TxCategory | null;
  monthlyAvgAmount: number;
  shareRate: number;
  runnerUpCategory: TxCategory | null;
  runnerUpAmount: number;
  /** 1위와 2위가 동점인가 — 프론트가 "박빙" 문구를 띄울 수 있다 */
  isTie: boolean;
}

/**
 * 최다 지출 카테고리.
 * FIXED / UNCLASSIFIED 는 "줄일 수 있는 소비"가 아니므로 후보에서 뺀다.
 */
export function findTopCategory(summary: AnalysisSummary): TopCategoryResult {
  const candidates = summary.byCategory.filter(
    (c) => c.category !== 'FIXED_BILLS' && c.category !== 'UNCLASSIFIED',
  );

  if (candidates.length === 0) {
    return {
      category: null,
      monthlyAvgAmount: 0,
      shareRate: 0,
      runnerUpCategory: null,
      runnerUpAmount: 0,
      isTie: false,
    };
  }

  const [first, second] = candidates;
  return {
    category: first.category,
    monthlyAvgAmount: first.monthlyAvgAmount,
    shareRate: first.shareRate,
    runnerUpCategory: second?.category ?? null,
    runnerUpAmount: second?.monthlyAvgAmount ?? 0,
    isTie: second !== undefined && second.monthlyAvgAmount === first.monthlyAvgAmount,
  };
}

/** 정기결제 요약 — 분석 화면의 "매달 빠져나가는 돈" */
export interface RecurringSummary {
  merchantName: string;
  normalizedMerchant: string;
  monthlyAmount: number;
  occurrences: number;
}

export function summarizeRecurring(
  transactions: readonly SummaryTransaction[],
): RecurringSummary[] {
  const byMerchant = new Map<string, SummaryTransaction[]>();
  for (const tx of transactions) {
    if (!tx.isRecurring) continue;
    const list = byMerchant.get(tx.normalizedMerchant);
    if (list) list.push(tx);
    else byMerchant.set(tx.normalizedMerchant, [tx]);
  }

  return [...byMerchant.entries()]
    .map(([normalizedMerchant, items]) => ({
      normalizedMerchant,
      merchantName: items[0].merchantName,
      monthlyAmount: items[items.length - 1].amount,
      occurrences: items.length,
    }))
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}
