import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  SAVING_TARGET_CATEGORIES,
  SAVING_EXCLUSION_REASONS,
} from '../../common/constants/saving-target';

export class SuggestionsQueryDto {
  @ApiPropertyOptional({
    type: Number,
    description:
      '채워야 할 목표액(원). 주면 `autoAllocation` 에 **정확히 이 금액을 맞춘 배분안**이 함께 옵니다. ' +
      '화면 S12 의 [✨ 자동 배분] 버튼이 이 값을 씁니다.\n\n' +
      '3단계부터는 여행지가 목표액을 정하므로, 선택한 여행지의 `targetSavingAmount` 를 그대로 넣으세요.',
    example: 60000,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  targetAmount?: number;
}

export class SavingSuggestionItemDto {
  @ApiProperty({ type: String, enum: SAVING_TARGET_CATEGORIES })
  category!: string;

  @ApiProperty({ type: String, example: '배달음식' })
  label!: string;

  @ApiProperty({ type: Number, description: '월평균 지출 (원)' })
  monthlyAvgAmount!: number;

  @ApiProperty({
    type: Number,
    description: '슬라이더 최대값 = 월평균 지출. 이 값을 넘기면 400 으로 거절된다.',
  })
  maxAmount!: number;

  @ApiProperty({ type: Number, description: '슬라이더 기본값 (월평균의 30%, 1,000원 단위)' })
  defaultAmount!: number;

  @ApiProperty({ type: Number, description: '슬라이더 눈금 단위 (원)', example: 1000 })
  step!: number;

  @ApiProperty({
    type: String,
    example: '끼',
    description: '환산 힌트의 단위. `(배달 약 3.9끼)` 의 "끼".',
  })
  unitLabel!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      '이 카테고리의 **실제 평균 결제액**(원). 기간 총액 ÷ 건수라 사용자마다 다릅니다. ' +
      '거래가 없으면 null — 이때는 환산 힌트를 숨기세요.',
  })
  unitPriceAmount!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      '`defaultAmount` 를 환산한 횟수. `3.9` 면 화면에 `(배달 약 3.9끼)` 로 표시합니다. ' +
      '슬라이더를 움직이면 프론트가 `금액 ÷ unitPriceAmount` 로 다시 계산하세요.',
  })
  defaultUnitCount!: number | null;
}

export class AutoAllocationItemDto {
  @ApiProperty({ type: String, enum: SAVING_TARGET_CATEGORIES })
  category!: string;

  @ApiProperty({ type: Number, description: '배분된 금액 (원)' })
  targetAmount!: number;
}

export class AutoAllocationDto {
  @ApiProperty({ type: Number, description: '요청한 목표액 (원)' })
  targetAmount!: number;

  @ApiProperty({
    type: [AutoAllocationItemDto],
    description: '**합계가 `targetAmount` 와 정확히 일치합니다.** 슬라이더에 그대로 꽂으세요.',
  })
  items!: AutoAllocationItemDto[];

  @ApiProperty({ type: Number, description: '실제로 배분된 합계 (원)' })
  allocatedAmount!: number;

  @ApiProperty({
    type: Number,
    description:
      '못 채운 금액 (원). 0 보다 크면 **지금 소비 규모로는 이 목표가 불가능**하다는 뜻입니다. ' +
      '화면은 이때 다른 여행지를 권해야 합니다.',
  })
  shortfallAmount!: number;
}

export class ExcludedCategoryDto {
  @ApiProperty({ type: String, example: 'HEALTH_FITNESS' })
  category!: string;

  @ApiProperty({ type: String, example: '의료+건강+피트니스' })
  label!: string;

  @ApiProperty({ type: String, description: '왜 절약 대상이 아닌지' })
  reason!: string;
}

export class SavingSuggestionsDto {
  @ApiProperty({ type: Number, description: '평균 계산에 사용한 완결 월 수' })
  monthsCovered!: number;

  @ApiProperty({ type: Number, description: '월평균 총 지출 (원). 12종 전체 기준입니다.' })
  monthlyAvgTotalAmount!: number;

  @ApiProperty({
    type: Number,
    description: '모든 슬라이더 기본값을 합한 금액.',
  })
  defaultTotalAmount!: number;

  @ApiProperty({
    type: Number,
    description:
      '슬라이더 9종의 상한 합계 (원). **이 금액을 넘는 목표는 달성이 불가능**하므로, ' +
      'S10 에서 이보다 큰 목표액의 여행지는 목록에서 빼야 합니다.',
  })
  allocatableTotalAmount!: number;

  @ApiProperty({
    type: [SavingSuggestionItemDto],
    description: '**9종만 옵니다** (월평균 큰 순). 분류·페르소나 축은 12종 그대로입니다.',
  })
  items!: SavingSuggestionItemDto[];

  @ApiProperty({
    type: [ExcludedCategoryDto],
    description:
      '절약 대상에서 뺀 3종과 이유. 화면에 안내를 띄우고 싶을 때 쓰세요. ' +
      '이 항목들도 소비 내역 탭에서는 계속 보이고 페르소나 산출에도 쓰입니다.',
  })
  excludedCategories!: ExcludedCategoryDto[];

  @ApiPropertyOptional({
    type: AutoAllocationDto,
    nullable: true,
    description: '`?targetAmount=` 를 줬을 때만 채워집니다. 안 주면 null.',
  })
  autoAllocation!: AutoAllocationDto | null;
}

export class SavingGoalItemInputDto {
  @ApiProperty({
    enum: SAVING_TARGET_CATEGORIES,
    description:
      '절약할 카테고리. **9종만 허용합니다** — ' +
      `${Object.keys(SAVING_EXCLUSION_REASONS).join(' / ')} 은 절약 대상이 아닙니다.`,
  })
  @IsIn(SAVING_TARGET_CATEGORIES, {
    message: `카테고리는 ${SAVING_TARGET_CATEGORIES.join(', ')} 중 하나여야 합니다. ` +
      '의료·건강 / 교육 / 여행·숙박은 절약 목표로 지정할 수 없습니다.',
  })
  category!: string;

  @ApiProperty({
    type: Number,
    description:
      '**기간 전체** 절약 희망액 (원 단위 정수). ' +
      '해당 카테고리의 기간 환산 평소 지출(월평균 × 주수/4)을 넘을 수 없습니다.',
    example: 80000,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt({ message: '절약 목표액은 원 단위 정수여야 합니다.' })
  @Min(0)
  targetAmount!: number;
}

export class CreateSavingGoalDto {
  @ApiProperty({
    type: String,
    description:
      'S10 에서 고른 여행지 ID. **목표액과 기간이 여기서 나옵니다** (§12-2).\n\n' +
      '`items` 합계가 이 여행지의 `targetSavingAmount` 와 정확히 일치해야 합니다 — ' +
      '화면이 `266,000 / 280,000원` 처럼 합계를 그대로 보여주기 때문입니다.',
  })
  @IsString()
  @IsNotEmpty()
  destinationId!: string;

  @ApiProperty({
    type: [SavingGoalItemInputDto],
    description:
      '카테고리별 절약 희망액. 슬라이더로 다중 지정한 결과를 그대로 보냅니다.\n\n' +
      '금액은 **기간 전체 기준**입니다 (8주 챌린지면 8주 동안 줄일 금액). ' +
      '`GET /saving-goals/suggestions?targetAmount=…` 의 `autoAllocation` 을 그대로 보내면 됩니다.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: '최소 한 개 카테고리는 지정해야 합니다.' })
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => SavingGoalItemInputDto)
  items!: SavingGoalItemInputDto[];
}

export class SavingGoalItemDto {
  @ApiProperty({ type: String })
  category!: string;

  @ApiProperty({ type: String, example: '배달' })
  label!: string;

  @ApiProperty({ type: Number, description: '**기간 전체** 절약 목표액 (원)' })
  targetAmount!: number;

  @ApiProperty({ type: Number, description: '산정 시점 월평균 지출 스냅샷 (원)' })
  monthlyAvgAmount!: number;

  @ApiProperty({ type: Number, description: '월평균 대비 절약 비율 0.0~1.0' })
  reductionRate!: number;
}

export class SavingGoalDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: '이 배분이 향하는 여행지 ID' })
  destinationId!: string;

  @ApiProperty({ type: String, example: '강진' })
  destinationName!: string;

  @ApiProperty({ type: Number, example: 2, description: '챌린지 기간(주). 여행지가 정합니다.' })
  weeks!: number;

  @ApiProperty({
    type: Number,
    description:
      '카테고리별 목표액 합계. **기간 전체 금액**이며 여행지의 targetSavingAmount 와 같습니다.',
  })
  totalTargetAmount!: number;

  @ApiProperty({ type: String, enum: ['ACTIVE', 'ARCHIVED'] })
  status!: string;

  @ApiProperty({ type: String, description: '생성 시각 (KST ISO)' })
  createdAt!: string;

  @ApiProperty({ type: [SavingGoalItemDto] })
  items!: SavingGoalItemDto[];
}
