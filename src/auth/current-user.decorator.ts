import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { AuthenticatedUser } from './jwt.strategy';

/**
 * 컨트롤러에서 인증된 사용자를 꺼낸다.
 *
 *   @Get('me')
 *   me(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
