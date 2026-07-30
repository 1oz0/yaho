/**
 * 정기결제 탐지 — 순수 함수, 분류 파이프라인 5순위.
 *
 * 판정 조건 (§5-2)
 *   동일 정규화 가맹점 + 금액 편차 5% 이내 + 25~35일 주기가 **3회 이상** 반복
 *
 * "3회 이상"은 **결제 건수**가 3건 이상이라는 뜻으로 해석한다.
 * 2건이면 주기가 한 번밖에 관측되지 않아 우연일 수 있다. 3건이면 주기가 2회 관측된다.
 * (2건짜리는 탐지되지 않아야 한다 — 단위 테스트로 고정)
 */
import { RECURRING_DETECTION } from '../../common/constants/transaction';

export interface RecurringCandidate {
  normalizedMerchant: string;
  amount: number;
  approvedAt: Date;
}

export interface RecurringGroup {
  normalizedMerchant: string;
  /** 정기결제로 인정된 건수 */
  occurrences: number;
  /** 대표 금액 (중앙값) */
  typicalAmount: number;
  /** 평균 결제 주기(일) */
  averageIntervalDays: number;
  /** 매월 결제일 (가장 흔한 일자) */
  dayOfMonth: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30.44;

/**
 * 가맹점의 월평균 이용 횟수 상한.
 * 이보다 자주 쓰는 곳은 정기결제(월 1회 청구)가 아니라 생활 소비다.
 */
const MAX_TX_PER_MONTH = 3;

/**
 * 결제일(일자) 허용 흔들림.
 * §4-3 의 "매월 같은 날 같은 금액"을 반영한다. 주말/공휴일 이월을 감안해 ±3일까지 허용한다.
 */
const MAX_DAY_OF_MONTH_DRIFT = 3;

/**
 * 정기결제 그룹을 찾는다.
 *
 * @param transactions 분석 대상 거래 (기간 제한은 호출부에서)
 * @param kstDayOfMonth 날짜에서 KST 기준 일(1~31)을 뽑는 함수. 주입해서 순수성을 유지한다.
 */
export function detectRecurring(
  transactions: readonly RecurringCandidate[],
  kstDayOfMonth: (date: Date) => number,
): RecurringGroup[] {
  // 1) 정규화 가맹점명으로 묶는다
  const byMerchant = new Map<string, RecurringCandidate[]>();
  for (const tx of transactions) {
    if (!tx.normalizedMerchant) continue;
    const list = byMerchant.get(tx.normalizedMerchant);
    if (list) list.push(tx);
    else byMerchant.set(tx.normalizedMerchant, [tx]);
  }

  const groups: RecurringGroup[] = [];

  for (const [merchant, txsRaw] of byMerchant) {
    if (txsRaw.length < RECURRING_DETECTION.minOccurrences) continue;

    const txs = [...txsRaw].sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime());

    // 자주 가는 곳은 정기결제가 아니다.
    //
    // 대중교통·편의점처럼 월 10회 이상 쓰는 가맹점은 금액이 고만고만해서,
    // 그중 일부만 뽑으면 "25~35일 간격 3회"가 우연히 성립해버린다.
    // 실제로 시드 데이터에서 "광주시내버스"가 정기결제로 오탐됐다.
    // 구독·통신·보험은 본질적으로 월 1회 청구되므로 이용 빈도로 먼저 거른다.
    const spanMonths = Math.max(
      1,
      (txs[txs.length - 1].approvedAt.getTime() - txs[0].approvedAt.getTime()) /
        DAY_MS /
        DAYS_PER_MONTH,
    );
    if (txs.length / spanMonths > MAX_TX_PER_MONTH) continue;

    // 2) 금액이 비슷한 것끼리 다시 묶는다.
    //    같은 가맹점이라도 "넷플릭스 13,500원 정기결제"와 일회성 결제가 섞일 수 있다.
    for (const cluster of clusterByAmount(txs, RECURRING_DETECTION.amountTolerance)) {
      if (cluster.length < RECURRING_DETECTION.minOccurrences) continue;

      // 3) 연속한 결제 간격이 25~35일 범위인 최장 구간을 찾는다.
      let runStart = 0;
      let bestStart = 0;
      let bestEnd = 0;

      for (let i = 1; i < cluster.length; i += 1) {
        const days = Math.round(
          (cluster[i].approvedAt.getTime() - cluster[i - 1].approvedAt.getTime()) / DAY_MS,
        );
        const inRange =
          days >= RECURRING_DETECTION.minIntervalDays && days <= RECURRING_DETECTION.maxIntervalDays;

        if (!inRange) {
          runStart = i;
          continue;
        }
        if (i - runStart > bestEnd - bestStart) {
          bestStart = runStart;
          bestEnd = i;
        }
      }

      const run = cluster.slice(bestStart, bestEnd + 1);
      if (run.length < RECURRING_DETECTION.minOccurrences) continue;

      // 4) 매월 "같은 날" 청구되는지 확인한다 (§4-3).
      //    간격이 25~35일이면 결제일이 조금씩 밀릴 수 있으므로 ±3일까지 허용한다.
      //    이 조건이 없으면, 결제일이 제멋대로 흩어진 우연한 3연속도 정기결제로 잡힌다.
      const days = run.map((t) => kstDayOfMonth(t.approvedAt));
      if (maxCircularDayDrift(days) > MAX_DAY_OF_MONTH_DRIFT) continue;

      const bestIntervals = run
        .slice(1)
        .map((t, i) => Math.round((t.approvedAt.getTime() - run[i].approvedAt.getTime()) / DAY_MS));

      groups.push({
        normalizedMerchant: merchant,
        occurrences: run.length,
        typicalAmount: median(run.map((t) => t.amount)),
        averageIntervalDays: Math.round(
          bestIntervals.reduce((s, v) => s + v, 0) / bestIntervals.length,
        ),
        dayOfMonth: mostCommon(days),
      });
      break; // 한 가맹점당 정기결제 그룹은 하나만 인정한다
    }
  }

  return groups.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

/** 정기결제로 판정된 가맹점명 집합 — rule-engine 에 그대로 넘긴다 */
export function toRecurringMerchantSet(groups: readonly RecurringGroup[]): Set<string> {
  return new Set(groups.map((g) => g.normalizedMerchant));
}

/**
 * 금액이 비슷한 것끼리 묶는다.
 *
 * "금액 편차 5% 이내"(§5-2)를 **대표 금액 기준 ±5%** 로 해석한다.
 * 각 거래를 한 번씩 기준점(pivot)으로 놓고 그 주위 ±tolerance 에 드는 거래를 모은 뒤,
 * 가장 큰 묶음을 택한다.
 *
 * 앞에서부터 사슬처럼 비교하는 방식(직전 원소 기준)은 쓰지 않는다.
 * 9,700 / 10,000 / 10,400 처럼 **각각은 중심에서 5% 이내인데 양 끝끼리는 7% 벌어진**
 * 경우를 놓치고, 입력 순서에 따라 결과가 달라져 결정론성도 깨진다.
 */
function clusterByAmount(
  txs: readonly RecurringCandidate[],
  tolerance: number,
): RecurringCandidate[][] {
  const seen = new Map<string, RecurringCandidate[]>();

  for (const pivot of txs) {
    if (pivot.amount <= 0) continue;
    const members = txs.filter(
      (t) => Math.abs(t.amount - pivot.amount) / pivot.amount <= tolerance,
    );
    // 동일한 구성의 묶음은 한 번만 담는다
    const key = members
      .map((m) => `${m.approvedAt.getTime()}:${m.amount}`)
      .sort()
      .join('|');
    if (!seen.has(key)) seen.set(key, members);
  }

  return [...seen.values()]
    // 주기 계산은 시간순이어야 한다
    .map((c) => [...c].sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime()))
    // 큰 묶음 우선, 동점이면 금액이 작은 쪽 우선 (결정론성)
    .sort((a, b) => b.length - a.length || a[0].amount - b[0].amount);
}

/**
 * 결제일(1~31)들이 얼마나 흩어져 있는지.
 *
 * 월말/월초를 넘나드는 경우를 고려해 **순환 거리**로 잰다.
 * 31일과 2일은 29일 차이가 아니라 2일 차이로 본다 — 매월 말일 청구가 다음 달 초로
 * 밀리는 것은 흔한 일이고, 이걸 큰 차이로 보면 정상 정기결제를 놓친다.
 */
function maxCircularDayDrift(days: readonly number[]): number {
  if (days.length < 2) return 0;

  // 기준점을 바꿔가며 가장 좁게 모이는 폭을 찾는다
  let best = Number.POSITIVE_INFINITY;
  for (const pivot of days) {
    let maxDistance = 0;
    for (const day of days) {
      const raw = Math.abs(day - pivot);
      const distance = Math.min(raw, 31 - raw);
      if (distance > maxDistance) maxDistance = distance;
    }
    if (maxDistance < best) best = maxDistance;
  }
  return best;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function mostCommon(values: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let bestValue = values[0] ?? 0;
  let bestCount = 0;
  for (const [value, count] of counts) {
    // 동점이면 작은 값 — 결정론성을 위해
    if (count > bestCount || (count === bestCount && value < bestValue)) {
      bestValue = value;
      bestCount = count;
    }
  }
  return bestValue;
}
