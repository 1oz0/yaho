/**
 * AI 여행코스 프롬프트 · 출력 스키마 — 순수 함수.
 *
 * ── 모델에게 무엇을 맡기고 무엇을 안 맡기는가 ────────────────────────────────
 * 맡긴다   : 어떤 경유지를 고를지, 어떤 순서로 돌지, 그리고 문구(제목·설명·팁)
 * 안 맡긴다 : 금액, 체류 시간, 도착 시각, 총합
 *
 * 금액과 시간을 모델이 쓰게 하면 두 가지가 깨진다.
 *   1. 합계가 안 맞는다 — 총액이 경유지 금액의 합과 어긋나도 아무도 모른다
 *   2. 재현되지 않는다 — 같은 화면을 두 번 열면 숫자가 달라진다
 * 그래서 숫자는 전부 시드 데이터에서 가져오고 서버가 더한다. 평가기준 ③
 * ("핵심 계산 로직이 AI 없이 결정론적으로 동작하는가") 을 여행코스에서도 지키는 방식이다.
 *
 * 장소도 마찬가지로 **시드에 있는 경유지 중에서만** 고르게 한다. 존재하지 않는 식당을
 * 지어내면 좌표를 붙일 수 없어 지도에 못 찍고, 무엇보다 사용자가 헛걸음한다.
 */

export interface CoursePromptPersona {
  code: string;
  displayName: string;
  tagline: string;
  timeBandLabel: string;
  categoryLabel: string;
  /** 최다 지출 카테고리의 월평균 (원) */
  topCategoryAmount: number;
  /** 월평균 총지출 (원) */
  monthlyAvgTotalAmount: number;
  /** 또래 대비 지출 배수 (1.5 = 1.5배) */
  spendingRatio: number;
}

export interface CoursePromptDestination {
  name: string;
  province: string;
  tagline: string;
  summary: string;
  recommendedNights: number;
}

export interface CandidateStop {
  placeName: string;
  description: string;
  stopType: string;
  stayMinutes: number;
  estimatedAmount: number;
  /** 어떤 시드 루트에서 왔는지 — 모델이 테마를 참고할 수 있게 알려준다 */
  routeTitle: string;
  routeTheme: string;
  /** 야호 제휴 할인율 (%). 있으면 프롬프트에 표시해 모델이 예산 감각을 갖게 한다. */
  discountRate?: number;
}

export interface CoursePromptInput {
  persona: CoursePromptPersona;
  destination: CoursePromptDestination;
  /** 절약으로 확보한 여행 예산 (원) */
  budgetAmount: number;
  candidates: CandidateStop[];
}

/** 모델이 채워야 하는 출력 형태 */
export interface AiCourseDraft {
  title: string;
  summary: string;
  personaFitReason: string;
  budgetNote: string;
  /** "HH:MM" — Day 1 시작 시각. 이후 도착 시각은 서버가 계산한다. */
  startTime: string;
  packingTips: string[];
  stops: { placeName: string; day: 1 | 2; activity: string; personaTip: string }[];
}

export const MIN_COURSE_STOPS = 5;
export const MAX_COURSE_STOPS = 8;
/** Day1 은 숙소를 포함해 최소 3곳 */
export const MIN_DAY1_STOPS = 3;
/** Day2 는 최소 2곳 — 1곳이면 "1박 2일" 이라 부를 수 없다 */
export const MIN_DAY2_STOPS = 2;

/**
 * structured outputs 용 JSON 스키마.
 *
 * 지원되지 않는 제약(minLength/maxLength/minItems/maxItems)은 넣지 않는다 —
 * 개수·길이 검증은 서버의 course-builder 가 한다.
 */
export const AI_COURSE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'personaFitReason', 'budgetNote', 'startTime', 'packingTips', 'stops'],
  properties: {
    title: { type: 'string', description: '코스 제목. 15자 내외의 한국어.' },
    summary: { type: 'string', description: '코스 한 줄 요약. 60자 내외.' },
    personaFitReason: {
      type: 'string',
      description:
        '왜 이 코스가 이 사용자에게 맞는지 2~3문장. 사용자의 소비 습관을 구체적으로 언급할 것.',
    },
    budgetNote: {
      type: 'string',
      description: '예산에 대한 한 줄 코멘트. 아낀 돈이 이 여행이 됐다는 맥락을 담을 것.',
    },
    startTime: {
      type: 'string',
      description: 'HH:MM 24시간 형식의 **Day 1** 시작 시각. Day 2 는 서버가 아침으로 고정한다.',
    },
    packingTips: {
      type: 'array',
      description: '준비물이나 실용 팁 2~4개. 각 30자 내외.',
      items: { type: 'string' },
    },
    stops: {
      type: 'array',
      description:
        `방문할 경유지 ${MIN_COURSE_STOPS}~${MAX_COURSE_STOPS}곳을 방문 순서대로. ` +
        'Day1 을 먼저 전부 적고 그다음 Day2 를 적을 것.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['placeName', 'day', 'activity', 'personaTip'],
        properties: {
          placeName: {
            type: 'string',
            description: '후보 목록에 있는 장소명을 글자 하나까지 똑같이 적을 것.',
          },
          day: {
            type: 'integer',
            enum: [1, 2],
            description: '첫째 날이면 1, 둘째 날이면 2. 숙소[STAY]는 반드시 1이다.',
          },
          activity: { type: 'string', description: '여기서 무엇을 하는지 한 문장.' },
          personaTip: {
            type: 'string',
            description: '이 사용자의 소비 습관에 맞춘 한 줄 조언. 40자 내외.',
          },
        },
      },
    },
  },
};

export function buildSystemPrompt(): string {
  return [
    '당신은 전라남·북도와 광주 지역을 20년간 안내해 온 여행 플래너입니다.',
    '과소비를 줄여 모은 돈으로 인구소멸위험지역을 여행하려는 사용자에게 1박 2일 코스를 짜 줍니다.',
    '',
    '## 반드시 지킬 것 — 1박 2일 코스입니다',
    '- 경유지는 사용자가 제시한 **후보 목록 안에서만** 고릅니다. 목록에 없는 장소를 만들어내지 마세요.',
    '- 장소명은 후보 목록의 표기를 **글자 하나까지 그대로** 옮겨 적습니다.',
    `- 경유지는 모두 합쳐 ${MIN_COURSE_STOPS}~${MAX_COURSE_STOPS}곳을 고르고, 같은 곳을 두 번 넣지 않습니다.`,
    `- **Day 1 은 숙소를 포함해 ${MIN_DAY1_STOPS}곳 이상, Day 2 는 ${MIN_DAY2_STOPS}곳 이상**입니다.`,
    '- **[STAY] 로 표시된 숙소를 정확히 하나 고르고, Day 1 의 마지막에 둡니다.**',
    '  숙소에 들렀다가 다시 관광지로 나가는 동선은 안 됩니다.',
    '- Day 2 는 아침에 시작해 이른 오후에 끝냅니다 (광주로 돌아가야 합니다).',
    '- 이동 동선을 고려해 순서를 정합니다. 식사는 식사 시간대에 배치합니다.',
    '- 금액과 체류 시간은 **쓰지 않습니다.** 서버가 실제 데이터로 계산합니다.',
    '',
    '## 문체',
    '- 한국어 존댓말. 담백하고 구체적으로 씁니다.',
    '- 사용자의 소비 습관을 판단하거나 훈계하지 않습니다. "그동안 아낀 덕분"이라는 톤을 유지합니다.',
    '- 이모지, 과장된 감탄사, "~해보세요!" 같은 광고 문구는 쓰지 않습니다.',
  ].join('\n');
}

const won = (n: number): string => `${n.toLocaleString('ko-KR')}원`;

export function buildUserPrompt(input: CoursePromptInput): string {
  const { persona, destination, budgetAmount, candidates } = input;

  const candidateLines = candidates.map(
    (c) =>
      `- ${c.placeName} [${c.stopType}] — ${c.description} ` +
      `(체류 ${c.stayMinutes}분 · ${won(c.estimatedAmount)}` +
      `${c.discountRate ? ` · 야호 제휴 ${c.discountRate}% 할인` : ''}` +
      ` · 출처 루트 "${c.routeTitle}"/${c.routeTheme})`,
  );

  return [
    '## 사용자 페르소나',
    `- 유형: ${persona.displayName} (${persona.tagline})`,
    `- 주 소비 시간대: ${persona.timeBandLabel}`,
    `- 최다 지출 항목: ${persona.categoryLabel} — 월평균 ${won(persona.topCategoryAmount)}`,
    `- 월평균 총지출: ${won(persona.monthlyAvgTotalAmount)} (또래 평균의 ${persona.spendingRatio.toFixed(2)}배)`,
    '',
    '## 여행지',
    `- ${destination.name} (${destination.province}) — ${destination.tagline}`,
    `- ${destination.summary}`,
    `- 권장 숙박: ${destination.recommendedNights}박`,
    '',
    '## 예산',
    `- 절약으로 확보한 금액: ${won(budgetAmount)}`,
    '',
    '## 경유지 후보',
    ...candidateLines,
    '',
    '## 요청',
    `위 후보 중에서 이 사용자에게 맞는 ${destination.name} **1박 2일** 코스를 짜 주세요.`,
    '[STAY] 로 표시된 숙소를 하나 골라 Day 1 의 마지막에 두고, Day 2 는 아침부터 이른 오후까지로 짭니다.',
    `"${persona.categoryLabel}"에 돈을 많이 쓰던 사람이 그 습관을 여행에서 어떻게 다르게 쓸 수 있는지가 드러나면 좋습니다.`,
  ].join('\n');
}
