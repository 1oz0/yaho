/**
 * 검증된 환경변수에 타입 안전하게 접근하는 래퍼.
 * 도메인 코드가 process.env 나 문자열 키를 직접 만지지 않게 한다.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvVars } from './env.validation';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvVars, true>) {}

  private get<K extends keyof EnvVars>(key: K): EnvVars[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): EnvVars['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.get('PORT');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  /** DATABASE_URL 로부터 현재 프로바이더를 추론한다. 부팅 로그에 찍어 혼동을 없앤다. */
  get databaseProvider(): 'sqlite' | 'postgresql' {
    return this.databaseUrl.startsWith('file:') ? 'sqlite' : 'postgresql';
  }

  get jwtSecret(): string {
    return this.get('JWT_SECRET');
  }

  get jwtExpiresIn(): string {
    return this.get('JWT_EXPIRES_IN');
  }

  get demoUserEmail(): string {
    return this.get('DEMO_USER_EMAIL');
  }

  get demoUserPassword(): string {
    return this.get('DEMO_USER_PASSWORD');
  }

  get mockLatencyRange(): { min: number; max: number } {
    return { min: this.get('MOCK_LATENCY_MIN_MS'), max: this.get('MOCK_LATENCY_MAX_MS') };
  }

  get mockProviderPassword(): string {
    return this.get('MOCK_PROVIDER_PASSWORD');
  }

  get demoMode(): boolean {
    return this.get('DEMO_MODE');
  }

  get swaggerEnabled(): boolean {
    return this.get('SWAGGER_ENABLED');
  }

  get swaggerPath(): string {
    return this.get('SWAGGER_PATH');
  }

  // --- Claude API -------------------------------------------------------------

  get anthropicApiKey(): string {
    return this.get('ANTHROPIC_API_KEY').trim();
  }

  get anthropicModel(): EnvVars['ANTHROPIC_MODEL'] {
    return this.get('ANTHROPIC_MODEL');
  }

  get anthropicEffort(): EnvVars['ANTHROPIC_EFFORT'] {
    return this.get('ANTHROPIC_EFFORT');
  }

  get anthropicTimeoutMs(): number {
    return this.get('ANTHROPIC_TIMEOUT_MS');
  }

  /**
   * Claude 를 호출할 수 있는 최소 조건 — 키가 있는가.
   *
   * 기능별 스위치와 분리해 둔다. ClaudeService 는 이것만 보고,
   * "이 기능에 AI 를 쓸 것인가"는 각 도메인 서비스가 자기 플래그로 판단한다.
   * 한 기능을 끄려고 키를 지우면 나머지 기능까지 같이 죽기 때문이다.
   */
  get anthropicConfigured(): boolean {
    return this.anthropicApiKey.length > 0;
  }

  /** 여행코스를 Claude 로 생성한다. 꺼지면 시드 루트 폴백. */
  get aiCourseEnabled(): boolean {
    return this.get('AI_COURSE_ENABLED') && this.anthropicConfigured;
  }

  /** 거래 카테고리를 Claude 로 분류한다. 꺼지면 키워드 사전·MCC 규칙 엔진만 쓴다. */
  get aiClassifyEnabled(): boolean {
    return this.get('AI_CLASSIFY_ENABLED') && this.anthropicConfigured;
  }

  /** 페르소나 축을 Claude 가 고른다. 꺼지면 최다 지출·최다 건수 규칙으로 고른다. */
  get aiPersonaEnabled(): boolean {
    return this.get('AI_PERSONA_ENABLED') && this.anthropicConfigured;
  }

  get aiClassifyBatchSize(): number {
    return this.get('AI_CLASSIFY_BATCH_SIZE');
  }
}
