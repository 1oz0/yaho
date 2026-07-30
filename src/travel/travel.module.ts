import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ChallengesModule } from '../challenges/challenges.module';
import { PersonaModule } from '../persona/persona.module';
import { AiCourseService } from './ai-course/ai-course.service';
import { TravelMapService } from './map/travel-map.service';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';

@Module({
  // AiModule 의존은 여기 한 곳뿐이다 — 분류·페르소나·예산 계산은 AI 를 타지 않는다.
  imports: [ChallengesModule, PersonaModule, AiModule],
  controllers: [TravelController],
  providers: [TravelService, AiCourseService, TravelMapService],
  exports: [TravelService],
})
export class TravelModule {}
