import { ApiProperty } from '@nestjs/swagger';

import { TIME_BANDS } from '../../common/constants/persona';
import { TX_CATEGORIES } from '../../common/constants/tx-category';

export class CategorySummaryDto {
  @ApiProperty({ type: String, enum: TX_CATEGORIES })
  category!: string;

  @ApiProperty({ type: String, description: '화면 표시용 한글 라벨', example: '배달' })
  label!: string;

  @ApiProperty({ type: Number, description: '월평균 지출 (원 단위 정수)' })
  monthlyAvgAmount!: number;

  @ApiProperty({ type: Number, description: '기간 총액 (원 단위 정수)' })
  totalAmount!: number;

  @ApiProperty({ type: Number, description: '전체 지출 대비 비중 0.0~1.0', example: 0.228 })
  shareRate!: number;

  @ApiProperty({ type: Number })
  txCount!: number;
}

export class MonthlyPointDto {
  @ApiProperty({ type: String, example: '2026-06' })
  month!: string;

  @ApiProperty({ type: Number })
  totalAmount!: number;

  @ApiProperty({ type: Number })
  txCount!: number;
}

export class HourPointDto {
  @ApiProperty({ type: Number, description: 'KST 기준 0~23시' })
  hour!: number;

  @ApiProperty({ type: Number })
  txCount!: number;

  @ApiProperty({ type: Number })
  totalAmount!: number;
}

export class TimeBandPointDto {
  @ApiProperty({ type: String, enum: TIME_BANDS })
  timeBand!: string;

  @ApiProperty({ type: String, description: '표시 라벨', example: '저녁형' })
  label!: string;

  @ApiProperty({ type: String, description: '시간 구간', example: '오후 5시~9시' })
  window!: string;

  @ApiProperty({ type: Number })
  txCount!: number;

  @ApiProperty({ type: Number })
  totalAmount!: number;
}

export class RecurringPaymentDto {
  @ApiProperty({ type: String, example: '넷플릭스' })
  merchantName!: string;

  @ApiProperty({ type: Number, description: '월 결제액 (원)' })
  monthlyAmount!: number;

  @ApiProperty({ type: Number, description: '탐지된 반복 횟수' })
  occurrences!: number;
}

export class AnalysisSummaryDto {
  @ApiProperty({
    type: Number,
    description:
      '평균 계산에 사용한 완결 월 수. 이력이 6개월 미만이면 6보다 작다 — 프론트는 이 값을 "최근 N개월 기준" 으로 표시하면 된다.',
    example: 6,
  })
  monthsCovered!: number;

  @ApiProperty({ type: String, nullable: true, description: '집계 시작 (KST ISO)' })
  periodFrom!: string | null;

  @ApiProperty({ type: String, nullable: true, description: '집계 끝, 미만 (KST ISO)' })
  periodTo!: string | null;

  @ApiProperty({ type: Number, description: '기간 총 지출 (원)' })
  totalAmount!: number;

  @ApiProperty({ type: Number, description: '월평균 총 지출 (원)' })
  monthlyAvgTotalAmount!: number;

  @ApiProperty({ type: Number, description: '집계에 포함된 거래 수' })
  totalTxCount!: number;

  @ApiProperty({ type: [CategorySummaryDto], description: '월평균 큰 순 정렬' })
  byCategory!: CategorySummaryDto[];

  @ApiProperty({ type: [MonthlyPointDto], description: '월별 추이. 무지출 월도 0으로 채워 보낸다.' })
  monthlyTrend!: MonthlyPointDto[];

  @ApiProperty({ type: [HourPointDto], description: '시간대 분포. 항상 24칸.' })
  hourlyDistribution!: HourPointDto[];

  @ApiProperty({ type: [TimeBandPointDto], description: '4개 구간 요약' })
  timeBandDistribution!: TimeBandPointDto[];

  @ApiProperty({ type: [RecurringPaymentDto], description: '매달 빠져나가는 정기결제' })
  recurringPayments!: RecurringPaymentDto[];
}

export class TopCategoryDto {
  @ApiProperty({
    type: String,
    nullable: true,
    enum: TX_CATEGORIES,
    description: '최다 지출 카테고리. FIXED·UNCLASSIFIED 는 후보에서 제외된다.',
  })
  category!: string | null;

  @ApiProperty({ type: String, nullable: true, description: '한글 라벨', example: '배달' })
  label!: string | null;

  @ApiProperty({ type: Number })
  monthlyAvgAmount!: number;

  @ApiProperty({ type: Number, description: '전체 지출 대비 비중 0.0~1.0' })
  shareRate!: number;

  @ApiProperty({ type: String, nullable: true, description: '2위 카테고리' })
  runnerUpCategory!: string | null;

  @ApiProperty({ type: Number })
  runnerUpAmount!: number;

  @ApiProperty({ type: Boolean, description: '1위와 2위가 동점인가' })
  isTie!: boolean;
}
