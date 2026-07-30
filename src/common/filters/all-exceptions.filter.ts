/**
 * 모든 예외를 { success: false, error: { code, message, details } } 봉투로 변환한다 (§7).
 *
 * 처리 대상
 *   - AppException            → code/details 를 그대로 사용
 *   - ValidationPipe 의 400   → VALIDATION_FAILED + 필드별 details
 *   - 그 외 HttpException     → 상태코드로 코드 추론
 *   - Prisma 알려진 오류      → 409 / 404 로 매핑 (P2002, P2025)
 *   - 나머지                  → 500 INTERNAL_ERROR (원문은 로그로만, 응답에 노출 안 함)
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppException } from '../errors/app.exception';
import { ERROR_CODES, ERROR_MESSAGES, ErrorCode } from '../errors/error-codes';

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details: unknown[] };
}

/** Prisma 오류를 @prisma/client import 없이 판별한다 (런타임 결합 최소화) */
function prismaErrorCode(exception: unknown): string | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const e = exception as { name?: string; code?: unknown };
  const isPrisma = typeof e.name === 'string' && e.name.startsWith('PrismaClient');
  return isPrisma && typeof e.code === 'string' ? e.code : null;
}

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.INVALID_REQUEST;
    case HttpStatus.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} ${body.error.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${status} ${body.error.code}`);
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): { status: number; body: ErrorEnvelope } {
    // 1) 도메인 예외 — 가장 흔한 경로
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details,
          },
        },
      };
    }

    // 2) Prisma 알려진 오류
    const pCode = prismaErrorCode(exception);
    if (pCode === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          success: false,
          error: {
            code: ERROR_CODES.CONNECTION_ALREADY_EXISTS,
            message: '이미 존재하는 데이터입니다.',
            details: [{ prismaCode: pCode }],
          },
        },
      };
    }
    if (pCode === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          success: false,
          error: {
            code: ERROR_CODES.NOT_FOUND,
            message: ERROR_MESSAGES.NOT_FOUND,
            details: [{ prismaCode: pCode }],
          },
        },
      };
    }

    // 3) NestJS HttpException (ValidationPipe 포함)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // ValidationPipe 는 { message: string[], error, statusCode } 를 준다
      if (
        status === HttpStatus.BAD_REQUEST &&
        typeof payload === 'object' &&
        payload !== null &&
        Array.isArray((payload as { message?: unknown }).message)
      ) {
        const messages = (payload as { message: string[] }).message;
        return {
          status,
          body: {
            success: false,
            error: {
              code: ERROR_CODES.VALIDATION_FAILED,
              message: ERROR_MESSAGES.VALIDATION_FAILED,
              details: messages.map((m) => ({ message: m })),
            },
          },
        };
      }

      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: unknown }).message as string | undefined) ??
            exception.message;

      const code = statusToCode(status);
      return {
        status,
        body: { success: false, error: { code, message, details: [] } },
      };
    }

    // 4) 알 수 없는 오류 — 내부 정보를 응답에 노출하지 않는다
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: ERROR_MESSAGES.INTERNAL_ERROR,
          details: [],
        },
      },
    };
  }
}
