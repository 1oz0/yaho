import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { CHALLENGE_STATUSES, DIFFICULTIES, PLAN_TYPES } from '../../common/constants/challenge';
import { TX_CATEGORIES } from '../../common/constants/tx-category';

// ---------------------------------------------------------------------------
// 플랜 후보
// ---------------------------------------------------------------------------

export class PlanCategoryDto {
  @ApiProperty({ type: String, enum: TX_CATEGORIES })
  category!: string;

  @ApiProperty({ type: String, example: '배달' })
  label!: string;

  @ApiProperty({ type: Number, description: '산정 시점 월평균 (원)' })
  monthlyAvgAmount!: number;

  @ApiProperty({ type: Number, description: '이 기간의 절약 목표 (원)' })
  periodTargetAmount!: number;

  @ApiProperty({ type: Number, description: '이 기간에 써도 되는 금액 (원)' })
  periodBudgetAmount!: number;

  @ApiProperty({
    type: Number,
    description: '절약하지 않았다면 썼을 금액 = 예산 + 목표 (원). 진척률의 기준선.',
  })
  baselineAmount!: number;
}

export class WeeklyCategoryBudgetDto {
  @ApiProperty({ type: String })
  category!: string;

  @ApiProperty({ type: Number })
  budgetAmount!: number;
}

export class WeeklyBudgetDto {
  @ApiProperty({ type: Number, description: '1부터 시작' })
  weekNo!: number;

  @ApiProperty({ type: String, description: 'KST ISO' })
  startsAt!: string;

  @ApiProperty({ type: String, description: 'KST ISO (미만)' })
  endsAt!: string;

  @ApiProperty({ type: Number, description: '해당 주 예산 합계 (원)' })
  budgetAmount!: number;

  @ApiProperty({ type: [WeeklyCategoryBudgetDto] })
  byCategory!: WeeklyCategoryBudgetDto[];
}

export class DestinationPlanDto {
  @ApiProperty({ type: String, description: 'TravelDestination ID. `POST /challenges` 에 이 값을 보냅니다.' })
  destinationId!: string;

  @ApiProperty({ type: String, example: 'GANGJIN' })
  code!: string;

  @ApiProperty({ type: String, example: '강진' })
  name!: string;

  @ApiProperty({ type: String, example: '전라남도' })
  province!: string;

  @ApiProperty({ type: String, description: '카드 썸네일' })
  heroImageUrl!: string;

  @ApiProperty({
    type: String,
    example: '지친 위장과 지갑에 휴식을',
    description: 'S10 카드의 한 줄 카피. 무엇을 줄여 무엇을 얻는지를 말합니다.',
  })
  catchphrase!: string;

  @ApiProperty({ type: String, description: '여행지 자체를 설명하는 문구 (카피와 다릅니다)' })
  tagline!: string;

  @ApiProperty({ type: String, enum: PLAN_TYPES, description: '기간에서 파생됩니다. 2주=SHORT, 4주=STANDARD, 8주=LONG' })
  planType!: string;

  @ApiProperty({ type: String, example: '2주 챌린지' })
  label!: string;

  @ApiProperty({ type: Number, example: 2, description: '챌린지 기간(주). **여행지가 정합니다.**' })
  weeks!: number;

  @ApiProperty({
    type: Number,
    example: 60000,
    description: '**기간 전체 목표 절약액(원).** 여행지가 정하며, 곧 예상 여행 경비입니다.',
  })
  targetSavingAmount!: number;

  @ApiProperty({ type: Number, description: '난이도 판정용 예상 지출 = 월평균 × 주수/4.345 (원)' })
  expectedSpendAmount!: number;

  @ApiProperty({ type: Number, description: '절감률 = 목표 / 예상지출. 0.0~1.0', example: 0.1412 })
  reductionRate!: number;

  @ApiProperty({ type: String, enum: DIFFICULTIES })
  difficulty!: string;

  @ApiProperty({
    type: Boolean,
    description:
      '이 목표액을 절약 슬라이더 9종으로 배분할 수 있는가. ' +
      '`false` 면 지금 소비 규모로는 달성이 불가능하므로 **목록에서 빼세요** ' +
      '(달성 불가능한 선택지를 보여주지 않는다).',
  })
  achievable!: boolean;

  @ApiProperty({
    type: Number,
    description: '이 기간에 배분 가능한 상한 합계(원) = 9종 월평균 합 × 주수/4',
  })
  allocatableAmount!: number;

  @ApiProperty({ type: Number, description: '목표액 − 배분 상한. 달성 가능하면 0.' })
  shortfallAmount!: number;
}

// ---------------------------------------------------------------------------
// 챌린지 시작
// ---------------------------------------------------------------------------

export class StartChallengeDto {
  @ApiProperty({
    type: String,
    description:
      '`GET /challenges/plans` 에서 고른 여행지 ID. ' +
      '**활성 절약 목표가 향하는 여행지와 같아야 합니다** — 다르면 400 으로 거절합니다. ' +
      '기간과 목표액은 이 여행지에서 나옵니다.',
  })
  @IsString()
  @IsNotEmpty()
  destinationId!: string;
}

// ---------------------------------------------------------------------------
// 진행 상황
// ---------------------------------------------------------------------------

export class ChallengeCategoryProgressDto {
  @ApiProperty({ type: String })
  category!: string;

  @ApiProperty({ type: String, example: '배달' })
  label!: string;

  @ApiProperty({ type: Number, description: '기간 전체 예산 (원)' })
  periodBudgetAmount!: number;

  @ApiProperty({ type: Number, description: '지금까지 안분된 예산 (원)' })
  budgetSoFarAmount!: number;

  @ApiProperty({ type: Number, description: '지금까지 안분된 기준 지출 (원)' })
  baselineSoFarAmount!: number;

  @ApiProperty({ type: Number, description: '챌린지 시작 이후 실제 지출 (원)' })
  spentAmount!: number;

  @ApiProperty({
    type: Number,
    description: '절약액 (원). **음수 가능** — 초과분이 다른 카테고리 절약분을 상쇄한다.',
  })
  savedAmount!: number;

  @ApiProperty({ type: Boolean, description: '예산 초과 여부. 프론트는 빨강 처리.' })
  isOver!: boolean;
}

export class ChallengeWeekProgressDto {
  @ApiProperty({ type: Number })
  weekNo!: number;

  @ApiProperty({ type: String, description: 'KST ISO' })
  startsAt!: string;

  @ApiProperty({ type: String, description: 'KST ISO' })
  endsAt!: string;

  @ApiProperty({ type: Number })
  budgetAmount!: number;

  @ApiProperty({ type: Number })
  spentAmount!: number;

  @ApiProperty({ type: Number, description: '음수 가능' })
  savedAmount!: number;

  @ApiProperty({ type: Boolean })
  checkedIn!: boolean;

  @ApiProperty({ type: Boolean, description: '지금 진행 중인 주차' })
  isCurrent!: boolean;

  @ApiProperty({ type: Boolean })
  isPast!: boolean;

  @ApiProperty({ type: Boolean })
  isOver!: boolean;
}

export class ChallengeDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, enum: PLAN_TYPES })
  planType!: string;

  @ApiProperty({ type: String, example: '4주 표준' })
  label!: string;

  @ApiProperty({ type: Number })
  weeks!: number;

  @ApiProperty({ type: String, enum: CHALLENGE_STATUSES })
  status!: string;

  @ApiProperty({ type: String, enum: DIFFICULTIES })
  difficulty!: string;

  @ApiProperty({ type: Number, description: '목표 절약액 (원)' })
  targetSavingAmount!: number;

  @ApiProperty({ type: String, description: 'KST ISO' })
  startedAt!: string;

  @ApiProperty({ type: String, description: 'KST ISO' })
  endsAt!: string;
}

export class ChallengeProgressDto extends ChallengeDto {
  @ApiProperty({ type: Number, description: '현재 절약액 (원). 음수 가능.' })
  currentSavedAmount!: number;

  @ApiProperty({ type: Number, description: 'clamp(절약액/목표, 0, 1)', example: 0.62 })
  progressRate!: number;

  @ApiProperty({
    type: Number,
    description: 'clamp 하지 않은 원본 비율. 1.0 을 넘으면 초과 달성.',
    example: 2.5,
  })
  rawProgressRate!: number;

  @ApiProperty({ type: Number, description: '기간 경과 비율 0.0~1.0' })
  elapsedRatio!: number;

  @ApiProperty({ type: Number })
  daysElapsed!: number;

  @ApiProperty({ type: Number })
  daysRemaining!: number;

  @ApiProperty({ type: Number })
  currentWeekNo!: number;

  @ApiProperty({ type: [ChallengeCategoryProgressDto] })
  byCategory!: ChallengeCategoryProgressDto[];

  @ApiProperty({ type: [ChallengeWeekProgressDto], description: '주차별 예산 대비 실지출' })
  weeklyProgress!: ChallengeWeekProgressDto[];
}

// ---------------------------------------------------------------------------
// 체크인 / 완료
// ---------------------------------------------------------------------------

export class CheckInDto {
  @ApiProperty({ type: Number, description: '체크인할 주차 (1부터)', minimum: 1, maximum: 8 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  weekNo!: number;

  @ApiPropertyOptional({ type: String, description: '메모', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CheckInResultDto {
  @ApiProperty({ type: Number })
  weekNo!: number;

  @ApiProperty({ type: Number })
  budgetAmount!: number;

  @ApiProperty({ type: Number })
  spentAmount!: number;

  @ApiProperty({ type: Number, description: '음수 가능' })
  savedAmount!: number;

  @ApiProperty({ type: String, description: 'KST ISO' })
  checkedAt!: string;

  @ApiProperty({ type: Number, description: '지금까지 체크인한 주차 수' })
  checkedInCount!: number;
}

export class EarnedBadgeDto {
  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ type: String })
  iconKey!: string;

  @ApiProperty({ type: String, enum: ['BRONZE', 'SILVER', 'GOLD'] })
  tier!: string;
}

export class IssuedCouponSummaryDto {
  @ApiProperty({ type: String, description: '사용자에게 노출되는 쿠폰 코드' })
  issueCode!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  partnerName!: string;

  @ApiProperty({ type: String, description: 'KST ISO' })
  validUntil!: string;
}

export class CompleteChallengeResultDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, enum: CHALLENGE_STATUSES })
  status!: string;

  @ApiProperty({ type: Number, description: '확정 절약액 (원). 음수 가능.' })
  finalSavedAmount!: number;

  @ApiProperty({ type: Number, description: '확정 진척률 0.0~1.0' })
  finalProgressRate!: number;

  @ApiProperty({ type: Number })
  targetSavingAmount!: number;

  @ApiProperty({ type: [EarnedBadgeDto], description: '이번에 새로 지급된 뱃지' })
  earnedBadges!: EarnedBadgeDto[];

  @ApiProperty({ type: [IssuedCouponSummaryDto], description: '이번에 발급된 쿠폰' })
  issuedCoupons!: IssuedCouponSummaryDto[];
}

export class ChallengeHistoryItemDto extends ChallengeDto {
  @ApiProperty({ type: Number, nullable: true, description: '확정 절약액 (원)' })
  finalSavedAmount!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: '확정 진척률' })
  finalProgressRate!: number | null;

  @ApiProperty({ type: String, nullable: true, description: '완료 시각 (KST ISO)' })
  completedAt!: string | null;
}
