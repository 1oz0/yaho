import { ApiProperty } from '@nestjs/swagger';

import { SPENDING_LEVELS, TIME_BANDS } from '../../common/constants/persona';
import { PERSONA_CATEGORIES } from '../../common/constants/persona-category';

export class PersonaAxesDto {
  @ApiProperty({
    type: String,
    enum: TIME_BANDS,
    description: '승인 건수가 가장 많은 시간대. 22~05 NIGHT / 05~11 MORNING / 11~17 LUNCH / 17~22 EVENING',
  })
  timeBand!: string;

  @ApiProperty({
    type: String,
    enum: PERSONA_CATEGORIES,
    description: '월평균 지출 최다 카테고리 (12종)',
  })
  category!: string;

  @ApiProperty({
    type: String,
    enum: SPENDING_LEVELS,
    description:
      '또래 대비 소비량. **페르소나 코드에는 포함되지 않는다** — 과소비 진단 근거로만 쓴다.',
  })
  spendingLevel!: string;
}

/**
 * "왜 이 페르소나인지" 를 화면에 그대로 띄우기 위한 근거 수치.
 * 심사에서 설명력을 요구받는 부분이라 응답에 명시적으로 싣는다.
 */
export class PersonaEvidenceDto {
  @ApiProperty({ type: Number, description: '최다 카테고리 월평균 지출 (원)' })
  topCategoryAmount!: number;

  @ApiProperty({ type: String, description: '최다 카테고리 한글 라벨', example: '배달' })
  topCategoryLabel!: string;

  @ApiProperty({ type: Number, description: '월평균 총 지출 (원)' })
  monthlyAvgTotalAmount!: number;

  @ApiProperty({ type: Number, description: '동일 연령대 월평균 지출 기준값 (원)' })
  benchmarkAmount!: number;

  @ApiProperty({ type: String, description: '벤치마크 출처', example: '통계청 가계동향조사(1인 가구) 기반 가공값' })
  benchmarkSource!: string;

  @ApiProperty({ type: Number, description: '실지출 / 벤치마크. 1.0 이 또래 평균.', example: 1.2752 })
  spendingRatio!: number;

  @ApiProperty({ type: Number, description: '해당 시간대 승인 건수' })
  topTimeBandTxCount!: number;

  @ApiProperty({ type: Number, description: '평균 계산에 사용한 완결 월 수' })
  monthsCovered!: number;

  @ApiProperty({
    type: Boolean,
    description:
      '집계 대상 지출이 전혀 없어 카테고리를 특정하지 못했는가. true 면 기본 카테고리로 떨어진 것이다.',
  })
  fallbackApplied!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '예비 필드. 현재는 항상 null.',
  })
  actualTopCategory!: string | null;
}

export class PersonaDto {
  @ApiProperty({ type: String, description: '페르소나 코드 {시간대}_{소비량}_{카테고리}', example: 'EVENING_OVER_FOOD_DELIVERY' })
  code!: string;

  @ApiProperty({ type: String, description: '표시 이름 (DB 에서 조회)', example: '저녁 배달 러버' })
  displayName!: string;

  @ApiProperty({ type: String, description: '한 줄 요약', example: '퇴근길 저녁, 배달앱을 여는 당신' })
  tagline!: string;

  @ApiProperty({ type: String, description: '2~3문장 설명' })
  description!: string;

  @ApiProperty({ type: String, description: '프론트 아이콘 키' })
  iconKey!: string;

  @ApiProperty({ type: PersonaAxesDto })
  axes!: PersonaAxesDto;

  @ApiProperty({ type: PersonaEvidenceDto })
  evidence!: PersonaEvidenceDto;

  @ApiProperty({ type: String, description: '산출 시각 (KST ISO)' })
  evaluatedAt!: string;
}
