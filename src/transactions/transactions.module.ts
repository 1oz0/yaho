import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { FinancialModule } from '../financial/financial.module';
import { AiClassifierService } from './classification/ai-classifier.service';
import { ClassificationService } from './classification/classification.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [FinancialModule, AiModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, ClassificationService, AiClassifierService],
  exports: [TransactionsService, ClassificationService],
})
export class TransactionsModule {}
