/**
 * 응답 봉투 DTO — Swagger 스키마 표현용.
 *
 * 실제 직렬화는 TransformInterceptor / AllExceptionsFilter 가 하고,
 * 이 클래스들은 "문서에 보이는 스키마 == 실제 응답" 을 보장하기 위해 존재한다.
 *
 * ⚠️ nullable 필드에는 반드시 `type` 을 명시할 것.
 *    `string | null` 같은 유니온은 reflect-metadata 가 Object 로 뭉개고,
 *    @nestjs/swagger 가 그걸 순환참조로 오인해 부팅 시점에 죽는다.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResponseMetaDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '다음 페이지 커서. null 이면 마지막 페이지.',
  })
  nextCursor?: string | null;

  @ApiPropertyOptional({ type: Boolean, description: '다음 페이지 존재 여부' })
  hasNext?: boolean;

  @ApiPropertyOptional({ type: Number, description: '전체 건수 (제공되는 엔드포인트에 한함)' })
  totalCount?: number;
}

export class ErrorBodyDto {
  @ApiProperty({
    type: String,
    description: '프론트가 분기에 사용하는 에러 코드. src/common/errors/error-codes.ts 참조.',
    example: 'SAVING_GOAL_EXCEEDS_AVERAGE',
  })
  code!: string;

  @ApiProperty({
    type: String,
    description: '사용자에게 그대로 보여줄 수 있는 한글 메시지',
    example: '절약 목표액이 해당 카테고리의 월평균 지출을 초과합니다.',
  })
  message!: string;

  @ApiProperty({
    description: '문제가 된 항목의 상세. 어떤 필드/카테고리가 원인인지 담긴다.',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    example: [{ category: 'SHOPPING', targetAmount: 200000, monthlyAvgAmount: 143000 }],
  })
  details!: unknown[];
}

export class ErrorEnvelopeDto {
  @ApiProperty({ type: Boolean, example: false })
  success!: boolean;

  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
