import { Injectable } from '@nestjs/common';

import { ChallengesService } from '../challenges/challenges.service';
import { AppException } from '../common/errors/app.exception';
import type { WithMeta } from '../common/interceptors/transform.interceptor';
import { toKstIso } from '../common/utils/date-kst';
import { fromBp, roundRatio } from '../common/utils/ratio';
import { PrismaService } from '../prisma/prisma.service';
import { applyBlur } from './blur-policy';
import {
  LockedDestinationDto,
  TravelDestinationDto,
  TravelPrescriptionDto,
  TravelReviewDto,
} from './dto/travel.dto';

/** 여행지 조회 시 함께 가져오는 관계 */
const DESTINATION_INCLUDE = {
  routes: { include: { stops: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
  photos: { orderBy: { revealOrder: 'asc' } },
  reviews: { select: { rating: true } },
} as const;

/** 처방의 기준이 되는 금액과 진척률 */
export interface PrescriptionBasis {
  source: 'CHALLENGE' | 'SAVING_GOAL' | 'NONE';
  basisSavedAmount: number;
  currentSavedAmount: number;
  progressRate: number;
}

@Injectable()
export class TravelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengesService,
  ) {}

  /**
   * 여행 처방 (§6-5).
   *
   * 후보 선정은 **예상 절약액** 기준이고, 사진 블러 해제는 **현재 진척률** 기준이다.
   * 둘을 분리해야 "이만큼 아끼면 여기 갈 수 있다 + 지금 이만큼 열렸다" 를 동시에 보여줄 수 있다.
   */
  async getPrescriptions(userId: string): Promise<TravelPrescriptionDto> {
    const basis = await this.resolveBasis(userId);

    const all = await this.prisma.travelDestination.findMany({
      include: DESTINATION_INCLUDE,
      orderBy: [{ targetSavingAmount: 'asc' }, { sortOrder: 'asc' }],
    });

    const affordable = all.filter((d) => d.targetSavingAmount <= basis.basisSavedAmount);
    const locked = all.filter((d) => d.targetSavingAmount > basis.basisSavedAmount);

    return {
      basisSource: basis.source,
      basisSavedAmount: basis.basisSavedAmount,
      currentSavedAmount: basis.currentSavedAmount,
      progressRate: roundRatio(basis.progressRate),
      destinations: affordable.map((d) => this.toDestinationDto(d, basis.progressRate)),
      lockedDestinations: locked.map((d): LockedDestinationDto => ({
        id: d.id,
        code: d.code,
        name: d.name,
        province: d.province,
        tagline: d.tagline,
        heroImageUrl: d.heroImageUrl,
        targetSavingAmount: d.targetSavingAmount,
        shortfallAmount: d.targetSavingAmount - basis.basisSavedAmount,
      })),
    };
  }

  /**
   * 챌린지가 있으면 그 기준으로, 없으면 절약 목표로, 그것도 없으면 0 으로.
   *
   * 목표가 없다고 에러를 내지 않는다 — 여행지 화면은 언제 열어도 뭔가 보여야 하고,
   * `lockedDestinations` 로 "얼마를 더 아끼면 갈 수 있는지" 를 보여주는 편이 동기 부여가 된다.
   *
   * AI 코스 생성과 지도 API 도 같은 기준을 써야 화면 사이에 금액이 어긋나지 않으므로
   * public 이다.
   */
  async resolveBasis(userId: string): Promise<PrescriptionBasis> {
    const challenge = await this.prisma.challenge.findFirst({
      where: { userId, status: { in: ['IN_PROGRESS', 'SUCCEEDED'] } },
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
    });

    if (challenge) {
      // 진행 중이면 실시간 진척을, 완료됐으면 확정값을 쓴다
      if (challenge.status === 'IN_PROGRESS') {
        const current = await this.challenges.getCurrent(userId);
        return {
          source: 'CHALLENGE',
          basisSavedAmount: challenge.targetSavingAmount,
          currentSavedAmount: current.currentSavedAmount,
          progressRate: current.progressRate,
        };
      }
      return {
        source: 'CHALLENGE',
        basisSavedAmount: Math.max(
          challenge.targetSavingAmount,
          challenge.finalSavedAmount ?? 0,
        ),
        currentSavedAmount: challenge.finalSavedAmount ?? 0,
        progressRate: roundRatio(fromBp(challenge.finalProgressBp ?? 0)),
      };
    }

    const goal = await this.prisma.savingGoal.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (goal) {
      return {
        source: 'SAVING_GOAL',
        basisSavedAmount: goal.totalTargetAmount,
        currentSavedAmount: 0,
        progressRate: 0,
      };
    }

    return { source: 'NONE', basisSavedAmount: 0, currentSavedAmount: 0, progressRate: 0 };
  }

  async getDestination(userId: string, id: string): Promise<TravelDestinationDto> {
    const destination = await this.prisma.travelDestination.findUnique({
      where: { id },
      include: DESTINATION_INCLUDE,
    });
    if (!destination) throw new AppException('NOT_FOUND', '여행지를 찾을 수 없습니다.');

    const basis = await this.resolveBasis(userId);
    return this.toDestinationDto(destination, basis.progressRate);
  }

  async listReviews(
    destinationId: string,
    cursor?: string,
    limit = 10,
  ): Promise<WithMeta<TravelReviewDto[]>> {
    const exists = await this.prisma.travelDestination.count({ where: { id: destinationId } });
    if (exists === 0) throw new AppException('NOT_FOUND', '여행지를 찾을 수 없습니다.');

    const rows = await this.prisma.travelReview.findMany({
      where: { destinationId },
      orderBy: [{ helpfulCount: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;

    return {
      data: page.map((r) => ({
        id: r.id,
        authorNickname: r.authorNickname,
        rating: r.rating,
        content: r.content,
        visitedAt: toKstIso(r.visitedAt),
        helpfulCount: r.helpfulCount,
      })),
      meta: { hasNext, nextCursor: hasNext ? page[page.length - 1].id : null },
    };
  }

  private toDestinationDto(
    destination: {
      id: string;
      code: string;
      name: string;
      province: string;
      regionCode: string;
      extinctionRiskIndexBp: number;
      riskGrade: string;
      tagline: string;
      summary: string;
      description: string;
      heroImageUrl: string;
      targetSavingAmount: number;
      recommendedNights: number;
      routes: {
        id: string;
        title: string;
        theme: string;
        summary: string;
        totalEstimatedAmount: number;
        totalDurationMinutes: number;
        stops: {
          sortOrder: number;
          placeName: string;
          description: string;
          stopType: string;
          stayMinutes: number;
          estimatedAmount: number;
        }[];
      }[];
      photos: { id: string; imageUrl: string; caption: string; revealOrder: number }[];
      reviews: { rating: number }[];
    },
    progressRate: number,
  ): TravelDestinationDto {
    const blur = applyBlur(destination.photos, progressRate);
    const ratings = destination.reviews.map((r) => r.rating);

    return {
      id: destination.id,
      code: destination.code,
      name: destination.name,
      province: destination.province,
      regionCode: destination.regionCode,
      extinctionRiskIndex: roundRatio(fromBp(destination.extinctionRiskIndexBp)),
      riskGrade: destination.riskGrade,
      tagline: destination.tagline,
      summary: destination.summary,
      description: destination.description,
      heroImageUrl: destination.heroImageUrl,
      targetSavingAmount: destination.targetSavingAmount,
      recommendedNights: destination.recommendedNights,
      routes: destination.routes.map((r) => ({
        id: r.id,
        title: r.title,
        theme: r.theme,
        summary: r.summary,
        totalEstimatedAmount: r.totalEstimatedAmount,
        totalDurationMinutes: r.totalDurationMinutes,
        stops: r.stops.map((s) => ({
          sortOrder: s.sortOrder,
          placeName: s.placeName,
          description: s.description,
          stopType: s.stopType,
          stayMinutes: s.stayMinutes,
          estimatedAmount: s.estimatedAmount,
        })),
      })),
      photos: blur.photos,
      revealedPhotoCount: blur.revealedCount,
      reviewSummary: {
        avgRating:
          ratings.length === 0
            ? 0
            : Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 10) / 10,
        count: ratings.length,
      },
    };
  }
}
