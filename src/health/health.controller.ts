/**
 * 헬스체크. 발표 당일 "서버 살아있나?" 를 1초 만에 확인하는 용도다.
 * README 트러블슈팅 체크리스트의 첫 번째 항목이기도 하다.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClockService } from '../common/clock/clock.service';
import { ApiEnvelope } from '../common/swagger/api-envelope.decorator';
import { toKstIso } from '../common/utils/date-kst';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthDto } from './health.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '서버 상태 확인',
    description:
      'DB 연결, 가상 시계 오프셋, 데모 모드 여부를 한 번에 확인한다. 발표 전 점검용.',
  })
  @ApiEnvelope(HealthDto)
  async check(): Promise<HealthDto> {
    let dbOk = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }

    return {
      status: dbOk ? 'ok' : 'degraded',
      databaseOk: dbOk,
      databaseProvider: this.config.databaseProvider,
      demoMode: this.config.demoMode,
      clockOffsetDays: this.clock.getOffsetDays(),
      virtualNow: toKstIso(this.clock.now()),
      realNow: toKstIso(this.clock.realNow()),
    };
  }
}
