/**
 * 모든 성공 응답을 { success: true, data, meta } 봉투로 감싼다 (§7).
 *
 * 컨트롤러가 { data, meta } 형태를 반환하면 meta 를 봉투 레벨로 끌어올리고,
 * 그 외에는 반환값 전체를 data 에 넣는다. 커서 페이지네이션 응답을 자연스럽게
 * 쓰기 위한 규약이다.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

import { ResponseMetaDto } from '../dto/envelope.dto';

export interface Envelope<T> {
  success: true;
  data: T;
  meta?: ResponseMetaDto;
}

/** 컨트롤러가 meta 를 함께 내리고 싶을 때 쓰는 반환 타입 */
export interface WithMeta<T> {
  data: T;
  meta: ResponseMetaDto;
}

function hasMetaShape(value: unknown): value is WithMeta<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'data' in value &&
    'meta' in value &&
    Object.keys(value).length === 2
  );
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<unknown>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<Envelope<unknown>> {
    return next.handle().pipe(
      map((payload): Envelope<unknown> => {
        if (hasMetaShape(payload)) {
          return { success: true, data: payload.data, meta: payload.meta };
        }
        return { success: true, data: payload ?? null };
      }),
    );
  }
}
