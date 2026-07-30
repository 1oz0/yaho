/**
 * 분류 엔진과 DB 사이의 얇은 어댑터.
 *
 * 실제 판단 로직은 전부 순수 함수(normalizer / rule-engine / recurring-detector)에 있다.
 * 이 클래스는 DB 에서 규칙을 읽어와 컨텍스트를 만들고, 결과를 되돌려주는 일만 한다.
 */
import { Injectable } from '@nestjs/common';

import type { TxCategory } from '../../common/constants/tx-category';
import { kstDayOfMonth } from '../../common/utils/date-kst';
import { PrismaService } from '../../prisma/prisma.service';
import {
  detectRecurring,
  toRecurringMerchantSet,
  type RecurringCandidate,
} from './recurring-detector';
import {
  classify,
  findCanceledApprovalNos,
  sortGlobalRules,
  type ClassifiableTransaction,
  type ClassificationContext,
  type ClassificationResult,
} from './rule-engine';
import { normalizeMerchantName } from './normalizer';

@Injectable()
export class ClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 분류 컨텍스트를 만든다.
   * 규칙 테이블은 사용자마다 바뀌지 않으므로 한 번 읽어 여러 거래에 재사용한다.
   */
  async buildContext(
    userId: string,
    transactions: readonly ClassifiableTransaction[],
    ownAccountKeys: Set<string>,
  ): Promise<ClassificationContext> {
    const [userRuleRows, globalRuleRows, mccRows] = await Promise.all([
      this.prisma.userMerchantRule.findMany({ where: { userId } }),
      this.prisma.merchantRule.findMany(),
      this.prisma.mccMapping.findMany(),
    ]);

    const userRules = new Map<string, TxCategory>(
      userRuleRows.map((r) => [r.normalizedMerchant, r.category as TxCategory]),
    );

    const globalRules = sortGlobalRules(
      globalRuleRows.map((r) => ({
        id: r.id,
        pattern: r.pattern,
        category: r.category as TxCategory,
        priority: r.priority,
      })),
    );

    const mccRules = new Map(
      mccRows.map((r) => [r.mcc, { id: r.id, mcc: r.mcc, category: r.category as TxCategory }]),
    );

    // 정기결제 탐지는 전체 거래를 한 번에 훑어야 의미가 있다.
    const candidates: RecurringCandidate[] = transactions
      .filter((t) => t.txType === 'APPROVAL')
      .map((t) => ({
        normalizedMerchant: t.normalizedMerchant,
        amount: t.amount,
        approvedAt: t.approvedAt,
      }));

    const recurringGroups = detectRecurring(candidates, kstDayOfMonth);

    return {
      userRules,
      globalRules,
      mccRules,
      recurringMerchants: toRecurringMerchantSet(recurringGroups),
      canceledApprovalNos: findCanceledApprovalNos(transactions),
      ownAccountKeys,
    };
  }

  /** 정규화 결과를 붙인 분류 대상으로 변환한다 */
  toClassifiable(tx: {
    providerTxId: string;
    merchantName: string;
    amount: number;
    txType: string;
    mcc: string | null;
    approvalNo: string | null;
    counterpartKey: string | null;
    approvedAt: Date;
  }): ClassifiableTransaction {
    const { normalized, matchTarget } = normalizeMerchantName(tx.merchantName);
    return { ...tx, normalizedMerchant: normalized, matchTarget };
  }

  classifyOne(
    tx: ClassifiableTransaction,
    ctx: ClassificationContext,
  ): ClassificationResult {
    return classify(tx, ctx);
  }

  /** 정기결제 목록 — 분석 화면에서 "매달 빠져나가는 돈"을 보여줄 때 쓴다 */
  detectRecurringFor(transactions: readonly ClassifiableTransaction[]) {
    return detectRecurring(
      transactions
        .filter((t) => t.txType === 'APPROVAL')
        .map((t) => ({
          normalizedMerchant: t.normalizedMerchant,
          amount: t.amount,
          approvedAt: t.approvedAt,
        })),
      kstDayOfMonth,
    );
  }
}
