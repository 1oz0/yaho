import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AppException } from '../common/errors/app.exception';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  /** userId */
  sub: string;
  email: string;
}

/** req.user 에 실리는 값 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  ageBand: string;
  regionCode: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
    });
  }

  /**
   * 토큰이 유효해도 사용자가 실제로 존재하는지 확인한다.
   * 재시드하면 user 행이 새로 생기므로, 이전 토큰을 들고 오면 여기서 걸러야 한다.
   * (발표 리허설 중 재시드 후 옛 토큰으로 접근하는 상황이 실제로 생긴다)
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AppException(
        'UNAUTHORIZED',
        '세션이 만료되었습니다. 다시 로그인해 주세요. (데이터가 재시드되었을 수 있습니다)',
      );
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      ageBand: user.ageBand,
      regionCode: user.regionCode,
    };
  }
}
