import { Injectable } from '@nestjs/common';

import { ClockService } from '../common/clock/clock.service';
import { TIME_BAND_RANGES, type TimeBand } from '../common/constants/persona';
import { CATEGORY_LABELS, type TxCategory } from '../common/constants/tx-category';
import { AppException } from '../common/errors/app.exception';
import { toKstIsoOrNull } from '../common/utils/date-kst';
import { roundRatio } from '../common/utils/ratio';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisSummaryDto, TopCategoryDto } from './dto/analysis.dto';
import {
  buildSummary,
  findTopCategory,
  summarizeRecurring,
  type AnalysisSummary,
  type SummaryTransaction,
} from './summary-calculator';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /**
   * 집계 원본을 만든다.
   * 다른 도메인(persona / saving-goals / challenges)도 이 결과를 재사용한다.
   */
  async computeSummary(userId: string, months = 6): Promise<AnalysisSummary> {
    const rows = await this.prisma.transaction.findMany({
      where: { userId },
      select: {
        approvedAt: true,
        amount: true,
        category: true,
        txType: true,
        isRecurring: true,
        merchantName: true,
        normalizedMerchant: true,
      },
      orderBy: { approvedAt: 'asc' },
    });

    return buildSummary(rows as SummaryTransaction[], this.clock.now(), months);
  }

  /** 거래가 없으면 분석 화면을 열 수 없다 — 명확한 코드로 막는다 */
  private assertHasData(summary: AnalysisSummary): void {
    if (summary.monthsCovered === 0) {
      throw new AppException('NO_TRANSACTION_DATA');
    }
  }

  async getSummary(userId: string): Promise<AnalysisSummaryDto> {
    const summary = await this.computeSummary(userId);
    this.assertHasData(summary);

    const recurringRows = await this.prisma.transaction.findMany({
      where: { userId, isRecurring: true },
      select: {
        approvedAt: true,
        amount: true,
        category: true,
        txType: true,
        isRecurring: true,
        merchantName: true,
        normalizedMerchant: true,
      },
      orderBy: { approvedAt: 'asc' },
    });

    return {
      monthsCovered: summary.monthsCovered,
      periodFrom: toKstIsoOrNull(summary.periodFrom),
      periodTo: toKstIsoOrNull(summary.periodTo),
      totalAmount: summary.totalAmount,
      monthlyAvgTotalAmount: summary.monthlyAvgTotalAmount,
      totalTxCount: summary.totalTxCount,
      byCategory: summary.byCategory.map((c) => ({
        category: c.category,
        label: CATEGORY_LABELS[c.category],
        monthlyAvgAmount: c.monthlyAvgAmount,
        totalAmount: c.totalAmount,
        shareRate: roundRatio(c.shareRate),
        txCount: c.txCount,
      })),
      monthlyTrend: summary.monthlyTrend,
      hourlyDistribution: summary.hourlyDistribution,
      timeBandDistribution: summary.timeBandDistribution.map((b) => ({
        timeBand: b.timeBand,
        label: TIME_BAND_RANGES[b.timeBand as TimeBand].label,
        window: describeWindow(b.timeBand as TimeBand),
        txCount: b.txCount,
        totalAmount: b.totalAmount,
      })),
      recurringPayments: summarizeRecurring(recurringRows as SummaryTransaction[]).map((r) => ({
        merchantName: r.merchantName,
        monthlyAmount: r.monthlyAmount,
        occurrences: r.occurrences,
      })),
    };
  }

  async getTopCategory(userId: string): Promise<TopCategoryDto> {
    const summary = await this.computeSummary(userId);
    this.assertHasData(summary);

    const top = findTopCategory(summary);
    return {
      category: top.category,
      label: top.category ? CATEGORY_LABELS[top.category as TxCategory] : null,
      monthlyAvgAmount: top.monthlyAvgAmount,
      shareRate: roundRatio(top.shareRate),
      runnerUpCategory: top.runnerUpCategory,
      runnerUpAmount: top.runnerUpAmount,
      isTie: top.isTie,
    };
  }
}

function describeWindow(band: TimeBand): string {
  const { fromHour, toHour } = TIME_BAND_RANGES[band];
  const fmt = (h: number) => (h < 12 ? `오전 ${h === 0 ? 12 : h}시` : `오후 ${h === 12 ? 12 : h - 12}시`);
  return `${fmt(fromHour)}~${fmt(toHour)}`;
}
