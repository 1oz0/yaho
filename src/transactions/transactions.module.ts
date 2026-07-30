import { Module } from '@nestjs/common';

import { FinancialModule } from '../financial/financial.module';
import { ClassificationService } from './classification/classification.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [FinancialModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, ClassificationService],
  exports: [TransactionsService, ClassificationService],
})
export class TransactionsModule {}
