import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AppException } from '../common/errors/app.exception';
import type { AuthenticatedUser } from './jwt.strategy';

/**
 * JWT 인증 가드.
 *
 * passport 의 기본 401 대신 AppException 을 던져, 응답 봉투의 error.code 가
 * 항상 'UNAUTHORIZED' 로 채워지게 한다. 프론트가 코드로 분기할 수 있어야 하기 때문이다.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (err instanceof AppException) throw err;
    if (err || !user) {
      throw new AppException('UNAUTHORIZED', '로그인이 필요합니다. Authorization 헤더를 확인해 주세요.');
    }
    return user as TUser;
  }
}
