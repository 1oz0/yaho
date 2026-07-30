/**
 * 절약 목표 대상 카테고리 (§12-1).
 *
 * ── SPENDABLE_CATEGORIES(12종)와 무엇이 다른가 ───────────────────────────────
 * 분류·집계·페르소나 축은 **12종 그대로**다. 여기서 줄어드는 것은
 * "S12 슬라이더에 무엇을 노출하고, 무엇을 절약 목표로 받을 것인가" 뿐이다.
 *
 * 두 상수를 같은 것으로 착각하면 페르소나 축이 9종으로 줄어드는 사고가 난다.
 * 페르소나는 `PERSONA_CATEGORIES`(= SPENDABLE_CATEGORIES, 12종)를 계속 쓴다.
 */
import {
  CATEGORY_LABELS,
  SPENDABLE_CATEGORIES,
  type SpendableCategory,
} from './tx-category';

/**
 * 절약 대상에서 뺀 3종과 그 이유.
 *
 * 이유를 상수로 남기는 건 나중에 "왜 빠졌지?" 를 코드에서 바로 확인하기 위해서다.
 * 프론트가 "이 항목은 왜 없나요?" 안내를 띄우고 싶을 때도 이 문구를 쓸 수 있다.
 */
export const SAVING_EXCLUSION_REASONS: Partial<Record<SpendableCategory, string>> = {
  HEALTH_FITNESS: '병원·약국이 포함된 항목이라 절약을 권하지 않습니다.',
  EDUCATION: '자기계발 지출은 줄이라고 권하지 않습니다.',
  TRAVEL_STAY: '여행 가려고 여행비를 줄이는 건 앞뒤가 맞지 않습니다.',
};

/** 절약 목표 대상 9종. SPENDABLE_CATEGORIES 순서를 그대로 따른다. */
export const SAVING_TARGET_CATEGORIES = SPENDABLE_CATEGORIES.filter(
  (c) => !(c in SAVING_EXCLUSION_REASONS),
) as readonly SpendableCategory[];

export type SavingTargetCategory = SpendableCategory;

export function isSavingTargetCategory(value: string): value is SavingTargetCategory {
  return (SAVING_TARGET_CATEGORIES as readonly string[]).includes(value);
}

/**
 * 환산 힌트의 단위 (화면 S12).
 *
 * "58,000원을 줄이면 배달 약 3.9끼" 처럼 **금액을 체감 가능한 횟수로 바꿔** 보여준다.
 * 단가는 하드코딩하지 않고 **사용자의 실제 평균 결제액**(총액 ÷ 건수)에서 뽑는다 —
 * 배달을 2만원씩 시키는 사람과 5천원씩 시키는 사람의 "3.9끼"는 달라야 한다.
 */
export const CATEGORY_UNIT_LABEL: Record<SavingTargetCategory, string> = {
  DELIVERY_FOOD: '끼',
  DINING_OUT: '끼',
  CAFE_SNACK: '잔',
  ALCOHOL_NIGHTLIFE: '번',
  TRANSPORT_CAR: '번',
  SHOPPING: '건',
  GAME_INAPP: '건',
  SUBSCRIPTION_OTT: '개월',
  CONVENIENCE_STORE: '번',
  // 아래 3종은 슬라이더에 노출되지 않지만, Record 타입을 만족시키고
  // 혹시 다른 화면에서 환산이 필요할 때 쓸 수 있도록 남겨 둔다.
  HEALTH_FITNESS: '회',
  EDUCATION: '건',
  TRAVEL_STAY: '박',
};

export const SAVING_TARGET_LABELS: Record<string, string> = Object.fromEntries(
  SAVING_TARGET_CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]]),
);
