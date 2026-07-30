import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import { AppException } from '../common/errors/app.exception';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginResponseDto, MeResponseDto } from './dto/auth.dto';
import type { AuthenticatedUser, JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async login(email: string, password: string): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // 이메일이 없는 경우에도 동일한 오류를 낸다 (계정 존재 여부 노출 방지).
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) {
      throw new AppException('INVALID_CREDENTIALS');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };

    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.jwtExpiresIn,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        ageBand: user.ageBand,
        regionCode: user.regionCode,
      },
    };
  }

  /**
   * 온보딩 진행 상태를 한 번에 반환한다.
   * 프론트는 이 플래그만 보고 앱 부팅 시 어느 화면으로 갈지 결정할 수 있다.
   */
  async me(user: AuthenticatedUser): Promise<MeResponseDto> {
    const userId = user.id;

    const [connectionCount, transactionCount, pendingReviewCount, persona, savingGoal, challenge] =
      await Promise.all([
        this.prisma.connection.count({ where: { userId, status: 'ACTIVE' } }),
        this.prisma.transaction.count({ where: { userId } }),
        this.prisma.transaction.count({ where: { userId, needsReview: true } }),
        this.prisma.userPersona.findFirst({ where: { userId, isCurrent: true } }),
        this.prisma.savingGoal.findFirst({ where: { userId, status: 'ACTIVE' } }),
        this.prisma.challenge.findFirst({ where: { userId, status: 'IN_PROGRESS' } }),
      ]);

    return {
      ...user,
      hasConnections: connectionCount > 0,
      hasSyncedTransactions: transactionCount > 0,
      pendingReviewCount,
      hasPersona: persona !== null,
      hasSavingGoal: savingGoal !== null,
      hasActiveChallenge: challenge !== null,
    };
  }
}
