import { Inject, Injectable, Logger } from '@nestjs/common';

import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import type { WithMeta } from '../common/interceptors/transform.interceptor';
import {
  addKstMonths,
  startOfKstDay,
  startOfKstMonth,
  toKstIso,
} from '../common/utils/date-kst';
import {
  FINANCIAL_PROVIDER,
  type FinancialProviderPort,
} from '../financial/financial-provider.port';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from './classification/classification.service';
import type { ClassifiableTransaction } from './classification/rule-engine';
import {
  BulkReviewDto,
  BulkReviewResultDto,
  ListTransactionsQueryDto,
  PendingReviewDto,
  SyncResultDto,
  TransactionDto,
  UpdateCategoryDto,
  UpdateCategoryResultDto,
} from './dto/transactions.dto';

const DEFAULT_SYNC_MONTHS = 6;
const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly classification: ClassificationService,
    @Inject(FINANCIAL_PROVIDER) private readonly provider: FinancialProviderPort,
  ) {}

  // ---------------------------------------------------------------------------
  // 동기화
  // ---------------------------------------------------------------------------

  /**
   * 가상 금융 DB 에서 최근 N개월 거래를 수집하고 분류 파이프라인을 돌린다.
   *
   * 수집 구간은 **직전 N개 완결 월의 1일 00:00 부터 지금까지**다.
   * 완결 월 평균(§6-1)과 진행 중인 부분 월(챌린지 진척용) 양쪽에 필요한 데이터를 한 번에 가져온다.
   */
  async sync(userId: string, months = DEFAULT_SYNC_MONTHS): Promise<SyncResultDto> {
    const now = this.clock.now();
    const from = addKstMonths(startOfKstMonth(now), -months);
    const to = now;

    const connections = await this.prisma.connection.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { accounts: true },
    });

    if (connections.length === 0) {
      throw new AppException(
        'NO_TRANSACTION_DATA',
        '연동된 금융기관이 없습니다. 결제수단을 먼저 연동해 주세요.',
      );
    }

    // --- 1) 프로바이더에서 원본 거래 수집 -------------------------------------
    interface Fetched {
      linkedAccountId: string;
      tx: Awaited<ReturnType<FinancialProviderPort['fetchTransactions']>>[number];
    }
    const fetched: Fetched[] = [];

    for (const connection of connections) {
      const session = await this.provider.restoreSession(connection.providerSessionKey);
      for (const account of connection.accounts) {
        const rows = await this.provider.fetchTransactions(
          session,
          account.providerAccountId,
          from,
          to,
        );
        for (const tx of rows) fetched.push({ linkedAccountId: account.id, tx });
      }
    }

    // --- 2) 이미 저장된 건 제외 -----------------------------------------------
    const existing = await this.prisma.transaction.findMany({
      where: { userId },
      select: { providerTxId: true },
    });
    const existingIds = new Set(existing.map((e) => e.providerTxId));
    const fresh = fetched.filter((f) => !existingIds.has(f.tx.providerTxId));

    // --- 3) 분류 --------------------------------------------------------------
    // 정기결제 탐지와 취소 상계는 "이미 저장된 것 + 새로 온 것" 전체를 봐야 정확하다.
    // 재동기화에서 일부만 새로 들어와도 판정이 흔들리지 않게 전체를 대상으로 컨텍스트를 만든다.
    const storedForContext = await this.prisma.transaction.findMany({
      where: { userId },
      select: {
        providerTxId: true,
        merchantName: true,
        normalizedMerchant: true,
        amount: true,
        txType: true,
        mcc: true,
        approvalNo: true,
        counterpartKey: true,
        approvedAt: true,
      },
    });

    const freshClassifiable: ClassifiableTransaction[] = fresh.map((f) =>
      this.classification.toClassifiable({
        providerTxId: f.tx.providerTxId,
        merchantName: f.tx.merchantName,
        amount: f.tx.amount,
        txType: f.tx.txType,
        mcc: f.tx.mcc,
        approvalNo: f.tx.approvalNo,
        counterpartKey: f.tx.counterpartKey,
        approvedAt: f.tx.approvedAt,
      }),
    );

    const allClassifiable: ClassifiableTransaction[] = [
      ...storedForContext.map((s) => ({
        providerTxId: s.providerTxId,
        merchantName: s.merchantName,
        normalizedMerchant: s.normalizedMerchant,
        matchTarget: s.normalizedMerchant,
        amount: s.amount,
        txType: s.txType,
        mcc: s.mcc,
        approvalNo: s.approvalNo,
        counterpartKey: s.counterpartKey,
        approvedAt: s.approvedAt,
      })),
      ...freshClassifiable,
    ];

    // 본인 명의 계좌 식별자 — 계좌 간 이체 판정용
    const ownAccountKeys = new Set<string>();
    for (const connection of connections) {
      for (const account of connection.accounts) {
        if (!account.isOwnAccount) continue;
        ownAccountKeys.add(account.providerAccountId);
        ownAccountKeys.add(account.accountNumberMasked);
      }
    }

    const ctx = await this.classification.buildContext(userId, allClassifiable, ownAccountKeys);

    // --- 4) 저장 --------------------------------------------------------------
    let classified = 0;
    let needsReview = 0;
    let excluded = 0;

    const rows = fresh.map((f, index) => {
      const classifiable = freshClassifiable[index];
      const result = this.classification.classifyOne(classifiable, ctx);

      if (result.needsReview) needsReview += 1;
      else classified += 1;
      if (result.category === 'EXCLUDED') excluded += 1;

      return {
        userId,
        linkedAccountId: f.linkedAccountId,
        providerTxId: f.tx.providerTxId,
        approvedAt: f.tx.approvedAt,
        merchantName: f.tx.merchantName,
        amount: f.tx.amount,
        txType: f.tx.txType,
        mcc: f.tx.mcc,
        installmentMonths: f.tx.installmentMonths,
        memo: f.tx.memo,
        approvalNo: f.tx.approvalNo,
        counterpartKey: f.tx.counterpartKey,
        normalizedMerchant: classifiable.normalizedMerchant,
        category: result.category,
        classifiedBy: result.classifiedBy,
        matchedRuleId: result.matchedRuleId,
        isRecurring: result.isRecurring,
        needsReview: result.needsReview,
        excludeReason: result.excludeReason,
      };
    });

    if (rows.length > 0) {
      await this.prisma.transaction.createMany({ data: rows });
    }

    await this.prisma.connection.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { lastSyncedAt: now },
    });

    this.logger.log(
      `동기화 완료: 신규 ${rows.length}건 / 자동분류 ${classified}건 / 확인필요 ${needsReview}건`,
    );

    return {
      imported: rows.length,
      skipped: fetched.length - fresh.length,
      classified,
      needsReview,
      recurringDetected: ctx.recurringMerchants.size,
      excluded,
      periodFrom: toKstIso(from),
      periodTo: toKstIso(to),
      syncedAt: toKstIso(now),
    };
  }

  // ---------------------------------------------------------------------------
  // 목록 조회 (커서 페이지네이션)
  // ---------------------------------------------------------------------------

  async list(
    userId: string,
    query: ListTransactionsQueryDto,
  ): Promise<WithMeta<TransactionDto[]>> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        ...(query.category ? { category: query.category } : {}),
        ...(query.onlyRecurring ? { isRecurring: true } : {}),
        ...(query.from || query.to
          ? {
              approvedAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lt: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: { linkedAccount: { select: { productName: true } } },
      orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;

    return {
      data: page.map((r) => ({
        id: r.id,
        approvedAt: toKstIso(r.approvedAt),
        merchantName: r.merchantName,
        normalizedMerchant: r.normalizedMerchant,
        amount: r.amount,
        category: r.category,
        classifiedBy: r.classifiedBy,
        txType: r.txType,
        isRecurring: r.isRecurring,
        needsReview: r.needsReview,
        installmentMonths: r.installmentMonths,
        excludeReason: r.excludeReason,
        accountName: r.linkedAccount.productName,
      })),
      meta: {
        hasNext,
        nextCursor: hasNext ? page[page.length - 1].id : null,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 미분류 확인 — 화면 ③ "확신 못한 N건"
  // ---------------------------------------------------------------------------

  /**
   * 미분류 거래를 **가맹점 단위로 묶어서** 반환한다.
   *
   * 건별로 물어보면 18번 질문해야 하지만, 정규화 가맹점으로 묶으면 6번이면 끝난다.
   * 이 압축이 화면 ③ 의 핵심 UX 다.
   */
  async pendingReview(userId: string): Promise<PendingReviewDto> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId, needsReview: true },
      orderBy: { approvedAt: 'desc' },
    });

    const byMerchant = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byMerchant.get(row.normalizedMerchant);
      if (list) list.push(row);
      else byMerchant.set(row.normalizedMerchant, [row]);
    }

    const groups = [...byMerchant.entries()]
      .map(([normalizedMerchant, items]) => ({
        normalizedMerchant,
        displayName: items[0].merchantName,
        count: items.length,
        totalAmount: items.reduce((s, i) => s + i.amount, 0),
        samples: items.slice(0, 3).map((i) => ({
          id: i.id,
          approvedAt: toKstIso(i.approvedAt),
          amount: i.amount,
          merchantName: i.merchantName,
        })),
      }))
      // 건수가 많은 것부터 물어봐야 한 번의 선택으로 가장 많이 정리된다
      .sort((a, b) => b.count - a.count || b.totalAmount - a.totalAmount);

    return { totalCount: rows.length, groupCount: groups.length, groups };
  }

  /**
   * 카테고리 직접 지정.
   *
   * 한 트랜잭션 안에서 세 가지를 함께 처리한다 (§5-3).
   *   1. 해당 거래 갱신
   *   2. 같은 정규화 가맹점의 다른 미분류 건 일괄 갱신 → alsoUpdatedCount
   *   3. UserMerchantRule 저장 → 다음 동기화부터 자동 적용
   */
  async updateCategory(
    userId: string,
    transactionId: string,
    dto: UpdateCategoryDto,
  ): Promise<UpdateCategoryResultDto> {
    const target = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
    });
    if (!target) throw new AppException('NOT_FOUND', '거래를 찾을 수 없습니다.');

    const applyToSame = dto.applyToSameMerchant ?? true;
    const saveRule = dto.saveRule ?? true;
    const now = this.clock.now();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          category: dto.category,
          classifiedBy: 'MANUAL',
          needsReview: false,
          excludeReason: dto.category === 'EXCLUDED' ? 'INTERNAL_TRANSFER' : null,
          reviewedAt: now,
        },
      });

      let alsoUpdatedCount = 0;
      if (applyToSame && target.normalizedMerchant) {
        const bulk = await tx.transaction.updateMany({
          where: {
            userId,
            normalizedMerchant: target.normalizedMerchant,
            needsReview: true,
            id: { not: transactionId },
          },
          data: {
            category: dto.category,
            classifiedBy: 'MANUAL',
            needsReview: false,
            excludeReason: dto.category === 'EXCLUDED' ? 'INTERNAL_TRANSFER' : null,
            reviewedAt: now,
          },
        });
        alsoUpdatedCount = bulk.count;
      }

      let ruleSaved = false;
      if (saveRule && target.normalizedMerchant) {
        await tx.userMerchantRule.upsert({
          where: {
            userId_normalizedMerchant: { userId, normalizedMerchant: target.normalizedMerchant },
          },
          create: {
            userId,
            normalizedMerchant: target.normalizedMerchant,
            category: dto.category,
            hitCount: alsoUpdatedCount + 1,
          },
          update: { category: dto.category, hitCount: { increment: alsoUpdatedCount + 1 } },
        });
        ruleSaved = true;
      }

      const remaining = await tx.transaction.count({ where: { userId, needsReview: true } });

      return { alsoUpdatedCount, ruleSaved, remaining };
    });

    return {
      id: transactionId,
      category: dto.category,
      alsoUpdatedCount: result.alsoUpdatedCount,
      ruleSaved: result.ruleSaved,
      remainingReviewCount: result.remaining,
    };
  }

  /** 여러 가맹점을 한 번에 확정 — "확신 못한 N건" 화면에서 전체 제출할 때 */
  async bulkReview(userId: string, dto: BulkReviewDto): Promise<BulkReviewResultDto> {
    const now = this.clock.now();

    const result = await this.prisma.$transaction(async (tx) => {
      const perItem = [];
      let updatedCount = 0;

      for (const item of dto.items) {
        const bulk = await tx.transaction.updateMany({
          where: { userId, normalizedMerchant: item.normalizedMerchant, needsReview: true },
          data: {
            category: item.category,
            classifiedBy: 'MANUAL',
            needsReview: false,
            excludeReason: item.category === 'EXCLUDED' ? 'INTERNAL_TRANSFER' : null,
            reviewedAt: now,
          },
        });

        await tx.userMerchantRule.upsert({
          where: {
            userId_normalizedMerchant: { userId, normalizedMerchant: item.normalizedMerchant },
          },
          create: {
            userId,
            normalizedMerchant: item.normalizedMerchant,
            category: item.category,
            hitCount: bulk.count,
          },
          update: { category: item.category, hitCount: { increment: bulk.count } },
        });

        updatedCount += bulk.count;
        perItem.push({
          normalizedMerchant: item.normalizedMerchant,
          category: item.category,
          updatedCount: bulk.count,
        });
      }

      const remaining = await tx.transaction.count({ where: { userId, needsReview: true } });
      return { updatedCount, perItem, remaining };
    });

    return {
      updatedCount: result.updatedCount,
      remainingReviewCount: result.remaining,
      perItem: result.perItem,
    };
  }

  /** demo/simulate-spending 등에서 쓰는 오늘 기준 시각 */
  todayStart(): Date {
    return startOfKstDay(this.clock.now());
  }
}
