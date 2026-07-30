import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import { PersonaDto } from './dto/persona.dto';
import { PersonaService } from './persona.service';

@ApiTags('persona')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('persona')
export class PersonaController {
  constructor(private readonly personaService: PersonaService) {}

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '페르소나 산출·저장 (화면 ④)',
    description:
      '세 축의 조합으로 60종 중 하나를 결정합니다 — **AI 를 쓰지 않습니다.**\n\n' +
      '- **시간대** 승인 건수 최다 구간 (KST). 아침 05–10 / 점심 11–16 / 저녁 17–21 / 심야 22–04\n' +
      '- **소비량** 연령대 벤치마크 대비. 80% 미만 LOW / 80~120% NORMAL / 120% 초과 OVER\n' +
      '- **카테고리** 월평균 지출 최다 (배달·외식·카페편의점·쇼핑·교통 5종)\n\n' +
      '계산은 코드로, **표시 문구는 DB 에서** 가져옵니다. 기획이 문구를 바꿔도 API 는 그대로입니다.\n\n' +
      '`evidence` 에 산출 근거 수치가 담기므로 화면에 "왜 이 페르소나인지" 를 그대로 띄울 수 있습니다.',
  })
  @ApiEnvelope(PersonaDto)
  @ApiErrors('NO_TRANSACTION_DATA', 'NOT_FOUND', 'UNAUTHORIZED')
  evaluate(@CurrentUser() user: AuthenticatedUser): Promise<PersonaDto> {
    return this.personaService.evaluate(user.id, user.ageBand);
  }

  @Get('me')
  @ApiOperation({
    summary: '현재 페르소나 조회 (화면 ④)',
    description:
      '가장 최근에 산출된 페르소나를 반환합니다. 아직 산출 전이면 `NO_PERSONA` (422) 입니다.',
  })
  @ApiEnvelope(PersonaDto)
  @ApiErrors('NO_PERSONA', 'UNAUTHORIZED')
  me(@CurrentUser() user: AuthenticatedUser): Promise<PersonaDto> {
    return this.personaService.getCurrent(user.id);
  }
}
