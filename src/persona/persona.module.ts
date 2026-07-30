import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { AiPersonaService } from './ai-persona.service';
import { PersonaController } from './persona.controller';
import { PersonaService } from './persona.service';

@Module({
  imports: [AnalysisModule, AiModule],
  controllers: [PersonaController],
  providers: [PersonaService, AiPersonaService],
  exports: [PersonaService],
})
export class PersonaModule {}
