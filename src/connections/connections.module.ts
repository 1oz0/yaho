import { Module } from '@nestjs/common';

import { FinancialModule } from '../financial/financial.module';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

@Module({
  imports: [FinancialModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
