/**
 * 페르소나 카테고리 축 — `페르소나 완성.xlsx` 확정안 12종.
 *
 * 분류 엔진의 소비 카테고리(SPENDABLE_CATEGORIES)와 **완전히 같다.**
 * 예전에는 분류 9종 → 페르소나 12종 변환 테이블이 있었지만,
 * 키워드 사전을 12종 기준으로 재편하면서 변환이 필요 없어졌다.
 *
 * 페르소나 정체성 = 시간대(4) × 카테고리(12) = 48종.
 * 소비량 축(LOW/NORMAL/OVER)은 코드에 들어가지 않고 과소비 진단 근거로만 쓴다.
 */
import { SPENDABLE_CATEGORIES, CATEGORY_LABELS, type SpendableCategory } from './tx-category';

export const PERSONA_CATEGORIES = SPENDABLE_CATEGORIES;
export type PersonaCategory = SpendableCategory;

export const PERSONA_CATEGORY_LABELS: Record<PersonaCategory, string> = Object.fromEntries(
  PERSONA_CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]]),
) as Record<PersonaCategory, string>;

export function isPersonaCategory(value: string): value is PersonaCategory {
  return (PERSONA_CATEGORIES as readonly string[]).includes(value);
}
