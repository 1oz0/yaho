import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ApiEnvelope, ApiErrors } from '../common/swagger/api-envelope.decorator';
import { DemoService } from './demo.service';
import {
  DemoResetResultDto,
  FastForwardDto,
  FastForwardResultDto,
  SimulateSpendingDto,
  SimulateSpendingResultDto,
} from './dto/demo.dto';

@ApiTags('demo')
@ApiBearerAuth('accessToken')
@UseGuards(JwtAuthGuard)
@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '데모 초기화 (리허설 반복용)',
    description:
      '사용자 진행 상태를 전부 지우고 가상 시계를 0으로 되돌립니다. ' +
      '연동·거래·목표·챌린지·페르소나·뱃지·쿠폰이 사라져 **처음 상태에서 다시 시연**할 수 있습니다.\n\n' +
      '**보존되는 것**: 가상 금융 DB(mock_*)와 참조 데이터(키워드 사전·MCC·페르소나 48종·여행지·뱃지·쿠폰 카탈로그).\n' +
      '고정 시드로 이미 결정론적이라 다시 만들 이유가 없고, 건드리지 않는 편이 빠르며 ' +
      '리허설마다 은행 데이터가 동일하게 유지됩니다.\n\n' +
      '참조 데이터까지 새로 만들려면 터미널에서 `npm run db:seed` 를 실행하세요.',
  })
  @ApiEnvelope(DemoResetResultDto)
  @ApiErrors('UNAUTHORIZED')
  reset(@CurrentUser() user: AuthenticatedUser): Promise<DemoResetResultDto> {
    return this.demoService.reset(user.id);
  }

  @Post('fast-forward')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '가상 시계 앞으로 감기 — 성공 화면 즉시 시연',
    description:
      '앱이 인식하는 현재 시각을 N일 앞으로 보냅니다. 누적되며, 음수를 넣으면 되감습니다.\n\n' +
      '4주 챌린지를 시작한 뒤 `{ "days": 30 }` 을 호출하면 종료일을 넘겨, ' +
      '응답의 `challenge.status` 가 그 자리에서 `SUCCEEDED` 로 바뀝니다. ' +
      '이어서 `GET /travel/prescriptions` 를 부르면 블러가 전부 풀립니다.\n\n' +
      '시스템 시각은 건드리지 않습니다 — `DemoState.clockOffsetDays` 에 오프셋을 저장하고 ' +
      '앱 전체가 `ClockService.now()` 를 통해서만 시간을 읽습니다.',
  })
  @ApiEnvelope(FastForwardResultDto)
  @ApiErrors('UNAUTHORIZED', 'VALIDATION_FAILED')
  fastForward(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FastForwardDto,
  ): Promise<FastForwardResultDto> {
    return this.demoService.fastForward(user.id, dto.days);
  }

  @Post('simulate-spending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '임의 지출 주입 — 진척률 변화 시연',
    description:
      '지정한 카테고리에 지출을 하나 꽂아 넣어 진척률이 떨어지는 것을 보여줍니다.\n\n' +
      '분류 파이프라인을 태우지 않고 카테고리를 직접 지정합니다 — ' +
      '"이 카테고리에서 이만큼 더 쓰면 어떻게 되는지" 를 보여주는 것이 목적이기 때문입니다. ' +
      '주입된 거래는 `isSimulated: true` 로 표시되어 실제 수집분과 구분됩니다.\n\n' +
      '`daysAgo` 로 과거 날짜에 넣을 수 있습니다 (챌린지 기간 안에 들어가야 진척에 반영됩니다).',
  })
  @ApiEnvelope(SimulateSpendingResultDto)
  @ApiErrors('NO_TRANSACTION_DATA', 'UNAUTHORIZED', 'VALIDATION_FAILED')
  simulateSpending(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SimulateSpendingDto,
  ): Promise<SimulateSpendingResultDto> {
    return this.demoService.simulateSpending(user.id, dto);
  }
}
