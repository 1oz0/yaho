/**
 * 가상 금융 프로바이더.
 *
 * mock_* 테이블을 "외부 금융기관 서버"처럼 취급해 데이터를 꺼내온다.
 * 실제 API 처럼 보이도록 매 호출에 인위적 지연을 넣는다(MOCK_LATENCY_MIN/MAX_MS).
 * 발표 때 로딩 애니메이션이 자연스러워진다 (§4-2).
 */
import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { AppException } from '../common/errors/app.exception';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  FinancialProviderPort,
  ProviderAccount,
  ProviderCredential,
  ProviderInstitution,
  ProviderSession,
  ProviderTransaction,
} from './financial-provider.port';

/**
 * sessionKey 안에 담기는 내용.
 *
 * 발급 시각은 일부러 담지 않는다. 아무도 읽지 않는 데다, 여기서 시각을 읽으면
 * 가상 시계(ClockService)와 실제 시각 중 무엇을 써야 하는지 애매해진다.
 * 만료가 필요해지면 그때 ClockService 를 주입해 제대로 넣는다.
 */
interface SessionPayload {
  institutionCode: string;
  credentialId: string;
  ownerName: string;
}

@Injectable()
export class MockFinancialProvider implements FinancialProviderPort {
  private readonly logger = new Logger(MockFinancialProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // 세션 인코딩 — stateless. 서버를 재시작해도 기존 세션이 살아있다.
  // ---------------------------------------------------------------------------
  private encodeSession(payload: SessionPayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private decodeSession(sessionKey: string): SessionPayload {
    try {
      const parsed = JSON.parse(
        Buffer.from(sessionKey, 'base64url').toString('utf8'),
      ) as SessionPayload;
      if (!parsed.credentialId || !parsed.institutionCode) throw new Error('필수 필드 누락');
      return parsed;
    } catch {
      throw new AppException(
        'PROVIDER_AUTH_FAILED',
        '금융기관 세션이 유효하지 않습니다. 해당 기관을 다시 연동해 주세요.',
      );
    }
  }

  /**
   * 실제 통신처럼 보이게 하는 지연.
   * Math.random() 은 프로젝트 전역에서 금지이므로 crypto.randomInt 를 쓴다.
   */
  private async delay(): Promise<void> {
    const { min, max } = this.config.mockLatencyRange;
    if (max <= 0) return;
    const ms = min >= max ? min : randomInt(min, max + 1);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---------------------------------------------------------------------------
  // Port 구현
  // ---------------------------------------------------------------------------

  async listInstitutions(): Promise<ProviderInstitution[]> {
    await this.delay();
    const rows = await this.prisma.mockInstitution.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      type: r.type,
      logoKey: r.logoKey,
      brandColor: r.brandColor,
      sortOrder: r.sortOrder,
    }));
  }

  async authenticate(
    institutionCode: string,
    credential: ProviderCredential,
  ): Promise<ProviderSession> {
    await this.delay();

    const institution = await this.prisma.mockInstitution.findUnique({
      where: { code: institutionCode },
    });
    if (!institution) {
      throw new AppException('NOT_FOUND', `기관 '${institutionCode}' 을(를) 찾을 수 없습니다.`);
    }

    const stored = await this.prisma.mockUserCredential.findUnique({
      where: {
        institutionId_loginId: { institutionId: institution.id, loginId: credential.loginId },
      },
    });

    // 아이디가 없을 때도 비밀번호 불일치와 동일한 오류를 낸다 (계정 존재 여부 노출 방지).
    const ok = stored ? await bcrypt.compare(credential.password, stored.passwordHash) : false;
    if (!stored || !ok) {
      this.logger.warn(`기관 인증 실패: ${institutionCode} / ${credential.loginId}`);
      throw new AppException('PROVIDER_AUTH_FAILED');
    }

    return {
      sessionKey: this.encodeSession({
        institutionCode,
        credentialId: stored.id,
        ownerName: stored.ownerName,
      }),
      institutionCode,
      ownerName: stored.ownerName,
    };
  }

  async restoreSession(sessionKey: string): Promise<ProviderSession> {
    const payload = this.decodeSession(sessionKey);
    const stored = await this.prisma.mockUserCredential.findUnique({
      where: { id: payload.credentialId },
    });
    if (!stored) {
      throw new AppException(
        'PROVIDER_AUTH_FAILED',
        '금융기관 세션이 만료되었습니다. 해당 기관을 다시 연동해 주세요.',
      );
    }
    return {
      sessionKey,
      institutionCode: payload.institutionCode,
      ownerName: payload.ownerName,
    };
  }

  async listAccounts(session: ProviderSession): Promise<ProviderAccount[]> {
    await this.delay();
    const payload = this.decodeSession(session.sessionKey);

    const rows = await this.prisma.mockAccount.findMany({
      where: { credentialId: payload.credentialId },
      orderBy: { openedAt: 'asc' },
    });

    return rows.map((r) => ({
      providerAccountId: r.id,
      type: r.type,
      accountNumberMasked: r.accountNumberMasked,
      productName: r.productName,
      ownerName: r.ownerName,
      isOwnAccount: r.isOwnAccount,
    }));
  }

  async fetchTransactions(
    session: ProviderSession,
    providerAccountId: string,
    from: Date,
    to: Date,
  ): Promise<ProviderTransaction[]> {
    await this.delay();
    const payload = this.decodeSession(session.sessionKey);

    // 세션에 딸리지 않은 계좌를 조회하려는 시도는 막는다.
    const account = await this.prisma.mockAccount.findFirst({
      where: { id: providerAccountId, credentialId: payload.credentialId },
    });
    if (!account) {
      throw new AppException('NOT_FOUND', '해당 세션으로 조회할 수 없는 계좌입니다.');
    }

    const rows = await this.prisma.mockTransaction.findMany({
      where: { accountId: providerAccountId, approvedAt: { gte: from, lt: to } },
      orderBy: { approvedAt: 'asc' },
    });

    return rows.map((r) => ({
      providerTxId: r.id,
      providerAccountId: r.accountId,
      approvedAt: r.approvedAt,
      merchantName: r.merchantName,
      amount: r.amount,
      txType: r.txType,
      mcc: r.mcc,
      installmentMonths: r.installmentMonths,
      memo: r.memo,
      approvalNo: r.approvalNo,
      counterpartKey: r.counterpartKey,
    }));
  }
}
