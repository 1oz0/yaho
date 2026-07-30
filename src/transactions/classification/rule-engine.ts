/**
 * 분류 규칙 엔진 — 순수 함수. NestJS 의존 없음.
 *
 * 심사 대응 포인트(§5): **LLM 호출이 한 번도 없다.** 전부 결정론적 규칙이므로
 * 유저가 100배 늘어도 비용은 그대로다. 같은 입력이면 언제나 같은 출력이 나온다.
 *
 * 파이프라인 — 위에서부터 순서대로, 먼저 매칭되면 종료 (§5-2)
 *
 *   0. 거래유형 가드   TRANSFER_IN / CANCEL / 취소된 원거래  → EXCLUDED
 *   1. 정규화          normalizer.ts (호출부에서 미리 수행해 넘겨준다)
 *   2. 사용자 개인 규칙 UserMerchantRule
 *   3. 전역 키워드 사전 MerchantRule (priority 오름차순)
 *   4. MCC 매핑        MccMapping
 *   5. 정기결제 탐지    recurring-detector 결과 → FIXED
 *   6. 계좌 간 이체     본인 명의 계좌로 나간 TRANSFER_OUT → EXCLUDED
 *   7. 실패            UNCLASSIFIED + needsReview
 *
 * ⚠️ 0순위 가드는 명세(§5-2)에서 6순위에 있던 것을 앞으로 당긴 것이다.
 *    월급 입금("(주)야호컴퍼니", TRANSFER_IN)이 3순위 전역 키워드에 먼저 걸려
 *    지출로 오분류되는 것을 막는다. 최종 카테고리 결과는 명세와 동일하고,
 *    오분류 경로만 제거된다. (docs/design.md §1-②)
 */
import type { TxCategory } from '../../common/constants/tx-category';
import type { ClassifiedBy, ExcludeReason } from '../../common/constants/transaction';

/** 분류 대상 거래 (프로바이더 원본 + 정규화 결과) */
export interface ClassifiableTransaction {
  providerTxId: string;
  merchantName: string;
  normalizedMerchant: string;
  matchTarget: string;
  amount: number;
  txType: string;
  mcc: string | null;
  approvalNo: string | null;
  counterpartKey: string | null;
  approvedAt: Date;
}

export interface GlobalRule {
  id: string;
  pattern: string;
  category: TxCategory;
  priority: number;
}

export interface MccRule {
  id: string;
  mcc: string;
  category: TxCategory;
}

/** 분류에 필요한 주변 정보 */
export interface ClassificationContext {
  /** 사용자 개인 규칙: 정규화 가맹점명 → 카테고리 */
  userRules: Map<string, TxCategory>;
  /** 전역 키워드 사전. priority 오름차순으로 정렬되어 있어야 한다. */
  globalRules: GlobalRule[];
  /** MCC → 카테고리 */
  mccRules: Map<string, MccRule>;
  /** 정기결제로 판정된 정규화 가맹점명 집합 (recurring-detector 결과) */
  recurringMerchants: Set<string>;
  /** 취소로 상계된 승인번호 집합 (원거래·취소거래 양쪽 모두 제외 대상) */
  canceledApprovalNos: Set<string>;
  /** 사용자 본인 명의 계좌 식별자 집합 (계좌 간 이체 판정용) */
  ownAccountKeys: Set<string>;
}

export interface ClassificationResult {
  category: TxCategory;
  classifiedBy: ClassifiedBy;
  matchedRuleId: string | null;
  isRecurring: boolean;
  needsReview: boolean;
  excludeReason: ExcludeReason | null;
}

const excluded = (
  classifiedBy: ClassifiedBy,
  excludeReason: ExcludeReason,
): ClassificationResult => ({
  category: 'EXCLUDED',
  classifiedBy,
  matchedRuleId: null,
  isRecurring: false,
  needsReview: false,
  excludeReason,
});

/**
 * 거래 1건을 분류한다.
 * 같은 입력에 대해 항상 같은 결과를 낸다 (결정론적).
 */
export function classify(
  tx: ClassifiableTransaction,
  ctx: ClassificationContext,
): ClassificationResult {
  // --- 0순위: 거래유형 가드 -------------------------------------------------
  // 수입은 지출 집계에 들어가면 안 된다.
  if (tx.txType === 'TRANSFER_IN') {
    return excluded('TX_TYPE_GUARD', 'TRANSFER_IN');
  }
  // 취소 거래 자체
  if (tx.txType === 'CANCEL') {
    return excluded('TX_TYPE_GUARD', 'CANCEL_ENTRY');
  }
  // 취소로 상계된 원거래 — 승인번호가 같은 CANCEL 이 존재한다
  if (tx.approvalNo && ctx.canceledApprovalNos.has(tx.approvalNo)) {
    return excluded('TX_TYPE_GUARD', 'CANCELED_ORIGIN');
  }

  // --- 2순위: 사용자 개인 규칙 ----------------------------------------------
  const userCategory = ctx.userRules.get(tx.normalizedMerchant);
  if (userCategory) {
    return {
      category: userCategory,
      classifiedBy: 'USER_RULE',
      matchedRuleId: null,
      isRecurring: ctx.recurringMerchants.has(tx.normalizedMerchant),
      needsReview: false,
      excludeReason: null,
    };
  }

  // --- 3순위: 전역 키워드 사전 ----------------------------------------------
  // globalRules 는 priority 오름차순 정렬 상태. 먼저 걸리는 것이 이긴다.
  if (tx.matchTarget.length > 0) {
    for (const rule of ctx.globalRules) {
      if (tx.matchTarget.includes(rule.pattern)) {
        return {
          category: rule.category,
          classifiedBy: 'GLOBAL_RULE',
          matchedRuleId: rule.id,
          isRecurring: ctx.recurringMerchants.has(tx.normalizedMerchant),
          needsReview: false,
          excludeReason: null,
        };
      }
    }
  }

  // --- 4순위: MCC 매핑 ------------------------------------------------------
  if (tx.mcc) {
    const mccRule = ctx.mccRules.get(tx.mcc);
    if (mccRule) {
      return {
        category: mccRule.category,
        classifiedBy: 'MCC',
        matchedRuleId: mccRule.id,
        isRecurring: ctx.recurringMerchants.has(tx.normalizedMerchant),
        needsReview: false,
        excludeReason: null,
      };
    }
  }

  // --- 5순위: 정기결제 탐지 -------------------------------------------------
  // 이름도 업종코드도 모르지만 매월 같은 날 같은 금액이 빠져나간다면 고정지출이다.
  if (ctx.recurringMerchants.has(tx.normalizedMerchant)) {
    return {
      category: 'SUBSCRIPTION_OTT',
      classifiedBy: 'RECURRING',
      matchedRuleId: null,
      isRecurring: true,
      needsReview: false,
      excludeReason: null,
    };
  }

  // --- 6순위: 본인 명의 계좌 간 이체 ----------------------------------------
  // 내 통장에서 내 통장으로 옮긴 돈은 지출이 아니다.
  if (
    tx.txType === 'TRANSFER_OUT' &&
    tx.counterpartKey &&
    ctx.ownAccountKeys.has(tx.counterpartKey)
  ) {
    return excluded('INTERNAL_TRANSFER', 'INTERNAL_TRANSFER');
  }

  // --- 7순위: 분류 실패 → 사용자에게 물어본다 -------------------------------
  return {
    category: 'UNCLASSIFIED',
    classifiedBy: 'NONE',
    matchedRuleId: null,
    isRecurring: false,
    needsReview: true,
    excludeReason: null,
  };
}

/**
 * 취소로 상계되는 승인번호를 찾는다.
 * CANCEL 행은 원거래와 같은 승인번호를 갖는다 — 그 번호를 가진 원거래도 함께 제외된다.
 */
export function findCanceledApprovalNos(
  transactions: readonly { txType: string; approvalNo: string | null }[],
): Set<string> {
  const result = new Set<string>();
  for (const tx of transactions) {
    if (tx.txType === 'CANCEL' && tx.approvalNo) result.add(tx.approvalNo);
  }
  return result;
}

/** 전역 규칙을 우선순위 순으로 정렬한다. priority 가 같으면 긴 패턴이 먼저(더 구체적). */
export function sortGlobalRules(rules: readonly GlobalRule[]): GlobalRule[] {
  return [...rules].sort(
    (a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length,
  );
}
