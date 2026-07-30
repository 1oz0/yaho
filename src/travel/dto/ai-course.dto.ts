import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { STOP_TYPES } from '../../common/constants/reward';

export const AI_COURSE_SOURCES = ['CLAUDE', 'FALLBACK'] as const;

export class GenerateAiCourseQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description:
      '`true` 면 캐시를 무시하고 새로 생성합니다. 기본은 캐시 재사용 — 같은 화면을 두 번 열어도 ' +
      '내용이 달라지지 않아야 하고, 불필요한 API 호출을 막기 위해서입니다.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  refresh?: boolean = false;
}

export class AiCourseStopDto {
  @ApiProperty({ type: Number, description: '1부터. Day 를 가로지르는 전체 순번입니다.' })
  sortOrder!: number;

  @ApiProperty({ type: Number, enum: [1, 2], description: '1박 2일의 Day 구분' })
  dayNumber!: number;

  @ApiProperty({ type: String, example: '백련사' })
  placeName!: string;

  @ApiProperty({ type: String, enum: STOP_TYPES })
  stopType!: string;

  @ApiProperty({
    type: String,
    example: '09:00',
    description: 'KST 도착 예정 시각. 서버가 시작 시각 + 체류 + 이동시간을 누적해 계산합니다.',
  })
  arrivalTime!: string;

  @ApiProperty({ type: Number, description: '체류 시간(분). 시드 데이터 값 그대로입니다.' })
  stayMinutes!: number;

  @ApiProperty({ type: Number, description: '**할인 전** 예상 비용(원). 시드 데이터 값 그대로입니다.' })
  estimatedAmount!: number;

  @ApiProperty({ type: Number, description: '야호 제휴 할인액(원). 제휴처가 아니면 0.' })
  discountAmount!: number;

  @ApiProperty({
    type: Number,
    description: '**할인 적용 후 실제 지불 금액(원).** 화면에는 ~~8,200원~~ → 6,970원 처럼 표시하세요.',
  })
  payableAmount!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '할인율 0.0~1.0 (0.15 = 15%). 제휴처가 아니면 null.',
  })
  discountRate!: number | null;

  @ApiProperty({ type: String, nullable: true, description: '제휴처명. 제휴처가 아니면 null.' })
  partnerName!: string | null;

  @ApiProperty({
    type: Number,
    description:
      '직전 경유지에서 여기까지의 이동 추정 시간(분). 첫 경유지는 0. ' +
      '직선거리 × 1.3(우회계수) ÷ 50km/h 로 계산한 **추정치**이며 실제 도로 시간과 다릅니다.',
  })
  travelMinutesFromPrevious!: number;

  @ApiProperty({ type: String, description: '여기서 무엇을 하는지 (AI 생성 문구)' })
  activity!: string;

  @ApiProperty({
    type: String,
    description: '페르소나 맞춤 한 줄 조언. 폴백 코스에서는 빈 문자열일 수 있습니다.',
  })
  personaTip!: string;

  @ApiProperty({ type: Number, nullable: true, description: '위도 (WGS84). 근사 좌표입니다.' })
  latitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: '경도 (WGS84). 근사 좌표입니다.' })
  longitude!: number | null;
}

export class AiCourseDayDto {
  @ApiProperty({ type: Number, enum: [1, 2] })
  dayNumber!: number;

  @ApiProperty({ type: String, example: '09:00', description: '이 날의 시작 시각 (KST)' })
  startTime!: string;

  @ApiProperty({ type: String, example: '18:20', description: '이 날의 종료 시각 (KST)' })
  endTime!: string;

  @ApiProperty({
    type: Number,
    description: '이 날의 활동 시간(분). **숙박 시간은 포함하지 않습니다.**',
  })
  durationMinutes!: number;

  @ApiProperty({ type: Number, description: '이 날 경유지의 할인 후 금액 합 (원)' })
  subtotalAmount!: number;

  @ApiProperty({ type: [AiCourseStopDto], description: '이 날의 경유지, 방문 순서대로' })
  stops!: AiCourseStopDto[];
}

export class SettlementDto {
  @ApiProperty({ type: Number, description: '💰 치료로 아낀 돈 = 여행 예산 (원)' })
  savedAmount!: number;

  @ApiProperty({ type: Number, description: '경유지 비용 합계 — 할인 전 (원)' })
  stopsGrossAmount!: number;

  @ApiProperty({
    type: Number,
    description: '🎟 야호 제휴 할인 (원). 화면에는 **음수로** 표시하세요.',
  })
  discountAmount!: number;

  @ApiProperty({ type: Number, description: '🚌 교통비 — 광주 왕복 (원). 편도 × 2.' })
  transportAmount!: number;

  @ApiProperty({
    type: Number,
    description: '📋 예상 여행 경비 (원) = 경유지(할인 후) + 교통비',
  })
  totalTripAmount!: number;

  @ApiProperty({
    type: Number,
    description: '아낀 돈 − 여행 경비 (원). 음수면 예산을 넘습니다.',
  })
  remainingAmount!: number;

  @ApiProperty({ type: Boolean, description: '아낀 돈 안에서 갈 수 있는가' })
  withinBudget!: boolean;
}

export class AiCourseMetaDto {
  @ApiProperty({
    type: String,
    enum: AI_COURSE_SOURCES,
    description:
      '`CLAUDE` = Claude API 가 생성 / `FALLBACK` = 시드 루트를 재구성. ' +
      '프론트는 이 값으로 "AI 추천" 배지를 붙일지 결정하세요.',
  })
  generatedBy!: string;

  @ApiProperty({
    type: String,
    example: 'claude-opus-5',
    description: '실제 사용한 모델명. 폴백이면 `seed-route`.',
  })
  model!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      '폴백으로 내려간 이유. `DISABLED`(키 없음) / `TIMEOUT` / `RATE_LIMITED` / `OVERLOADED`(529) / ' +
      '`AUTH_FAILED` / `REFUSED` / `MAX_TOKENS` / `BAD_JSON` / `API_ERROR` / `INVALID_COURSE`. ' +
      '성공이면 null.\n\n' +
      '**폴백 결과는 캐시되지 않습니다** — 다음 호출에서 자동으로 다시 시도합니다. ' +
      '일시적인 API 과부하 한 번에 시드 루트가 영구히 고정되지 않도록 한 조치입니다.',
  })
  fallbackReason!: string | null;

  @ApiProperty({ type: Boolean, description: '캐시된 코스를 그대로 돌려줬는가' })
  cached!: boolean;

  @ApiProperty({ type: Number, description: 'Claude 호출에 걸린 시간(ms). 캐시/폴백이면 0.' })
  latencyMs!: number;

  @ApiProperty({ type: String, description: '이 코스를 만든 기준 페르소나 코드' })
  personaCode!: string;

  @ApiProperty({ type: String, description: '생성 시각 (KST ISO)' })
  generatedAt!: string;
}

export class AiTravelCourseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: 'TravelDestination ID' })
  destinationId!: string;

  @ApiProperty({ type: String, example: '강진' })
  destinationName!: string;

  @ApiProperty({ type: String, example: '강진 다산 사색 코스' })
  title!: string;

  @ApiProperty({ type: String })
  summary!: string;

  @ApiProperty({
    type: String,
    description: '이 코스가 왜 이 사용자에게 맞는지. 화면에 그대로 노출하도록 쓰였습니다.',
  })
  personaFitReason!: string;

  @ApiProperty({ type: String, description: '예산에 대한 코멘트' })
  budgetNote!: string;

  @ApiProperty({ type: [String], description: '준비물·실용 팁 (최대 4개)' })
  packingTips!: string[];

  @ApiProperty({ type: Number, example: 1, description: '숙박 수. 현재는 항상 1 (1박 2일).' })
  nights!: number;

  @ApiProperty({
    type: [AiCourseDayDto],
    description: '**화면 S18 의 [ Day 1 | Day 2 ] 탭이 이걸 그대로 씁니다.**',
  })
  days!: AiCourseDayDto[];

  @ApiProperty({ type: String, example: '09:00', description: 'Day 1 시작 시각 (KST)' })
  startTime!: string;

  @ApiProperty({ type: String, example: '14:30', description: 'Day 2 종료 예정 시각 (KST)' })
  endTime!: string;

  @ApiProperty({
    type: Number,
    description: '경유지 예상 비용의 합(원). **서버가 시드 금액을 더한 값**으로 AI 가 쓰지 않습니다.',
  })
  totalEstimatedAmount!: number;

  @ApiProperty({
    type: Number,
    description:
      'Day1 + Day2 의 활동 시간 합(분). 체류 + 이동을 포함하되 **숙박 시간은 뺍니다** — ' +
      '"2일 32시간 코스" 는 안내가 아니라 오류이기 때문입니다.',
  })
  totalDurationMinutes!: number;

  @ApiProperty({ type: Number, description: '이 코스의 기준이 된 절약액(원)' })
  budgetAmount!: number;

  @ApiProperty({
    type: Number,
    description:
      '예산 − **교통비 포함** 여행 경비 (원). `settlement.remainingAmount` 와 같은 값입니다.',
  })
  remainingBudgetAmount!: number;

  @ApiProperty({
    type: SettlementDto,
    description: '화면 S18 하단의 정산 요약 박스. **서버가 계산합니다** (AI 아님).',
  })
  settlement!: SettlementDto;

  @ApiProperty({
    type: [AiCourseStopDto],
    description: 'Day 를 가로지르는 전체 경유지. Day 별로 보려면 `days` 를 쓰세요.',
  })
  stops!: AiCourseStopDto[];

  @ApiProperty({ type: AiCourseMetaDto })
  meta!: AiCourseMetaDto;
}
