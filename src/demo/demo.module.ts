import { Module } from '@nestjs/common';

import { ChallengesModule } from '../challenges/challenges.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

/**
 * 발표 전용 모듈.
 * `DEMO_MODE=false` 면 AppModule 이 아예 import 하지 않으므로 라우트가 존재하지 않는다(404).
 * Swagger 문서에도 나오지 않는다.
 */
@Module({
  imports: [ChallengesModule, TransactionsModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
