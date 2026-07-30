import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { WithMeta } from '../common/interceptors/transform.interceptor';
import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import { AiCourseService } from './ai-course/ai-course.service';
import {
  AiTravelCourseDto,
  GenerateAiCourseQueryDto,
} from './dto/ai-course.dto';
import { RouteMapDto, TravelMapDto } from './dto/map.dto';
import {
  ListReviewsQueryDto,
  TravelDestinationDto,
  TravelPrescriptionDto,
  TravelReviewDto,
} from './dto/travel.dto';
import { TravelMapService } from './map/travel-map.service';
import { TravelService } from './travel.service';

@ApiTags('travel')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('travel')
export class TravelController {
  constructor(
    private readonly travelService: TravelService,
    private readonly aiCourseService: AiCourseService,
    private readonly mapService: TravelMapService,
  ) {}

  @Get('prescriptions')
  @ApiOperation({
    summary: '여행 처방 (화면 ⑧)',
    description:
      '절약액으로 갈 수 있는 **호남권 인구소멸위험지역** 여행지를 추천합니다. ' +
      '여행지마다 루트가 **정확히 2개** 옵니다.\n\n' +
      '### 블러 정책\n' +
      '`progressRate` 만큼 사진이 열립니다 — 공개 장수 = `ceil(진척률 × 전체 장수)`, ' +
      '`revealOrder` 가 앞선 것부터.\n\n' +
      '**블러 처리된 사진도 `imageUrl` 은 항상 내려갑니다.** 프론트가 `blurred` 플래그로 ' +
      'CSS 블러를 걸어주세요. 서버가 URL 을 숨기면 진척률이 바뀔 때마다 이미지를 다시 받아야 해서 ' +
      '전환이 끊깁니다.\n\n' +
      '### 기준 금액\n' +
      '- 챌린지가 있으면 그 목표 절약액 (`basisSource: "CHALLENGE"`)\n' +
      '- 없으면 절약 목표 합계 T (`"SAVING_GOAL"`)\n' +
      '- 그것도 없으면 0 (`"NONE"`) — 이때도 에러가 아니라 `lockedDestinations` 로 ' +
      '"얼마를 더 아끼면 갈 수 있는지" 를 보여줍니다.',
  })
  @ApiEnvelope(TravelPrescriptionDto)
  @ApiErrors('UNAUTHORIZED')
  getPrescriptions(@CurrentUser() user: AuthenticatedUser): Promise<TravelPrescriptionDto> {
    return this.travelService.getPrescriptions(user.id);
  }

  @Get('destinations/:id')
  @ApiOperation({
    summary: '여행지 상세 (화면 ⑧)',
    description: '루트 2개와 사진(블러 플래그 포함), 리뷰 요약을 반환합니다.',
  })
  @ApiParam({ name: 'id', description: 'TravelDestination ID' })
  @ApiEnvelope(TravelDestinationDto)
  @ApiErrors('NOT_FOUND', 'UNAUTHORIZED')
  getDestination(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<TravelDestinationDto> {
    return this.travelService.getDestination(user.id, id);
  }

  @Get('destinations/:id/reviews')
  @ApiOperation({
    summary: '기방문자 리뷰 (화면 ⑧)',
    description: '도움이 된 순으로 정렬합니다. 커서 페이지네이션.',
  })
  @ApiParam({ name: 'id', description: 'TravelDestination ID' })
  @ApiEnvelope(TravelReviewDto, { isArray: true, paginated: true })
  @ApiErrors('NOT_FOUND', 'UNAUTHORIZED')
  listReviews(
    @Param('id') id: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<WithMeta<TravelReviewDto[]>> {
    return this.travelService.listReviews(id, query.cursor, query.limit);
  }

  // ==========================================================================
  // AI 여행코스 (Claude API)
  // ==========================================================================

  @Post('destinations/:id/ai-course')
  @ApiOperation({
    summary: 'AI 여행코스 생성 (화면 ⑧)',
    description:
      '**현재 페르소나에 맞춘 하루 코스를 Claude API 로 생성합니다.**\n\n' +
      '### 선행 조건\n' +
      '`POST /persona/evaluate` 로 페르소나가 산출돼 있어야 합니다. 없으면 `NO_PERSONA`(422).\n' +
      '페르소나는 카드내역 분석 결과에서 **지출 비중이 가장 높은 카테고리 × 승인 건수가 가장 많은 ' +
      '시간대** 로 정해지며, 이 계산은 AI 가 아니라 규칙 기반입니다.\n\n' +
      '### AI 가 하는 일 / 하지 않는 일\n' +
      '| 항목 | 담당 |\n' +
      '|---|---|\n' +
      '| 어떤 경유지를 고를지, 어떤 순서로 돌지 | Claude |\n' +
      '| 제목·요약·추천 이유·경유지 설명·팁 | Claude |\n' +
      '| 금액, 체류 시간, 도착 시각, 총합 | **서버 (시드 데이터 + 산술)** |\n' +
      '| 좌표 | **서버 (시드 데이터)** |\n\n' +
      '경유지는 해당 여행지에 등록된 시드 경유지 중에서만 고릅니다. 모델이 목록에 없는 장소를 ' +
      '만들어내면 서버가 걸러냅니다.\n\n' +
      '### 캐시\n' +
      '같은 (사용자 · 여행지 · 페르소나) 조합은 한 번만 생성하고 이후에는 저장된 것을 그대로 ' +
      '돌려줍니다(`meta.cached: true`). 새로 짜려면 `?refresh=true`.\n\n' +
      '### 실패해도 200 입니다\n' +
      'API 키가 없거나 타임아웃·거절·검증 실패가 나면 **시드 루트를 재구성한 코스**를 돌려주고 ' +
      '`meta.generatedBy: "FALLBACK"` 과 `meta.fallbackReason` 으로 알립니다. ' +
      '응답 형태는 완전히 동일하니 프론트는 분기할 필요 없이 배지만 다르게 붙이면 됩니다.',
  })
  @ApiParam({ name: 'id', description: 'TravelDestination ID' })
  @ApiEnvelope(AiTravelCourseDto)
  @ApiErrors('NOT_FOUND', 'NO_PERSONA', 'UNAUTHORIZED')
  generateAiCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: GenerateAiCourseQueryDto,
  ): Promise<AiTravelCourseDto> {
    return this.aiCourseService.generate(user.id, id, query.refresh ?? false);
  }

  @Get('destinations/:id/ai-course')
  @ApiOperation({
    summary: '생성된 AI 여행코스 조회 (화면 ⑧)',
    description:
      '이미 생성해 둔 코스를 돌려줍니다. **조회만 하고 생성하지 않습니다** — ' +
      '화면 진입마다 API 가 과금되지 않도록 생성은 POST 로만 합니다.\n\n' +
      '아직 만든 적이 없으면 `NOT_FOUND`(404). 그때 POST 를 호출하세요.',
  })
  @ApiParam({ name: 'id', description: 'TravelDestination ID' })
  @ApiEnvelope(AiTravelCourseDto)
  @ApiErrors('NOT_FOUND', 'NO_PERSONA', 'UNAUTHORIZED')
  getAiCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AiTravelCourseDto> {
    return this.aiCourseService.getCached(user.id, id);
  }

  // ==========================================================================
  // 지도 (상태바 "지도" 탭)
  // ==========================================================================

  @Get('map')
  @ApiOperation({
    summary: '지도 탭 진입 (화면 ⑨ 지도)',
    description:
      '호남권 여행지를 지도 마커로 내려줍니다.\n\n' +
      '- **잠긴 여행지도 포함됩니다.** `unlocked: false` + `shortfallAmount` 로 ' +
      '"얼마를 더 아끼면 열리는지"를 보여주세요.\n' +
      '- `viewport.bounds` 를 지도 SDK 의 fitBounds 에 그대로 넣으면 전체가 화면에 들어옵니다.\n' +
      '- `hasAiCourse: true` 인 마커는 탭했을 때 바로 AI 코스를 열 수 있습니다.\n\n' +
      '기준 절약액은 `/travel/prescriptions` 와 **완전히 같은 규칙**(챌린지 → 절약목표 → 0)을 씁니다.\n\n' +
      '⚠️ 좌표는 공개 정보를 옮겨 적은 **근사값**입니다. 핀 위치 표시용이며 내비게이션 목적지로는 ' +
      '부정확할 수 있습니다.',
  })
  @ApiEnvelope(TravelMapDto)
  @ApiErrors('UNAUTHORIZED')
  getTravelMap(@CurrentUser() user: AuthenticatedUser): Promise<TravelMapDto> {
    return this.mapService.getTravelMap(user.id);
  }

  @Get('routes/:routeId/map')
  @ApiOperation({
    summary: '여행 루트 지도 (화면 ⑨ 지도)',
    description:
      '시드 루트 하나를 지도에 그리기 위한 데이터입니다.\n\n' +
      '`stops` 를 `sortOrder` 순으로 이으면 그것이 곧 폴리라인이고, `legs` 에 구간별 거리가 ' +
      '들어 있습니다.\n\n' +
      '⚠️ `distanceKm` 는 **직선거리**입니다. 실제 도로 주행거리는 보통 20~40% 더 깁니다. ' +
      '화면에도 "직선거리"라고 표기해 주세요.',
  })
  @ApiParam({ name: 'routeId', description: 'TravelRoute ID' })
  @ApiEnvelope(RouteMapDto)
  @ApiErrors('NOT_FOUND', 'UNAUTHORIZED')
  getRouteMap(@Param('routeId') routeId: string): Promise<RouteMapDto> {
    return this.mapService.getRouteMap(routeId);
  }

  @Get('ai-courses/:courseId/map')
  @ApiOperation({
    summary: 'AI 여행코스 지도 (화면 ⑨ 지도)',
    description:
      'AI 가 짠 코스를 지도에 그립니다. 루트 지도와 응답 형태가 같고, 경유지에 ' +
      '`arrivalTime`(도착 예정 시각)이 추가로 채워집니다 — 같은 컴포넌트로 둘 다 그릴 수 있습니다.\n\n' +
      '본인이 생성한 코스만 조회할 수 있습니다.',
  })
  @ApiParam({ name: 'courseId', description: 'AiTravelCourse ID' })
  @ApiEnvelope(RouteMapDto)
  @ApiErrors('NOT_FOUND', 'UNAUTHORIZED')
  getAiCourseMap(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ): Promise<RouteMapDto> {
    return this.mapService.getAiCourseMap(user.id, courseId);
  }
}
