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
    description:
      '이 사람을 규정하는 소비 카테고리 (12종). 기본은 월평균 지출 1위이고, ' +
      'AI 가 1·2위가 근소하다고 판단하면 다른 쪽을 고를 수 있습니다 (`ai.divergedFromRule`).',
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
    description:
      'AI 가 규칙과 **다른** 카테고리를 골랐을 때, 규칙이 1위로 뽑았던 카테고리. ' +
      '같으면 null. "규칙은 외식이라 했지만 AI 는 배달로 봤다"를 화면에 보여주고 싶을 때 씁니다.',
  })
  actualTopCategory!: string | null;
}

/**
 * 페르소나를 누가 어떻게 골랐는지.
 *
 * **`generatedBy` 가 `RULE` 이어도 정상 응답입니다.** 페르소나는 항상 나오고,
 * 달라지는 것은 `reason` / `headline` 개인화 문구가 있느냐뿐입니다.
 * 프론트는 분기하지 말고 `reason` 이 null 이면 그 영역만 숨기면 됩니다.
 */
export class PersonaAiDto {
  @ApiProperty({
    type: String,
    enum: ['CLAUDE', 'RULE'],
    description:
      '두 축을 누가 골랐는가. `CLAUDE` 면 모델이 비중 분포를 보고 판단했고, ' +
      '`RULE` 이면 각 축의 1위를 그대로 집은 것입니다.',
  })
  generatedBy!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      '모델이 쓴 축 선정 근거 (한국어 두세 문장, 숫자 포함). 화면의 "왜 이 페르소나인가"에 ' +
      '그대로 띄우면 됩니다. `RULE` 이면 null.',
    example: '배달음식이 18.9%로 가장 높고, 저녁 시간대 결제가 전체의 41%입니다.',
  })
  reason!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      '모델이 쓴 개인화 한 줄 (40자 이내). 카탈로그 `tagline` 은 페르소나 48종 공통 문구이고, ' +
      '이건 **이 사용자 전용**입니다. 있으면 tagline 대신 띄우는 걸 권합니다. `RULE` 이면 null.',
    example: '퇴근길에 하루를 보상하는 소비',
  })
  headline!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'AI 를 못 쓴 이유. `DISABLED`(키 없음/스위치 off) · `NO_SPENDING`(지출 0) · `TIMEOUT` · ' +
      '`RATE_LIMITED` · `OVERLOADED` · `BAD_CATEGORY` 등. 성공했으면 null.',
  })
  fallbackReason!: string | null;

  @ApiProperty({
    type: Boolean,
    description:
      'AI 가 규칙과 다른 축을 골랐는가. 1위와 2위가 근소할 때 주로 true 가 됩니다.',
  })
  divergedFromRule!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '규칙 기반으로만 계산했다면 나왔을 페르소나 코드. 비교용 스냅샷.',
    example: 'EVENING_DINING_OUT',
  })
  ruleBaselineCode!: string | null;
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

  @ApiProperty({ type: PersonaAiDto })
  ai!: PersonaAiDto;

  @ApiProperty({ type: PersonaEvidenceDto })
  evidence!: PersonaEvidenceDto;

  @ApiProperty({ type: String, description: '산출 시각 (KST ISO)' })
  evaluatedAt!: string;
}
