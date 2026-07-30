/**
 * AI 거래 분류 프롬프트 · 출력 스키마 — 순수 함수. NestJS 의존 없음.
 *
 * ── 왜 "거래 단위"가 아니라 "가맹점 단위"인가 ────────────────────────────────
 * 6개월 거래 424건을 정규화하면 서로 다른 가맹점은 80개 남짓이다.
 * 건별로 물으면 424번, 가맹점별로 물으면 80번이고 배치로 묶으면 호출 2회로 끝난다.
 *
 * 비용만의 문제가 아니다. 건별로 물으면 **같은 가맹점이 다른 카테고리로 갈라진다.**
 * "배민)김밥천국" 이 어떤 달은 배달음식, 어떤 달은 외식이 되면 카테고리별 월평균이
 * 흔들리고, 그 위에 얹힌 절약 목표 슬라이더 상한과 챌린지 진척률까지 같이 흔들린다.
 * 가맹점 단위로 한 번만 판정하면 그런 일이 없다.
 *
 * ── 모델에게 무엇을 맡기고 무엇을 안 맡기는가 ────────────────────────────────
 * 맡긴다   : 이 가맹점이 12종 중 어디에 속하는가, 그리고 그 확신도
 * 안 맡긴다 : 금액 집계, 정기결제 판정, 수입·이체·취소 제외, 사용자가 직접 고친 규칙
 *
 * 수입/이체/취소는 거래유형(txType)이 이미 말해주는 **사실**이라 판단할 게 없다.
 * 정기결제는 "매월 같은 날 ±5% 금액이 3회 이상"이라는 주기 계산이라 산술이 정확하다.
 * 모델에게 물으면 느려지고 틀릴 뿐이다.
 */
import { SPENDABLE_CATEGORIES } from '../../common/constants/tx-category';

/** 모델이 고를 수 있는 카테고리 — 지출 12종 + 고정지출 + 모르겠음 */
export const AI_CLASSIFIABLE_CATEGORIES = [
  ...SPENDABLE_CATEGORIES,
  'FIXED_BILLS',
  'UNCLASSIFIED',
] as const;

export type AiClassifiableCategory = (typeof AI_CLASSIFIABLE_CATEGORIES)[number];

export const AI_CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type AiConfidence = (typeof AI_CONFIDENCES)[number];

/** 모델에게 보여줄 가맹점 한 건 */
export interface MerchantForClassification {
  /** normalizer.ts 를 통과한 이름 — 응답을 되짚는 키 */
  normalizedMerchant: string;
  /** 화면에 찍히는 원본 이름. 채널 접두("배민)")가 살아 있어 단서가 된다. */
  sampleMerchantName: string;
  /** 이 가맹점의 거래 건수 */
  txCount: number;
  /** 평균 결제액 (원) — 3천원이면 편의점, 30만원이면 쇼핑 쪽이다 */
  avgAmount: number;
  /** 결제가 가장 잦은 KST 시각 (0~23). 새벽 2시 결제는 배달일 확률이 높다. */
  peakHour: number | null;
  /** 업종코드. 있으면 강한 단서다. */
  mcc: string | null;
}

export interface ClassifyPromptInput {
  merchants: MerchantForClassification[];
}

/** 모델이 돌려주는 판정 한 건 */
export interface AiMerchantVerdict {
  normalizedMerchant: string;
  category: string;
  confidence: string;
  /** 왜 그렇게 봤는지 한 줄. 로그로만 쓰고 화면에는 안 나간다. */
  reason: string;
}

export interface AiClassifyDraft {
  verdicts: AiMerchantVerdict[];
}

// ---------------------------------------------------------------------------
// 프롬프트
// ---------------------------------------------------------------------------

const CATEGORY_GUIDE = [
  'DELIVERY_FOOD  배달음식 — 배달앱을 거친 주문. "배민)", "쿠팡이츠)", "요기요)" 접두가 붙는다.',
  'DINING_OUT     외식 — 식당에서 직접 결제. 같은 식당이라도 배달앱을 안 거쳤으면 여기다.',
  'CAFE_SNACK     카페+간식 — 커피, 베이커리, 디저트, 아이스크림.',
  'ALCOHOL_NIGHTLIFE 술+유흥 — 주점, 이자카야, 호프, 포차, 바.',
  'TRANSPORT_CAR  교통+자동차 — 대중교통, 택시, 주유, 주차, 통행료, 정비.',
  'SHOPPING       쇼핑 — 의류, 잡화, 가전, 온라인 종합몰. 식료품 장보기도 여기.',
  'GAME_INAPP     게임+인앱 — 게임 결제, 앱스토어·구글플레이 인앱.',
  'SUBSCRIPTION_OTT 구독+OTT — 넷플릭스, 유튜브 프리미엄, 멜론, 쿠팡와우 같은 월 구독.',
  'CONVENIENCE_STORE 편의점 — GS25, CU, 세븐일레븐 등.',
  'HEALTH_FITNESS 의료+건강+피트니스 — 병원, 약국, 헬스장, 필라테스.',
  'EDUCATION      교육 — 학원, 인강, 도서, 자격증 응시료.',
  'TRAVEL_STAY    여행+숙박 — 호텔, 펜션, 항공, 숙박앱.',
  'FIXED_BILLS    고정지출 — 통신요금, 보험료, 공과금, 월세. 줄이기 어려운 진짜 고정비.',
  'UNCLASSIFIED   모르겠음 — 단서가 부족해 추측이 될 것 같으면 여기로.',
].join('\n  ');

export function buildClassifySystemPrompt(): string {
  return [
    '당신은 한국 카드·계좌 거래내역을 소비 카테고리로 분류하는 전문가입니다.',
    '가맹점 목록을 받아 각각을 아래 카테고리 중 하나로 판정하세요.',
    '',
    '## 카테고리',
    `  ${CATEGORY_GUIDE}`,
    '',
    '## 판정 원칙',
    '1. **한국 가맹점 상호에 대한 지식을 적극적으로 쓰세요.** 규칙 사전이 못 잡는 지역 상호,',
    '   신규 브랜드, 줄임말이 이 분류의 핵심 가치입니다. "본죽", "역전할머니맥주", "무신사"',
    '   같은 이름은 사전에 없어도 무엇을 파는 곳인지 알 수 있습니다.',
    '2. 원본 이름의 채널 접두를 놓치지 마세요. `배민)`, `쿠팡이츠)`, `요기요)` 가 붙어 있으면',
    '   식당 이름이 무엇이든 DELIVERY_FOOD 입니다. 접두가 없는 같은 상호는 DINING_OUT 입니다.',
    '3. 평균 결제액과 결제 시각을 보조 단서로 쓰세요. 평균 3천원·건수 다수는 편의점이나 카페에',
    '   가깝고, 새벽 시간대 음식 결제는 배달일 확률이 높습니다.',
    '4. **모르면 UNCLASSIFIED 를 쓰세요.** 억지로 맞히지 마세요. 사용자에게 직접 물어보는',
    '   화면이 따로 있어서, 확신 없는 추측보다 "모르겠다"가 훨씬 낫습니다.',
    '5. confidence 는 정직하게 매기세요. HIGH 는 상호만 봐도 확실할 때, MEDIUM 은 정황상',
    '   그럴듯할 때, LOW 는 추측일 때입니다. LOW 로 준 판정은 서버가 규칙 엔진으로 되돌립니다.',
    '',
    '## 지켜야 할 것',
    '- 입력에 있는 모든 가맹점을 빠짐없이 판정하세요. 개수가 맞아야 합니다.',
    '- `normalizedMerchant` 는 **입력에 있는 문자열을 글자 그대로** 돌려주세요. 다듬거나 고치면',
    '  서버가 어느 가맹점의 판정인지 되짚지 못해 그 건이 통째로 버려집니다.',
    '- reason 은 한국어 40자 이내로 짧게 쓰세요.',
  ].join('\n');
}

export function buildClassifyUserPrompt(input: ClassifyPromptInput): string {
  const lines = input.merchants.map((m, i) => {
    const parts = [
      `${i + 1}. 정규화명: "${m.normalizedMerchant}"`,
      `원본: "${m.sampleMerchantName}"`,
      `${m.txCount}건`,
      `평균 ${m.avgAmount.toLocaleString('ko-KR')}원`,
    ];
    if (m.peakHour !== null) parts.push(`주로 ${m.peakHour}시`);
    if (m.mcc) parts.push(`MCC ${m.mcc}`);
    return `  ${parts.join(' · ')}`;
  });

  return [
    `가맹점 ${input.merchants.length}곳을 분류해 주세요.`,
    '',
    ...lines,
    '',
    `${input.merchants.length}곳 전부에 대해 판정을 돌려주세요.`,
  ].join('\n');
}

export const AI_CLASSIFY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      description: '입력한 가맹점 수와 같아야 한다.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['normalizedMerchant', 'category', 'confidence', 'reason'],
        properties: {
          normalizedMerchant: {
            type: 'string',
            description: '입력에 있던 정규화명을 글자 그대로.',
          },
          category: { type: 'string', enum: [...AI_CLASSIFIABLE_CATEGORIES] },
          confidence: { type: 'string', enum: [...AI_CONFIDENCES] },
          reason: { type: 'string', description: '한국어 40자 이내' },
        },
      },
    },
  },
} as const satisfies Record<string, unknown>;

// ---------------------------------------------------------------------------
// 검증 — 모델 출력은 신뢰하지 않는다
// ---------------------------------------------------------------------------

export interface AcceptedVerdict {
  normalizedMerchant: string;
  category: AiClassifiableCategory;
  confidence: AiConfidence;
  reason: string;
}

export interface ValidatedVerdicts {
  /** 실제로 채택한 판정 */
  accepted: AcceptedVerdict[];
  /** 요청했는데 답이 안 온 가맹점 */
  missing: string[];
  /** 요청하지 않은 가맹점을 지어냈다 */
  unknown: string[];
  /** confidence 가 LOW 라 규칙 엔진으로 되돌린 가맹점 */
  lowConfidence: string[];
}

function isClassifiableCategory(value: string): value is AiClassifiableCategory {
  return (AI_CLASSIFIABLE_CATEGORIES as readonly string[]).includes(value);
}

function isConfidence(value: string): value is AiConfidence {
  return (AI_CONFIDENCES as readonly string[]).includes(value);
}

/**
 * 모델 출력을 검증해 채택 가능한 판정만 남긴다.
 *
 * 버리는 경우는 넷이다.
 *   - 요청하지 않은 가맹점 (환각)
 *   - 같은 가맹점에 대한 중복 판정 (먼저 온 것을 쓴다)
 *   - 카테고리·확신도가 열거값 밖
 *   - UNCLASSIFIED 이거나 confidence 가 LOW
 *
 * 마지막 둘은 실패가 아니라 **정상 경로**다. 모델이 "모르겠다"고 한 것이므로
 * 규칙 엔진(키워드 사전 → MCC → 정기결제)이 이어서 판단하고, 그것도 실패하면
 * 사용자에게 물어보는 화면으로 넘어간다.
 */
export function validateVerdicts(
  draft: AiClassifyDraft | null | undefined,
  requested: readonly string[],
): ValidatedVerdicts {
  const requestedSet = new Set(requested);
  const seen = new Set<string>();
  const accepted: AcceptedVerdict[] = [];
  const unknown: string[] = [];
  const lowConfidence: string[] = [];

  for (const v of draft?.verdicts ?? []) {
    const key = typeof v?.normalizedMerchant === 'string' ? v.normalizedMerchant : '';
    if (!requestedSet.has(key)) {
      if (key.length > 0) unknown.push(key);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);

    if (typeof v.category !== 'string' || !isClassifiableCategory(v.category)) continue;
    if (typeof v.confidence !== 'string' || !isConfidence(v.confidence)) continue;

    // 모델이 스스로 모른다고 한 것은 규칙 엔진에 넘긴다.
    if (v.category === 'UNCLASSIFIED' || v.confidence === 'LOW') {
      lowConfidence.push(key);
      continue;
    }

    accepted.push({
      normalizedMerchant: key,
      category: v.category,
      confidence: v.confidence,
      reason: typeof v.reason === 'string' ? v.reason.slice(0, 100) : '',
    });
  }

  const missing = requested.filter((m) => !seen.has(m));

  return { accepted, missing, unknown, lowConfidence };
}

/** 가맹점 목록을 배치 크기로 자른다 */
export function chunkMerchants<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [[...items]];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
