/**
 * 페르소나 맞춤 AI 여행코스 (§추가요청 1).
 *
 * ── 전체 흐름 ────────────────────────────────────────────────────────────────
 *   1. 현재 페르소나 조회      ← 규칙 기반. 카드내역의 카테고리 비중 최다 × 시간대 비중 최다
 *   2. 절약액(예산) 확정        ← 규칙 기반. 챌린지 → 절약목표 → 0 순서
 *   3. 시드 경유지 후보 수집    ← DB
 *   4. Claude 호출              ← 여기만 AI. 장소 선택·순서·문구만 맡긴다
 *   5. 검증 + 일정 계산         ← 규칙 기반. 금액·시간·좌표는 전부 시드 값
 *   6. 캐시에 저장
 *
 * 4번이 어떤 이유로든 실패하면 5번으로 그냥 넘어간다. 입력이 시드 루트로 바뀔 뿐
 * 이후 경로는 동일하다. 그래서 **AI 가 죽어도 이 API 는 200 을 돌려준다.**
 * 발표 당일 네트워크가 끊겨도 여행코스 화면은 비지 않는다.
 */
import { Injectable, Logger } from '@nestjs/common';

import { ClaudeService } from '../../ai/claude.service';
import { ClockService } from '../../common/clock/clock.service';
import { AppConfigService } from '../../config/app-config.service';
import type { TimeBand } from '../../common/constants/persona';
import {
  PERSONA_CATEGORY_LABELS,
  isPersonaCategory,
  type PersonaCategory,
} from '../../common/constants/persona-category';
import { TIME_BAND_RANGES } from '../../common/constants/persona';
import { AppException } from '../../common/errors/app.exception';
import { toKstIso } from '../../common/utils/date-kst';
import { fromBp, roundRatio } from '../../common/utils/ratio';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonaService } from '../../persona/persona.service';
import { AiTravelCourseDto } from '../dto/ai-course.dto';
import { TravelService } from '../travel.service';
import {
  DEFAULT_START_TIME,
  buildFallbackCourse,
  buildSchedule,
  computeSettlement,
  discountOf,
  pickFallbackRoute,
  validateAiCourse,
  type FallbackRouteCandidate,
  type SeedRouteStop,
  type ValidatedCourse,
} from './course-builder';
import {
  AI_COURSE_JSON_SCHEMA,
  buildSystemPrompt,
  buildUserPrompt,
  type AiCourseDraft,
  type CandidateStop,
} from './course-prompt';

/**
 * thinking 토큰도 여기 포함된다 (claude-opus-5 는 thinking 이 기본 on).
 * 최종 JSON 은 1.5K 토큰 안팎이라 넉넉히 잡아 잘림을 막는다.
 */
const MAX_TOKENS = 8_000;

/** 예산이 잡히지 않은 사용자(챌린지·절약목표 둘 다 없음)에게 보여줄 기준액 */
const DEFAULT_BUDGET_AMOUNT = 150_000;

@Injectable()
export class AiCourseService {
  private readonly logger = new Logger(AiCourseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeService,
    private readonly clock: ClockService,
    private readonly persona: PersonaService,
    private readonly travel: TravelService,
    private readonly config: AppConfigService,
  ) {}

  async generate(
    userId: string,
    destinationId: string,
    refresh: boolean,
  ): Promise<AiTravelCourseDto> {
    // --- 1. 페르소나 (규칙 기반) ---------------------------------------------
    // getCurrent 는 산출 이력이 없으면 NO_PERSONA 를 던진다. 그대로 통과시킨다 —
    // "카드내역 분석 → 페르소나 → 여행코스" 순서를 프론트가 지키게 하는 안전장치다.
    const persona = await this.persona.getCurrent(userId);
    const category = persona.axes.category;
    const timeBand = persona.axes.timeBand as TimeBand;

    // --- 2. 여행지 + 시드 경유지 ---------------------------------------------
    const destination = await this.prisma.travelDestination.findUnique({
      where: { id: destinationId },
      include: {
        routes: {
          orderBy: { sortOrder: 'asc' },
          include: { stops: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!destination) throw new AppException('NOT_FOUND', '여행지를 찾을 수 없습니다.');

    // --- 3. 예산 (규칙 기반) --------------------------------------------------
    const basis = await this.travel.resolveBasis(userId);
    const budgetAmount =
      basis.basisSavedAmount > 0 ? basis.basisSavedAmount : DEFAULT_BUDGET_AMOUNT;

    // --- 4. 캐시 --------------------------------------------------------------
    const cacheKey = {
      userId_destinationId_personaCode: { userId, destinationId, personaCode: persona.code },
    };

    if (!refresh) {
      const cached = await this.prisma.aiTravelCourse.findUnique({
        where: cacheKey,
        include: { stops: { orderBy: { sortOrder: 'asc' } }, destination: true },
      });

      // **폴백 결과는 캐시로 인정하지 않는다.**
      // Anthropic 쪽 529 한 번에 시드 루트가 영구히 박제되면, 그 사용자는 그 여행지에서
      // 두 번 다시 AI 코스를 못 본다. 폴백은 "이번엔 실패했으니 일단 이거라도" 이지
      // "이 조합의 정답" 이 아니다. 다음 호출에서 조용히 다시 시도한다.
      // (키가 없어 DISABLED 인 경우 재시도는 즉시 반환이라 비용이 없다)
      if (cached && cached.generatedBy === 'CLAUDE') {
        this.logger.log(`AI 코스 캐시 적중: ${destination.name} / ${persona.code}`);
        return this.toDto(cached, true);
      }
      if (cached) {
        this.logger.log(
          `이전 폴백(${cached.fallbackReason})을 무시하고 재시도: ${destination.name}`,
        );
      }
    }

    // --- 5. 생성 --------------------------------------------------------------
    const seedRoutes: FallbackRouteCandidate[] = destination.routes.map((r) => ({
      id: r.id,
      title: r.title,
      theme: r.theme,
      summary: r.summary,
      sortOrder: r.sortOrder,
      stops: r.stops.map(toSeedStop),
    }));
    const candidates: SeedRouteStop[] = seedRoutes.flatMap((r) => r.stops);

    const generated = await this.buildCourse({
      persona,
      category,
      timeBand,
      destination,
      seedRoutes,
      candidates,
      budgetAmount,
    });

    const schedule = buildSchedule(generated.course.stops, generated.course.startTime);
    const now = this.clock.now();

    // --- 6. 저장 ---------------------------------------------------------------
    // **upsert 를 쓴다 — 삭제 후 재생성이 아니다.**
    // 폴백은 캐시되지 않아 다음 호출에서 다시 생성되는데, 그때마다 새 cuid 를 발급하면
    // 앞서 응답으로 내려준 courseId 가 죽어 `/travel/ai-courses/{id}/map` 이 404 가 된다.
    // 행 ID 는 (사용자·여행지·페르소나) 조합에 고정하고 내용만 갈아끼운다.
    const scalars = {
      budgetAmount,
      title: generated.course.title,
      summary: generated.course.summary,
      personaFitReason: generated.course.personaFitReason,
      budgetNote: generated.course.budgetNote,
      packingTips: generated.course.packingTips.join('\n'),
      totalEstimatedAmount: schedule.totalEstimatedAmount,
      totalDurationMinutes: schedule.totalDurationMinutes,
      generatedBy: generated.generatedBy,
      modelName: generated.modelName,
      fallbackReason: generated.fallbackReason,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      latencyMs: generated.latencyMs,
      createdAt: now,
    };
    const stopRows = schedule.stops.map((s) => ({
      sortOrder: s.sortOrder,
      dayNumber: s.dayNumber,
      placeName: s.placeName,
      stopType: s.stopType,
      arrivalTime: s.arrivalTime,
      stayMinutes: s.stayMinutes,
      estimatedAmount: s.estimatedAmount,
      discountRateBp: s.discountRateBp,
      partnerName: s.partnerName,
      activity: s.activity,
      personaTip: s.personaTip,
      latitude: s.latitude,
      longitude: s.longitude,
    }));

    const saved = await this.prisma.aiTravelCourse.upsert({
      where: cacheKey,
      create: {
        userId,
        destinationId,
        personaCode: persona.code,
        ...scalars,
        stops: { create: stopRows },
      },
      // 경유지는 (courseId, sortOrder) 유니크라 개수가 줄면 옛 행이 남는다. 통째로 갈아끼운다.
      update: { ...scalars, stops: { deleteMany: {}, create: stopRows } },
      include: { stops: { orderBy: { sortOrder: 'asc' } }, destination: true },
    });

    return this.toDto(saved, false);
  }

  /** 이미 생성된 코스만 조회한다. 없으면 404 — 조회 API 가 조용히 과금되면 안 된다. */
  async getCached(userId: string, destinationId: string): Promise<AiTravelCourseDto> {
    const persona = await this.persona.getCurrent(userId);
    const cached = await this.prisma.aiTravelCourse.findUnique({
      where: {
        userId_destinationId_personaCode: { userId, destinationId, personaCode: persona.code },
      },
      include: { stops: { orderBy: { sortOrder: 'asc' } }, destination: true },
    });

    if (!cached) {
      throw new AppException(
        'NOT_FOUND',
        '아직 생성된 AI 코스가 없습니다. POST /travel/destinations/{id}/ai-course 를 먼저 호출해 주세요.',
      );
    }
    return this.toDto(cached, true);
  }

  // -------------------------------------------------------------------------

  /**
   * Claude 를 시도하고, 안 되면 시드 루트로 되돌린다.
   * 어떤 경로로 왔는지는 반환값의 `generatedBy` / `fallbackReason` 에 남는다.
   */
  private async buildCourse(input: {
    persona: Awaited<ReturnType<PersonaService['getCurrent']>>;
    category: string;
    timeBand: TimeBand;
    destination: { name: string; province: string; tagline: string; summary: string; recommendedNights: number };
    seedRoutes: FallbackRouteCandidate[];
    candidates: SeedRouteStop[];
    budgetAmount: number;
  }): Promise<{
    course: ValidatedCourse;
    generatedBy: 'CLAUDE' | 'FALLBACK';
    modelName: string;
    fallbackReason: string | null;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  }> {
    const fallbackStartTime = DEFAULT_START_TIME[input.timeBand];
    const categoryLabel = isPersonaCategory(input.category)
      ? PERSONA_CATEGORY_LABELS[input.category]
      : input.category;

    const fallback = (reason: string) => {
      const route = pickFallbackRoute(
        input.seedRoutes,
        isPersonaCategory(input.category) ? (input.category as PersonaCategory) : 'DELIVERY_FOOD',
      );
      if (!route) {
        // 시드가 깨졌다는 뜻. 여기까지 오면 숨길 게 아니라 드러내야 한다.
        throw new AppException(
          'INTERNAL_ERROR',
          '여행지에 등록된 루트가 없어 코스를 만들 수 없습니다. `npm run db:seed` 로 재시드해 주세요.',
        );
      }
      this.logger.warn(`AI 코스 폴백 (${reason}) → 시드 루트 "${route.title}"`);
      return {
        course: buildFallbackCourse(
          route,
          { displayName: input.persona.displayName, categoryLabel },
          input.budgetAmount,
          input.timeBand,
        ),
        generatedBy: 'FALLBACK' as const,
        modelName: 'seed-route',
        fallbackReason: reason,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
      };
    };

    if (!this.config.aiCourseEnabled) return fallback('DISABLED');

    const promptCandidates: CandidateStop[] = input.seedRoutes.flatMap((r) =>
      r.stops.map((s) => ({
        placeName: s.placeName,
        description: s.description,
        stopType: s.stopType,
        stayMinutes: s.stayMinutes,
        estimatedAmount: s.estimatedAmount,
        routeTitle: r.title,
        routeTheme: r.theme,
        discountRate: s.discountRateBp ? s.discountRateBp / 100 : undefined,
      })),
    );

    const result = await this.claude.generateJson<AiCourseDraft>({
      system: buildSystemPrompt(),
      user: buildUserPrompt({
        persona: {
          code: input.persona.code,
          displayName: input.persona.displayName,
          tagline: input.persona.tagline,
          timeBandLabel: TIME_BAND_RANGES[input.timeBand].label,
          categoryLabel,
          topCategoryAmount: input.persona.evidence.topCategoryAmount,
          monthlyAvgTotalAmount: input.persona.evidence.monthlyAvgTotalAmount,
          spendingRatio: input.persona.evidence.spendingRatio,
        },
        destination: input.destination,
        budgetAmount: input.budgetAmount,
        candidates: promptCandidates,
      }),
      schema: AI_COURSE_JSON_SCHEMA,
      maxTokens: MAX_TOKENS,
    });

    if (!result.ok) return fallback(result.reason);

    const validated = validateAiCourse(result.data, input.candidates, fallbackStartTime);
    if (!validated.ok) {
      this.logger.warn(`AI 코스 검증 실패: ${validated.reason}`);
      return fallback('INVALID_COURSE');
    }

    if (validated.course.droppedPlaceNames.length > 0) {
      // 코스 자체는 성립했지만 모델이 없는 장소를 지어냈다는 신호다. 프롬프트 튜닝 근거로 남긴다.
      this.logger.warn(
        `후보에 없는 장소를 제외했습니다: ${validated.course.droppedPlaceNames.join(', ')}`,
      );
    }

    return {
      course: validated.course,
      generatedBy: 'CLAUDE',
      modelName: result.usage.model,
      fallbackReason: null,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      latencyMs: result.usage.latencyMs,
    };
  }

  private toDto(
    row: {
      id: string;
      destinationId: string;
      personaCode: string;
      budgetAmount: number;
      title: string;
      summary: string;
      personaFitReason: string;
      budgetNote: string;
      packingTips: string;
      totalEstimatedAmount: number;
      totalDurationMinutes: number;
      generatedBy: string;
      modelName: string;
      fallbackReason: string | null;
      latencyMs: number;
      createdAt: Date;
      destination: { name: string; oneWayFareAmount: number; travelMinutesFromGwangju: number };
      stops: {
        sortOrder: number;
        dayNumber: number;
        placeName: string;
        stopType: string;
        arrivalTime: string;
        stayMinutes: number;
        estimatedAmount: number;
        discountRateBp: number | null;
        partnerName: string | null;
        activity: string;
        personaTip: string;
        latitude: number | null;
        longitude: number | null;
      }[];
    },
    cached: boolean,
  ): AiTravelCourseDto {
    // 이동시간은 저장하지 않고 도착 시각의 차이에서 되살린다 —
    // 같은 값을 두 곳에 두면 언젠가 어긋난다. Day 가 바뀌면 시계가 리셋되므로 0 이다.
    const stops = row.stops.map((s, i) => {
      const prev = row.stops[i - 1];
      const sameDay = prev !== undefined && prev.dayNumber === s.dayNumber;
      const travel = !sameDay
        ? 0
        : Math.max(0, toMinutes(s.arrivalTime) - toMinutes(prev.arrivalTime) - prev.stayMinutes);
      const discount = discountOf(s.estimatedAmount, s.discountRateBp);
      return {
        sortOrder: s.sortOrder,
        dayNumber: s.dayNumber,
        placeName: s.placeName,
        stopType: s.stopType,
        arrivalTime: s.arrivalTime,
        stayMinutes: s.stayMinutes,
        estimatedAmount: s.estimatedAmount,
        discountAmount: discount,
        payableAmount: s.estimatedAmount - discount,
        discountRate: s.discountRateBp === null ? null : roundRatio(fromBp(s.discountRateBp)),
        partnerName: s.partnerName,
        travelMinutesFromPrevious: travel,
        activity: s.activity,
        personaTip: s.personaTip,
        latitude: s.latitude,
        longitude: s.longitude,
      };
    });

    // Day 별로 묶는다. 화면 S18 의 [ Day 1 | Day 2 ] 탭이 이걸 그대로 쓴다.
    const days = [1, 2]
      .map((dayNumber) => {
        const dayStops = stops.filter((s) => s.dayNumber === dayNumber);
        if (dayStops.length === 0) return null;
        const last = dayStops[dayStops.length - 1];
        // 숙소는 그 날의 마지막이고 수면 시간은 일정에 포함하지 않는다
        const endMinutes =
          toMinutes(last.arrivalTime) + (last.stopType === 'STAY' ? 0 : last.stayMinutes);
        return {
          dayNumber,
          startTime: dayStops[0].arrivalTime,
          endTime: formatMinutes(endMinutes),
          durationMinutes: endMinutes - toMinutes(dayStops[0].arrivalTime),
          subtotalAmount: dayStops.reduce((sum, x) => sum + x.payableAmount, 0),
          stops: dayStops,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    const stopsGrossAmount = stops.reduce((sum, x) => sum + x.estimatedAmount, 0);
    const discountAmount = stops.reduce((sum, x) => sum + x.discountAmount, 0);
    const settlement = computeSettlement({
      savedAmount: row.budgetAmount,
      stopsGrossAmount,
      discountAmount,
      oneWayFareAmount: row.destination.oneWayFareAmount,
    });

    return {
      id: row.id,
      destinationId: row.destinationId,
      destinationName: row.destination.name,
      title: row.title,
      summary: row.summary,
      personaFitReason: row.personaFitReason,
      budgetNote: row.budgetNote,
      packingTips: row.packingTips.length > 0 ? row.packingTips.split('\n') : [],
      nights: 1,
      days,
      startTime: days[0]?.startTime ?? '00:00',
      endTime: days[days.length - 1]?.endTime ?? '00:00',
      totalEstimatedAmount: row.totalEstimatedAmount,
      totalDurationMinutes: row.totalDurationMinutes,
      budgetAmount: row.budgetAmount,
      remainingBudgetAmount: settlement.remainingAmount,
      settlement,
      stops,
      meta: {
        generatedBy: row.generatedBy,
        model: row.modelName,
        fallbackReason: row.fallbackReason,
        cached,
        latencyMs: row.latencyMs,
        personaCode: row.personaCode,
        generatedAt: toKstIso(row.createdAt),
      },
    };
  }
}

function toSeedStop(s: {
  placeName: string;
  description: string;
  stopType: string;
  stayMinutes: number;
  estimatedAmount: number;
  latitude: number | null;
  longitude: number | null;
  dayNumber: number;
  discountRateBp: number | null;
  partnerName: string | null;
}): SeedRouteStop {
  return {
    placeName: s.placeName,
    description: s.description,
    stopType: s.stopType,
    stayMinutes: s.stayMinutes,
    estimatedAmount: s.estimatedAmount,
    latitude: s.latitude,
    longitude: s.longitude,
    dayNumber: s.dayNumber === 2 ? 2 : 1,
    discountRateBp: s.discountRateBp,
    partnerName: s.partnerName,
  };
}

const toMinutes = (time: string): number => {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
};

const formatMinutes = (minutes: number): string => {
  const w = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
};
