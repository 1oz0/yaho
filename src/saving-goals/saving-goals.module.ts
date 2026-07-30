import { Module } from '@nestjs/common';

import { AnalysisModule } from '../analysis/analysis.module';
import { SavingGoalsController } from './saving-goals.controller';
import { SavingGoalsService } from './saving-goals.service';

@Module({
  imports: [AnalysisModule],
  controllers: [SavingGoalsController],
  providers: [SavingGoalsService],
  exports: [SavingGoalsService],
})
export class SavingGoalsModule {}
