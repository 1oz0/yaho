import type { TxCategory } from '../../common/constants/tx-category';
import { kstDate } from '../../common/utils/date-kst';
import { normalizeMerchantName } from './normalizer';
import {
  classify,
  findCanceledApprovalNos,
  sortGlobalRules,
  type ClassifiableTransaction,
  type ClassificationContext,
  type GlobalRule,
} from './rule-engine';

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const GLOBAL_RULES: GlobalRule[] = sortGlobalRules([
  { id: 'r-baemin', pattern: '배민', category: 'DELIVERY_FOOD', priority: 10 },
  { id: 'r-coupangeats', pattern: '쿠팡이츠', category: 'DELIVERY_FOOD', priority: 10 },
  { id: 'r-coupangwow', pattern: '쿠팡와우', category: 'SUBSCRIPTION_OTT', priority: 10 },
  { id: 'r-netflix', pattern: '넷플릭스', category: 'SUBSCRIPTION_OTT', priority: 20 },
  { id: 'r-kyochon', pattern: '교촌치킨', category: 'DINING_OUT', priority: 45 },
  { id: 'r-starbucks', pattern: '스타벅스', category: 'CAFE_SNACK', priority: 40 },
  { id: 'r-coupang', pattern: '쿠팡', category: 'SHOPPING', priority: 60 },
  { id: 'r-chicken', pattern: '치킨', category: 'DINING_OUT', priority: 95 },
]);

function makeCtx(overrides: Partial<ClassificationContext> = {}): ClassificationContext {
  return {
    userRules: new Map<string, TxCategory>(),
    globalRules: GLOBAL_RULES,
    mccRules: new Map([
      ['5812', { id: 'm-5812', mcc: '5812', category: 'DINING_OUT' as TxCategory }],
      ['4111', { id: 'm-4111', mcc: '4111', category: 'TRANSPORT_CAR' as TxCategory }],
    ]),
    recurringMerchants: new Set<string>(),
    canceledApprovalNos: new Set<string>(),
    ownAccountKeys: new Set<string>(),
    ...overrides,
  };
}

function makeTx(overrides: Partial<ClassifiableTransaction> = {}): ClassifiableTransaction {
  const merchantName = overrides.merchantName ?? '테스트가맹점';
  const { normalized, matchTarget } = normalizeMerchantName(merchantName);
  return {
    providerTxId: 'tx-1',
    merchantName,
    normalizedMerchant: normalized,
    matchTarget,
    amount: 10_000,
    txType: 'APPROVAL',
    mcc: null,
    approvalNo: '12345678',
    counterpartKey: null,
    approvedAt: kstDate(2026, 7, 15, 19, 0),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('0순위 — 거래유형 가드', () => {
  it('TRANSFER_IN(월급)은 상호명이 키워드에 걸려도 EXCLUDED 다', () => {
    // 명세대로 6순위에 뒀다면 "쿠팡"이 먼저 걸려 SHOPPING 이 됐을 것이다
    const tx = makeTx({ merchantName: '쿠팡', txType: 'TRANSFER_IN', amount: 2_850_000 });
    const r = classify(tx, makeCtx());
    expect(r.category).toBe('EXCLUDED');
    expect(r.classifiedBy).toBe('TX_TYPE_GUARD');
    expect(r.excludeReason).toBe('TRANSFER_IN');
    expect(r.needsReview).toBe(false);
  });

  it('CANCEL 거래 자체가 EXCLUDED', () => {
    const r = classify(makeTx({ merchantName: '스타벅스', txType: 'CANCEL' }), makeCtx());
    expect(r.category).toBe('EXCLUDED');
    expect(r.excludeReason).toBe('CANCEL_ENTRY');
  });

  it('취소로 상계된 원거래도 EXCLUDED (같은 승인번호)', () => {
    const ctx = makeCtx({ canceledApprovalNos: new Set(['99999999']) });
    const r = classify(makeTx({ merchantName: '스타벅스', approvalNo: '99999999' }), ctx);
    expect(r.category).toBe('EXCLUDED');
    expect(r.excludeReason).toBe('CANCELED_ORIGIN');
  });

  it('승인번호가 달라 상계되지 않은 거래는 정상 분류된다', () => {
    const ctx = makeCtx({ canceledApprovalNos: new Set(['99999999']) });
    const r = classify(makeTx({ merchantName: '스타벅스', approvalNo: '11111111' }), ctx);
    expect(r.category).toBe('CAFE_SNACK');
  });
});

describe('findCanceledApprovalNos', () => {
  it('CANCEL 행의 승인번호만 모은다', () => {
    const set = findCanceledApprovalNos([
      { txType: 'APPROVAL', approvalNo: 'A' },
      { txType: 'CANCEL', approvalNo: 'B' },
      { txType: 'CANCEL', approvalNo: null },
      { txType: 'TRANSFER_OUT', approvalNo: 'C' },
    ]);
    expect([...set]).toEqual(['B']);
  });
});

describe('2순위 — 사용자 개인 규칙이 전역 사전을 이긴다', () => {
  it('사용자가 지정한 카테고리가 우선한다', () => {
    const ctx = makeCtx({ userRules: new Map([['스타벅스', 'HEALTH_FITNESS' as TxCategory]]) });
    const r = classify(makeTx({ merchantName: '스타벅스 광주상무점' }), ctx);
    expect(r.category).toBe('HEALTH_FITNESS'); // 전역 사전은 CAFE_CONV 라고 말하지만
    expect(r.classifiedBy).toBe('USER_RULE');
  });
});

describe('3순위 — 전역 키워드 사전 우선순위', () => {
  it('배달 채널이 가맹점 브랜드보다 먼저 걸린다', () => {
    // "배민)교촌치킨" — 교촌치킨(45)이 아니라 배민(10)이 이겨야 배달로 잡힌다
    const r = classify(makeTx({ merchantName: '배민)교촌치킨 광주상무점' }), makeCtx());
    expect(r.category).toBe('DELIVERY_FOOD');
    expect(r.matchedRuleId).toBe('r-baemin');
  });

  it('같은 가게라도 채널이 없으면 외식으로 분류된다', () => {
    const r = classify(makeTx({ merchantName: '교촌치킨 광주상무점' }), makeCtx());
    expect(r.category).toBe('DINING_OUT');
    expect(r.matchedRuleId).toBe('r-kyochon');
  });

  it('"쿠팡이츠"가 "쿠팡"보다 먼저 걸린다 (부분문자열 함정)', () => {
    const r = classify(makeTx({ merchantName: '쿠팡이츠)마라공방' }), makeCtx());
    expect(r.category).toBe('DELIVERY_FOOD');
  });

  it('"쿠팡와우멤버십"은 쇼핑이 아니라 구독이다', () => {
    const r = classify(makeTx({ merchantName: '쿠팡와우멤버십' }), makeCtx());
    expect(r.category).toBe('SUBSCRIPTION_OTT');
    expect(r.matchedRuleId).toBe('r-coupangwow');
  });

  it('"쿠팡" 단독은 쇼핑이다', () => {
    const r = classify(makeTx({ merchantName: '쿠팡' }), makeCtx());
    expect(r.category).toBe('SHOPPING');
    expect(r.matchedRuleId).toBe('r-coupang');
  });

  it('구체적인 브랜드가 포괄 키워드보다 먼저 걸린다', () => {
    // 교촌치킨(45) vs 치킨(95)
    const r = classify(makeTx({ merchantName: '교촌치킨' }), makeCtx());
    expect(r.matchedRuleId).toBe('r-kyochon');
  });

  it('포괄 키워드는 모르는 브랜드를 건진다', () => {
    const r = classify(makeTx({ merchantName: '이름모를치킨집' }), makeCtx());
    expect(r.category).toBe('DINING_OUT');
    expect(r.matchedRuleId).toBe('r-chicken');
  });
});

describe('sortGlobalRules', () => {
  it('priority 오름차순, 동점이면 긴 패턴이 먼저', () => {
    const sorted = sortGlobalRules([
      { id: 'a', pattern: '쿠팡', category: 'SHOPPING', priority: 10 },
      { id: 'b', pattern: '쿠팡이츠', category: 'DELIVERY_FOOD', priority: 10 },
      { id: 'c', pattern: '넷플릭스', category: 'SUBSCRIPTION_OTT', priority: 5 },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('4순위 — MCC 매핑', () => {
  it('키워드 사전이 놓치면 MCC 로 건진다', () => {
    const r = classify(makeTx({ merchantName: '처음보는식당이름', mcc: '5812' }), makeCtx());
    expect(r.category).toBe('DINING_OUT');
    expect(r.classifiedBy).toBe('MCC');
    expect(r.matchedRuleId).toBe('m-5812');
  });

  it('키워드 사전이 MCC 보다 우선한다', () => {
    // 스타벅스(CAFE_CONV) vs mcc 5812(DINING)
    const r = classify(makeTx({ merchantName: '스타벅스', mcc: '5812' }), makeCtx());
    expect(r.category).toBe('CAFE_SNACK');
    expect(r.classifiedBy).toBe('GLOBAL_RULE');
  });

  it('매핑에 없는 MCC 는 무시된다', () => {
    const r = classify(makeTx({ merchantName: '처음보는곳', mcc: '9999' }), makeCtx());
    expect(r.category).toBe('UNCLASSIFIED');
  });
});

describe('5순위 — 정기결제', () => {
  it('이름도 업종코드도 모르지만 매월 빠져나가면 구독으로 본다', () => {
    // 통신·보험은 이름으로 잡히므로(FIXED_BILLS 규칙), 여기까지 내려온 정기결제는
    // 정체 모를 구독일 가능성이 높다. 게다가 구독은 줄일 수 있어 절약 목표에 잡히는 편이 낫다.
    const ctx = makeCtx({ recurringMerchants: new Set(['알수없는구독']) });
    const r = classify(makeTx({ merchantName: '알수없는구독' }), ctx);
    expect(r.category).toBe('SUBSCRIPTION_OTT');
    expect(r.classifiedBy).toBe('RECURRING');
    expect(r.isRecurring).toBe(true);
  });

  it('키워드로 분류된 건에도 isRecurring 플래그가 붙는다', () => {
    const ctx = makeCtx({ recurringMerchants: new Set(['넷플릭스']) });
    const r = classify(makeTx({ merchantName: '넷플릭스' }), ctx);
    expect(r.classifiedBy).toBe('GLOBAL_RULE');
    expect(r.isRecurring).toBe(true);
  });
});

describe('6순위 — 본인 명의 계좌 간 이체', () => {
  it('내 계좌로 옮긴 돈은 지출이 아니다', () => {
    const ctx = makeCtx({ ownAccountKeys: new Set(['acc-toss-123']) });
    const r = classify(
      makeTx({
        merchantName: '토스뱅크 이체',
        txType: 'TRANSFER_OUT',
        counterpartKey: 'acc-toss-123',
        approvalNo: null,
      }),
      ctx,
    );
    expect(r.category).toBe('EXCLUDED');
    expect(r.classifiedBy).toBe('INTERNAL_TRANSFER');
    expect(r.excludeReason).toBe('INTERNAL_TRANSFER');
  });

  it('남에게 보낸 이체는 미분류로 남아 사용자에게 물어본다', () => {
    const ctx = makeCtx({ ownAccountKeys: new Set(['acc-toss-123']) });
    const r = classify(
      makeTx({
        merchantName: '이체 김**',
        txType: 'TRANSFER_OUT',
        counterpartKey: '김**',
        approvalNo: null,
      }),
      ctx,
    );
    expect(r.category).toBe('UNCLASSIFIED');
    expect(r.needsReview).toBe(true);
  });
});

describe('7순위 — 미분류 판정', () => {
  it.each(['카카오페이', '토스페이', '네이버페이', '(주)케이지이니시스', '이체 박**'])(
    '%s → UNCLASSIFIED + needsReview',
    (merchantName) => {
      const r = classify(makeTx({ merchantName, mcc: null }), makeCtx());
      expect(r.category).toBe('UNCLASSIFIED');
      expect(r.classifiedBy).toBe('NONE');
      expect(r.needsReview).toBe(true);
    },
  );

  it('가맹점명이 비어도 안전하게 미분류로 떨어진다', () => {
    const r = classify(makeTx({ merchantName: '***', mcc: null }), makeCtx());
    expect(r.category).toBe('UNCLASSIFIED');
  });
});

describe('결정론성 — LLM 없이 같은 입력이면 같은 출력', () => {
  it('100회 반복해도 결과가 동일하다', () => {
    const tx = makeTx({ merchantName: '배민)한식대첩 광주상무점', mcc: '5812' });
    const ctx = makeCtx();
    const first = classify(tx, ctx);
    for (let i = 0; i < 100; i += 1) {
      expect(classify(tx, ctx)).toEqual(first);
    }
  });
});
