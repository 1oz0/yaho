/**
 * 뱃지 카탈로그 + 지급 조건 시드.
 *
 * 뱃지는 수집형이므로 미보유 항목도 전부 내려줘야 한다 (§6-6).
 * 조건은 코드에 박지 않고 BadgeRule 테이블로 정의해, 기획이 기준을 바꿔도
 * 서비스 코드 수정 없이 시드만 갱신하면 되게 한다.
 */
import type { PrismaClient } from '@prisma/client';

import type { BadgeRuleType, BadgeTier } from '../../src/common/constants/reward';
import type { TxCategory } from '../../src/common/constants/tx-category';

interface SeedBadge {
  code: string;
  displayName: string;
  description: string;
  iconKey: string;
  tier: BadgeTier;
  rules: { ruleType: BadgeRuleType; thresholdValue: number; category?: TxCategory }[];
}

const BADGES: SeedBadge[] = [
  {
    code: 'FIRST_WIN',
    displayName: '첫 번째 성공',
    description: '첫 절약 챌린지를 성공적으로 완주했습니다.',
    iconKey: 'badge-first-win',
    tier: 'BRONZE',
    rules: [{ ruleType: 'FIRST_CHALLENGE_SUCCESS', thresholdValue: 1 }],
  },
  {
    code: 'CHALLENGER_3',
    displayName: '도전하는 사람',
    description: '챌린지를 3회 완료했습니다. 결과와 관계없이 도전 자체가 기록됩니다.',
    iconKey: 'badge-challenger-3',
    tier: 'BRONZE',
    rules: [{ ruleType: 'CHALLENGE_COUNT', thresholdValue: 3 }],
  },
  {
    code: 'STREAK_3',
    displayName: '3연속 성공',
    description: '챌린지를 3회 연속으로 성공했습니다.',
    iconKey: 'badge-streak-3',
    tier: 'GOLD',
    rules: [{ ruleType: 'CONSECUTIVE_SUCCESS', thresholdValue: 3 }],
  },
  {
    code: 'SAVED_100K',
    displayName: '10만원 세이버',
    description: '누적 절약액 10만원을 달성했습니다.',
    iconKey: 'badge-saved-100k',
    tier: 'BRONZE',
    rules: [{ ruleType: 'TOTAL_SAVED_AMOUNT', thresholdValue: 100_000 }],
  },
  {
    code: 'SAVED_300K',
    displayName: '30만원 세이버',
    description: '누적 절약액 30만원을 달성했습니다. 강진 1박이 가능한 금액입니다.',
    iconKey: 'badge-saved-300k',
    tier: 'SILVER',
    rules: [{ ruleType: 'TOTAL_SAVED_AMOUNT', thresholdValue: 300_000 }],
  },
  {
    code: 'SAVED_500K',
    displayName: '50만원 세이버',
    description: '누적 절약액 50만원 달성. 신안 2박 여행도 무리가 없습니다.',
    iconKey: 'badge-saved-500k',
    tier: 'GOLD',
    rules: [{ ruleType: 'TOTAL_SAVED_AMOUNT', thresholdValue: 500_000 }],
  },
  {
    code: 'DELIVERY_BREAKER',
    displayName: '배달앱 탈출',
    description: '배달 카테고리에서 누적 10만원을 절약했습니다.',
    iconKey: 'badge-delivery-breaker',
    tier: 'SILVER',
    rules: [
      { ruleType: 'CATEGORY_SAVED_AMOUNT', thresholdValue: 100_000, category: 'DELIVERY_FOOD' },
    ],
  },
  {
    code: 'SHOPPING_TAMER',
    displayName: '장바구니 비우기',
    description: '쇼핑 카테고리에서 누적 10만원을 절약했습니다.',
    iconKey: 'badge-shopping-tamer',
    tier: 'SILVER',
    rules: [{ ruleType: 'CATEGORY_SAVED_AMOUNT', thresholdValue: 100_000, category: 'SHOPPING' }],
  },
  {
    code: 'CAFE_MINIMALIST',
    displayName: '카페 미니멀리스트',
    description: '카페·편의점 카테고리에서 누적 5만원을 절약했습니다.',
    iconKey: 'badge-cafe-minimalist',
    tier: 'BRONZE',
    rules: [{ ruleType: 'CATEGORY_SAVED_AMOUNT', thresholdValue: 50_000, category: 'CONVENIENCE_STORE' }],
  },
  {
    code: 'HONAM_TRAVELER',
    displayName: '호남 여행자',
    description: '여행 처방을 받을 수 있는 절약액(12만원)을 처음으로 모았습니다.',
    iconKey: 'badge-honam-traveler',
    tier: 'SILVER',
    rules: [{ ruleType: 'TOTAL_SAVED_AMOUNT', thresholdValue: 120_000 }],
  },
];

export async function seedBadges(prisma: PrismaClient): Promise<{ badges: number; rules: number }> {
  let ruleCount = 0;

  for (const [index, badge] of BADGES.entries()) {
    const created = await prisma.badge.create({
      data: {
        code: badge.code,
        displayName: badge.displayName,
        description: badge.description,
        iconKey: badge.iconKey,
        tier: badge.tier,
        sortOrder: index,
      },
    });

    await prisma.badgeRule.createMany({
      data: badge.rules.map((r) => ({
        badgeId: created.id,
        ruleType: r.ruleType,
        thresholdValue: r.thresholdValue,
        category: r.category ?? null,
      })),
    });
    ruleCount += badge.rules.length;
  }

  return { badges: BADGES.length, rules: ruleCount };
}

export const BADGE_COUNT = BADGES.length;
