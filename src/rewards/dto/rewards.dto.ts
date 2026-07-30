import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import {
  BADGE_RULE_TYPES,
  BADGE_TIERS,
  DISCOUNT_TYPES,
  ISSUED_COUPON_STATUSES,
} from '../../common/constants/reward';

export class BadgeProgressDto {
  @ApiProperty({ type: String, enum: BADGE_RULE_TYPES, description: '조건 종류' })
  ruleType!: string;

  @ApiProperty({ type: String, description: '사람이 읽는 조건 설명', example: '누적 절약 300,000원' })
  label!: string;

  @ApiProperty({ type: Number, description: '현재 실적' })
  current!: number;

  @ApiProperty({ type: Number, description: '달성 기준' })
  threshold!: number;

  @ApiProperty({ type: Number, description: '달성률 0.0~1.0', example: 0.42 })
  rate!: number;
}

export class BadgeDto {
  @ApiProperty({ type: String, example: 'FIRST_WIN' })
  code!: string;

  @ApiProperty({ type: String, example: '첫 번째 성공' })
  displayName!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ type: String })
  iconKey!: string;

  @ApiProperty({ type: String, enum: BADGE_TIERS })
  tier!: string;

  @ApiProperty({ type: Boolean, description: '보유 여부. false 면 잠긴 칸으로 표시한다.' })
  earned!: boolean;

  @ApiProperty({ type: String, nullable: true, description: '획득 시각 (KST ISO)' })
  earnedAt!: string | null;

  @ApiProperty({
    type: [BadgeProgressDto],
    description: '미보유 뱃지의 달성 진행도. 조건이 여러 개면 전부 만족해야 획득한다.',
  })
  progress!: BadgeProgressDto[];
}

export class BadgeCollectionDto {
  @ApiProperty({ type: Number, description: '보유 뱃지 수' })
  earnedCount!: number;

  @ApiProperty({ type: Number, description: '전체 뱃지 수' })
  totalCount!: number;

  @ApiProperty({
    type: [BadgeDto],
    description: '**미보유 항목도 전부 포함한다** — 수집형이므로 잠긴 칸을 보여줘야 한다.',
  })
  badges!: BadgeDto[];
}

export class CouponDestinationDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, example: '강진' })
  name!: string;
}

export class IssuedCouponDto {
  @ApiProperty({ type: String, description: '사용자에게 노출되는 고유 코드' })
  issueCode!: string;

  @ApiProperty({ type: String, example: '숙박 20% 할인' })
  title!: string;

  @ApiProperty({ type: String, example: '강진 다산독채펜션' })
  partnerName!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ type: String, enum: DISCOUNT_TYPES, description: 'RATE 면 퍼센트, AMOUNT 면 원' })
  discountType!: string;

  @ApiProperty({ type: Number, description: 'RATE 면 20 (=20%), AMOUNT 면 5000 (=5,000원)' })
  discountValue!: number;

  @ApiProperty({ type: Number, description: '최소 결제 금액 (원)' })
  minSpendAmount!: number;

  @ApiProperty({ type: Number, nullable: true, description: '최대 할인 한도 (원)' })
  maxDiscountAmount!: number | null;

  @ApiProperty({ type: String, enum: ISSUED_COUPON_STATUSES })
  status!: string;

  @ApiProperty({ type: String, description: '유효 시작 (KST ISO)' })
  validFrom!: string;

  @ApiProperty({ type: String, description: '유효 종료 (KST ISO)' })
  validUntil!: string;

  @ApiProperty({ type: Number, description: '남은 일수. 만료됐으면 0.' })
  daysLeft!: number;

  @ApiProperty({ type: CouponDestinationDto, nullable: true, description: '연계 여행지' })
  destination!: CouponDestinationDto | null;
}

export class ListCouponsQueryDto {
  @ApiPropertyOptional({ enum: ISSUED_COUPON_STATUSES, description: '상태 필터' })
  @IsOptional()
  @IsIn(ISSUED_COUPON_STATUSES)
  status?: string;
}
