import { Module } from '@nestjs/common';

import { AnalysisModule } from '../analysis/analysis.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SavingGoalsModule } from '../saving-goals/saving-goals.module';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';

@Module({
  imports: [AnalysisModule, SavingGoalsModule, RewardsModule],
  controllers: [ChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
