/**
 * 분류 규칙 엔진 — 순수 함수. NestJS 의존 없음. **여기서 API 를 호출하지 않는다.**
 *
 * AI 판정은 `ctx.aiCategories` 에 이미 담겨서 들어온다. 호출은 바깥
 * (AiClassifierService)에서 끝내고 이 함수는 결과만 읽는다. 그래서 이 파일은
 * 여전히 동기 순수 함수이고, 같은 컨텍스트를 주면 언제나 같은 출력이 나온다.
 *
 * 파이프라인 — 위에서부터 순서대로, 먼저 매칭되면 종료 (§5-2)
 *
 *   0. 거래유형 가드   TRANSFER_IN / CANCEL / 취소된 원거래  → EXCLUDED
 *   1. 정규화          normalizer.ts (호출부에서 미리 수행해 넘겨준다)
 *   2. 사용자 개인 규칙 UserMerchantRule
 *   3. ★ AI 판정       Claude 가 가맹점 단위로 내린 결론 (ctx.aiCategories)
 *   4. 전역 키워드 사전 MerchantRule (priority 오름차순)
 *   5. MCC 매핑        MccMapping
 *   6. 정기결제 탐지    recurring-detector 결과 → SUBSCRIPTION_OTT
 *   7. 계좌 간 이체     본인 명의 계좌로 나간 TRANSFER_OUT → EXCLUDED
 *   8. 실패            UNCLASSIFIED + needsReview
 *
 * ⚠️ 왜 AI 가 1순위가 아니라 3순위인가
 *    - 0순위(거래유형)는 판단이 아니라 **사실**이다. 월급 입금을 모델에게 물어볼 이유가 없고,
 *      물어보면 "(주)야호컴퍼니"를 어딘가의 지출로 만들 위험만 생긴다.
 *    - 2순위(사용자 규칙)는 사용자가 화면에서 직접 고친 결과다. 여기서 AI 가 이기면
 *      "고쳤는데 다음 동기화에 원복됐다"가 된다. 사람이 한 말이 모델보다 위다.
 *    나머지 실질 판정은 전부 AI 가 먼저 가져간다.
 *
 * ⚠️ 0순위 가드는 명세(§5-2)에서 6순위에 있던 것을 앞으로 당긴 것이다.
 *    월급 입금이 전역 키워드에 먼저 걸려 지출로 오분류되는 것을 막는다.
 *    최종 카테고리 결과는 명세와 동일하고, 오분류 경로만 제거된다. (docs/design.md §1-②)
 *
 * ⚠️ `ctx.aiCategories` 가 빈 Map 이면 (AI_CLASSIFY_ENABLED=false, 키 없음, 호출 실패)
 *    3순위가 통째로 건너뛰어져 예전과 완전히 동일하게 동작한다.
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
  /**
   * AI 가 내린 가맹점 판정: 정규화 가맹점명 → 카테고리.
   *
   * 비어 있으면 AI 단계를 건너뛴다 — 스위치를 껐거나, 키가 없거나, 호출이 실패한 경우다.
   * 확신도가 낮아 모델이 스스로 물러선 가맹점도 여기 들어오지 않는다.
   */
  aiCategories: Map<string, TxCategory>;
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

  // --- 3순위: AI 판정 -------------------------------------------------------
  // 규칙 사전이 못 잡는 지역 상호·신규 브랜드를 여기서 잡는다.
  // 모델이 확신하지 못한 가맹점은 애초에 이 Map 에 들어오지 않으므로,
  // 여기 있다는 것은 곧 "모델이 확신했다"는 뜻이다.
  const aiCategory = ctx.aiCategories.get(tx.normalizedMerchant);
  if (aiCategory) {
    return {
      category: aiCategory,
      classifiedBy: 'AI',
      matchedRuleId: null,
      isRecurring: ctx.recurringMerchants.has(tx.normalizedMerchant),
      needsReview: false,
      excludeReason: null,
    };
  }

  // --- 4순위: 전역 키워드 사전 ----------------------------------------------
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

  // --- 5순위: MCC 매핑 ------------------------------------------------------
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

  // --- 6순위: 정기결제 탐지 -------------------------------------------------
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

  // --- 7순위: 본인 명의 계좌 간 이체 ----------------------------------------
  // 내 통장에서 내 통장으로 옮긴 돈은 지출이 아니다.
  if (
    tx.txType === 'TRANSFER_OUT' &&
    tx.counterpartKey &&
    ctx.ownAccountKeys.has(tx.counterpartKey)
  ) {
    return excluded('INTERNAL_TRANSFER', 'INTERNAL_TRANSFER');
  }

  // --- 8순위: 분류 실패 → 사용자에게 물어본다 -------------------------------
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
