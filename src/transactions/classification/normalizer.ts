/**
 * 가맹점명 정규화 — 순수 함수, 분류 파이프라인 1순위.
 *
 * 실제 카드 명세서의 가맹점명은 이런 모양으로 온다:
 *   "배민)한식대첩 광주상무점"  "(주)아웃백스테이크하우스"  "GS25 광주치평점"
 *
 * 여기서 두 가지를 뽑아낸다.
 *   normalized  — 지점·사업자 형태·공백·특수문자를 걷어낸 core. 같은 가게를 묶는 키.
 *   channel     — "배민)" 같은 배달 채널 접두. 별도로 보관한다.
 *
 * ⚠️ 채널을 그냥 버리면 안 된다.
 *    "배민)한식대첩" 에서 "배민)" 을 지우면 "한식대첩" 만 남아 외식(DINING)으로 분류된다.
 *    배달인지 외식인지는 채널이 결정하므로, 채널을 살려 매칭 문자열에 합쳐준다.
 *    그래서 결과가 3개다: normalized(묶기용) / channel / matchTarget(규칙 매칭용).
 */

export interface NormalizedMerchant {
  /** 지점·사업자형태·공백·특수문자를 제거한 core. 같은 가맹점 묶기와 UserMerchantRule 키로 쓴다. */
  normalized: string;
  /** 배달 채널 접두. 없으면 null. */
  channel: string | null;
  /** 전역 키워드 사전 매칭에 쓰는 문자열 = channel + normalized */
  matchTarget: string;
}

/** 배달 채널 접두 표기. "배민)" 처럼 닫는 괄호로 끝나는 형태가 일반적이다. */
const CHANNEL_PREFIXES = [
  '배민',
  '배달의민족',
  '쿠팡이츠',
  '요기요',
  '땡겨요',
  '배달통',
] as const;

/** 사업자 형태 표기 */
const BUSINESS_FORMS = [
  '주식회사',
  '유한회사',
  '합자회사',
  '(주)',
  '（주）',
  '(유)',
  '㈜',
];

/**
 * 지점 접미사.
 * "광주상무점" → 제거, "송정떡갈비" → 유지되어야 하므로 "점" 하나만 보고 자르면 안 된다.
 * 1~10자 + (점|지점|직영점|본점|센터) 형태가 **문자열 끝**에 올 때만 제거한다.
 */
const BRANCH_SUFFIX = /[가-힣A-Za-z0-9]{1,10}(직영점|지점|본점|센터|점)$/;

/** 남길 문자: 한글/영문/숫자만. 나머지(공백·괄호·하이픈·별표 등)는 제거. */
const NON_ALNUM_HANGUL = /[^0-9A-Za-z가-힣]/g;

/**
 * 가맹점명을 정규화한다.
 *
 * @example
 * normalizeMerchantName('배민)한식대첩 광주상무점')
 * // { normalized: '한식대첩', channel: '배민', matchTarget: '배민한식대첩' }
 *
 * normalizeMerchantName('(주)아웃백스테이크하우스 광주점')
 * // { normalized: '아웃백스테이크하우스', channel: null, matchTarget: '아웃백스테이크하우스' }
 */
export function normalizeMerchantName(raw: string): NormalizedMerchant {
  let work = (raw ?? '').trim();

  // 1) 배달 채널 접두 분리 — "배민)" / "배민 )" / "배민]" 등 구분자를 관대하게 받는다
  let channel: string | null = null;
  for (const prefix of CHANNEL_PREFIXES) {
    const pattern = new RegExp(`^${prefix}\\s*[)\\]:>\\-]\\s*`);
    if (pattern.test(work)) {
      channel = prefix;
      work = work.replace(pattern, '');
      break;
    }
  }

  // 2) 사업자 형태 제거 (문자열 어디에 있든)
  for (const form of BUSINESS_FORMS) {
    work = work.split(form).join('');
  }

  // 3) 지점 접미사 제거 — 공백이 남아 있는 상태에서 판단해야 정확하다.
  //    "GS25 광주치평점" → 마지막 토큰이 지점명이므로 그것만 떼어낸다.
  work = stripBranchSuffix(work);

  // 4) 공백·특수문자 제거 후 영문 소문자화
  const normalized = work.replace(NON_ALNUM_HANGUL, '').toLowerCase();

  return {
    normalized,
    channel,
    matchTarget: channel ? `${channel}${normalized}` : normalized,
  };
}

/**
 * 끝에 붙은 지점 표기를 제거한다.
 *
 * **공백으로 분리된 마지막 토큰일 때만** 제거한다.
 *   "GS25 광주치평점"  → "GS25"
 *   "역전할머니맥주 광주상무점" → "역전할머니맥주"
 *
 * 공백 없이 붙어 있는 경우("스타벅스광주상무점")는 손대지 않는다.
 * 상호와 지점명의 경계를 사전 없이 알아낼 방법이 없어서, 억지로 자르면
 * "스타벅스광주상무" 처럼 엉뚱하게 잘린다. 그대로 두어도 전역 키워드 사전이
 * 부분문자열로 매칭하므로 분류에는 지장이 없다 — 같은 가맹점 묶기 정확도만
 * 조금 떨어지고, 이는 잘못 자르는 것보다 훨씬 안전한 실패다.
 */
function stripBranchSuffix(value: string): string {
  const trimmed = value.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return trimmed;

  const last = tokens[tokens.length - 1];
  if (!BRANCH_SUFFIX.test(last)) return trimmed;

  const remainder = tokens.slice(0, -1).join(' ').trim();
  // 지점명만 남는 경우(상호가 통째로 지점 형태)는 원본을 유지한다.
  return remainder.length >= 2 ? remainder : trimmed;
}

/** 정규화 결과가 사실상 비어 있는지 (분류 불가 판정에 쓴다) */
export function isEmptyNormalized(value: string): boolean {
  return value.trim().length === 0;
}
