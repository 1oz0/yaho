/**
 * 응답 봉투를 Swagger 스키마에 반영하는 데코레이터.
 *
 * 왜 필요한가:
 *   TransformInterceptor 가 런타임에 { success, data, meta } 로 감싸지만,
 *   @ApiOkResponse({ type: FooDto }) 만 붙이면 문서에는 봉투 없이 FooDto 만 나온다.
 *   문서와 실제 응답이 어긋나면 프론트가 추측으로 붙게 되고, 그게 이 프로젝트의
 *   평가 기준 ② 를 정면으로 깨뜨린다. 그래서 컨트롤러는 이 데코레이터만 쓴다.
 *
 * 사용법
 *   @ApiEnvelope(AnalysisSummaryDto, { description: '6개월 소비 요약' })
 *   @ApiEnvelope(TransactionDto, { isArray: true, paginated: true })
 *   @ApiEnvelope(null)                                  // data: null
 */
import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { ErrorEnvelopeDto, ResponseMetaDto } from '../dto/envelope.dto';
import { ERROR_MESSAGES, ERROR_STATUS, ErrorCode } from '../errors/error-codes';

export interface ApiEnvelopeOptions {
  isArray?: boolean;
  /** meta 에 nextCursor / hasNext 가 실린다 */
  paginated?: boolean;
  status?: number;
  description?: string;
}

export function ApiEnvelope<TModel extends Type<unknown>>(
  model: TModel | null,
  options: ApiEnvelopeOptions = {},
) {
  const { isArray = false, paginated = false, status = 200, description } = options;

  const dataSchema: SchemaObject | { $ref: string } | { type: 'null' } = model
    ? isArray
      ? { type: 'array', items: { $ref: getSchemaPath(model) } }
      : { $ref: getSchemaPath(model) }
    : { type: 'null' };

  const properties: Record<string, unknown> = {
    success: { type: 'boolean', example: true },
    data: dataSchema,
  };
  if (paginated) {
    properties.meta = { $ref: getSchemaPath(ResponseMetaDto) };
  }

  const extraModels = model ? [model, ResponseMetaDto] : [ResponseMetaDto];

  return applyDecorators(
    ApiExtraModels(...extraModels),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties,
      } as SchemaObject,
    }),
  );
}

/**
 * 이 엔드포인트가 낼 수 있는 에러 코드를 문서에 명시한다.
 * 프론트가 어떤 코드로 분기해야 하는지 추측하지 않아도 된다.
 *
 *   @ApiErrors('SAVING_GOAL_EXCEEDS_AVERAGE', 'NO_TRANSACTION_DATA')
 */
export function ApiErrors(...codes: ErrorCode[]) {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of codes) {
    const status = ERROR_STATUS[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }

  const decorators = [...byStatus.entries()].map(([status, statusCodes]) =>
    ApiResponse({
      status,
      description: statusCodes.map((c) => `\`${c}\` — ${ERROR_MESSAGES[c]}`).join('<br>'),
      type: ErrorEnvelopeDto,
    }),
  );

  return applyDecorators(ApiExtraModels(ErrorEnvelopeDto), ...decorators);
}
