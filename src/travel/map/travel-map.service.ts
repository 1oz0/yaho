/**
 * 지도 기능 (§추가요청 2 — 상태바 "지도" 탭).
 *
 * 지도 SDK 를 서버가 고르지 않는다. 카카오맵이든 네이버맵이든 Leaflet 이든 그대로 먹일 수 있도록
 * **위경도 · 경계 상자 · 중심점 · 구간 거리** 만 내려준다.
 *
 * 좌표가 없는 항목은 조용히 빼지 않고 `missingCoordinateCount` 로 알린다 —
 * 지도에 핀이 하나 비었을 때 "데이터가 없는 건지 버그인지" 를 프론트가 알 수 있어야 한다.
 */
import { Injectable } from '@nestjs/common';

import { AppException } from '../../common/errors/app.exception';
import {
  buildLegs,
  computeBounds,
  computeCenter,
  hasCoords,
  totalDistanceKm,
  type LatLng,
  type LegInput,
} from '../../common/utils/geo';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DestinationMarkerDto,
  MapViewportDto,
  RouteMapDto,
  RouteMapStopDto,
  TravelMapDto,
} from '../dto/map.dto';
import { TravelService } from '../travel.service';

@Injectable()
export class TravelMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly travel: TravelService,
  ) {}

  /**
   * 지도 탭 진입 화면 — 여행지 5곳을 마커로.
   *
   * 잠긴 여행지도 함께 내려준다. "아직 못 가는 곳" 이 지도에서 사라지면
   * 얼마를 더 아껴야 하는지 보여줄 자리가 없어진다.
   */
  async getTravelMap(userId: string): Promise<TravelMapDto> {
    const basis = await this.travel.resolveBasis(userId);

    const destinations = await this.prisma.travelDestination.findMany({
      orderBy: [{ targetSavingAmount: 'asc' }, { sortOrder: 'asc' }],
      include: {
        _count: { select: { routes: true } },
        aiCourses: { where: { userId }, select: { id: true } },
      },
    });

    const withCoords = destinations.filter(hasCoords);
    const missingCoordinateCount = destinations.length - withCoords.length;

    const markers: DestinationMarkerDto[] = withCoords.map((d) => {
      const unlocked = d.targetSavingAmount <= basis.basisSavedAmount;
      return {
        id: d.id,
        code: d.code,
        name: d.name,
        province: d.province,
        tagline: d.tagline,
        latitude: d.latitude,
        longitude: d.longitude,
        riskGrade: d.riskGrade,
        targetSavingAmount: d.targetSavingAmount,
        unlocked,
        shortfallAmount: unlocked ? 0 : d.targetSavingAmount - basis.basisSavedAmount,
        routeCount: d._count.routes,
        hasAiCourse: d.aiCourses.length > 0,
      };
    });

    return {
      viewport: toViewport(markers),
      destinations: markers,
      unlockedCount: markers.filter((m) => m.unlocked).length,
      missingCoordinateCount,
      basisSavedAmount: basis.basisSavedAmount,
      basisSource: basis.source,
    };
  }

  /** 시드 루트 하나의 지도 — 경유지 마커 + 구간 거리 */
  async getRouteMap(routeId: string): Promise<RouteMapDto> {
    const route = await this.prisma.travelRoute.findUnique({
      where: { id: routeId },
      include: {
        destination: { select: { id: true, name: true } },
        stops: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!route) throw new AppException('NOT_FOUND', '여행 루트를 찾을 수 없습니다.');

    return this.assemble({
      id: route.id,
      kind: 'SEED_ROUTE',
      title: route.title,
      destinationId: route.destination.id,
      destinationName: route.destination.name,
      rawStops: route.stops.map((s) => ({
        sortOrder: s.sortOrder,
        placeName: s.placeName,
        stopType: s.stopType,
        stayMinutes: s.stayMinutes,
        estimatedAmount: s.estimatedAmount,
        latitude: s.latitude,
        longitude: s.longitude,
        arrivalTime: null,
      })),
    });
  }

  /**
   * AI 코스의 지도.
   *
   * 시드 루트 지도와 유일하게 다른 점은 `arrivalTime` 이 채워진다는 것뿐이다 —
   * 프론트는 같은 컴포넌트로 둘 다 그릴 수 있다.
   */
  async getAiCourseMap(userId: string, courseId: string): Promise<RouteMapDto> {
    const course = await this.prisma.aiTravelCourse.findUnique({
      where: { id: courseId },
      include: {
        destination: { select: { id: true, name: true } },
        stops: { orderBy: { sortOrder: 'asc' } },
      },
    });
    // 남의 코스를 ID 만으로 열람하지 못하게 소유자를 확인한다.
    // 없는 코스와 남의 코스를 같은 404 로 묶어 존재 여부가 새지 않게 한다.
    if (!course || course.userId !== userId) {
      throw new AppException('NOT_FOUND', 'AI 여행코스를 찾을 수 없습니다.');
    }

    return this.assemble({
      id: course.id,
      kind: 'AI_COURSE',
      title: course.title,
      destinationId: course.destination.id,
      destinationName: course.destination.name,
      rawStops: course.stops.map((s) => ({
        sortOrder: s.sortOrder,
        placeName: s.placeName,
        stopType: s.stopType,
        stayMinutes: s.stayMinutes,
        estimatedAmount: s.estimatedAmount,
        latitude: s.latitude,
        longitude: s.longitude,
        arrivalTime: s.arrivalTime,
      })),
    });
  }

  // -------------------------------------------------------------------------

  private assemble(input: {
    id: string;
    kind: 'SEED_ROUTE' | 'AI_COURSE';
    title: string;
    destinationId: string;
    destinationName: string;
    rawStops: {
      sortOrder: number;
      placeName: string;
      stopType: string;
      stayMinutes: number;
      estimatedAmount: number;
      latitude: number | null;
      longitude: number | null;
      arrivalTime: string | null;
    }[];
  }): RouteMapDto {
    const plotted = input.rawStops.filter(hasCoords);

    const stops: RouteMapStopDto[] = plotted.map((s) => ({
      sortOrder: s.sortOrder,
      placeName: s.placeName,
      stopType: s.stopType,
      latitude: s.latitude,
      longitude: s.longitude,
      stayMinutes: s.stayMinutes,
      estimatedAmount: s.estimatedAmount,
      arrivalTime: s.arrivalTime,
    }));

    const legInputs: LegInput[] = stops.map((s) => ({
      sortOrder: s.sortOrder,
      placeName: s.placeName,
      latitude: s.latitude,
      longitude: s.longitude,
    }));
    const legs = buildLegs(legInputs);

    return {
      id: input.id,
      kind: input.kind,
      title: input.title,
      destinationId: input.destinationId,
      destinationName: input.destinationName,
      viewport: toViewport(stops),
      stops,
      legs,
      totalDistanceKm: totalDistanceKm(legs),
      // 금액은 **지도에서 뺀 경유지까지 포함해** 더한다. 좌표가 없다고 비용이 사라지진 않는다.
      totalEstimatedAmount: input.rawStops.reduce((s, x) => s + x.estimatedAmount, 0),
      missingCoordinateCount: input.rawStops.length - plotted.length,
    };
  }
}

function toViewport(points: LatLng[]): MapViewportDto {
  return { bounds: computeBounds(points), center: computeCenter(points) };
}
