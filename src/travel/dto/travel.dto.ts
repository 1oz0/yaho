import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { ROUTE_THEMES, STOP_TYPES } from '../../common/constants/reward';

export class TravelPhotoDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({
    type: String,
    description: '**블러 여부와 무관하게 항상 내려간다.** 블러는 프론트가 처리한다.',
  })
  imageUrl!: string;

  @ApiProperty({ type: String })
  caption!: string;

  @ApiProperty({ type: Number, description: '공개 순서. 낮을수록 먼저 열린다.' })
  revealOrder!: number;

  @ApiProperty({ type: Boolean, description: 'true 면 블러 처리해서 보여준다' })
  blurred!: boolean;
}

export class RouteStopDto {
  @ApiProperty({ type: Number, description: '1부터' })
  sortOrder!: number;

  @ApiProperty({ type: String, example: '백련사' })
  placeName!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ type: String, enum: STOP_TYPES })
  stopType!: string;

  @ApiProperty({ type: Number, description: '체류 시간(분)' })
  stayMinutes!: number;

  @ApiProperty({ type: Number, description: '예상 비용 (원)' })
  estimatedAmount!: number;
}

export class TravelRouteDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, example: '강진 다산 사색 코스' })
  title!: string;

  @ApiProperty({ type: String, enum: ROUTE_THEMES })
  theme!: string;

  @ApiProperty({ type: String })
  summary!: string;

  @ApiProperty({ type: Number, description: '루트 전체 예상 비용 (원)' })
  totalEstimatedAmount!: number;

  @ApiProperty({ type: Number, description: '루트 전체 소요 시간(분)' })
  totalDurationMinutes!: number;

  @ApiProperty({ type: [RouteStopDto], description: '순서대로' })
  stops!: RouteStopDto[];
}

export class ReviewSummaryDto {
  @ApiProperty({ type: Number, description: '평균 별점 (0~5)', example: 4.6 })
  avgRating!: number;

  @ApiProperty({ type: Number })
  count!: number;
}

export class TravelDestinationDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, example: 'GANGJIN' })
  code!: string;

  @ApiProperty({ type: String, example: '강진' })
  name!: string;

  @ApiProperty({ type: String, example: '전라남도' })
  province!: string;

  @ApiProperty({ type: String, description: '행정표준코드', example: '46810' })
  regionCode!: string;

  @ApiProperty({
    type: Number,
    description: '인구소멸위험지수. 0.2 미만이면 소멸고위험. 추후 실제 데이터로 교체 가능.',
    example: 0.158,
  })
  extinctionRiskIndex!: number;

  @ApiProperty({ type: String, example: '소멸고위험' })
  riskGrade!: string;

  @ApiProperty({ type: String, example: '다산이 18년을 머문 남도의 서재' })
  tagline!: string;

  @ApiProperty({ type: String })
  summary!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ type: String })
  heroImageUrl!: string;

  @ApiProperty({ type: Number, description: '이 금액 이상 절약해야 처방 대상이 된다 (원)' })
  targetSavingAmount!: number;

  @ApiProperty({ type: Number, description: '권장 숙박일' })
  recommendedNights!: number;

  @ApiProperty({ type: [TravelRouteDto], description: '여행지마다 정확히 2개' })
  routes!: TravelRouteDto[];

  @ApiProperty({ type: [TravelPhotoDto] })
  photos!: TravelPhotoDto[];

  @ApiProperty({ type: Number, description: '지금 공개된 사진 수' })
  revealedPhotoCount!: number;

  @ApiProperty({ type: ReviewSummaryDto })
  reviewSummary!: ReviewSummaryDto;
}

export class LockedDestinationDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  province!: string;

  @ApiProperty({ type: String })
  tagline!: string;

  @ApiProperty({ type: String })
  heroImageUrl!: string;

  @ApiProperty({ type: Number })
  targetSavingAmount!: number;

  @ApiProperty({
    type: Number,
    description: '앞으로 얼마를 더 아끼면 갈 수 있는지 (원). 동기 부여 문구에 쓴다.',
  })
  shortfallAmount!: number;
}

export class TravelPrescriptionDto {
  @ApiProperty({
    type: String,
    enum: ['CHALLENGE', 'SAVING_GOAL', 'NONE'],
    description:
      '처방 기준이 어디서 왔는지. CHALLENGE = 진행/완료된 챌린지, SAVING_GOAL = 아직 챌린지 전, NONE = 목표도 없음',
  })
  basisSource!: string;

  @ApiProperty({
    type: Number,
    description: '여행지 후보를 고른 기준 금액 (원). 챌린지가 있으면 목표 절약액, 없으면 목표 합계 T.',
  })
  basisSavedAmount!: number;

  @ApiProperty({ type: Number, description: '지금까지 실제로 아낀 금액 (원). 음수 가능.' })
  currentSavedAmount!: number;

  @ApiProperty({
    type: Number,
    description: '진척률 0.0~1.0. **사진 블러 해제 비율과 동일하다.**',
  })
  progressRate!: number;

  @ApiProperty({ type: [TravelDestinationDto], description: '지금 갈 수 있는 여행지' })
  destinations!: TravelDestinationDto[];

  @ApiProperty({
    type: [LockedDestinationDto],
    description: '아직 예산이 모자란 여행지. 얼마가 부족한지 함께 준다.',
  })
  lockedDestinations!: LockedDestinationDto[];
}

export class TravelReviewDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, example: '느린여행자' })
  authorNickname!: string;

  @ApiProperty({ type: Number, description: '1~5' })
  rating!: number;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: String, description: '방문 시점 (KST ISO)' })
  visitedAt!: string;

  @ApiProperty({ type: Number })
  helpfulCount!: number;
}

export class ListReviewsQueryDto {
  @ApiPropertyOptional({ description: '커서' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: '페이지 크기', minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
