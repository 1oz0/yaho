import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import { ConnectionsService } from './connections.service';
import {
  ConnectionDto,
  CreateConnectionDto,
  InstitutionDto,
  RevokeConnectionDto,
} from './dto/connections.dto';

@ApiTags('connections')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get('institutions')
  @ApiOperation({
    summary: '연동 가능한 기관 목록 (화면 ②)',
    description:
      '카드사 3곳 · 은행 3곳을 반환합니다. `isConnected` 가 true 면 이미 연동된 기관입니다.\n\n' +
      '실제 금융 API 처럼 보이도록 150~400ms 지연이 들어갑니다 (`MOCK_LATENCY_*_MS` 로 조절).',
  })
  @ApiEnvelope(InstitutionDto, { isArray: true })
  @ApiErrors('UNAUTHORIZED')
  listInstitutions(@CurrentUser() user: AuthenticatedUser): Promise<InstitutionDto[]> {
    return this.connectionsService.listInstitutions(user.id);
  }

  @Post()
  @ApiOperation({
    summary: '기관 연동 (화면 ②)',
    description:
      '인증에 성공하면 해당 기관의 계좌·카드가 **자동으로 등록**됩니다.\n\n' +
      '데모 자격증명: `yaho` / `1234` (6개 기관 모두 동일)\n\n' +
      '복수 기관을 순차 호출해 동시에 연동할 수 있습니다. ' +
      '이 시점에는 거래를 가져오지 않습니다 — `POST /transactions/sync` 를 따로 호출하세요.',
  })
  @ApiEnvelope(ConnectionDto, { status: 201, description: '연동 성공' })
  @ApiErrors('PROVIDER_AUTH_FAILED', 'CONNECTION_ALREADY_EXISTS', 'NOT_FOUND', 'VALIDATION_FAILED')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConnectionDto,
  ): Promise<ConnectionDto> {
    return this.connectionsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: '연동 현황 (화면 ②)',
    description: '해제된 연동(`status: "REVOKED"`)도 함께 반환합니다.',
  })
  @ApiEnvelope(ConnectionDto, { isArray: true })
  @ApiErrors('UNAUTHORIZED')
  list(@CurrentUser() user: AuthenticatedUser): Promise<ConnectionDto[]> {
    return this.connectionsService.list(user.id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: '연동 해제 (화면 ②)',
    description:
      '해당 기관에서 수집한 거래도 **함께 삭제**됩니다. ' +
      '남겨두면 연동을 끊었는데도 분석 결과에 그 기관 지출이 계속 잡히기 때문입니다.',
  })
  @ApiParam({ name: 'id', description: 'Connection ID' })
  @ApiEnvelope(RevokeConnectionDto)
  @ApiErrors('NOT_FOUND', 'UNAUTHORIZED')
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RevokeConnectionDto> {
    return this.connectionsService.revoke(user.id, id);
  }
}
