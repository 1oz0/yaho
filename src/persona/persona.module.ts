import { Module } from '@nestjs/common';

import { AnalysisModule } from '../analysis/analysis.module';
import { PersonaController } from './persona.controller';
import { PersonaService } from './persona.service';

@Module({
  imports: [AnalysisModule],
  controllers: [PersonaController],
  providers: [PersonaService],
  exports: [PersonaService],
})
export class PersonaModule {}
