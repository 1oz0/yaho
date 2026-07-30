import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import type { WithMeta } from '../common/interceptors/transform.interceptor';
import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import { ChallengesService } from './challenges.service';
import {
  ChallengeHistoryItemDto,
  ChallengeProgressDto,
  CheckInDto,
  CheckInResultDto,
  CompleteChallengeResultDto,
  DestinationPlanDto,
  StartChallengeDto,
} from './dto/challenges.dto';

@ApiTags('challenges')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get('plans')
  @ApiOperation({
    summary: '처방 선택 — 고를 수 있는 챌린지 목록 (화면 S10)',
    description:
      '**여행지가 곧 챌린지입니다.** 여행지마다 기간과 목표액이 정해져 있고, 사용자는 카드를 골라 ' +
      '그 목표액을 확정합니다. 절약 목표는 그다음 화면(S12)에서 배분합니다.\n\n' +
      '> 예전에는 슬라이더로 T 를 먼저 정하고 2/4/8주 플랜이 파생됐지만, 화면 흐름이 ' +
      '`S10 처방 선택 → S11 상세 → S12 배분` 이라 방향을 뒤집었습니다.\n\n' +
      '### 절약 목표가 없어도 호출할 수 있습니다\n' +
      'S10 은 S12 보다 앞에 오므로 `NO_SAVING_GOAL` 을 내지 않습니다. 거래 내역만 있으면 됩니다.\n\n' +
      '### 화면 구성\n' +
      '`weeks` 로 묶으면 화면의 "2주 챌린지 / 4주 챌린지 / 8주 챌린지" 섹션이 됩니다 ' +
      '(응답은 이미 기간 → 목표액 순으로 정렬돼 있습니다).\n\n' +
      '### achievable 를 꼭 보세요\n' +
      '`achievable: false` 는 **지금 소비 규모로는 그 목표를 배분할 수 없다**는 뜻입니다. ' +
      '화면 문서의 "월평균 총지출을 넘는 챌린지는 목록에서 아예 제외" 규칙이 이것입니다 — ' +
      '달성 불가능한 선택지는 보여주지 마세요. 판정 기준은 **절약 대상 9종의 기간 환산 상한**입니다.\n\n' +
      '난이도는 `절감률 = 목표 / (월평균 총지출 × 주수/4.345)` 로 판정합니다 — ' +
      '10% 미만 EASY / 10~25% NORMAL / 25% 초과 HARD.',
  })
  @ApiEnvelope(DestinationPlanDto, { isArray: true })
  @ApiErrors('NO_TRANSACTION_DATA', 'UNAUTHORIZED')
  getPlans(@CurrentUser() user: AuthenticatedUser): Promise<DestinationPlanDto[]> {
    return this.challengesService.getPlans(user.id);
  }

  @Post()
  @ApiOperation({
    summary: '챌린지 시작 (화면 ⑥)',
    description:
      '고른 플랜으로 챌린지를 시작하고 주차별 예산을 확정 저장합니다.\n\n' +
      '진행 중인 챌린지가 있으면 `CHALLENGE_ALREADY_ACTIVE` (409) 입니다.',
  })
  @ApiEnvelope(ChallengeProgressDto, { status: 201 })
  @ApiErrors('CHALLENGE_ALREADY_ACTIVE', 'NO_SAVING_GOAL', 'INVALID_REQUEST', 'NO_TRANSACTION_DATA', 'VALIDATION_FAILED')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartChallengeDto,
  ): Promise<ChallengeProgressDto> {
    return this.challengesService.start(user.id, dto.destinationId);
  }

  @Get('current')
  @ApiOperation({
    summary: '진행 중인 챌린지 (화면 ⑦)',
    description:
      '진척률, 주차별 예산 대비 실지출, 남은 일수를 반환합니다.\n\n' +
      '**상태는 이 API 를 호출하는 시점에 판정됩니다** (백그라운드 스케줄러 없음). ' +
      '`POST /demo/fast-forward` 로 시계를 감은 뒤 이 API 를 부르면 그 자리에서 ' +
      '`SUCCEEDED` / `FAILED` 로 전환됩니다.\n\n' +
      '`byCategory[].savedAmount` 는 **초과 시 음수로 내려갑니다.** ' +
      '한 카테고리의 초과분이 다른 카테고리 절약분을 상쇄해야 정직하기 때문입니다. ' +
      '프론트는 `isOver` 로 빨강 처리하세요.\n\n' +
      '진행 중에는 경과 일수만큼 기준 지출을 안분하므로, 1주차에 진척률이 과장되지 않습니다.',
  })
  @ApiEnvelope(ChallengeProgressDto)
  @ApiErrors('NO_ACTIVE_CHALLENGE', 'UNAUTHORIZED')
  getCurrent(@CurrentUser() user: AuthenticatedUser): Promise<ChallengeProgressDto> {
    return this.challengesService.getCurrent(user.id);
  }

  @Post(':id/checkin')
  @ApiOperation({
    summary: '주차 체크인 (화면 ⑦)',
    description: '해당 주차의 예산 대비 실지출을 확정 기록합니다. 같은 주차 중복 체크인은 409 입니다.',
  })
  @ApiParam({ name: 'id', description: 'Challenge ID' })
  @ApiEnvelope(CheckInResultDto, { status: 201 })
  @ApiErrors('NOT_FOUND', 'CHALLENGE_NOT_ACTIVE', 'ALREADY_CHECKED_IN', 'VALIDATION_FAILED')
  checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CheckInDto,
  ): Promise<CheckInResultDto> {
    return this.challengesService.checkIn(user.id, id, dto);
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: '성공/실패 판정 + 보상 지급 (화면 ⑦→⑨)',
    description:
      '진척률 100% 이상이면 `SUCCEEDED`, 아니면 `FAILED` 로 확정하고 ' +
      '**성공 시 뱃지와 쿠폰을 지급**합니다.\n\n' +
      '기간이 남아 있어도 호출할 수 있습니다 — 발표에서 종료를 기다리지 않고 결과 화면으로 넘어가기 위함입니다.\n\n' +
      '재호출해도 이미 보유한 뱃지·쿠폰은 다시 발급되지 않습니다.',
  })
  @ApiParam({ name: 'id', description: 'Challenge ID' })
  @ApiEnvelope(CompleteChallengeResultDto, { status: 201 })
  @ApiErrors('NOT_FOUND', 'UNAUTHORIZED')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CompleteChallengeResultDto> {
    return this.challengesService.complete(user.id, id);
  }

  @Get('history')
  @ApiOperation({ summary: '챌린지 이력 (화면 ⑦)', description: '커서 페이지네이션.' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiEnvelope(ChallengeHistoryItemDto, { isArray: true, paginated: true })
  @ApiErrors('UNAUTHORIZED')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ): Promise<WithMeta<ChallengeHistoryItemDto[]>> {
    return this.challengesService.history(user.id, cursor, limit ? Number(limit) : undefined);
  }
}
