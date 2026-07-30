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
   * Claude 를 실제로 호출할 수 있는 상태인가.
   * 키가 없거나 스위치가 꺼져 있으면 AI 코스는 시드 루트 폴백으로 내려간다.
   */
  get aiCourseEnabled(): boolean {
    return this.get('AI_COURSE_ENABLED') && this.anthropicApiKey.length > 0;
  }
}
