/** 거래 유형 — 프로바이더(가상 금융 DB)가 주는 원시 값 */
export const TX_TYPES = ['APPROVAL', 'CANCEL', 'TRANSFER_OUT', 'TRANSFER_IN'] as const;
export type TxType = (typeof TX_TYPES)[number];

/** 기관·계좌 종류 */
export const ACCOUNT_TYPES = ['CARD', 'BANK'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** 연동 상태 */
export const CONNECTION_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/**
 * 분류 파이프라인에서 어느 단계가 카테고리를 결정했는지.
 * 응답에 그대로 실어 "왜 이 카테고리인지"를 프론트가 설명할 수 있게 한다.
 */
export const CLASSIFIED_BY = [
  'TX_TYPE_GUARD', // 0순위 — TRANSFER_IN / CANCEL 상계
  'USER_RULE', // 1순위 — 사용자 개인 규칙
  'AI', // 2순위 — Claude 가맹점 판정
  'GLOBAL_RULE', // 3순위 — 전역 키워드 사전
  'MCC', // 4순위 — 업종코드 매핑
  'RECURRING', // 5순위 — 정기결제 탐지
  'INTERNAL_TRANSFER', // 6순위 — 본인 명의 계좌 간 이체
  'NONE', // 7순위 — 미분류
  'MANUAL', // 사용자가 직접 지정
] as const;
export type ClassifiedBy = (typeof CLASSIFIED_BY)[number];

/** 분류 근거를 화면에 한국어로 보여줄 때 쓴다 */
export const CLASSIFIED_BY_LABELS: Record<ClassifiedBy, string> = {
  TX_TYPE_GUARD: '거래유형',
  USER_RULE: '내가 정한 규칙',
  AI: 'AI 분류',
  GLOBAL_RULE: '가맹점 사전',
  MCC: '업종코드',
  RECURRING: '정기결제 탐지',
  INTERNAL_TRANSFER: '계좌 간 이체',
  NONE: '미분류',
  MANUAL: '직접 지정',
};

/** EXCLUDED 로 빠진 이유 */
export const EXCLUDE_REASONS = [
  'TRANSFER_IN', // 수입(월급 등)
  'INTERNAL_TRANSFER', // 본인 명의 계좌 간 이체
  'CANCELED_ORIGIN', // 취소된 원거래
  'CANCEL_ENTRY', // 취소 거래 자체
] as const;
export type ExcludeReason = (typeof EXCLUDE_REASONS)[number];

/** 정기결제 탐지 파라미터 (§5-2 5순위) */
export const RECURRING_DETECTION = {
  /** 금액 편차 허용치 */
  amountTolerance: 0.05,
  /** 주기 하한(일) */
  minIntervalDays: 25,
  /** 주기 상한(일) */
  maxIntervalDays: 35,
  /** 이 횟수 "이상" 반복되어야 정기결제로 본다 */
  minOccurrences: 3,
} as const;
