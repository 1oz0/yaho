import { Module } from '@nestjs/common';

import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService],
  // persona / saving-goals / challenges 가 집계 결과를 재사용한다
  exports: [AnalysisService],
})
export class AnalysisModule {}
