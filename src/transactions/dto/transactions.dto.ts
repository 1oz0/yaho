import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { SPENDABLE_CATEGORIES, TX_CATEGORIES } from '../../common/constants/tx-category';

/** 사용자가 직접 지정할 수 있는 카테고리 (FIXED 포함, UNCLASSIFIED/EXCLUDED 제외) */
export const USER_SELECTABLE_CATEGORIES = [...SPENDABLE_CATEGORIES, 'FIXED_BILLS', 'EXCLUDED'] as const;

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

export class SyncTransactionsDto {
  @ApiPropertyOptional({
    description: '수집할 개월 수. 기본 6개월.',
    minimum: 1,
    maximum: 24,
    default: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;
}

export class SyncResultDto {
  @ApiProperty({ type: Number, description: '이번 동기화로 새로 저장된 거래 수' })
  imported!: number;

  @ApiProperty({ type: Number, description: '이미 있어서 건너뛴 거래 수 (재동기화 시)' })
  skipped!: number;

  @ApiProperty({ type: Number, description: '자동 분류에 성공한 거래 수' })
  classified!: number;

  @ApiProperty({
    type: Number,
    description: '사용자 확인이 필요한 미분류 거래 수. 화면 ③ "확신 못한 N건" 의 N.',
  })
  needsReview!: number;

  @ApiProperty({ type: Number, description: '정기결제로 탐지된 가맹점 수' })
  recurringDetected!: number;

  @ApiProperty({ type: Number, description: '집계에서 제외된 거래 수 (수입·계좌간이체·취소)' })
  excluded!: number;

  @ApiProperty({
    type: Number,
    description:
      '`classified` 중 **Claude 가 판정한** 거래 수. 나머지는 사용자 규칙·키워드 사전·MCC·정기결제가 맡았습니다.',
  })
  aiClassified!: number;

  @ApiProperty({
    type: String,
    enum: ['AI', 'RULE'],
    description:
      '이번 분류의 주 경로. `AI` 면 Claude 가 판정에 참여했고, `RULE` 이면 규칙 엔진만 돌았습니다.\n\n' +
      '`RULE` 이어도 **정상 응답**입니다 — 분류 결과의 품질만 달라지고 화면은 똑같이 뜹니다.',
  })
  classificationSource!: string;

  @ApiProperty({ type: Number, description: 'Claude 에게 판정을 요청한 가맹점 수 (거래 수가 아닙니다)' })
  aiMerchantsAsked!: number;

  @ApiProperty({ type: Number, description: 'Claude 가 확신해서 채택된 가맹점 수' })
  aiMerchantsAccepted!: number;

  @ApiProperty({
    type: Number,
    description:
      'Claude 가 "모르겠다"고 해서 규칙 엔진으로 넘긴 가맹점 수. ' +
      '억지 추측 대신 물러선 것이라 **정상 동작**입니다.',
  })
  aiMerchantsDeferred!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'AI 를 못 썼거나 일부 배치가 실패한 이유. `DISABLED`(키 없음/스위치 off) · `TIMEOUT` · ' +
      '`RATE_LIMITED` · `OVERLOADED` · `AUTH_FAILED` · `MAX_TOKENS` · `BAD_JSON` · `API_ERROR`. ' +
      '전부 성공했으면 null.',
  })
  aiFallbackReason!: string | null;

  @ApiProperty({ type: Number, description: 'Claude 호출에 걸린 총 시간 (ms). 안 썼으면 0.' })
  aiLatencyMs!: number;

  @ApiProperty({ type: String, description: '수집 시작일 (KST ISO)' })
  periodFrom!: string;

  @ApiProperty({ type: String, description: '수집 종료일 (KST ISO)' })
  periodTo!: string;

  @ApiProperty({ type: String, description: '동기화 완료 시각 (KST ISO)' })
  syncedAt!: string;
}

// ---------------------------------------------------------------------------
// 목록 조회
// ---------------------------------------------------------------------------

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({ description: '조회 시작일 (ISO 8601)', example: '2026-01-01' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: '조회 종료일 (ISO 8601, 미만)', example: '2026-08-01' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: '카테고리 필터', enum: TX_CATEGORIES })
  @IsOptional()
  @IsIn(TX_CATEGORIES)
  category?: string;

  @ApiPropertyOptional({ description: '정기결제만 보기' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyRecurring?: boolean;

  @ApiPropertyOptional({ description: '커서 (직전 응답의 meta.nextCursor)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: '페이지 크기', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TransactionDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: '승인 일시 (KST ISO)' })
  approvedAt!: string;

  @ApiProperty({ type: String, description: '원본 가맹점명', example: '배민)한식대첩 광주상무점' })
  merchantName!: string;

  @ApiProperty({ type: String, description: '정규화된 가맹점명 (같은 가게 묶기 키)', example: '한식대첩' })
  normalizedMerchant!: string;

  @ApiProperty({ type: Number, description: '원 단위 정수' })
  amount!: number;

  @ApiProperty({ type: String, enum: TX_CATEGORIES })
  category!: string;

  @ApiProperty({
    type: String,
    description: '어느 단계에서 분류됐는지. 화면에 "왜 이 카테고리인지" 표시할 때 쓴다.',
    enum: ['TX_TYPE_GUARD', 'USER_RULE', 'GLOBAL_RULE', 'MCC', 'RECURRING', 'INTERNAL_TRANSFER', 'NONE', 'MANUAL'],
  })
  classifiedBy!: string;

  @ApiProperty({ type: String, enum: ['APPROVAL', 'CANCEL', 'TRANSFER_OUT', 'TRANSFER_IN'] })
  txType!: string;

  @ApiProperty({ type: Boolean, description: '정기결제 여부' })
  isRecurring!: boolean;

  @ApiProperty({ type: Boolean, description: '사용자 확인 대기 중인가' })
  needsReview!: boolean;

  @ApiProperty({ type: Number, description: '할부 개월 (0 = 일시불)' })
  installmentMonths!: number;

  @ApiProperty({ type: String, nullable: true, description: '집계 제외 사유' })
  excludeReason!: string | null;

  @ApiProperty({ type: String, description: '결제 수단', example: '신한카드 Deep Dream 체크' })
  accountName!: string;
}

// ---------------------------------------------------------------------------
// 미분류 확인 (화면 ③ "확신 못한 N건")
// ---------------------------------------------------------------------------

export class PendingReviewSampleDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: 'KST ISO' })
  approvedAt!: string;

  @ApiProperty({ type: Number })
  amount!: number;

  @ApiProperty({ type: String })
  merchantName!: string;
}

export class PendingReviewGroupDto {
  @ApiProperty({ type: String, description: '정규화 가맹점명. 확정 요청 시 이 값을 보낸다.' })
  normalizedMerchant!: string;

  @ApiProperty({ type: String, description: '화면에 보여줄 대표 가맹점명', example: '카카오페이' })
  displayName!: string;

  @ApiProperty({ type: Number, description: '이 가맹점의 미분류 건수' })
  count!: number;

  @ApiProperty({ type: Number, description: '합계 금액 (원)' })
  totalAmount!: number;

  @ApiProperty({ type: [PendingReviewSampleDto], description: '최근 거래 3건 미리보기' })
  samples!: PendingReviewSampleDto[];
}

export class PendingReviewDto {
  @ApiProperty({ type: Number, description: '미분류 거래 총 건수 — "확신 못한 N건" 의 N' })
  totalCount!: number;

  @ApiProperty({
    type: Number,
    description: '질문 개수. 거래를 가맹점 단위로 묶었기 때문에 totalCount 보다 훨씬 작다.',
  })
  groupCount!: number;

  @ApiProperty({ type: [PendingReviewGroupDto] })
  groups!: PendingReviewGroupDto[];
}

// ---------------------------------------------------------------------------
// 카테고리 지정
// ---------------------------------------------------------------------------

export class UpdateCategoryDto {
  @ApiProperty({
    description: '지정할 카테고리',
    enum: USER_SELECTABLE_CATEGORIES,
    example: 'SHOPPING',
  })
  @IsIn(USER_SELECTABLE_CATEGORIES, {
    message: `카테고리는 ${USER_SELECTABLE_CATEGORIES.join(', ')} 중 하나여야 합니다.`,
  })
  category!: string;

  @ApiPropertyOptional({
    description:
      '같은 가맹점의 다른 미분류 건도 함께 정리할지. 기본 true — 이게 "N건이 1번에 정리되는" UX 의 핵심이다.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  applyToSameMerchant?: boolean;

  @ApiPropertyOptional({
    description: '규칙으로 저장해 다음 동기화부터 자동 적용할지. 기본 true.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  saveRule?: boolean;
}

export class UpdateCategoryResultDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  category!: string;

  @ApiProperty({
    type: Number,
    description:
      '이번 선택으로 **함께 정리된** 다른 거래 건수. 화면에 "N건이 함께 정리됐어요" 로 노출한다.',
  })
  alsoUpdatedCount!: number;

  @ApiProperty({ type: Boolean, description: 'UserMerchantRule 로 저장되었는가' })
  ruleSaved!: boolean;

  @ApiProperty({ type: Number, description: '아직 남은 미분류 건수' })
  remainingReviewCount!: number;
}

// ---------------------------------------------------------------------------
// 일괄 확정
// ---------------------------------------------------------------------------

export class BulkReviewItemDto {
  @ApiProperty({ type: String, description: 'pending-review 응답의 normalizedMerchant' })
  @IsString()
  normalizedMerchant!: string;

  @ApiProperty({ enum: USER_SELECTABLE_CATEGORIES })
  @IsIn(USER_SELECTABLE_CATEGORIES)
  category!: string;
}

export class BulkReviewDto {
  @ApiProperty({ type: [BulkReviewItemDto], description: '가맹점 단위로 한 번에 확정' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkReviewItemDto)
  items!: BulkReviewItemDto[];
}

export class BulkReviewItemResultDto {
  @ApiProperty({ type: String })
  normalizedMerchant!: string;

  @ApiProperty({ type: String })
  category!: string;

  @ApiProperty({ type: Number })
  updatedCount!: number;
}

export class BulkReviewResultDto {
  @ApiProperty({ type: Number, description: '총 갱신된 거래 수' })
  updatedCount!: number;

  @ApiProperty({ type: Number, description: '아직 남은 미분류 건수' })
  remainingReviewCount!: number;

  @ApiProperty({ type: [BulkReviewItemResultDto] })
  perItem!: BulkReviewItemResultDto[];
}
