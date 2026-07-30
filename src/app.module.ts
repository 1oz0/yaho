// ⚠️ 최상단이어야 한다. DemoModule 조건부 등록이 process.env.DEMO_MODE 를 읽는데,
//    데코레이터가 평가되기 전에 .env 가 로드돼 있어야 하기 때문이다.
import { isDemoMode } from './load-env';

import { Module } from '@nestjs/common';

import { AnalysisModule } from './analysis/analysis.module';
import { AuthModule } from './auth/auth.module';
import { ChallengesModule } from './challenges/challenges.module';
import { CommonModule } from './common/common.module';
import { AppConfigModule } from './config/config.module';
import { ConnectionsModule } from './connections/connections.module';
import { DemoModule } from './demo/demo.module';
import { FinancialModule } from './financial/financial.module';
import { HealthController } from './health/health.controller';
import { PersonaModule } from './persona/persona.module';
import { PrismaModule } from './prisma/prisma.module';
import { RewardsModule } from './rewards/rewards.module';
import { SavingGoalsModule } from './saving-goals/saving-goals.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TravelModule } from './travel/travel.module';

/** 의존 그래프는 docs/design.md §5 참조 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CommonModule,
    AuthModule,
    FinancialModule,
    ConnectionsModule,
    TransactionsModule,
    AnalysisModule,
    PersonaModule,
    SavingGoalsModule,
    RewardsModule,
    ChallengesModule,
    TravelModule,
    // DEMO_MODE=false 면 /demo/* 라우트가 아예 등록되지 않는다 (404, Swagger 에도 없음)
    ...(isDemoMode() ? [DemoModule] : []),
  ],
  controllers: [HealthController],
})
export class AppModule {}
