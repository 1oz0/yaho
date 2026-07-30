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
      '**두 축(시간대 × 카테고리)을 Claude 가 고르고, 48종 카탈로그에서 페르소나를 확정합니다.**\n\n' +
      '### 축\n' +
      '- **시간대** (4종) 아침 05–10 / 점심 11–16 / 저녁 17–21 / 심야 22–04. **건수** 기준입니다.\n' +
      '- **카테고리** (12종) 배달·외식·카페·술·교통·쇼핑·게임·구독·편의점·의료·교육·여행\n\n' +
      '### AI 가 하는 일 / 하지 않는 일\n' +
      '| 항목 | 담당 |\n' +
      '|---|---|\n' +
      '| 두 축을 무엇으로 볼지 | Claude |\n' +
      '| 개인화 문구 (`ai.reason` / `ai.headline`) | Claude |\n' +
      '| 페르소나 이름·태그라인·설명 | **서버 (Persona 카탈로그)** |\n' +
      '| 소비량 진단, 또래 대비 배수, 모든 금액 | **서버 (산술)** |\n\n' +
      '모델은 **페르소나 이름을 짓지 않습니다.** 축 두 개만 고르고 코드 조합·카탈로그 조회는 ' +
      '서버가 하므로, 48종 밖의 존재하지 않는 페르소나는 나올 수 없습니다.\n\n' +
      '### 규칙과 갈릴 때\n' +
      '규칙은 각 축의 1위를 그대로 집습니다. 배달 18.9% · 외식 18.0% 처럼 근소하면 모델이 ' +
      '건수·가맹점 구성을 보고 다르게 고를 수 있고, 그때 `ai.divergedFromRule: true` 와 ' +
      '`evidence.actualTopCategory`(규칙이 뽑았던 값)가 채워집니다.\n\n' +
      '### 실패해도 200 입니다\n' +
      'API 키가 없거나 타임아웃·검증 실패가 나면 **규칙 기반 축**으로 산출하고 ' +
      '`ai.generatedBy: "RULE"` 과 `ai.fallbackReason` 으로 알립니다. 응답 형태는 완전히 같으니 ' +
      '프론트는 분기하지 말고 `ai.reason` 이 null 이면 그 영역만 숨기면 됩니다.\n\n' +
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
