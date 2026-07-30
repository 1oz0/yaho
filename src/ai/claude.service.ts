/**
 * Claude API 얇은 래퍼.
 *
 * ── 이 서비스가 지키는 계약 하나 ─────────────────────────────────────────────
 * **절대 throw 하지 않는다.** 성공이든 실패든 판별 가능한 결과 객체를 돌려준다.
 *
 * 이유: 야호에서 Claude 는 **주 경로이되 필수 경로는 아니다.**
 * 거래 분류 · 페르소나 매칭 · 여행코스 생성 세 곳에 쓰지만, 셋 다 실패하면
 * 규칙 기반 계산으로 자동 강등되어 화면은 그대로 뜬다(§11 평가기준 ③).
 * 호출부가 try/catch 를 잊는 순간 발표 화면이 500 을 뱉는 구조는 만들지 않는다.
 *
 * 반대로 **금액 계산에는 절대 쓰지 않는다.** 예산·진척률·정산은 전부 산술이다.
 * 모델이 더한 숫자는 검산할 방법이 없다.
 *
 * ── 왜 structured outputs 인가 ───────────────────────────────────────────────
 * 응답을 그대로 DB 에 넣어야 해서 JSON 스키마를 강제한다. 프롬프트로 "JSON 으로 답해" 라고
 * 부탁하고 파싱하는 방식은 마크다운 코드펜스나 앞뒤 설명이 섞여 들어와 깨진다.
 */
import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

import { AppConfigService } from '../config/app-config.service';
import type { EnvVars } from '../config/env.validation';

/** 호출이 실패한 이유. 그대로 DB 의 fallbackReason 에 남고 응답에도 실린다. */
export type ClaudeFailureReason =
  | 'DISABLED' // 키가 없거나 해당 기능의 AI 스위치가 꺼져 있다
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'OVERLOADED' // 529 — Anthropic 쪽 일시 과부하. 잠시 뒤 재시도하면 대개 된다.
  | 'AUTH_FAILED'
  | 'REFUSED' // 안전 분류기가 요청을 거절
  | 'MAX_TOKENS' // 출력이 잘려 JSON 이 불완전
  | 'BAD_JSON'
  | 'API_ERROR';

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
}

export type ClaudeJsonResult<T> =
  | { ok: true; data: T; usage: ClaudeUsage }
  | { ok: false; reason: ClaudeFailureReason; message: string };

export interface GenerateJsonParams {
  system: string;
  user: string;
  /** JSON Schema. `additionalProperties: false` 와 `required` 가 있어야 한다. */
  schema: Record<string, unknown>;
  maxTokens: number;
  /**
   * 이 호출만 다른 추론 강도를 쓴다. 생략하면 ANTHROPIC_EFFORT.
   *
   * 작업 성격이 다르기 때문에 필요하다. 여행코스 설계는 여러 후보를 견줘야 해서
   * 생각할 시간이 필요하지만, 가맹점 분류는 "본죽이 뭐 파는 곳인가" 같은 지식 조회에 가까워
   * 오래 생각한다고 정답률이 오르지 않는다 — 응답만 느려진다.
   */
  effort?: EnvVars['ANTHROPIC_EFFORT'];
  /**
   * 이 호출만 다른 타임아웃을 쓴다 (ms). 생략하면 ANTHROPIC_TIMEOUT_MS.
   *
   * 전역 기본값은 "발표 중 화면이 멈추면 안 된다"를 기준으로 짧게 잡혀 있다.
   * 하지만 동기화처럼 로딩 화면이 이미 떠 있는 배치 작업은 조금 더 기다려도 되고,
   * 여기서 타임아웃이 나면 오히려 재시도까지 겹쳐 전체가 더 느려진다.
   */
  timeoutMs?: number;
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | null = null;

  constructor(private readonly config: AppConfigService) {}

  /**
   * 호출 가능한 상태인가 — **키가 있는가만 본다.**
   *
   * "이 기능에 AI 를 쓸 것인가"는 여기서 판단하지 않는다. 분류·페르소나·여행코스는
   * 각자 독립된 스위치를 갖고, 호출부가 자기 플래그를 먼저 확인한 뒤 이 서비스를 부른다.
   */
  get available(): boolean {
    return this.config.anthropicConfigured;
  }

  get model(): string {
    return this.config.anthropicModel;
  }

  /** 클라이언트는 실제로 필요할 때 한 번만 만든다 (키가 없는 환경에서 부팅을 막지 않으려고). */
  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: this.config.anthropicApiKey,
        // SDK 기본 재시도는 2회다. 발표에서 429/5xx 로 오래 붙잡히지 않도록 1회로 줄인다.
        maxRetries: 1,
        // 단위: 밀리초 (TypeScript SDK 는 초가 아니다)
        timeout: this.config.anthropicTimeoutMs,
      });
    }
    return this.client;
  }

  /**
   * JSON 스키마에 맞는 응답을 받아온다.
   *
   * `claude-opus-5` 는 thinking 이 기본 on 이고 그 토큰도 `max_tokens` 에 포함되므로,
   * 호출부는 최종 JSON 길이보다 넉넉하게 잡아야 한다. (부족하면 MAX_TOKENS 로 잘린다)
   */
  async generateJson<T>(params: GenerateJsonParams): Promise<ClaudeJsonResult<T>> {
    if (!this.available) {
      return {
        ok: false,
        reason: 'DISABLED',
        message: 'ANTHROPIC_API_KEY 가 없거나 AI_COURSE_ENABLED=false 입니다.',
      };
    }

    // 여기서 재는 것은 도메인 시각이 아니라 **HTTP 왕복에 걸린 시간**이다.
    // ClockService 는 demo/fast-forward 로 며칠씩 앞당길 수 있어 경과시간 측정에 쓰면 안 되고,
    // Date.now() 는 시스템 시각 변경에 흔들린다. 단조 시계인 performance.now() 가 맞다.
    const startedAt = performance.now();

    const timeoutMs = params.timeoutMs ?? this.config.anthropicTimeoutMs;

    try {
      const response = await this.getClient().messages.create(
        {
          model: this.config.anthropicModel,
          max_tokens: params.maxTokens,
          system: params.system,
          output_config: {
            effort: params.effort ?? this.config.anthropicEffort,
            format: { type: 'json_schema', schema: params.schema },
          },
          messages: [{ role: 'user', content: params.user }],
        },
        // 클라이언트 기본 타임아웃을 이 호출에서만 덮어쓴다.
        { timeout: timeoutMs },
      );

      const latencyMs = Math.round(performance.now() - startedAt);

      // stop_reason 을 content 보다 먼저 본다 — 거절이면 content 가 비어 있다.
      if (response.stop_reason === 'refusal') {
        this.logger.warn(
          `Claude 가 요청을 거절했습니다 (category=${response.stop_details?.category ?? 'unknown'})`,
        );
        return { ok: false, reason: 'REFUSED', message: '모델이 요청을 거절했습니다.' };
      }
      if (response.stop_reason === 'max_tokens') {
        this.logger.warn(`출력이 max_tokens(${params.maxTokens})에서 잘렸습니다.`);
        return { ok: false, reason: 'MAX_TOKENS', message: '응답이 잘려 JSON 이 불완전합니다.' };
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      if (text.trim().length === 0) {
        return { ok: false, reason: 'BAD_JSON', message: '응답 본문이 비어 있습니다.' };
      }

      let data: T;
      try {
        data = JSON.parse(text) as T;
      } catch {
        this.logger.warn(`JSON 파싱 실패: ${text.slice(0, 200)}`);
        return { ok: false, reason: 'BAD_JSON', message: 'JSON 파싱에 실패했습니다.' };
      }

      this.logger.log(
        `Claude 호출 성공 (${latencyMs}ms, in=${response.usage.input_tokens} out=${response.usage.output_tokens})`,
      );

      return {
        ok: true,
        data,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          latencyMs,
          model: response.model,
        },
      };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const { reason, message } = this.classifyError(error, timeoutMs);
      // 스택 전체를 찍지 않는다 — 실패해도 폴백으로 이어지는 정상 경로라 로그를 어지럽힐 뿐이다.
      this.logger.warn(`Claude 호출 실패 (${latencyMs}ms, ${reason}): ${message}`);
      return { ok: false, reason, message };
    }
  }

  /** SDK 의 타입 있는 예외로 분기한다. 메시지 문자열 매칭은 하지 않는다. */
  private classifyError(
    error: unknown,
    timeoutMs: number,
  ): { reason: ClaudeFailureReason; message: string } {
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return { reason: 'TIMEOUT', message: `${timeoutMs}ms 안에 응답이 없었습니다.` };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { reason: 'RATE_LIMITED', message: '요청 한도를 초과했습니다.' };
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return { reason: 'AUTH_FAILED', message: 'ANTHROPIC_API_KEY 가 유효하지 않습니다.' };
    }
    if (error instanceof Anthropic.APIError) {
      // 529 overloaded_error 는 서버 과부하라 잠시 뒤면 대개 풀린다.
      // 코드가 잘못된 것과 구분해야 폴백 캐시 정책(재시도 여부)을 다르게 줄 수 있다.
      if (error.status === 529) {
        return { reason: 'OVERLOADED', message: 'Anthropic API 가 일시적으로 과부하 상태입니다.' };
      }
      return { reason: 'API_ERROR', message: `${error.status ?? '?'} ${error.message}` };
    }
    return {
      reason: 'API_ERROR',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
