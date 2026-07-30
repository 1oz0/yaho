import { Injectable, Logger } from '@nestjs/common';

import { AnalysisService } from '../analysis/analysis.service';
import { SAVING_GOAL_STEP_AMOUNT } from '../common/constants/challenge';
import {
  CATEGORY_UNIT_LABEL,
  SAVING_EXCLUSION_REASONS,
  isSavingTargetCategory,
  type SavingTargetCategory,
} from '../common/constants/saving-target';
import { CATEGORY_LABELS, type TxCategory } from '../common/constants/tx-category';
import { AppException } from '../common/errors/app.exception';
import { toKstIso } from '../common/utils/date-kst';
import { sum } from '../common/utils/money';
import { roundRatio, safeRatio } from '../common/utils/ratio';
import { findGoalViolations } from '../challenges/plan-calculator';
import { PrismaService } from '../prisma/prisma.service';
import { autoAllocate, toUnitCount, unitPriceOf } from './allocation-calculator';
import {
  CreateSavingGoalDto,
  SavingGoalDto,
  SavingSuggestionsDto,
} from './dto/saving-goals.dto';

/** 슬라이더 기본값 = 월평균의 30% */
const DEFAULT_REDUCTION_RATE = 0.3;

@Injectable()
export class SavingGoalsService {
  private readonly logger = new Logger(SavingGoalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysis: AnalysisService,
  ) {}

  /**
   * 슬라이더 기본값·최대값·환산 힌트를 제공한다 (화면 S12).
   *
   * **9종만 내려간다** (§12-1). 최대값은 해당 카테고리 월평균이다 — 그보다 많이 아낄 수는 없다.
   *
   * `targetAmount` 를 주면 그 금액을 정확히 채우는 자동 배분안이 함께 온다.
   * 3단계부터는 여행지가 목표액을 정하므로 그 값을 그대로 넘기면 된다 (§12-2).
   */
  async getSuggestions(userId: string, targetAmount?: number): Promise<SavingSuggestionsDto> {
    const summary = await this.analysis.computeSummary(userId);
    if (summary.monthsCovered === 0) throw new AppException('NO_TRANSACTION_DATA');

    const items = summary.byCategory
      .filter((c) => isSavingTargetCategory(c.category))
      .map((c) => {
        const category = c.category as SavingTargetCategory;
        const defaultAmount = Math.min(
          roundToStep(c.monthlyAvgAmount * DEFAULT_REDUCTION_RATE),
          c.monthlyAvgAmount,
        );
        return {
          category,
          label: CATEGORY_LABELS[category],
          monthlyAvgAmount: c.monthlyAvgAmount,
          maxAmount: c.monthlyAvgAmount,
          defaultAmount,
          step: SAVING_GOAL_STEP_AMOUNT,
          unitLabel: CATEGORY_UNIT_LABEL[category],
          // 단가는 하드코딩하지 않는다 — 이 사용자의 실제 평균 결제액에서 뽑는다
          unitPriceAmount: unitPriceOf(c.totalAmount, c.txCount),
          defaultUnitCount: toUnitCount(defaultAmount, c.totalAmount, c.txCount),
        };
      });

    const allocatableTotalAmount = sum(items.map((i) => i.maxAmount));

    const allocation =
      targetAmount === undefined || targetAmount <= 0
        ? null
        : autoAllocate(
            targetAmount,
            items.map((i) => ({ category: i.category, monthlyAvgAmount: i.monthlyAvgAmount })),
            SAVING_GOAL_STEP_AMOUNT,
          );

    return {
      monthsCovered: summary.monthsCovered,
      monthlyAvgTotalAmount: summary.monthlyAvgTotalAmount,
      defaultTotalAmount: sum(items.map((i) => i.defaultAmount)),
      allocatableTotalAmount,
      items,
      excludedCategories: Object.entries(SAVING_EXCLUSION_REASONS).map(([category, reason]) => ({
        category,
        label: CATEGORY_LABELS[category as TxCategory] ?? category,
        reason: reason!,
      })),
      autoAllocation:
        allocation === null
          ? null
          : {
              targetAmount: targetAmount!,
              items: allocation.items,
              allocatedAmount: allocation.allocatedAmount,
              shortfallAmount: allocation.shortfallAmount,
            },
    };
  }

  /**
   * 절약 목표를 저장한다.
   *
   * 목표액이 해당 카테고리 월평균을 초과하면 400 `SAVING_GOAL_EXCEEDS_AVERAGE` 로 거절하고,
   * **어떤 카테고리가 문제인지** details 에 담아 프론트가 그 슬라이더를 짚어줄 수 있게 한다 (§6-3).
   */
  async create(userId: string, dto: CreateSavingGoalDto): Promise<SavingGoalDto> {
    const summary = await this.analysis.computeSummary(userId);
    if (summary.monthsCovered === 0) throw new AppException('NO_TRANSACTION_DATA');

    // 중복 카테고리는 조용히 합치지 않고 거절한다 — 프론트 버그를 숨기지 않는다
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.category)) {
        throw new AppException('INVALID_CATEGORY', '같은 카테고리를 두 번 지정할 수 없습니다.', [
          { category: item.category },
        ]);
      }
      seen.add(item.category);

      // DTO 의 @IsIn 이 이미 막지만, 서비스가 직접 불릴 때를 대비해 한 번 더 본다.
      // 절약 대상이 아닌 카테고리가 들어오면 이유까지 알려준다.
      if (!isSavingTargetCategory(item.category)) {
        throw new AppException(
          'INVALID_CATEGORY',
          SAVING_EXCLUSION_REASONS[item.category as SavingTargetCategory] ??
            '절약 목표로 지정할 수 없는 카테고리입니다.',
          [{ category: item.category, label: CATEGORY_LABELS[item.category as TxCategory] }],
        );
      }
    }

    // 목표액과 기간은 여행지가 정한다 (§12-2)
    const destination = await this.prisma.travelDestination.findUnique({
      where: { id: dto.destinationId },
    });
    if (!destination) throw new AppException('NOT_FOUND', '여행지를 찾을 수 없습니다.');

    const goalItems = dto.items.map((item) => ({
      category: item.category,
      targetAmount: item.targetAmount,
      monthlyAvgAmount: summary.monthlyAvgByCategory[item.category] ?? 0,
    }));

    // 상한은 월평균이 아니라 **기간 환산 평소 지출**이다.
    // 2주 챌린지에서 월평균만큼 줄이겠다고 하면 그 기간 예산이 음수가 된다.
    const violations = findGoalViolations(goalItems, destination.challengeWeeks);
    if (violations.length > 0) {
      throw new AppException(
        'SAVING_GOAL_EXCEEDS_AVERAGE',
        `${destination.challengeWeeks}주 동안 쓰던 금액보다 많이 줄이겠다고 한 카테고리가 있습니다: ${violations
          .map((v) => CATEGORY_LABELS[v.category as TxCategory] ?? v.category)
          .join(', ')}`,
        violations.map((v) => ({
          category: v.category,
          label: CATEGORY_LABELS[v.category as TxCategory] ?? v.category,
          targetAmount: v.targetAmount,
          monthlyAvgAmount: v.monthlyAvgAmount,
          periodMaxAmount: v.periodMaxAmount,
        })),
      );
    }

    const totalTargetAmount = sum(goalItems.map((i) => i.targetAmount));

    // 합계가 여행지 목표액과 정확히 일치해야 한다.
    // 화면이 `266,000 / 280,000원` 처럼 합계를 그대로 보여주므로, 여기서 어긋나면
    // "목표를 못 채웠는데 챌린지가 시작되는" 상태가 만들어진다.
    if (totalTargetAmount !== destination.targetSavingAmount) {
      throw new AppException(
        'INVALID_REQUEST',
        `배분 합계가 목표액과 다릅니다. ${destination.name} 목표는 ` +
          `${destination.targetSavingAmount.toLocaleString('ko-KR')}원인데 ` +
          `${totalTargetAmount.toLocaleString('ko-KR')}원이 배분됐습니다.`,
        [
          {
            destinationId: destination.id,
            requiredAmount: destination.targetSavingAmount,
            allocatedAmount: totalTargetAmount,
            differenceAmount: destination.targetSavingAmount - totalTargetAmount,
          },
        ],
      );
    }

    // 기존 활성 목표는 보관 처리하고 새로 만든다 (이력을 남긴다)
    const goal = await this.prisma.$transaction(async (tx) => {
      await tx.savingGoal.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'ARCHIVED' },
      });
      return tx.savingGoal.create({
        data: {
          userId,
          destinationId: destination.id,
          weeks: destination.challengeWeeks,
          totalTargetAmount,
          status: 'ACTIVE',
          items: {
            create: goalItems.map((i) => ({
              category: i.category,
              targetAmount: i.targetAmount,
              monthlyAvgAmount: i.monthlyAvgAmount,
            })),
          },
        },
        include: { items: true, destination: { select: { name: true } } },
      });
    });

    this.logger.log(
      `절약 목표 저장: ${destination.name} ${destination.challengeWeeks}주 / ` +
        `${totalTargetAmount}원 (${goalItems.length}개 카테고리)`,
    );
    return toDto(goal);
  }

  async getCurrent(userId: string): Promise<SavingGoalDto> {
    const goal = await this.prisma.savingGoal.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { items: true, destination: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!goal) throw new AppException('NO_SAVING_GOAL');
    return toDto(goal);
  }

  /** challenges 모듈이 플랜 계산에 쓴다. destinationId / weeks 가 필요하다 (§12-2). */
  async requireActiveGoal(userId: string) {
    const goal = await this.prisma.savingGoal.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { items: true, destination: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!goal) throw new AppException('NO_SAVING_GOAL');
    return goal;
  }
}

function roundToStep(amount: number): number {
  return Math.round(amount / SAVING_GOAL_STEP_AMOUNT) * SAVING_GOAL_STEP_AMOUNT;
}

function toDto(goal: {
  id: string;
  destinationId: string;
  weeks: number;
  totalTargetAmount: number;
  status: string;
  createdAt: Date;
  destination: { name: string };
  items: { category: string; targetAmount: number; monthlyAvgAmount: number }[];
}): SavingGoalDto {
  return {
    id: goal.id,
    destinationId: goal.destinationId,
    destinationName: goal.destination.name,
    weeks: goal.weeks,
    totalTargetAmount: goal.totalTargetAmount,
    status: goal.status,
    createdAt: toKstIso(goal.createdAt),
    items: goal.items
      .map((i) => ({
        category: i.category,
        label: CATEGORY_LABELS[i.category as TxCategory] ?? i.category,
        targetAmount: i.targetAmount,
        monthlyAvgAmount: i.monthlyAvgAmount,
        reductionRate: roundRatio(safeRatio(i.targetAmount, i.monthlyAvgAmount)),
      }))
      .sort((a, b) => b.targetAmount - a.targetAmount),
  };
}
