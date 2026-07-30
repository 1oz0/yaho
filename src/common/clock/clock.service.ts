/**
 * 가상 시계.
 *
 * ⚠️ 애플리케이션 전체에서 `new Date()` / `Date.now()` 직접 호출을 금지한다.
 *    현재 시각이 필요하면 반드시 ClockService.now() 를 쓴다. (ESLint 로 강제)
 *
 * 이유 (docs/design.md §1-④)
 *   POST /demo/fast-forward 로 "챌린지 시계를 N일 진행" 시켜 성공 화면을 즉석에서
 *   시연해야 한다. 시스템 시각은 건드릴 수 없으므로 DemoState.clockOffsetDays 를
 *   더한 값을 앱의 현재 시각으로 삼는다.
 *
 * 오프셋은 DB 단일 행에 있고 자주 읽히므로 메모리에 캐시한다.
 * 부팅 시 1회 로드하고, fast-forward / reset 때만 갱신한다.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { addDays, toKstIso } from '../utils/date-kst';

export const DEMO_STATE_ID = 'singleton';

@Injectable()
export class ClockService implements OnModuleInit {
  private readonly logger = new Logger(ClockService.name);
  private offsetDays = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** 앱이 인식하는 현재 시각. 실제 시각 + 데모 오프셋. */
  now(): Date {
    const real = new Date();
    return this.offsetDays === 0 ? real : addDays(real, this.offsetDays);
  }

  /** 오프셋이 섞이지 않은 진짜 시각. 로그·감사 용도로만 쓴다. */
  realNow(): Date {
    return new Date();
  }

  getOffsetDays(): number {
    return this.offsetDays;
  }

  /** DB 에서 오프셋을 다시 읽는다. DB 가 아직 없으면 0 으로 둔다(부팅 실패 방지). */
  async reload(): Promise<number> {
    try {
      const state = await this.prisma.demoState.findUnique({ where: { id: DEMO_STATE_ID } });
      this.offsetDays = state?.clockOffsetDays ?? 0;
    } catch {
      this.offsetDays = 0;
      this.logger.warn('DemoState 를 읽지 못했습니다. 시계 오프셋을 0 으로 둡니다. (시드 전이면 정상)');
    }
    if (this.offsetDays !== 0) {
      this.logger.log(`가상 시계 활성: +${this.offsetDays}일 → ${toKstIso(this.now())}`);
    }
    return this.offsetDays;
  }

  /** N일 앞으로 감는다. 누적된다. */
  async fastForward(days: number): Promise<number> {
    const next = this.offsetDays + days;
    await this.prisma.demoState.update({
      where: { id: DEMO_STATE_ID },
      data: { clockOffsetDays: next },
    });
    this.offsetDays = next;
    this.logger.log(`fast-forward +${days}일 (누적 +${next}일) → ${toKstIso(this.now())}`);
    return next;
  }

  /** 오프셋을 0 으로 되돌린다. demo/reset 에서 호출. */
  async reset(): Promise<void> {
    await this.prisma.demoState.updateMany({ data: { clockOffsetDays: 0 } });
    this.offsetDays = 0;
    this.logger.log('가상 시계 초기화');
  }
}
