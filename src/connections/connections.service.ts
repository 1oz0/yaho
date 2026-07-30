import { Inject, Injectable, Logger } from '@nestjs/common';

import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { toKstIso, toKstIsoOrNull } from '../common/utils/date-kst';
import {
  FINANCIAL_PROVIDER,
  type FinancialProviderPort,
} from '../financial/financial-provider.port';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConnectionDto,
  CreateConnectionDto,
  InstitutionDto,
  RevokeConnectionDto,
} from './dto/connections.dto';

/** Connection 조회 시 항상 함께 가져오는 관계 */
const CONNECTION_INCLUDE = { accounts: { orderBy: { id: 'asc' } } } as const;

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    @Inject(FINANCIAL_PROVIDER) private readonly provider: FinancialProviderPort,
  ) {}

  async listInstitutions(userId: string): Promise<InstitutionDto[]> {
    const [institutions, connections] = await Promise.all([
      this.provider.listInstitutions(),
      this.prisma.connection.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { institutionCode: true },
      }),
    ]);

    const connectedCodes = new Set(connections.map((c) => c.institutionCode));

    return institutions.map((i) => ({
      code: i.code,
      name: i.name,
      type: i.type,
      logoKey: i.logoKey,
      brandColor: i.brandColor,
      isConnected: connectedCodes.has(i.code),
    }));
  }

  /**
   * 기관 연동. 인증 → 계좌 목록 조회 → Connection + LinkedAccount 생성까지 한 번에 한다.
   * 복수 기관 동시 연동이 가능하도록 기관당 1건씩 독립적으로 만든다.
   */
  async create(userId: string, dto: CreateConnectionDto): Promise<ConnectionDto> {
    const existing = await this.prisma.connection.findUnique({
      where: { userId_institutionCode: { userId, institutionCode: dto.institutionCode } },
    });
    if (existing && existing.status === 'ACTIVE') {
      throw new AppException(
        'CONNECTION_ALREADY_EXISTS',
        `이미 연동된 기관입니다: ${existing.institutionName}`,
        [{ connectionId: existing.id, institutionCode: existing.institutionCode }],
      );
    }

    // 프로바이더 인증 (실패 시 PROVIDER_AUTH_FAILED)
    const session = await this.provider.authenticate(dto.institutionCode, {
      loginId: dto.loginId,
      password: dto.password,
    });

    const institutions = await this.provider.listInstitutions();
    const institution = institutions.find((i) => i.code === dto.institutionCode);
    if (!institution) throw new AppException('NOT_FOUND', '기관 정보를 찾을 수 없습니다.');

    const accounts = await this.provider.listAccounts(session);
    const now = this.clock.now();

    // 이전에 해제한 기관이면 되살린다 (재연동)
    const connection = await this.prisma.connection.upsert({
      where: { userId_institutionCode: { userId, institutionCode: dto.institutionCode } },
      create: {
        userId,
        institutionCode: institution.code,
        institutionName: institution.name,
        institutionType: institution.type,
        providerSessionKey: session.sessionKey,
        status: 'ACTIVE',
        connectedAt: now,
        accounts: {
          create: accounts.map((a) => ({
            providerAccountId: a.providerAccountId,
            type: a.type,
            accountNumberMasked: a.accountNumberMasked,
            productName: a.productName,
            ownerName: a.ownerName,
            isOwnAccount: a.isOwnAccount,
          })),
        },
      },
      update: {
        providerSessionKey: session.sessionKey,
        status: 'ACTIVE',
        connectedAt: now,
        revokedAt: null,
        accounts: {
          deleteMany: {},
          create: accounts.map((a) => ({
            providerAccountId: a.providerAccountId,
            type: a.type,
            accountNumberMasked: a.accountNumberMasked,
            productName: a.productName,
            ownerName: a.ownerName,
            isOwnAccount: a.isOwnAccount,
          })),
        },
      },
      include: CONNECTION_INCLUDE,
    });

    this.logger.log(`연동 완료: ${institution.name} (계좌 ${accounts.length}개)`);

    return this.toDto(connection, institution.logoKey, institution.brandColor);
  }

  async list(userId: string): Promise<ConnectionDto[]> {
    const [connections, institutions] = await Promise.all([
      this.prisma.connection.findMany({
        where: { userId },
        include: CONNECTION_INCLUDE,
        orderBy: { connectedAt: 'asc' },
      }),
      this.provider.listInstitutions(),
    ]);

    const byCode = new Map(institutions.map((i) => [i.code, i]));

    return connections.map((c) =>
      this.toDto(c, byCode.get(c.institutionCode)?.logoKey ?? '', byCode.get(c.institutionCode)?.brandColor ?? '#999999'),
    );
  }

  /**
   * 연동 해제.
   * 해당 기관에서 수집한 거래도 함께 지운다 — 남겨두면 연동을 끊었는데도
   * 분석 결과에 그 기관 지출이 계속 잡혀 사용자가 혼란스러워진다.
   */
  async revoke(userId: string, connectionId: string): Promise<RevokeConnectionDto> {
    const connection = await this.prisma.connection.findFirst({
      where: { id: connectionId, userId },
      include: { accounts: { select: { id: true } } },
    });
    if (!connection) throw new AppException('NOT_FOUND', '연동 정보를 찾을 수 없습니다.');

    const accountIds = connection.accounts.map((a) => a.id);

    const [removed] = await this.prisma.$transaction([
      this.prisma.transaction.deleteMany({
        where: { userId, linkedAccountId: { in: accountIds } },
      }),
      this.prisma.connection.update({
        where: { id: connectionId },
        data: { status: 'REVOKED', revokedAt: this.clock.now(), lastSyncedAt: null },
      }),
      this.prisma.linkedAccount.deleteMany({ where: { connectionId } }),
    ]);

    this.logger.log(`연동 해제: ${connection.institutionName} (거래 ${removed.count}건 정리)`);

    return { id: connectionId, status: 'REVOKED', removedTransactionCount: removed.count };
  }

  private toDto(
    connection: {
      id: string;
      institutionCode: string;
      institutionName: string;
      institutionType: string;
      status: string;
      connectedAt: Date;
      lastSyncedAt: Date | null;
      accounts: {
        id: string;
        type: string;
        accountNumberMasked: string;
        productName: string;
      }[];
    },
    logoKey: string,
    brandColor: string,
  ): ConnectionDto {
    return {
      id: connection.id,
      institutionCode: connection.institutionCode,
      institutionName: connection.institutionName,
      institutionType: connection.institutionType,
      logoKey,
      brandColor,
      status: connection.status,
      connectedAt: toKstIso(connection.connectedAt),
      lastSyncedAt: toKstIsoOrNull(connection.lastSyncedAt),
      accounts: connection.accounts.map((a) => ({
        id: a.id,
        type: a.type,
        accountNumberMasked: a.accountNumberMasked,
        productName: a.productName,
      })),
    };
  }
}
