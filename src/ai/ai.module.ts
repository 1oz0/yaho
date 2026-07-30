/**
 * Claude API 연동 모듈.
 *
 * 여행코스 생성에만 쓴다. 분류·페르소나·예산 계산은 규칙 기반 그대로다 —
 * "핵심 계산 로직이 AI 없이 결정론적으로 동작하는가"(평가기준 ③) 를 지키기 위해
 * 이 모듈에 대한 의존은 TravelModule 한 곳으로 제한한다.
 */
import { Module } from '@nestjs/common';

import { ClaudeService } from './claude.service';

@Module({
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class AiModule {}
