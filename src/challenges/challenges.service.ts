import { Injectable, Logger } from '@nestjs/common';

import { AnalysisService } from '../analysis/analysis.service';
import { ClockService } from '../common/clock/clock.service';
import { PLAN_SPECS, type ChallengeStatus, type PlanType } from '../common/constants/challenge';
import { isSavingTargetCategory } from '../common/constants/saving-target';
import { CATEGORY_LABELS, type TxCategory } from '../common/constants/tx-category';
import { AppException } from '../common/errors/app.exception';
import type { WithMeta } from '../common/interceptors/transform.interceptor';
import { toKstIso, toKstIsoOrNull } from '../common/utils/date-kst';
import { sum } from '../common/utils/money';
import { fromBp, roundRatio, toBp } from '../common/utils/ratio';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsService } from '../rewards/rewards.service';
import { SavingGoalsService } from '../saving-goals/saving-goals.service';
import {
  ChallengeHistoryItemDto,
  ChallengeProgressDto,
  CheckInDto,
  CheckInResultDto,
  CompleteChallengeResultDto,
  DestinationPlanDto,
} from './dto/challenges.dto';
import {
  buildDestinationPlans,
  buildPlan,
  type DestinationPlan,
} from './plan-calculator';
import {
  buildWeekProgress,
  calcProgress,
  evaluateStatus,
  type ProgressResult,
} from './progress-calculator';

/** 진행 중 챌린지 조회 시 함께 가져오는 관계 */
const CHALLENGE_INCLUDE = {
  categoryBudgets: true,
  weeklyPlans: { include: { categoryBudgets: true }, orderBy: { weekNo: 'asc' } },
  checkIns: true,
} as const;

@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly analysis: AnalysisService,
    private readonly savingGoals: SavingGoalsService,
    private readonly rewards: RewardsService,
  ) {}

  // ---------------------------------------------------------------------------
  // S10 처방 선택 — 여행지가 곧 플랜이다 (§12-2)
  // ---------------------------------------------------------------------------

  /**
   * 고를 수 있는 챌린지 목록을 반환한다. 저장하지 않는다.
   *
   * **절약 목표가 없어도 호출할 수 있다** — S10 은 S12 보다 앞에 오기 때문이다.
   * 목표액과 기간은 여행지가 갖고 있고, 여기서는 난이도와 달성 가능 여부만 계산한다.
   */
  async getPlans(userId: string): Promise<DestinationPlanDto[]> {
    const summary = await this.analysis.computeSummary(userId);
    if (summary.monthsCovered === 0) throw new AppException('NO_TRANSACTION_DATA');

    const destinations = await this.prisma.travelDestination.findMany({
      orderBy: [{ challengeWeeks: 'asc' }, { targetSavingAmount: 'asc' }],
    });

    // 배분 상한은 **절약 대상 9종만** 더한다 (§12-1).
    // 12종 전체로 계산하면 의료·교육·여행비까지 줄일 수 있다고 보는 셈이라 과대평가된다.
    const savingTargetMonthlyAvgTotal = sum(
      summary.byCategory
        .filter((c) => isSavingTargetCategory(c.category))
        .map((c) => c.monthlyAvgAmount),
    );

    return buildDestinationPlans({
      destinations: destinations.map((d) => ({
        destinationId: d.id,
        code: d.code,
        name: d.name,
        province: d.province,
        heroImageUrl: d.heroImageUrl,
        catchphrase: d.catchphrase,
        tagline: d.tagline,
        weeks: d.challengeWeeks,
        targetSavingAmount: d.targetSavingAmount,
      })),
      savingTargetMonthlyAvgTotal,
      monthlyAvgTotalAmount: summary.monthlyAvgTotalAmount,
    }).map(toDestinationPlanDto);
  }

  // ---------------------------------------------------------------------------
  // 시작
  // ---------------------------------------------------------------------------

  /**
   * 챌린지를 시작한다.
   *
   * 기간·목표액은 **활성 절약 목표가 가리키는 여행지**에서 나온다 (§12-2).
   * 프론트가 상태를 잃고 다른 여행지를 보내는 사고를 막기 위해 `destinationId` 를 받아
   * 목표와 일치하는지 확인한다.
   */
  async start(userId: string, destinationId: string): Promise<ChallengeProgressDto> {
    const active = await this.prisma.challenge.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
    });
    if (active) {
      throw new AppException(
        'CHALLENGE_ALREADY_ACTIVE',
        '이미 진행 중인 챌린지가 있습니다. 완료하거나 포기한 뒤 새로 시작해 주세요.',
        [{ challengeId: active.id, endsAt: toKstIso(active.endsAt) }],
      );
    }

    const goal = await this.savingGoals.requireActiveGoal(userId);
    const summary = await this.analysis.computeSummary(userId);
    if (summary.monthsCovered === 0) throw new AppException('NO_TRANSACTION_DATA');

    if (goal.destinationId !== destinationId) {
      throw new AppException(
        'INVALID_REQUEST',
        '절약 목표가 다른 여행지를 향하고 있습니다. 목표를 다시 배분해 주세요.',
        [{ goalDestinationId: goal.destinationId, requestedDestinationId: destinationId }],
      );
    }

    const plan = buildPlan({
      items: goal.items.map((i) => ({
        category: i.category,
        monthlyAvgAmount: i.monthlyAvgAmount,
        targetAmount: i.targetAmount,
      })),
      weeks: goal.weeks,
      monthlyAvgTotalAmount: summary.monthlyAvgTotalAmount,
      startedAt: this.clock.now(),
    });

    const created = await this.prisma.challenge.create({
      data: {
        userId,
        savingGoalId: goal.id,
        destinationId,
        planType: plan.planType,
        weeks: plan.weeks,
        targetSavingAmount: plan.targetSavingAmount,
        difficulty: plan.difficulty,
        reductionRateBp: toBp(plan.reductionRate),
        baselineMonthlyTotalAmount: summary.monthlyAvgTotalAmount,
        expectedSpendAmount: plan.expectedSpendAmount,
        startedAt: plan.startedAt,
        endsAt: plan.endsAt,
        status: 'IN_PROGRESS',
        categoryBudgets: {
          create: plan.categories.map((c) => ({
            category: c.category,
            monthlyAvgAmount: c.monthlyAvgAmount,
            targetSavingAmount: c.periodTargetAmount,
            periodBudgetAmount: c.periodBudgetAmount,
          })),
        },
        weeklyPlans: {
          create: plan.weeklyBudgets.map((w) => ({
            weekNo: w.weekNo,
            startsAt: w.startsAt,
            endsAt: w.endsAt,
            budgetAmount: w.budgetAmount,
            categoryBudgets: {
              create: w.byCategory.map((b) => ({
                category: b.category,
                budgetAmount: b.budgetAmount,
              })),
            },
          })),
        },
      },
    });

    this.logger.log(
      `챌린지 시작: ${plan.planType} ${plan.weeks}주 / 목표 ${plan.targetSavingAmount}원 / ${plan.difficulty}`,
    );

    return this.getCurrent(userId, created.id);
  }

  // ---------------------------------------------------------------------------
  // 진행 상황 (지연 평가)
  // ---------------------------------------------------------------------------

  /**
   * 진행 중인 챌린지의 진척을 계산한다.
   *
   * 상태는 **조회 시점에 지연 평가**한다 (docs/design.md §1-⑤).
   * 백그라운드 스케줄러가 없으므로 demo/fast-forward 직후 이 API 를 부르면
   * 그 자리에서 SUCCEEDED / FAILED 로 전환된다.
   */
  async getCurrent(userId: string, challengeId?: string): Promise<ChallengeProgressDto> {
    const challenge = await this.prisma.challenge.findFirst({
      where: challengeId ? { id: challengeId, userId } : { userId, status: 'IN_PROGRESS' },
      include: CHALLENGE_INCLUDE,
      orderBy: { startedAt: 'desc' },
    });

    if (!challenge) throw new AppException('NO_ACTIVE_CHALLENGE');

    const { progress } = await this.computeProgress(userId, challenge);

    // 지연 평가 — 종료일이 지났으면 여기서 확정한다
    const nextStatus = evaluateStatus(challenge.status as ChallengeStatus, progress);
    if (nextStatus !== challenge.status) {
      await this.prisma.challenge.update({
        where: { id: challenge.id },
        data: {
          status: nextStatus,
          completedAt: this.clock.now(),
          finalSavedAmount: progress.currentSavedAmount,
          finalProgressBp: toBp(progress.progressRate),
        },
      });
      this.logger.log(`챌린지 상태 전환(지연 평가): ${challenge.status} → ${nextStatus}`);
    }

    return this.toProgressDto(userId, challenge, nextStatus, progress);
  }

  /** 챌린지 기간 내 카테고리별 실제 지출을 집계하고 진척을 계산한다 */
  private async computeProgress(
    userId: string,
    challenge: {
      id: string;
      startedAt: Date;
      endsAt: Date;
      targetSavingAmount: number;
      categoryBudgets: {
        category: string;
        periodBudgetAmount: number;
        targetSavingAmount: number;
      }[];
    },
  ): Promise<{ progress: ProgressResult; spentByCategory: Map<string, number> }> {
    const now = this.clock.now();
    const until = now.getTime() < challenge.endsAt.getTime() ? now : challenge.endsAt;

    const categories = challenge.categoryBudgets.map((b) => b.category);

    const grouped = await this.prisma.transaction.groupBy({
      by: ['category'],
      where: {
        userId,
        category: { in: categories },
        approvedAt: { gte: challenge.startedAt, lt: until },
      },
      _sum: { amount: true },
    });

    const spentByCategory = new Map<string, number>(
      grouped.map((g) => [g.category, g._sum.amount ?? 0]),
    );

    const progress = calcProgress({
      categories: challenge.categoryBudgets.map((b) => ({
        category: b.category,
        periodBudgetAmount: b.periodBudgetAmount,
        periodTargetAmount: b.targetSavingAmount,
        baselineAmount: b.periodBudgetAmount + b.targetSavingAmount,
        spentAmount: spentByCategory.get(b.category) ?? 0,
      })),
      targetSavingAmount: challenge.targetSavingAmount,
      startedAt: challenge.startedAt,
      endsAt: challenge.endsAt,
      now,
    });

    return { progress, spentByCategory };
  }

  // ---------------------------------------------------------------------------
  // 체크인
  // ---------------------------------------------------------------------------

  async checkIn(userId: string, challengeId: string, dto: CheckInDto): Promise<CheckInResultDto> {
    const challenge = await this.prisma.challenge.findFirst({
      where: { id: challengeId, userId },
      include: CHALLENGE_INCLUDE,
    });
    if (!challenge) throw new AppException('NOT_FOUND', '챌린지를 찾을 수 없습니다.');
    if (challenge.status !== 'IN_PROGRESS') {
      throw new AppException('CHALLENGE_NOT_ACTIVE', '진행 중인 챌린지가 아닙니다.', [
        { status: challenge.status },
      ]);
    }

    const week = challenge.weeklyPlans.find((w) => w.weekNo === dto.weekNo);
    if (!week) {
      throw new AppException('NOT_FOUND', `${dto.weekNo}주차가 존재하지 않습니다.`, [
        { weeks: challenge.weeks },
      ]);
    }
    if (challenge.checkIns.some((c) => c.weekNo === dto.weekNo)) {
      throw new AppException('ALREADY_CHECKED_IN');
    }

    const spent = await this.prisma.transaction.aggregate({
      where: {
        userId,
        category: { in: challenge.categoryBudgets.map((b) => b.category) },
        approvedAt: { gte: week.startsAt, lt: week.endsAt },
      },
      _sum: { amount: true },
    });

    const spentAmount = spent._sum.amount ?? 0;
    const now = this.clock.now();

    await this.prisma.challengeCheckIn.create({
      data: {
        challengeId,
        weekNo: dto.weekNo,
        checkedAt: now,
        budgetAmount: week.budgetAmount,
        spentAmount,
        savedAmount: week.budgetAmount - spentAmount,
        note: dto.note ?? null,
      },
    });

    return {
      weekNo: dto.weekNo,
      budgetAmount: week.budgetAmount,
      spentAmount,
      savedAmount: week.budgetAmount - spentAmount,
      checkedAt: toKstIso(now),
      checkedInCount: challenge.checkIns.length + 1,
    };
  }

  // ---------------------------------------------------------------------------
  // 완료 — 성공/실패 판정 + 뱃지·쿠폰 지급 트리거
  // ---------------------------------------------------------------------------

  async complete(userId: string, challengeId: string): Promise<CompleteChallengeResultDto> {
    const challenge = await this.prisma.challenge.findFirst({
      where: { id: challengeId, userId },
      include: CHALLENGE_INCLUDE,
    });
    if (!challenge) throw new AppException('NOT_FOUND', '챌린지를 찾을 수 없습니다.');

    const { progress } = await this.computeProgress(userId, challenge);

    // 아직 기간이 남았어도 완료를 호출하면 그 시점 진척으로 판정한다.
    // 발표에서 종료를 기다리지 않고 결과 화면으로 넘어갈 수 있어야 하기 때문이다.
    const alreadyCompleted = challenge.status !== 'IN_PROGRESS';
    const status: ChallengeStatus = alreadyCompleted
      ? (challenge.status as ChallengeStatus)
      : progress.progressRate >= 1
        ? 'SUCCEEDED'
        : 'FAILED';

    if (!alreadyCompleted) {
      await this.prisma.challenge.update({
        where: { id: challengeId },
        data: {
          status,
          completedAt: this.clock.now(),
          finalSavedAmount: progress.currentSavedAmount,
          finalProgressBp: toBp(progress.progressRate),
        },
      });
      this.logger.log(`챌린지 완료: ${status} / 절약 ${progress.currentSavedAmount}원`);
    }

    // 성공했을 때만 보상을 준다. 재호출해도 이미 보유한 뱃지·쿠폰은 다시 나가지 않는다.
    const rewards =
      status === 'SUCCEEDED'
        ? await this.rewards.grantForChallenge(userId, challengeId)
        : { badges: [], coupons: [] };

    return {
      id: challengeId,
      status,
      finalSavedAmount: alreadyCompleted
        ? (challenge.finalSavedAmount ?? progress.currentSavedAmount)
        : progress.currentSavedAmount,
      finalProgressRate: alreadyCompleted
        ? roundRatio(fromBp(challenge.finalProgressBp ?? 0))
        : roundRatio(progress.progressRate),
      targetSavingAmount: challenge.targetSavingAmount,
      earnedBadges: rewards.badges,
      issuedCoupons: rewards.coupons,
    };
  }

  // ---------------------------------------------------------------------------
  // 이력
  // ---------------------------------------------------------------------------

  async history(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<WithMeta<ChallengeHistoryItemDto[]>> {
    const rows = await this.prisma.challenge.findMany({
      where: { userId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;

    return {
      data: page.map((c) => ({
        id: c.id,
        planType: c.planType,
        label: PLAN_SPECS[c.planType as PlanType]?.label ?? c.planType,
        weeks: c.weeks,
        status: c.status,
        difficulty: c.difficulty,
        targetSavingAmount: c.targetSavingAmount,
        startedAt: toKstIso(c.startedAt),
        endsAt: toKstIso(c.endsAt),
        finalSavedAmount: c.finalSavedAmount,
        finalProgressRate:
          c.finalProgressBp === null ? null : roundRatio(fromBp(c.finalProgressBp)),
        completedAt: toKstIsoOrNull(c.completedAt),
      })),
      meta: { hasNext, nextCursor: hasNext ? page[page.length - 1].id : null },
    };
  }

  // ---------------------------------------------------------------------------

  private async toProgressDto(
    userId: string,
    challenge: {
      id: string;
      planType: string;
      weeks: number;
      difficulty: string;
      targetSavingAmount: number;
      startedAt: Date;
      endsAt: Date;
      categoryBudgets: { category: string }[];
      weeklyPlans: { weekNo: number; startsAt: Date; endsAt: Date; budgetAmount: number }[];
      checkIns: { weekNo: number }[];
    },
    status: ChallengeStatus,
    progress: ProgressResult,
  ): Promise<ChallengeProgressDto> {
    const now = this.clock.now();
    const checkedInWeeks = new Set(challenge.checkIns.map((c) => c.weekNo));
    const categories = challenge.categoryBudgets.map((b) => b.category);

    // 주차별 실지출을 주차 구간으로 집계한다.
    // 챌린지가 추적하는 카테고리만 센다 — 목표에 없는 카테고리 지출은 예산과 무관하다.
    const weeklySpent = await Promise.all(
      challenge.weeklyPlans.map(async (w) => {
        const agg = await this.prisma.transaction.aggregate({
          where: {
            userId,
            category: { in: categories },
            approvedAt: { gte: w.startsAt, lt: w.endsAt },
          },
          _sum: { amount: true },
        });
        return agg._sum.amount ?? 0;
      }),
    );

    const weeklyProgress = buildWeekProgress(
      challenge.weeklyPlans.map((w, i) => ({
        weekNo: w.weekNo,
        startsAt: w.startsAt,
        endsAt: w.endsAt,
        budgetAmount: w.budgetAmount,
        spentAmount: weeklySpent[i],
        checkedIn: checkedInWeeks.has(w.weekNo),
      })),
      now,
    );

    return {
      id: challenge.id,
      planType: challenge.planType,
      label: PLAN_SPECS[challenge.planType as PlanType]?.label ?? challenge.planType,
      weeks: challenge.weeks,
      status,
      difficulty: challenge.difficulty,
      targetSavingAmount: challenge.targetSavingAmount,
      startedAt: toKstIso(challenge.startedAt),
      endsAt: toKstIso(challenge.endsAt),
      currentSavedAmount: progress.currentSavedAmount,
      progressRate: roundRatio(progress.progressRate),
      rawProgressRate: roundRatio(progress.rawProgressRate),
      elapsedRatio: roundRatio(progress.elapsedRatio),
      daysElapsed: progress.daysElapsed,
      daysRemaining: progress.daysRemaining,
      currentWeekNo: progress.currentWeekNo,
      byCategory: progress.byCategory.map((c) => ({
        category: c.category,
        label: CATEGORY_LABELS[c.category as TxCategory] ?? c.category,
        periodBudgetAmount: c.periodBudgetAmount,
        budgetSoFarAmount: c.budgetSoFarAmount,
        baselineSoFarAmount: c.baselineSoFarAmount,
        spentAmount: c.spentAmount,
        savedAmount: c.savedAmount,
        isOver: c.isOver,
      })),
      weeklyProgress: weeklyProgress.map((w) => ({
        weekNo: w.weekNo,
        startsAt: toKstIso(w.startsAt),
        endsAt: toKstIso(w.endsAt),
        budgetAmount: w.budgetAmount,
        spentAmount: w.spentAmount,
        savedAmount: w.savedAmount,
        checkedIn: w.checkedIn,
        isCurrent: w.isCurrent,
        isPast: w.isPast,
        isOver: w.isOver,
      })),
    };
  }
}

function toDestinationPlanDto(plan: DestinationPlan): DestinationPlanDto {
  return {
    destinationId: plan.destinationId,
    code: plan.code,
    name: plan.name,
    province: plan.province,
    heroImageUrl: plan.heroImageUrl,
    catchphrase: plan.catchphrase,
    tagline: plan.tagline,
    planType: plan.planType,
    label: plan.label,
    weeks: plan.weeks,
    targetSavingAmount: plan.targetSavingAmount,
    expectedSpendAmount: plan.expectedSpendAmount,
    reductionRate: roundRatio(plan.reductionRate),
    difficulty: plan.difficulty,
    achievable: plan.achievable,
    allocatableAmount: plan.allocatableAmount,
    shortfallAmount: plan.shortfallAmount,
  };
}
