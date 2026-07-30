/**
 * 가상 거래 시드 — 발표 품질을 좌우하는 부분.
 *
 * 설계 원칙
 *  1) **재현성**: 고정 시드 PRNG(mulberry32). 같은 날 재시드하면 숫자가 100% 동일하다.
 *     리허설과 본 발표의 금액이 달라지면 안 된다 (§4-3).
 *  2) **시간 앵커**: 금액은 고정이되, 날짜는 시드 실행일의 KST 자정을 기준으로 상대 생성한다.
 *     날짜까지 하드코딩하면 시간이 지날수록 "최근 6개월" 창을 벗어난다 (docs/design.md §1-③).
 *  3) **카테고리 미저장**: MockTransaction 에는 카테고리 컬럼이 없다. 여기서 붙이는
 *     `_intended` 태그는 검증 assert 전용이며 DB 에 절대 들어가지 않는다.
 *
 * 생성 구간: 직전 6개 완결 월 + 진행 중인 부분 월(어제까지).
 * 월 경계는 KST 매월 1일 00:00 이다.
 */
import type { PrismaClient } from '@prisma/client';

import type { TxCategory } from '../../src/common/constants/tx-category';
import { timeBandOfHour, type TimeBand } from '../../src/common/constants/persona';
import {
  addDays,
  currentPartialMonth,
  kstDayOfMonth,
  kstHour,
  kstDayOfWeek,
  kstMonthKey,
  lastNCompleteMonths,
  startOfKstMonth,
} from '../../src/common/utils/date-kst';
import { createPrng, type Prng } from '../../src/common/utils/prng';
import {
  ALCOHOL_MERCHANTS,
  BRANCH_POOL,
  CAFE_MERCHANTS,
  CONVENIENCE_MERCHANTS,
  DELIVERY_MERCHANTS,
  DINING_MERCHANTS,
  EDUCATION_MERCHANTS,
  GAME_MERCHANTS,
  HEALTH_MERCHANTS,
  RECURRING_MERCHANTS,
  SALARY,
  SHOPPING_MERCHANTS,
  TAXI_MERCHANTS,
  TRANSPORT_MERCHANTS,
  TRAVEL_MERCHANTS,
  UNCLASSIFIABLE_MERCHANTS,
  type SeedMerchant,
} from './data/merchants.data';
import type { SeededAccount } from './institutions';

/** 시드가 만들어내는 거래 1건. `_` 접두 필드는 검증 전용이며 DB 에 넣지 않는다. */
interface GeneratedTx {
  accountId: string;
  approvedAt: Date;
  merchantName: string;
  amount: number;
  txType: string;
  mcc: string | null;
  installmentMonths: number;
  memo: string | null;
  approvalNo: string | null;
  counterpartKey: string | null;

  _intended: TxCategory;
  _isRecurring: boolean;
  _isSubscription: boolean;
}

type BandWeights = Record<TimeBand, number>;

interface CategoryPlan {
  name: string;
  merchants: SeedMerchant[];
  /** 월 거래 건수 범위 */
  monthlyCount: [number, number];
  bandWeights: BandWeights;
  /** 요일 가중치 [일,월,화,수,목,금,토] */
  weekdayWeights: number[];
  /** 결제 카드 */
  cardUsage: SeededAccount['usage'][];
}

const EVEN_WEEK = [1, 1, 1, 1, 1, 1, 1];

/**
 * 카테고리별 생성 계획.
 *
 * 건수 × 가맹점 가중평균 금액이 곧 월평균 지출이 된다.
 * 배달이 최다 지출 카테고리가 되도록 튜닝했다 (페르소나 스토리 = "저녁마다 배달").
 */
const CATEGORY_PLANS: CategoryPlan[] = [
  {
    name: 'DELIVERY_FOOD',
    merchants: DELIVERY_MERCHANTS,
    monthlyCount: [7, 9], // × 약 24,400원 ≒ 월 19만원 (§4-3: 월 15만원 이상)
    bandWeights: { MORNING: 0, LUNCH: 1, EVENING: 6, NIGHT: 3 },
    weekdayWeights: [0.7, 1.2, 1.2, 1.2, 1.2, 1.4, 0.9], // 평일 저녁·야간 집중
    cardUsage: ['PRIMARY_CARD', 'SECONDARY_CARD'],
  },
  {
    name: 'DINING_OUT',
    merchants: DINING_MERCHANTS,
    monthlyCount: [3, 5], // 술집을 별도 축으로 뺐으므로 줄었다
    bandWeights: { MORNING: 0, LUNCH: 3, EVENING: 6, NIGHT: 0.5 },
    weekdayWeights: [0.8, 0.9, 0.9, 1, 1.1, 1.6, 1.4],
    cardUsage: ['PRIMARY_CARD', 'SECONDARY_CARD'],
  },
  {
    name: 'ALCOHOL_NIGHTLIFE',
    merchants: ALCOHOL_MERCHANTS,
    monthlyCount: [2, 3],
    bandWeights: { MORNING: 0, LUNCH: 0.2, EVENING: 4, NIGHT: 3 }, // 저녁~심야
    weekdayWeights: [0.4, 0.6, 0.6, 0.8, 1.4, 2, 1.4], // 목·금 집중
    cardUsage: ['PRIMARY_CARD'],
  },
  {
    name: 'CAFE_SNACK',
    merchants: CAFE_MERCHANTS,
    monthlyCount: [8, 10], // 편의점을 별도 축으로 뺐으므로 줄었다
    // 오전·점심 위주지만, MORNING 을 너무 키우면 시간대 축이 EVENING 에서 넘어간다.
    // → "최다 시간대 = 저녁" assert 가 이 균형을 지킨다.
    bandWeights: { MORNING: 4, LUNCH: 4, EVENING: 1.6, NIGHT: 0.4 },
    weekdayWeights: [0.5, 1.3, 1.3, 1.3, 1.3, 1.3, 0.7],
    cardUsage: ['PRIMARY_CARD', 'SECONDARY_CARD'],
  },
  {
    name: 'CONVENIENCE_STORE',
    merchants: CONVENIENCE_MERCHANTS,
    monthlyCount: [6, 8], // 아침 삼각김밥 · 퇴근길 편의점
    bandWeights: { MORNING: 3, LUNCH: 2, EVENING: 3, NIGHT: 1.2 },
    weekdayWeights: [0.7, 1.2, 1.2, 1.2, 1.2, 1.2, 0.9],
    cardUsage: ['PRIMARY_CARD', 'SECONDARY_CARD'],
  },
  {
    name: 'SHOPPING',
    merchants: SHOPPING_MERCHANTS,
    monthlyCount: [2, 3],
    bandWeights: { MORNING: 0.5, LUNCH: 2, EVENING: 4, NIGHT: 3 }, // 저녁·야간 편중
    weekdayWeights: EVEN_WEEK,
    cardUsage: ['PRIMARY_CARD'],
  },
  {
    name: 'TRANSPORT_CAR',
    merchants: TRANSPORT_MERCHANTS,
    monthlyCount: [9, 11],
    bandWeights: { MORNING: 3.5, LUNCH: 2, EVENING: 4.5, NIGHT: 0.5 }, // 출근보다 퇴근에 조금 더
    weekdayWeights: [0.4, 1.4, 1.4, 1.4, 1.4, 1.4, 0.6],
    cardUsage: ['PRIMARY_CARD', 'SECONDARY_CARD'],
  },
  {
    name: 'TAXI',
    merchants: TAXI_MERCHANTS,
    monthlyCount: [1, 2],
    bandWeights: { MORNING: 0.3, LUNCH: 0.5, EVENING: 1, NIGHT: 5 }, // 야간 택시
    weekdayWeights: [0.8, 0.7, 0.7, 0.8, 1, 1.8, 1.6],
    cardUsage: ['PRIMARY_CARD'],
  },
  {
    name: 'GAME_INAPP',
    merchants: GAME_MERCHANTS,
    monthlyCount: [1, 2],
    bandWeights: { MORNING: 0.2, LUNCH: 1, EVENING: 2, NIGHT: 4 }, // 심야 편중
    weekdayWeights: [1.4, 0.8, 0.8, 0.8, 1, 1.4, 1.6],
    cardUsage: ['PRIMARY_CARD'],
  },
  {
    name: 'HEALTH_FITNESS',
    merchants: HEALTH_MERCHANTS,
    monthlyCount: [1, 2],
    bandWeights: { MORNING: 2, LUNCH: 2, EVENING: 3, NIGHT: 0.3 },
    weekdayWeights: [0.8, 1.1, 1.1, 1.1, 1.1, 1.1, 1.2],
    cardUsage: ['PRIMARY_CARD', 'SECONDARY_CARD'],
  },
  {
    name: 'EDUCATION',
    merchants: EDUCATION_MERCHANTS,
    monthlyCount: [1, 2],
    bandWeights: { MORNING: 1, LUNCH: 2, EVENING: 3, NIGHT: 1 },
    weekdayWeights: [1.4, 0.8, 0.8, 0.8, 0.9, 1.3, 1.6],
    cardUsage: ['PRIMARY_CARD'],
  },
  {
    name: 'TRAVEL_STAY',
    merchants: TRAVEL_MERCHANTS,
    monthlyCount: [0, 1], // 드물지만 건당 금액이 크다
    bandWeights: { MORNING: 0.5, LUNCH: 2, EVENING: 2, NIGHT: 1.5 },
    weekdayWeights: EVEN_WEEK,
    cardUsage: ['PRIMARY_CARD'],
  },
  {
    name: 'UNCLASSIFIED',
    merchants: UNCLASSIFIABLE_MERCHANTS,
    monthlyCount: [2, 3], // 6~7개월 × 2.5 ≒ 17건 (§4-3: 12~20건)
    bandWeights: { MORNING: 1, LUNCH: 2, EVENING: 2, NIGHT: 1 },
    weekdayWeights: EVEN_WEEK,
    cardUsage: ['PRIMARY_CARD'],
  },
];

const BAND_HOURS: Record<TimeBand, number[]> = {
  MORNING: [5, 6, 7, 8, 9, 10],
  LUNCH: [11, 12, 13, 14, 15, 16],
  EVENING: [17, 18, 19, 20, 21],
  NIGHT: [22, 23, 0, 1, 2, 3, 4],
};

function pickBand(rng: Prng, weights: BandWeights): TimeBand {
  return rng.weighted(
    (Object.keys(weights) as TimeBand[])
      .filter((b) => weights[b] > 0)
      .map((b) => ({ value: b, weight: weights[b] })),
  );
}

/** 월 구간 안에서 요일 가중치를 반영해 하루를 고른 뒤, 시간대까지 붙여 승인 일시를 만든다. */
function pickApprovedAt(
  rng: Prng,
  monthStart: Date,
  daysAvailable: number,
  weekdayWeights: number[],
  bandWeights: BandWeights,
): Date {
  const candidates = Array.from({ length: daysAvailable }, (_, i) => {
    const day = addDays(monthStart, i);
    return { value: i, weight: weekdayWeights[kstDayOfWeek(day)] };
  });
  const dayOffset = rng.weighted(candidates);
  const band = pickBand(rng, bandWeights);
  const hour = rng.pick(BAND_HOURS[band]);

  // 새벽(0~4시)은 통념상 "전날 밤"이지만, 월 구간을 벗어나지 않도록 고른 날짜에 그대로
  // 붙인다. 시간대 축 분포에는 영향이 없다.
  const dayStart = addDays(monthStart, dayOffset);
  return new Date(dayStart.getTime() + (hour * 60 + rng.int(0, 59)) * 60_000);
}

function pickMerchant(rng: Prng, merchants: SeedMerchant[]): SeedMerchant {
  return rng.weighted(merchants.map((m) => ({ value: m, weight: m.pickWeight ?? 1 })));
}

/** 가맹점 평균가 ±35% 범위에서 100원 단위로 흔든다. */
function amountFor(rng: Prng, merchant: SeedMerchant): number {
  const raw = merchant.meanAmount * rng.float(0.65, 1.35);
  return Math.max(100, Math.round(raw / 100) * 100);
}

function merchantNameFor(rng: Prng, merchant: SeedMerchant): string {
  if (!merchant.branch) return merchant.base;
  return `${merchant.base} ${rng.pick(BRANCH_POOL)}`;
}

function approvalNo(rng: Prng): string {
  return String(rng.int(10_000_000, 99_999_999));
}

/** mcc 는 약 30% 를 null 로 만든다 (§4-1). 단, 원래 null 인 가맹점은 그대로 둔다. */
function mccFor(rng: Prng, merchant: SeedMerchant): string | null {
  if (merchant.mcc === null) return null;
  return rng.chance(0.3) ? null : merchant.mcc;
}

export interface SeedTransactionsResult {
  total: number;
  byIntended: Record<string, number>;
  /** 완결 월 기준 카테고리별 월평균 지출 (EXCLUDED/UNCLASSIFIED 제외) */
  monthlyAvgByCategory: Record<string, number>;
  /** 월평균 총지출 — 페르소나 소비량 축의 분자 */
  monthlyAvgTotalAmount: number;
  /** 최다 지출 카테고리 — 페르소나 카테고리 축 */
  topCategory: string;
  /** 시간대별 승인 건수 */
  timeBandCounts: Record<string, number>;
  /** 최다 시간대 — 페르소나 시간대 축 */
  topTimeBand: string;
  deliveryMonthlyAvgAmount: number;
  subscriptionCount: number;
  recurringMerchantCount: number;
  unclassifiableCount: number;
  cancelCount: number;
  salaryCount: number;
  internalTransferCount: number;
  monthKeys: string[];
  perMonthCounts: number[];
  spanFrom: Date;
  spanTo: Date;
}

export async function seedTransactions(
  prisma: PrismaClient,
  accounts: SeededAccount[],
  anchor: Date,
  seed: string,
): Promise<SeedTransactionsResult> {
  const rng = createPrng(seed);
  const txs: GeneratedTx[] = [];

  const accountByUsage = new Map<SeededAccount['usage'], SeededAccount>();
  for (const a of accounts) accountByUsage.set(a.usage, a);
  const primaryCard = accountByUsage.get('PRIMARY_CARD')!;
  const mainBank = accountByUsage.get('MAIN_BANK')!;
  const subBank = accountByUsage.get('SUB_BANK')!;

  const pickCard = (usages: SeededAccount['usage'][]): SeededAccount =>
    accountByUsage.get(
      rng.weighted(usages.map((u, i) => ({ value: u, weight: i === 0 ? 7 : 3 }))),
    ) ?? primaryCard;

  // --- 대상 월 구간: 직전 6개 완결 월 + 진행 중인 부분 월 -------------------
  const completeMonths = lastNCompleteMonths(anchor, 6);
  const partial = currentPartialMonth(anchor);
  /** 부분 월에서 사용할 일수 = 어제까지. 오늘이 1일이면 0일이라 생성하지 않는다. */
  const partialDays = kstDayOfMonth(anchor) - 1;

  const monthTargets: { start: Date; days: number; key: string; scale: number }[] = completeMonths.map(
    (m) => ({
      start: m.start,
      days: Math.round((m.end.getTime() - m.start.getTime()) / 86_400_000),
      key: m.key,
      scale: 1,
    }),
  );
  if (partialDays > 0) {
    const daysInMonth = Math.round((partial.end.getTime() - partial.start.getTime()) / 86_400_000);
    monthTargets.push({
      start: partial.start,
      days: partialDays,
      key: partial.key,
      scale: partialDays / daysInMonth,
    });
  }

  // --- 1) 카테고리별 일반 거래 ------------------------------------------------
  for (const month of monthTargets) {
    for (const plan of CATEGORY_PLANS) {
      const base = rng.int(plan.monthlyCount[0], plan.monthlyCount[1]);
      const count = Math.max(month.scale === 1 ? base : Math.round(base * month.scale), 0);

      for (let i = 0; i < count; i += 1) {
        const merchant = pickMerchant(rng, plan.merchants);
        const approvedAt = pickApprovedAt(
          rng,
          month.start,
          month.days,
          plan.weekdayWeights,
          plan.bandWeights,
        );
        const amount = amountFor(rng, merchant);
        const isTransferOut = merchant.base.startsWith('이체');
        const account = isTransferOut ? mainBank : pickCard(plan.cardUsage);

        txs.push({
          accountId: account.id,
          approvedAt,
          merchantName: merchantNameFor(rng, merchant),
          amount,
          txType: isTransferOut ? 'TRANSFER_OUT' : 'APPROVAL',
          mcc: mccFor(rng, merchant),
          // 쇼핑 10만원 이상은 가끔 할부
          installmentMonths:
            plan.name === 'SHOPPING' && amount >= 100_000 && rng.chance(0.25) ? rng.pick([3, 6]) : 0,
          memo: null,
          approvalNo: isTransferOut ? null : approvalNo(rng),
          counterpartKey: isTransferOut ? merchant.base.replace('이체 ', '') : null,
          _intended: merchant.intendedCategory,
          _isRecurring: false,
          _isSubscription: false,
        });
      }
    }
  }

  // --- 2) 정기결제 — 매월 같은 날 같은 금액 -----------------------------------
  for (const month of monthTargets) {
    for (const [idx, rec] of RECURRING_MERCHANTS.entries()) {
      const monthStart = startOfKstMonth(month.start);
      const at = new Date(
        addDays(monthStart, rec.dayOfMonth - 1).getTime() + (rec.hour * 60 + idx) * 60_000,
      );
      if (at.getTime() >= anchor.getTime()) continue; // 아직 오지 않은 결제일

      txs.push({
        accountId: primaryCard.id,
        approvedAt: at,
        merchantName: rec.base,
        amount: rec.amount, // 흔들지 않는다 — 정기결제 탐지의 전제
        txType: 'APPROVAL',
        mcc: rec.mcc,
        installmentMonths: 0,
        memo: null,
        approvalNo: approvalNo(rng),
        counterpartKey: null,
        _intended: rec.intendedCategory,
        _isRecurring: true,
        _isSubscription: rec.isSubscription,
      });
    }
  }

  // --- 3) 월급 입금 (TRANSFER_IN — 지출 집계에서 제외되는지 검증) --------------
  let salaryCount = 0;
  for (const month of monthTargets) {
    const monthStart = startOfKstMonth(month.start);
    const at = new Date(
      addDays(monthStart, SALARY.dayOfMonth - 1).getTime() + SALARY.hour * 60 * 60_000,
    );
    if (at.getTime() >= anchor.getTime()) continue;

    txs.push({
      accountId: mainBank.id,
      approvedAt: at,
      merchantName: SALARY.merchantName,
      amount: SALARY.amount,
      txType: 'TRANSFER_IN',
      mcc: null,
      installmentMonths: 0,
      memo: '급여',
      approvalNo: null,
      counterpartKey: SALARY.merchantName,
      _intended: 'EXCLUDED',
      _isRecurring: false,
      _isSubscription: false,
    });
    salaryCount += 1;
  }

  // --- 4) 본인 명의 계좌 간 이체 (분류 6순위 INTERNAL_TRANSFER 검증) ----------
  let internalTransferCount = 0;
  for (const month of monthTargets) {
    if (month.days < 5) continue;
    const at = new Date(
      addDays(month.start, rng.int(2, month.days - 1)).getTime() + rng.int(9, 20) * 60 * 60_000,
    );
    if (at.getTime() >= anchor.getTime()) continue;

    txs.push({
      accountId: mainBank.id,
      approvedAt: at,
      merchantName: '토스뱅크 이체',
      amount: Math.round(rng.int(200, 800) / 10) * 10_000,
      txType: 'TRANSFER_OUT',
      mcc: null,
      installmentMonths: 0,
      memo: '저축',
      approvalNo: null,
      // 본인 명의 계좌번호가 상대로 찍힌다 → 계좌 간 이체로 판정되어야 한다
      counterpartKey: subBank.id,
      _intended: 'EXCLUDED',
      _isRecurring: false,
      _isSubscription: false,
    });
    internalTransferCount += 1;
  }

  // --- 5) 취소 거래 (원거래와 상계 처리되는지 검증) ----------------------------
  // 승인번호가 있는 고액 결제 중 3건을 골라, 같은 승인번호의 CANCEL 행을 만든다.
  const cancelCandidates = txs
    .filter((t) => t.txType === 'APPROVAL' && t.approvalNo && t.amount >= 30_000 && !t._isRecurring)
    .sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime());

  const cancels: GeneratedTx[] = [];
  const step = Math.max(1, Math.floor(cancelCandidates.length / 4));
  for (let i = 0; i < 3 && cancelCandidates.length > 0; i += 1) {
    const origin = cancelCandidates[Math.min((i + 1) * step, cancelCandidates.length - 1)];
    const canceledAt = addDays(origin.approvedAt, rng.int(1, 5));
    if (canceledAt.getTime() >= anchor.getTime()) continue;

    cancels.push({
      ...origin,
      approvedAt: canceledAt,
      txType: 'CANCEL',
      memo: '승인취소',
      installmentMonths: 0,
      _intended: 'EXCLUDED',
    });
  }
  txs.push(...cancels);

  // --- 저장 ------------------------------------------------------------------
  txs.sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime());

  await prisma.mockTransaction.createMany({
    data: txs.map((t) => ({
      accountId: t.accountId,
      approvedAt: t.approvedAt,
      merchantName: t.merchantName,
      amount: t.amount,
      txType: t.txType,
      mcc: t.mcc,
      installmentMonths: t.installmentMonths,
      memo: t.memo,
      approvalNo: t.approvalNo,
      counterpartKey: t.counterpartKey,
      // _intended / _isRecurring / _isSubscription 은 넣지 않는다.
      // MockTransaction 에는 카테고리 컬럼이 존재하지 않는다 (§4-1).
    })),
  });

  // --- 통계 (검증용) ----------------------------------------------------------
  const byIntended: Record<string, number> = {};
  for (const t of txs) byIntended[t._intended] = (byIntended[t._intended] ?? 0) + 1;

  const completeKeys = new Set(completeMonths.map((m) => m.key));
  const deliveryInCompleteMonths = txs.filter(
    (t) =>
      t._intended === 'DELIVERY_FOOD' &&
      t.txType === 'APPROVAL' &&
      completeKeys.has(kstMonthKey(t.approvedAt)),
  );
  const deliveryMonthlyAvgAmount = Math.round(
    deliveryInCompleteMonths.reduce((s, t) => s + t.amount, 0) / completeMonths.length,
  );

  const perMonthCounts = monthTargets.map(
    (m) => txs.filter((t) => kstMonthKey(t.approvedAt) === m.key).length,
  );

  // 페르소나 3축의 입력이 의도대로 나오는지 미리 계산해 둔다.
  // 실제 산출은 6단계 persona-calculator 가 하지만, 시드 단계에서 어긋나 있으면
  // 아무리 계산기가 정확해도 시연이 원하는 그림이 나오지 않는다.
  const completeTxs = txs.filter(
    (t) => completeKeys.has(kstMonthKey(t.approvedAt)) && t._intended !== 'EXCLUDED',
  );

  const monthlyAvgByCategory: Record<string, number> = {};
  for (const t of completeTxs) {
    if (t._intended === 'UNCLASSIFIED') continue;
    // CANCEL 은 원거래를 상계하므로 지출에서 뺀다
    const signed = t.txType === 'CANCEL' ? -t.amount : t.amount;
    monthlyAvgByCategory[t._intended] = (monthlyAvgByCategory[t._intended] ?? 0) + signed;
  }
  for (const key of Object.keys(monthlyAvgByCategory)) {
    monthlyAvgByCategory[key] = Math.round(monthlyAvgByCategory[key] / completeMonths.length);
  }

  const monthlyAvgTotalAmount = Object.values(monthlyAvgByCategory).reduce((s, v) => s + v, 0);
  const topCategory =
    Object.entries(monthlyAvgByCategory)
      .filter(([c]) => c !== 'FIXED_BILLS')
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'NONE';

  const timeBandCounts: Record<string, number> = { MORNING: 0, LUNCH: 0, EVENING: 0, NIGHT: 0 };
  for (const t of completeTxs) {
    if (t.txType !== 'APPROVAL') continue;
    timeBandCounts[timeBandOfHour(kstHour(t.approvedAt))] += 1;
  }
  const topTimeBand = Object.entries(timeBandCounts).sort((a, b) => b[1] - a[1])[0][0];

  return {
    total: txs.length,
    byIntended,
    monthlyAvgByCategory,
    monthlyAvgTotalAmount,
    topCategory,
    timeBandCounts,
    topTimeBand,
    deliveryMonthlyAvgAmount,
    subscriptionCount: new Set(
      txs.filter((t) => t._isSubscription).map((t) => t.merchantName),
    ).size,
    recurringMerchantCount: new Set(txs.filter((t) => t._isRecurring).map((t) => t.merchantName))
      .size,
    unclassifiableCount: txs.filter((t) => t._intended === 'UNCLASSIFIED').length,
    cancelCount: cancels.length,
    salaryCount,
    internalTransferCount,
    monthKeys: monthTargets.map((m) => m.key),
    perMonthCounts,
    spanFrom: txs[0]?.approvedAt ?? anchor,
    spanTo: txs[txs.length - 1]?.approvedAt ?? anchor,
  };
}
