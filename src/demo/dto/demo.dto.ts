import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { SPENDABLE_CATEGORIES } from '../../common/constants/tx-category';

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

export class DemoResetResultDto {
  @ApiProperty({ type: String, description: '초기화 시각 (KST ISO)' })
  resetAt!: string;

  @ApiProperty({ type: Number, description: '삭제된 거래 수' })
  removedTransactions!: number;

  @ApiProperty({ type: Number, description: '삭제된 연동 수' })
  removedConnections!: number;

  @ApiProperty({ type: Number, description: '삭제된 챌린지 수' })
  removedChallenges!: number;

  @ApiProperty({ type: Number, description: '회수된 뱃지 수' })
  removedBadges!: number;

  @ApiProperty({ type: Number, description: '회수된 쿠폰 수' })
  removedCoupons!: number;

  @ApiProperty({ type: Number, description: '되돌린 가상 시계 오프셋(일)' })
  clockOffsetDaysBefore!: number;

  @ApiProperty({
    type: String,
    description: '보존된 데이터 안내. 가상 금융 DB 와 참조 데이터는 건드리지 않는다.',
  })
  preserved!: string;
}

// ---------------------------------------------------------------------------
// fast-forward
// ---------------------------------------------------------------------------

export class FastForwardDto {
  @ApiProperty({
    type: Number,
    description: '앞으로 감을 일수. 누적된다. 음수를 넣으면 되감는다.',
    example: 30,
    minimum: -365,
    maximum: 365,
  })
  @Type(() => Number)
  @IsInt()
  @Min(-365)
  @Max(365)
  days!: number;
}

export class FastForwardChallengeDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: '지연 평가 후 상태' })
  status!: string;

  @ApiProperty({ type: Number })
  progressRate!: number;

  @ApiProperty({ type: Number })
  currentSavedAmount!: number;

  @ApiProperty({ type: Number })
  daysRemaining!: number;
}

export class FastForwardResultDto {
  @ApiProperty({ type: Number, description: '누적 오프셋(일)' })
  clockOffsetDays!: number;

  @ApiProperty({ type: String, description: '앱이 인식하는 현재 시각 (KST ISO)' })
  virtualNow!: string;

  @ApiProperty({ type: String, description: '오프셋이 섞이지 않은 실제 시각 (KST ISO)' })
  realNow!: string;

  @ApiProperty({
    type: FastForwardChallengeDto,
    nullable: true,
    description: '진행 중이던 챌린지의 갱신 상태. 없으면 null.',
  })
  challenge!: FastForwardChallengeDto | null;
}

// ---------------------------------------------------------------------------
// simulate-spending
// ---------------------------------------------------------------------------

export class SimulateSpendingDto {
  @ApiProperty({ enum: SPENDABLE_CATEGORIES, description: '지출 카테고리', example: 'FOOD_DELIVERY' })
  @IsIn(SPENDABLE_CATEGORIES)
  category!: string;

  @ApiProperty({ type: Number, description: '금액 (원 단위 정수)', example: 45000, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  amount!: number;

  @ApiPropertyOptional({ type: String, description: '가맹점명. 생략하면 카테고리 기본값.', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchantName?: string;

  @ApiPropertyOptional({
    type: Number,
    description: '며칠 전 지출로 넣을지. 0 = 오늘(가상 시계 기준). 기본 0.',
    minimum: 0,
    maximum: 60,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  daysAgo?: number;
}

export class SimulateSpendingResultDto {
  @ApiProperty({ type: String })
  transactionId!: string;

  @ApiProperty({ type: String, description: '승인 일시 (KST ISO)' })
  approvedAt!: string;

  @ApiProperty({ type: String })
  merchantName!: string;

  @ApiProperty({ type: Number })
  amount!: number;

  @ApiProperty({ type: String })
  category!: string;

  @ApiProperty({
    type: FastForwardChallengeDto,
    nullable: true,
    description: '주입 후 갱신된 챌린지 진척. 진행 중인 챌린지가 없으면 null.',
  })
  challenge!: FastForwardChallengeDto | null;
}
