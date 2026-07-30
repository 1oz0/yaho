/** 보상(뱃지·쿠폰) 상수 (§6-6) */

export const BADGE_TIERS = ['BRONZE', 'SILVER', 'GOLD'] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];

/** 뱃지 지급 조건 종류. BadgeRule.ruleType 에 저장된다. */
export const BADGE_RULE_TYPES = [
  'FIRST_CHALLENGE_SUCCESS', // 첫 챌린지 성공
  'CHALLENGE_COUNT', // 챌린지 N회 완료
  'CONSECUTIVE_SUCCESS', // N회 연속 성공
  'TOTAL_SAVED_AMOUNT', // 누적 절약액 N원 달성
  'CATEGORY_SAVED_AMOUNT', // 특정 카테고리 N원 절약
] as const;
export type BadgeRuleType = (typeof BADGE_RULE_TYPES)[number];

export const DISCOUNT_TYPES = ['RATE', 'AMOUNT'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const ISSUED_COUPON_STATUSES = ['ISSUED', 'USED', 'EXPIRED'] as const;
export type IssuedCouponStatus = (typeof ISSUED_COUPON_STATUSES)[number];

/** 여행 루트 테마 */
export const ROUTE_THEMES = ['FOOD', 'HEALING', 'ACTIVITY', 'HISTORY'] as const;
export type RouteTheme = (typeof ROUTE_THEMES)[number];

/** 루트 경유지 종류 */
export const STOP_TYPES = ['SIGHT', 'MEAL', 'CAFE', 'ACTIVITY', 'STAY'] as const;
export type StopType = (typeof STOP_TYPES)[number];
