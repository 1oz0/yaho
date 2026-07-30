/**
 * 전역 공통 모듈.
 * ClockService 는 거의 모든 도메인이 쓰므로 @Global 로 올려 import 보일러플레이트를 없앤다.
 */
import { Global, Module } from '@nestjs/common';

import { ClockService } from './clock/clock.service';

@Global()
@Module({
  providers: [ClockService],
  exports: [ClockService],
})
export class CommonModule {}
