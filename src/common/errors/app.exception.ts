/**
 * 도메인 예외.
 *
 * 서비스 코드는 NestJS 의 BadRequestException 등을 직접 던지지 않고 이걸 쓴다.
 * 그래야 응답 봉투의 error.code 가 항상 채워지고, 프론트가 코드로 분기할 수 있다.
 *
 *   throw new AppException('SAVING_GOAL_EXCEEDS_AVERAGE', undefined, [
 *     { category: 'SHOPPING', targetAmount: 200000, monthlyAvgAmount: 143000 },
 *   ]);
 */
import { HttpException } from '@nestjs/common';

import { ERROR_MESSAGES, ERROR_STATUS, ErrorCode } from './error-codes';

export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details: unknown[];

  constructor(code: ErrorCode, message?: string, details: unknown[] = []) {
    super(message ?? ERROR_MESSAGES[code], ERROR_STATUS[code]);
    this.code = code;
    this.details = details;
  }
}

/** 자주 쓰는 단축 생성자 */
export const AppErrors = {
  notFound: (what: string) => new AppException('NOT_FOUND', `${what}을(를) 찾을 수 없습니다.`),
  unauthorized: () => new AppException('UNAUTHORIZED'),
  noTransactionData: () => new AppException('NO_TRANSACTION_DATA'),
  noSavingGoal: () => new AppException('NO_SAVING_GOAL'),
  noActiveChallenge: () => new AppException('NO_ACTIVE_CHALLENGE'),
} as const;
