/**
 * AI 페르소나 축 선정 — Claude 호출과 검증만 담당한다.
 *
 * ── 이 서비스가 지키는 계약 ─────────────────────────────────────────────────
 * **절대 throw 하지 않는다.** 실패하면 `ok: false` 를 돌려주고 호출부가 규칙 기반으로 간다.
 *
 * DB 도 만지지 않는다. 저장은 PersonaService 한 곳에서만 한다 —
 * 페르소나 이력(UserPersona)은 "산출 시점의 사실"을 보존하는 자리라
 * 쓰는 곳이 둘로 갈라지면 스냅샷 일관성이 깨진다.
 */
import { Injectable, Logger } from '@nestjs/common';

import { ClaudeService } from '../ai/claude.service';
import { AppConfigService } from '../config/app-config.service';
import {
  AI_PERSONA_JSON_SCHEMA,
  buildPersonaSystemPrompt,
  buildPersonaUserPrompt,
  validatePersonaDraft,
  type AiPersonaDraft,
  type PersonaPromptInput,
  type ValidatedPersonaAxes,
} from './ai-persona-prompt';

/**
 * 출력 JSON 은 300 토큰이 안 되지만 claude-opus-5 는 thinking 이 기본 on 이고
 * 그 토큰도 max_tokens 에 포함된다. 축 선택은 비교·판단이 필요한 작업이라
 * 생각을 많이 하는 편이 결과가 낫다.
 */
const MAX_TOKENS = 6_000;

export type AiPersonaResult =
  | { ok: true; axes: ValidatedPersonaAxes; modelName: string; latencyMs: number }
  | { ok: false; reason: string };

@Injectable()
export class AiPersonaService {
  private readonly logger = new Logger(AiPersonaService.name);

  constructor(
    private readonly claude: ClaudeService,
    private readonly config: AppConfigService,
  ) {}

  get enabled(): boolean {
    return this.config.aiPersonaEnabled;
  }

  async selectAxes(input: PersonaPromptInput): Promise<AiPersonaResult> {
    if (!this.enabled) return { ok: false, reason: 'DISABLED' };

    const result = await this.claude.generateJson<AiPersonaDraft>({
      system: buildPersonaSystemPrompt(),
      user: buildPersonaUserPrompt(input),
      schema: AI_PERSONA_JSON_SCHEMA,
      maxTokens: MAX_TOKENS,
    });

    if (!result.ok) return { ok: false, reason: result.reason };

    const validated = validatePersonaDraft(result.data);
    if (!validated.ok) {
      this.logger.warn(`AI 페르소나 검증 실패: ${validated.reason}`);
      return { ok: false, reason: validated.reason };
    }

    const { timeBand, category } = validated.axes;
    const baseline = input.ruleBaseline;
    if (timeBand !== baseline.timeBand || category !== baseline.category) {
      // 규칙과 다른 결론이 나온 것 자체는 정상이다 — 그러라고 AI 를 쓴다.
      // 다만 얼마나 자주 갈리는지는 프롬프트 튜닝의 근거라 남겨 둔다.
      this.logger.log(
        `AI 가 규칙과 다른 축을 골랐습니다: ` +
          `규칙 ${baseline.timeBand}×${baseline.category} → AI ${timeBand}×${category}`,
      );
    }

    return {
      ok: true,
      axes: validated.axes,
      modelName: result.usage.model,
      latencyMs: result.usage.latencyMs,
    };
  }
}
