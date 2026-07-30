import { Injectable, Logger } from '@nestjs/common';

import { AnalysisService } from '../analysis/analysis.service';
import { ClockService } from '../common/clock/clock.service';
import { BENCHMARK_SCOPE_TOTAL, type TimeBand } from '../common/constants/persona';
import {
  PERSONA_CATEGORY_LABELS,
  type PersonaCategory,
} from '../common/constants/persona-category';
import { AppException } from '../common/errors/app.exception';
import { toKstIso } from '../common/utils/date-kst';
import { fromBp, roundRatio, toBp } from '../common/utils/ratio';
import { PrismaService } from '../prisma/prisma.service';
import { PersonaDto } from './dto/persona.dto';
import { evaluatePersona } from './persona-calculator';

/** 연령대 벤치마크가 없을 때 쓰는 최후 기본값 */
const FALLBACK_BENCHMARK = {
  monthlyAvgAmount: 620_000,
  source: '기본값 (해당 연령대 벤치마크 미등록)',
};

@Injectable()
export class PersonaService {
  private readonly logger = new Logger(PersonaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly analysis: AnalysisService,
  ) {}

  /**
   * 페르소나를 산출하고 저장한다.
   *
   * 계산은 순수 함수(persona-calculator)가 하고, **표시 문구는 Persona 테이블**에서 가져온다.
   * 기획이 문구를 바꿔도 이 코드는 그대로다 (§6-2).
   */
  async evaluate(userId: string, ageBand: string): Promise<PersonaDto> {
    const summary = await this.analysis.computeSummary(userId);
    if (summary.monthsCovered === 0) {
      throw new AppException('NO_TRANSACTION_DATA');
    }

    const benchmark =
      (await this.prisma.spendingBenchmark.findUnique({
        where: { ageBand_scope: { ageBand, scope: BENCHMARK_SCOPE_TOTAL } },
      })) ?? FALLBACK_BENCHMARK;

    const axes = evaluatePersona({
      timeBandCounts: summary.timeBandCounts,
      monthlyAvgByCategory: summary.monthlyAvgByCategory,
      monthlyAvgTotalAmount: summary.monthlyAvgTotalAmount,
      benchmarkAmount: benchmark.monthlyAvgAmount,
    });

    const persona = await this.prisma.persona.findUnique({ where: { code: axes.code } });
    if (!persona) {
      // 카탈로그가 시드되지 않았거나 PERSONA_CATEGORIES 를 바꾸고 재시드하지 않은 경우
      throw new AppException(
        'NOT_FOUND',
        `페르소나 카탈로그에 '${axes.code}' 가 없습니다. \`npm run db:seed\` 로 재시드해 주세요.`,
        [{ code: axes.code }],
      );
    }

    const now = this.clock.now();

    // 이전 산출 이력은 남기되 현재 플래그만 옮긴다 (변화 추이를 보여줄 수 있도록)
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.userPersona.updateMany({ where: { userId, isCurrent: true }, data: { isCurrent: false } });
      return tx.userPersona.create({
        data: {
          userId,
          personaId: persona.id,
          timeBand: axes.timeBand,
          spendingLevel: axes.spendingLevel,
          topCategory: axes.category,
          topCategoryAmount: axes.topCategoryAmount,
          actualMonthlyAvgAmount: summary.monthlyAvgTotalAmount,
          benchmarkAmount: benchmark.monthlyAvgAmount,
          spendingRatioBp: toBp(axes.spendingRatio),
          monthsCovered: summary.monthsCovered,
          topTimeBandTxCount: summary.timeBandCounts[axes.timeBand as TimeBand] ?? 0,
          // 지출이 전혀 없어 카테고리를 특정하지 못한 경우를 그대로 남긴다
          fallbackApplied: axes.hasNoSpending,
          actualTopCategory: null,
          isCurrent: true,
          evaluatedAt: now,
        },
      });
    });

    this.logger.log(`페르소나 산출: ${persona.code} (${persona.displayName})`);

    return this.toDto(persona, saved, {
      benchmarkSource: 'source' in benchmark ? benchmark.source : FALLBACK_BENCHMARK.source,
    });
  }

  /** 현재 페르소나 조회. 아직 산출하지 않았으면 NO_PERSONA. */
  async getCurrent(userId: string): Promise<PersonaDto> {
    const current = await this.prisma.userPersona.findFirst({
      where: { userId, isCurrent: true },
      include: { persona: true },
      orderBy: { evaluatedAt: 'desc' },
    });

    if (!current) {
      throw new AppException(
        'NO_PERSONA',
        '아직 페르소나가 산출되지 않았습니다. POST /persona/evaluate 를 먼저 호출해 주세요.',
      );
    }

    const benchmark = await this.prisma.spendingBenchmark.findFirst({
      where: { monthlyAvgAmount: current.benchmarkAmount, scope: BENCHMARK_SCOPE_TOTAL },
    });

    // 근거 수치는 전부 산출 시점 스냅샷에서 읽는다 — POST 응답과 GET 응답이 항상 일치한다.
    return this.toDto(current.persona, current, {
      benchmarkSource: benchmark?.source ?? FALLBACK_BENCHMARK.source,
    });
  }

  private toDto(
    persona: {
      code: string;
      displayName: string;
      tagline: string;
      description: string;
      iconKey: string;
    },
    userPersona: {
      timeBand: string;
      spendingLevel: string;
      topCategory: string;
      topCategoryAmount: number;
      actualMonthlyAvgAmount: number;
      benchmarkAmount: number;
      spendingRatioBp: number;
      monthsCovered: number;
      topTimeBandTxCount: number;
      fallbackApplied: boolean;
      actualTopCategory: string | null;
      evaluatedAt: Date;
    },
    extra: { benchmarkSource: string },
  ): PersonaDto {
    return {
      code: persona.code,
      displayName: persona.displayName,
      tagline: persona.tagline,
      description: persona.description,
      iconKey: persona.iconKey,
      axes: {
        timeBand: userPersona.timeBand,
        spendingLevel: userPersona.spendingLevel,
        category: userPersona.topCategory,
      },
      evidence: {
        topCategoryAmount: userPersona.topCategoryAmount,
        topCategoryLabel:
          PERSONA_CATEGORY_LABELS[userPersona.topCategory as PersonaCategory] ??
          userPersona.topCategory,
        monthlyAvgTotalAmount: userPersona.actualMonthlyAvgAmount,
        benchmarkAmount: userPersona.benchmarkAmount,
        benchmarkSource: extra.benchmarkSource,
        spendingRatio: roundRatio(fromBp(userPersona.spendingRatioBp)),
        topTimeBandTxCount: userPersona.topTimeBandTxCount,
        monthsCovered: userPersona.monthsCovered,
        fallbackApplied: userPersona.fallbackApplied,
        actualTopCategory: userPersona.actualTopCategory,
      },
      evaluatedAt: toKstIso(userPersona.evaluatedAt),
    };
  }
}
