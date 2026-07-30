/**
 * 소비 카테고리.
 *
 * `페르소나 완성.xlsx` 의 12종을 **분류 엔진의 카테고리로 그대로 채택**했다.
 * 덕분에 분류 결과가 곧 페르소나 축이 되어 변환 레이어가 필요 없다.
 *
 * Prisma enum 을 쓰지 않는다 (SQLite 미지원 — docs/design.md §2-1).
 * DB 에는 String 으로 저장하고, 검증은 DTO 의 @IsIn(TX_CATEGORIES) 으로 한다.
 */

/**
 * 절약 목표·챌린지·페르소나의 대상이 되는 소비 카테고리 12종.
 * 순서가 페르소나 카테고리 축의 동점 처리 우선순위이기도 하다.
 */
export const SPENDABLE_CATEGORIES = [
  'DELIVERY_FOOD', // 배달음식
  'DINING_OUT', // 외식
  'CAFE_SNACK', // 카페+간식
  'ALCOHOL_NIGHTLIFE', // 술+유흥
  'TRANSPORT_CAR', // 교통+자동차
  'SHOPPING', // 쇼핑
  'GAME_INAPP', // 게임+인앱
  'SUBSCRIPTION_OTT', // 구독+OTT
  'CONVENIENCE_STORE', // 편의점
  'HEALTH_FITNESS', // 의료+건강+피트니스
  'EDUCATION', // 교육
  'TRAVEL_STAY', // 여행+숙박
] as const;

export type SpendableCategory = (typeof SPENDABLE_CATEGORIES)[number];

export const TX_CATEGORIES = [
  ...SPENDABLE_CATEGORIES,
  /**
   * 통신·보험·공과금. 줄이기 어려운 진짜 고정비라 절약 목표 대상이 아니고,
   * 페르소나 축에도 들어가지 않는다.
   * ⚠️ 넷플릭스 같은 구독은 여기가 아니라 SUBSCRIPTION_OTT 다 — 그건 줄일 수 있다.
   */
  'FIXED_BILLS',
  'UNCLASSIFIED', // 미분류 — 사용자 확인 대기
  'EXCLUDED', // 집계 제외 — 수입, 계좌 간 이체, 취소 상계분
] as const;

export type TxCategory = (typeof TX_CATEGORIES)[number];

/** 집계에서 완전히 배제되는 카테고리 */
export const NON_AGGREGATED_CATEGORIES: readonly TxCategory[] = ['EXCLUDED', 'UNCLASSIFIED'];

/** 화면 표시용 한글 라벨 — 엑셀 확정안 표기를 그대로 쓴다 */
export const CATEGORY_LABELS: Record<TxCategory, string> = {
  DELIVERY_FOOD: '배달음식',
  DINING_OUT: '외식',
  CAFE_SNACK: '카페+간식',
  ALCOHOL_NIGHTLIFE: '술+유흥',
  TRANSPORT_CAR: '교통+자동차',
  SHOPPING: '쇼핑',
  GAME_INAPP: '게임+인앱',
  SUBSCRIPTION_OTT: '구독+OTT',
  CONVENIENCE_STORE: '편의점',
  HEALTH_FITNESS: '의료+건강+피트니스',
  EDUCATION: '교육',
  TRAVEL_STAY: '여행+숙박',
  FIXED_BILLS: '고정지출',
  UNCLASSIFIED: '미분류',
  EXCLUDED: '집계 제외',
};

export function isSpendableCategory(value: string): value is SpendableCategory {
  return (SPENDABLE_CATEGORIES as readonly string[]).includes(value);
}

export function isTxCategory(value: string): value is TxCategory {
  return (TX_CATEGORIES as readonly string[]).includes(value);
}
