/**
 * 보상 지급 (§6-6).
 *
 * 뱃지 조건은 코드에 박지 않고 **BadgeRule 테이블**에서 읽는다.
 * 기획이 기준을 바꾸면 시드만 갱신하면 되고 서비스 코드는 그대로다.
 *
 * 이 파일은 "지급" 로직이다. 조회 엔드포인트(GET /rewards/*)는 8단계에서 붙는다.
 */
import { Injectable, Logger } from '@nestjs/common';

import { ClockService } from '../common/clock/clock.service';
import type { BadgeRuleType } from '../common/constants/reward';
import { addDays, diffKstDays, toKstIso } from '../common/utils/date-kst';
import { clamp } from '../common/utils/money';
import { roundRatio } from '../common/utils/ratio';
import { PrismaService } from '../prisma/prisma.service';
import type { BadgeCollectionDto, BadgeDto, IssuedCouponDto } from './dto/rewards.dto';

export interface GrantedBadge {
  code: string;
  displayName: string;
  description: string;
  iconKey: string;
  tier: string;
}

export interface GrantedCoupon {
  issueCode: string;
  title: string;
  partnerName: string;
  validUntil: string;
}

export interface GrantResult {
  badges: GrantedBadge[];
  coupons: GrantedCoupon[];
}

/** 뱃지 조건 판정에 필요한 사용자 누적 실적 */
export interface RewardStats {
  succeededCount: number;
  challengeCount: number;
  consecutiveSuccess: number;
  totalSavedAmount: number;
  savedByCategory: Record<string, number>;
}

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /**
   * 챌린지 완료 시 뱃지·쿠폰을 지급한다.
   * 조건을 만족해도 이미 보유한 뱃지는 다시 주지 않는다.
   */
  async grantForChallenge(userId: string, challengeId: string): Promise<GrantResult> {
    const stats = await this.collectStats(userId);
    const badges = await this.grantBadges(userId, challengeId, stats);
    const coupons = await this.grantCoupons(userId, challengeId, stats);
    return { badges, coupons };
  }

  /**
   * 누적 실적. 지급 판정과 조회 화면의 진행도가 **같은 값**을 쓰도록 공개한다.
   * 따로 계산하면 "99% 인데 이미 받았다" 같은 어긋남이 생긴다.
   */
  async collectStats(userId: string): Promise<RewardStats> {
    const challenges = await this.prisma.challenge.findMany({
      where: { userId, status: { in: ['SUCCEEDED', 'FAILED'] } },
      orderBy: { completedAt: 'asc' },
      include: { categoryBudgets: true },
    });

    const succeeded = challenges.filter((c) => c.status === 'SUCCEEDED');

    // 최근부터 거슬러 올라가며 연속 성공 횟수를 센다
    let consecutiveSuccess = 0;
    for (let i = challenges.length - 1; i >= 0; i -= 1) {
      if (challenges[i].status !== 'SUCCEEDED') break;
      consecutiveSuccess += 1;
    }

    const totalSavedAmount = succeeded.reduce((s, c) => s + Math.max(0, c.finalSavedAmount ?? 0), 0);

    // 카테고리별 누적 절약은 성공한 챌린지의 목표액 기준으로 본다.
    // (카테고리별 실적 절약액을 따로 저장하지 않으므로, 달성한 목표를 실적으로 인정한다)
    const savedByCategory: Record<string, number> = {};
    for (const challenge of succeeded) {
      for (const budget of challenge.categoryBudgets) {
        savedByCategory[budget.category] =
          (savedByCategory[budget.category] ?? 0) + budget.targetSavingAmount;
      }
    }

    return {
      succeededCount: succeeded.length,
      challengeCount: challenges.length,
      consecutiveSuccess,
      totalSavedAmount,
      savedByCategory,
    };
  }

  private async grantBadges(
    userId: string,
    challengeId: string,
    stats: RewardStats,
  ): Promise<GrantedBadge[]> {
    const [badges, owned] = await Promise.all([
      this.prisma.badge.findMany({ include: { rules: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
    ]);

    const ownedIds = new Set(owned.map((o) => o.badgeId));
    const granted: GrantedBadge[] = [];

    for (const badge of badges) {
      if (ownedIds.has(badge.id)) continue;
      // 한 뱃지에 여러 조건이 걸려 있으면 전부 만족해야 한다 (AND)
      const satisfied = badge.rules.every((rule) => this.isRuleSatisfied(rule, stats));
      if (!satisfied || badge.rules.length === 0) continue;

      await this.prisma.userBadge.create({
        data: { userId, badgeId: badge.id, challengeId, earnedAt: this.clock.now() },
      });

      granted.push({
        code: badge.code,
        displayName: badge.displayName,
        description: badge.description,
        iconKey: badge.iconKey,
        tier: badge.tier,
      });
    }

    if (granted.length > 0) {
      this.logger.log(`뱃지 지급: ${granted.map((b) => b.displayName).join(', ')}`);
    }
    return granted;
  }

  private isRuleSatisfied(
    rule: { ruleType: string; thresholdValue: number; category: string | null },
    stats: RewardStats,
  ): boolean {
    const { current, threshold } = this.measureRule(rule, stats);
    if (threshold < 0) return false; // 알 수 없는 조건
    return current >= threshold;
  }

  /**
   * 조건별 현재 실적과 기준값. 지급 판정과 진행도 표시가 이 함수 하나를 공유한다.
   * threshold 가 -1 이면 알 수 없는 조건이다.
   */
  measureRule(
    rule: { ruleType: string; thresholdValue: number; category: string | null },
    stats: RewardStats,
  ): { current: number; threshold: number; label: string } {
    const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

    switch (rule.ruleType as BadgeRuleType) {
      case 'FIRST_CHALLENGE_SUCCESS':
        return { current: stats.succeededCount, threshold: 1, label: '첫 챌린지 성공' };
      case 'CHALLENGE_COUNT':
        return {
          current: stats.challengeCount,
          threshold: rule.thresholdValue,
          label: `챌린지 ${rule.thresholdValue}회 완료`,
        };
      case 'CONSECUTIVE_SUCCESS':
        return {
          current: stats.consecutiveSuccess,
          threshold: rule.thresholdValue,
          label: `${rule.thresholdValue}회 연속 성공`,
        };
      case 'TOTAL_SAVED_AMOUNT':
        return {
          current: stats.totalSavedAmount,
          threshold: rule.thresholdValue,
          label: `누적 절약 ${won(rule.thresholdValue)}`,
        };
      case 'CATEGORY_SAVED_AMOUNT':
        return {
          current: rule.category ? (stats.savedByCategory[rule.category] ?? 0) : 0,
          threshold: rule.thresholdValue,
          label: `${rule.category ?? '?'} 절약 ${won(rule.thresholdValue)}`,
        };
      default:
        // 알 수 없는 조건은 만족하지 않은 것으로 본다 (조용히 지급되는 사고 방지)
        this.logger.warn(`알 수 없는 뱃지 조건: ${rule.ruleType}`);
        return { current: 0, threshold: -1, label: rule.ruleType };
    }
  }

  // ---------------------------------------------------------------------------
  // 조회
  // ---------------------------------------------------------------------------

  /**
   * 뱃지 컬렉션.
   * 수집형이므로 **미보유 항목도 전부** 내려주고, 잠긴 것에는 달성 진행도를 함께 준다 (§6-6).
   */
  async getBadgeCollection(userId: string): Promise<BadgeCollectionDto> {
    const [catalog, owned, stats] = await Promise.all([
      this.prisma.badge.findMany({ include: { rules: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.userBadge.findMany({ where: { userId } }),
      this.collectStats(userId),
    ]);

    const ownedByBadgeId = new Map(owned.map((o) => [o.badgeId, o]));

    const badges: BadgeDto[] = catalog.map((badge) => {
      const userBadge = ownedByBadgeId.get(badge.id);
      return {
        code: badge.code,
        displayName: badge.displayName,
        description: badge.description,
        iconKey: badge.iconKey,
        tier: badge.tier,
        earned: userBadge !== undefined,
        earnedAt: userBadge ? toKstIso(userBadge.earnedAt) : null,
        // 이미 받은 뱃지는 진행도를 보여줄 필요가 없다
        progress: userBadge
          ? []
          : badge.rules.map((rule) => {
              const m = this.measureRule(rule, stats);
              return {
                ruleType: rule.ruleType,
                label: m.label,
                current: m.current,
                threshold: m.threshold,
                rate: m.threshold > 0 ? roundRatio(clamp(m.current / m.threshold, 0, 1)) : 0,
              };
            }),
      };
    });

    return {
      earnedCount: badges.filter((b) => b.earned).length,
      totalCount: badges.length,
      badges,
    };
  }

  /**
   * 발급받은 쿠폰 목록.
   * 조회 시점에 만료된 쿠폰을 EXPIRED 로 정리한다 — 스케줄러를 두지 않기 위함이다.
   */
  async getIssuedCoupons(userId: string, status?: string): Promise<IssuedCouponDto[]> {
    const now = this.clock.now();

    await this.prisma.issuedCoupon.updateMany({
      where: { userId, status: 'ISSUED', validUntil: { lt: now } },
      data: { status: 'EXPIRED' },
    });

    const rows = await this.prisma.issuedCoupon.findMany({
      where: { userId, ...(status ? { status } : {}) },
      include: { coupon: { include: { destination: true } } },
      orderBy: [{ status: 'asc' }, { validUntil: 'asc' }],
    });

    return rows.map((r) => ({
      issueCode: r.issueCode,
      title: r.coupon.title,
      partnerName: r.coupon.partnerName,
      description: r.coupon.description,
      discountType: r.coupon.discountType,
      discountValue: r.coupon.discountValue,
      minSpendAmount: r.coupon.minSpendAmount,
      maxDiscountAmount: r.coupon.maxDiscountAmount,
      status: r.status,
      validFrom: toKstIso(r.validFrom),
      validUntil: toKstIso(r.validUntil),
      daysLeft: Math.max(0, diffKstDays(now, r.validUntil)),
      destination: r.coupon.destination
        ? { id: r.coupon.destination.id, name: r.coupon.destination.name }
        : null,
    }));
  }

  // ---------------------------------------------------------------------------

  /**
   * 절약액으로 갈 수 있는 여행지의 제휴 쿠폰을 발급한다.
   * 이미 발급받아 사용하지 않은 쿠폰은 중복 발급하지 않는다.
   */
  private async grantCoupons(
    userId: string,
    challengeId: string,
    stats: RewardStats,
  ): Promise<GrantedCoupon[]> {
    if (stats.totalSavedAmount <= 0) return [];

    const now = this.clock.now();

    // 절약액으로 갈 수 있는 여행지
    const destinations = await this.prisma.travelDestination.findMany({
      where: { targetSavingAmount: { lte: stats.totalSavedAmount } },
      orderBy: { targetSavingAmount: 'desc' },
      take: 2, // 너무 많이 뿌리지 않는다
    });

    const destinationIds = destinations.map((d) => d.id);

    const coupons = await this.prisma.coupon.findMany({
      where: {
        validFrom: { lte: now },
        validUntil: { gte: now },
        OR: [{ destinationId: { in: destinationIds } }, { destinationId: null }],
      },
      orderBy: { code: 'asc' },
    });

    const existing = await this.prisma.issuedCoupon.findMany({
      where: { userId, status: { in: ['ISSUED', 'USED'] } },
      select: { couponId: true },
    });
    const existingIds = new Set(existing.map((e) => e.couponId));

    const granted: GrantedCoupon[] = [];

    for (const coupon of coupons) {
      if (existingIds.has(coupon.id)) continue;

      // 캠페인 종료일과 "발급 후 N일" 중 이른 쪽이 유효기간이다
      const byValidDays = addDays(now, coupon.validDays);
      const validUntil =
        byValidDays.getTime() < coupon.validUntil.getTime() ? byValidDays : coupon.validUntil;

      const issueCode = `${coupon.code}-${challengeId.slice(-6).toUpperCase()}`;

      await this.prisma.issuedCoupon.create({
        data: {
          userId,
          couponId: coupon.id,
          challengeId,
          issueCode,
          status: 'ISSUED',
          issuedAt: now,
          validFrom: now,
          validUntil,
        },
      });

      granted.push({
        issueCode,
        title: coupon.title,
        partnerName: coupon.partnerName,
        validUntil: toKstIso(validUntil),
      });
    }

    if (granted.length > 0) {
      this.logger.log(`쿠폰 발급: ${granted.length}장`);
    }
    return granted;
  }
}
