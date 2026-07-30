/**
 * 에러 코드 집중 관리소.
 *
 * 프론트는 HTTP 상태가 아니라 이 코드로 분기한다. 문자열 상수를 여기 한 곳에만 두고,
 * docs/api-contract.md §1-3 표와 항상 일치시킨다.
 */
import { HttpStatus } from '@nestjs/common';

export const ERROR_CODES = {
  // --- 400 ---
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SAVING_GOAL_EXCEEDS_AVERAGE: 'SAVING_GOAL_EXCEEDS_AVERAGE',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  INVALID_REQUEST: 'INVALID_REQUEST',

  // --- 401 ---
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',

  // --- 403 ---
  FORBIDDEN: 'FORBIDDEN',
  DEMO_MODE_DISABLED: 'DEMO_MODE_DISABLED',

  // --- 404 ---
  NOT_FOUND: 'NOT_FOUND',

  // --- 409 ---
  CONNECTION_ALREADY_EXISTS: 'CONNECTION_ALREADY_EXISTS',
  CHALLENGE_ALREADY_ACTIVE: 'CHALLENGE_ALREADY_ACTIVE',
  CHALLENGE_NOT_ACTIVE: 'CHALLENGE_NOT_ACTIVE',
  ALREADY_CHECKED_IN: 'ALREADY_CHECKED_IN',

  // --- 422 ---
  NO_TRANSACTION_DATA: 'NO_TRANSACTION_DATA',
  NO_SAVING_GOAL: 'NO_SAVING_GOAL',
  NO_PERSONA: 'NO_PERSONA',
  NO_ACTIVE_CHALLENGE: 'NO_ACTIVE_CHALLENGE',

  // --- 500 ---
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** 코드별 기본 HTTP 상태. AppException 이 상태를 생략하면 여기서 찾는다. */
export const ERROR_STATUS: Record<ErrorCode, HttpStatus> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  SAVING_GOAL_EXCEEDS_AVERAGE: HttpStatus.BAD_REQUEST,
  INVALID_CATEGORY: HttpStatus.BAD_REQUEST,
  INVALID_REQUEST: HttpStatus.BAD_REQUEST,

  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  PROVIDER_AUTH_FAILED: HttpStatus.UNAUTHORIZED,

  FORBIDDEN: HttpStatus.FORBIDDEN,
  DEMO_MODE_DISABLED: HttpStatus.FORBIDDEN,

  NOT_FOUND: HttpStatus.NOT_FOUND,

  CONNECTION_ALREADY_EXISTS: HttpStatus.CONFLICT,
  CHALLENGE_ALREADY_ACTIVE: HttpStatus.CONFLICT,
  CHALLENGE_NOT_ACTIVE: HttpStatus.CONFLICT,
  ALREADY_CHECKED_IN: HttpStatus.CONFLICT,

  NO_TRANSACTION_DATA: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_SAVING_GOAL: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_PERSONA: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_ACTIVE_CHALLENGE: HttpStatus.UNPROCESSABLE_ENTITY,

  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** 코드별 기본 한글 메시지. 호출부에서 더 구체적인 문구로 덮어쓸 수 있다. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: '요청 값이 올바르지 않습니다.',
  SAVING_GOAL_EXCEEDS_AVERAGE: '절약 목표액이 해당 카테고리의 월평균 지출을 초과합니다.',
  INVALID_CATEGORY: '지정할 수 없는 카테고리입니다.',
  INVALID_REQUEST: '처리할 수 없는 요청입니다.',

  UNAUTHORIZED: '로그인이 필요합니다.',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
  PROVIDER_AUTH_FAILED: '금융기관 인증에 실패했습니다. 아이디와 비밀번호를 확인해 주세요.',

  FORBIDDEN: '접근 권한이 없습니다.',
  DEMO_MODE_DISABLED: '데모 모드가 꺼져 있어 사용할 수 없습니다.',

  NOT_FOUND: '요청한 리소스를 찾을 수 없습니다.',

  CONNECTION_ALREADY_EXISTS: '이미 연동된 기관입니다.',
  CHALLENGE_ALREADY_ACTIVE: '이미 진행 중인 챌린지가 있습니다.',
  CHALLENGE_NOT_ACTIVE: '진행 중인 챌린지가 아닙니다.',
  ALREADY_CHECKED_IN: '해당 주차는 이미 체크인했습니다.',

  NO_TRANSACTION_DATA: '분석할 거래 내역이 없습니다. 결제수단을 연동하고 동기화를 먼저 진행해 주세요.',
  NO_SAVING_GOAL: '설정된 절약 목표가 없습니다.',
  NO_PERSONA: '아직 페르소나가 산출되지 않았습니다.',
  NO_ACTIVE_CHALLENGE: '진행 중인 챌린지가 없습니다.',

  INTERNAL_ERROR: '서버 내부 오류가 발생했습니다.',
};
