/**
 * 시드용 가맹점 카탈로그 — **12종 카테고리 기준**.
 *
 * ⚠️ 중요: 여기의 `intendedCategory` 는 **검증용 태그일 뿐 DB 에 저장되지 않는다.**
 *    MockTransaction 에는 카테고리 컬럼이 없다 (프롬프트 §4-1). 카테고리를 미리
 *    넣어두면 분류 엔진이 무의미해진다. 이 태그는 시드 말미 assert 에서
 *    "의도한 소비 패턴이 실제로 만들어졌는지" 확인하는 데만 쓴다.
 *
 * 가맹점명은 실제 카드 명세서에 찍히는 모양 그대로 쓴다.
 *   - 배달 채널 접두: "배민)", "쿠팡이츠)", "요기요)"
 *   - 지점 접미: "광주상무점", "충장로점"
 *   - 사업자 형태: "(주)", "주식회사"
 * 이걸 정규화해 분류하는 것이 normalizer 의 일이다.
 */
import type { TxCategory } from '../../../src/common/constants/tx-category';

export interface SeedMerchant {
  /** 가맹점 기본명 (지점 접미사 제외) */
  base: string;
  /** 업종코드. null 이면 명세서에 MCC 가 없는 경우. */
  mcc: string | null;
  /** 건당 평균 결제액(원) */
  meanAmount: number;
  /** 지점 접미사를 붙일지 */
  branch?: boolean;
  /**
   * 선택 가중치 (기본 1).
   * 대중교통처럼 자주 쓰는 곳은 높이고, 백화점·기차처럼 드문 곳은 낮춘다.
   * 이게 없으면 카테고리 평균 금액이 비싼 가맹점 쪽으로 심하게 끌려간다.
   */
  pickWeight?: number;
  /** 검증 전용 태그 — DB 에 저장하지 않는다 */
  intendedCategory: TxCategory;
}

/** 광주 지역 지점명 풀 — 데모 계정이 광주광역시 거주 20대 후반 직장인이다 */
export const BRANCH_POOL = [
  '광주상무점',
  '광주충장로점',
  '광주치평점',
  '광주수완점',
  '광주첨단점',
  '광주터미널점',
  '상무센트럴점',
  '광주풍암점',
] as const;

// ---------------------------------------------------------------------------
// 배달음식 — 평일 저녁·야간 집중, 월 15만원 이상 (발표 후킹 소재)
// ---------------------------------------------------------------------------
export const DELIVERY_MERCHANTS: SeedMerchant[] = [
  { base: '배민)한식대첩', mcc: '5812', meanAmount: 24000, branch: true, intendedCategory: 'DELIVERY_FOOD' },
  { base: '배민)교촌치킨', mcc: '5812', meanAmount: 28000, branch: true, intendedCategory: 'DELIVERY_FOOD' },
  { base: '배민)엽기떡볶이', mcc: '5812', meanAmount: 19000, branch: true, intendedCategory: 'DELIVERY_FOOD' },
  { base: '배민)유가네닭갈비', mcc: null, meanAmount: 26000, branch: true, intendedCategory: 'DELIVERY_FOOD' },
  { base: '쿠팡이츠)마라공방', mcc: '5812', meanAmount: 23000, branch: true, intendedCategory: 'DELIVERY_FOOD' },
  { base: '쿠팡이츠)버거킹', mcc: '5814', meanAmount: 17000, branch: true, intendedCategory: 'DELIVERY_FOOD' },
  { base: '요기요)피자스쿨', mcc: null, meanAmount: 21000, branch: true, intendedCategory: 'DELIVERY_FOOD' },
  { base: '배민)곱창고', mcc: '5812', meanAmount: 32000, branch: true, intendedCategory: 'DELIVERY_FOOD' },
  { base: '배민)명륜진사갈비', mcc: '5812', meanAmount: 30000, branch: true, intendedCategory: 'DELIVERY_FOOD' },
];

// ---------------------------------------------------------------------------
// 외식 (술집은 별도 축으로 분리했다)
// ---------------------------------------------------------------------------
export const DINING_MERCHANTS: SeedMerchant[] = [
  { base: '송정떡갈비', mcc: '5812', meanAmount: 32000, branch: true, pickWeight: 1, intendedCategory: 'DINING_OUT' },
  { base: '무등산보리밥', mcc: '5812', meanAmount: 14000, branch: false, pickWeight: 1.5, intendedCategory: 'DINING_OUT' },
  { base: '청기와타운', mcc: '5812', meanAmount: 38000, branch: true, pickWeight: 0.7, intendedCategory: 'DINING_OUT' },
  { base: '스시로', mcc: '5812', meanAmount: 29000, branch: true, pickWeight: 0.8, intendedCategory: 'DINING_OUT' },
  { base: '광주식당', mcc: null, meanAmount: 13000, branch: false, pickWeight: 1.5, intendedCategory: 'DINING_OUT' },
  { base: '(주)아웃백스테이크하우스', mcc: '5812', meanAmount: 47000, branch: true, pickWeight: 0.5, intendedCategory: 'DINING_OUT' },
  { base: '온기정', mcc: '5812', meanAmount: 16000, branch: true, pickWeight: 1.2, intendedCategory: 'DINING_OUT' },
];

// ---------------------------------------------------------------------------
// 술+유흥 — 저녁·심야. 외식에서 떼어낸 축.
// ---------------------------------------------------------------------------
export const ALCOHOL_MERCHANTS: SeedMerchant[] = [
  { base: '역전할머니맥주', mcc: '5813', meanAmount: 26000, branch: true, pickWeight: 2, intendedCategory: 'ALCOHOL_NIGHTLIFE' },
  { base: '생활맥주', mcc: '5813', meanAmount: 24000, branch: true, pickWeight: 1.5, intendedCategory: 'ALCOHOL_NIGHTLIFE' },
  { base: '광주포차', mcc: null, meanAmount: 31000, branch: false, pickWeight: 1.2, intendedCategory: 'ALCOHOL_NIGHTLIFE' },
  { base: '상무이자카야', mcc: '5813', meanAmount: 38000, branch: false, pickWeight: 1, intendedCategory: 'ALCOHOL_NIGHTLIFE' },
  { base: '코인노래연습장', mcc: null, meanAmount: 6000, branch: true, pickWeight: 1, intendedCategory: 'ALCOHOL_NIGHTLIFE' },
];

// ---------------------------------------------------------------------------
// 카페+간식 — 오전·점심 시간대 소액 다건
// ---------------------------------------------------------------------------
export const CAFE_MERCHANTS: SeedMerchant[] = [
  { base: '스타벅스', mcc: '5814', meanAmount: 5800, branch: true, pickWeight: 2, intendedCategory: 'CAFE_SNACK' },
  { base: '메가엠지씨커피', mcc: '5814', meanAmount: 2500, branch: true, pickWeight: 3, intendedCategory: 'CAFE_SNACK' },
  { base: '컴포즈커피', mcc: '5814', meanAmount: 2200, branch: true, pickWeight: 2.5, intendedCategory: 'CAFE_SNACK' },
  { base: '투썸플레이스', mcc: '5814', meanAmount: 7400, branch: true, pickWeight: 1, intendedCategory: 'CAFE_SNACK' },
  { base: '이디야커피', mcc: null, meanAmount: 4200, branch: true, pickWeight: 1.2, intendedCategory: 'CAFE_SNACK' },
  { base: '파리바게뜨', mcc: '5814', meanAmount: 6800, branch: true, pickWeight: 1.2, intendedCategory: 'CAFE_SNACK' },
  { base: '배스킨라빈스', mcc: null, meanAmount: 9500, branch: true, pickWeight: 0.6, intendedCategory: 'CAFE_SNACK' },
];

// ---------------------------------------------------------------------------
// 편의점 — 카페에서 떼어낸 축. 아침·퇴근길 소액 다건.
// ---------------------------------------------------------------------------
export const CONVENIENCE_MERCHANTS: SeedMerchant[] = [
  { base: 'GS25', mcc: '5499', meanAmount: 6300, branch: true, pickWeight: 3, intendedCategory: 'CONVENIENCE_STORE' },
  { base: 'CU', mcc: '5499', meanAmount: 5400, branch: true, pickWeight: 3, intendedCategory: 'CONVENIENCE_STORE' },
  { base: '세븐일레븐', mcc: '5499', meanAmount: 4900, branch: true, pickWeight: 2, intendedCategory: 'CONVENIENCE_STORE' },
  { base: '이마트24', mcc: null, meanAmount: 5100, branch: true, pickWeight: 1.5, intendedCategory: 'CONVENIENCE_STORE' },
];

// ---------------------------------------------------------------------------
// 쇼핑 — 월 2~3건, 저녁·야간 편중
// ---------------------------------------------------------------------------
export const SHOPPING_MERCHANTS: SeedMerchant[] = [
  // 고액 가맹점(백화점·29CM)의 가중치를 낮게 잡는다. 이걸 높이면 쇼핑이 배달을 제치고
  // 최다 지출 카테고리가 되어 페르소나 스토리가 깨진다.
  // → prisma/seed/index.ts 의 "최다 지출 카테고리 = 배달" assert 가 이를 지킨다.
  { base: '무신사', mcc: '5651', meanAmount: 78000, branch: false, pickWeight: 1.2, intendedCategory: 'SHOPPING' },
  { base: '쿠팡', mcc: '5399', meanAmount: 42000, branch: false, pickWeight: 2.5, intendedCategory: 'SHOPPING' },
  { base: '29CM', mcc: '5651', meanAmount: 95000, branch: false, pickWeight: 0.5, intendedCategory: 'SHOPPING' },
  { base: '지그재그', mcc: null, meanAmount: 56000, branch: false, pickWeight: 1, intendedCategory: 'SHOPPING' },
  { base: 'CJ올리브영', mcc: '5912', meanAmount: 38000, branch: true, pickWeight: 2, intendedCategory: 'SHOPPING' },
  { base: '롯데백화점', mcc: '5311', meanAmount: 120000, branch: true, pickWeight: 0.3, intendedCategory: 'SHOPPING' },
  { base: '다이소', mcc: '5399', meanAmount: 15000, branch: true, pickWeight: 2, intendedCategory: 'SHOPPING' },
  { base: '(주)에이블리', mcc: null, meanAmount: 47000, branch: false, pickWeight: 1, intendedCategory: 'SHOPPING' },
];

// ---------------------------------------------------------------------------
// 교통+자동차 — 대중교통 소액, 가끔 택시(야간)
// ---------------------------------------------------------------------------
export const TRANSPORT_MERCHANTS: SeedMerchant[] = [
  { base: '광주교통공사', mcc: '4111', meanAmount: 1500, branch: false, pickWeight: 10, intendedCategory: 'TRANSPORT_CAR' },
  { base: '티머니', mcc: '4111', meanAmount: 1600, branch: false, pickWeight: 8, intendedCategory: 'TRANSPORT_CAR' },
  { base: '광주시내버스', mcc: '4111', meanAmount: 1500, branch: false, pickWeight: 10, intendedCategory: 'TRANSPORT_CAR' },
  { base: '코레일', mcc: '4112', meanAmount: 24000, branch: false, pickWeight: 1, intendedCategory: 'TRANSPORT_CAR' },
  { base: 'GS칼텍스주유소', mcc: '5541', meanAmount: 52000, branch: true, pickWeight: 1.5, intendedCategory: 'TRANSPORT_CAR' },
];

/** 택시는 야간 편중이라 별도 풀로 둔다 */
export const TAXI_MERCHANTS: SeedMerchant[] = [
  { base: '카카오T택시', mcc: '4121', meanAmount: 14000, branch: false, intendedCategory: 'TRANSPORT_CAR' },
  { base: '광주개인택시', mcc: '4121', meanAmount: 11000, branch: false, intendedCategory: 'TRANSPORT_CAR' },
];

// ---------------------------------------------------------------------------
// 게임+인앱 — 새 축. 심야 편중, 소액~중액.
// ---------------------------------------------------------------------------
export const GAME_MERCHANTS: SeedMerchant[] = [
  { base: '구글플레이', mcc: '5817', meanAmount: 15000, branch: false, pickWeight: 3, intendedCategory: 'GAME_INAPP' },
  { base: '넥슨', mcc: '5816', meanAmount: 33000, branch: false, pickWeight: 1.5, intendedCategory: 'GAME_INAPP' },
  { base: 'STEAM', mcc: '5816', meanAmount: 28000, branch: false, pickWeight: 1.2, intendedCategory: 'GAME_INAPP' },
  { base: '카카오게임즈', mcc: null, meanAmount: 22000, branch: false, pickWeight: 1, intendedCategory: 'GAME_INAPP' },
];

// ---------------------------------------------------------------------------
// 의료+건강+피트니스 — 새 축(기존 생활·문화에서 분리)
// ---------------------------------------------------------------------------
export const HEALTH_MERCHANTS: SeedMerchant[] = [
  { base: '스포애니헬스', mcc: '7997', meanAmount: 44000, branch: true, pickWeight: 1.5, intendedCategory: 'HEALTH_FITNESS' },
  { base: '광주365의원', mcc: '8011', meanAmount: 12000, branch: false, pickWeight: 1.5, intendedCategory: 'HEALTH_FITNESS' },
  { base: '온누리약국', mcc: null, meanAmount: 9000, branch: true, pickWeight: 2, intendedCategory: 'HEALTH_FITNESS' },
  { base: '블루클럽미용실', mcc: '7230', meanAmount: 18000, branch: true, pickWeight: 1.2, intendedCategory: 'HEALTH_FITNESS' },
];

// ---------------------------------------------------------------------------
// 교육 (문화·여가 포함) — 새 축
// ---------------------------------------------------------------------------
export const EDUCATION_MERCHANTS: SeedMerchant[] = [
  { base: '교보문고', mcc: '5942', meanAmount: 26000, branch: true, pickWeight: 1.5, intendedCategory: 'EDUCATION' },
  { base: '예스24', mcc: '5942', meanAmount: 21000, branch: false, pickWeight: 1.2, intendedCategory: 'EDUCATION' },
  { base: 'CGV', mcc: '7832', meanAmount: 15000, branch: true, pickWeight: 2, intendedCategory: 'EDUCATION' },
  { base: '인프런', mcc: '8299', meanAmount: 55000, branch: false, pickWeight: 0.6, intendedCategory: 'EDUCATION' },
  { base: '광주시립미술관', mcc: null, meanAmount: 8000, branch: false, pickWeight: 0.8, intendedCategory: 'EDUCATION' },
];

// ---------------------------------------------------------------------------
// 여행+숙박 — 새 축. 드물지만 건당 금액이 크다.
// ---------------------------------------------------------------------------
export const TRAVEL_MERCHANTS: SeedMerchant[] = [
  { base: '야놀자', mcc: '7011', meanAmount: 72000, branch: false, pickWeight: 1.5, intendedCategory: 'TRAVEL_STAY' },
  { base: '여기어때', mcc: '7011', meanAmount: 65000, branch: false, pickWeight: 1.2, intendedCategory: 'TRAVEL_STAY' },
  { base: '제주항공', mcc: '4511', meanAmount: 98000, branch: false, pickWeight: 0.5, intendedCategory: 'TRAVEL_STAY' },
];

// ---------------------------------------------------------------------------
// 정기결제 — 매월 같은 날 같은 금액 (정기결제 탐지 로직 검증용)
// ---------------------------------------------------------------------------
export interface SeedRecurring {
  base: string;
  mcc: string | null;
  amount: number;
  /** 매월 결제일 */
  dayOfMonth: number;
  hour: number;
  /** 구독 서비스인지 (프롬프트 §4-3 의 "구독 3~4건" 카운트 대상) */
  isSubscription: boolean;
  intendedCategory: TxCategory;
}

export const RECURRING_MERCHANTS: SeedRecurring[] = [
  // 구독 4건 — "매월 같은 날 같은 금액". 줄일 수 있는 지출이라 SUBSCRIPTION_OTT.
  { base: '넷플릭스', mcc: '5968', amount: 13500, dayOfMonth: 15, hour: 3, isSubscription: true, intendedCategory: 'SUBSCRIPTION_OTT' },
  { base: '유튜브프리미엄', mcc: '5968', amount: 14900, dayOfMonth: 3, hour: 4, isSubscription: true, intendedCategory: 'SUBSCRIPTION_OTT' },
  { base: '멜론', mcc: '5968', amount: 10900, dayOfMonth: 7, hour: 2, isSubscription: true, intendedCategory: 'SUBSCRIPTION_OTT' },
  { base: '쿠팡와우멤버십', mcc: '5968', amount: 7890, dayOfMonth: 22, hour: 3, isSubscription: true, intendedCategory: 'SUBSCRIPTION_OTT' },
  // 통신·보험 — 줄이기 어려운 진짜 고정비. 절약 목표 대상이 아니다.
  { base: 'SK텔레콤', mcc: '4899', amount: 55000, dayOfMonth: 26, hour: 9, isSubscription: false, intendedCategory: 'FIXED_BILLS' },
  { base: '삼성화재해상보험', mcc: '6300', amount: 42000, dayOfMonth: 10, hour: 9, isSubscription: false, intendedCategory: 'FIXED_BILLS' },
];

// ---------------------------------------------------------------------------
// 분류 불가 건 — "직접 확인" UI 를 시연하기 위해 의도적으로 심는다
//
// ⚠️ 이 이름들은 merchant-rules.data.ts 의 전역 키워드 사전에 **절대 넣지 않는다.**
//    넣는 순간 자동 분류되어 "확신 못한 N건" 화면이 비어버린다.
// ---------------------------------------------------------------------------
export const UNCLASSIFIABLE_MERCHANTS: SeedMerchant[] = [
  { base: '이체 김**', mcc: null, meanAmount: 45000, branch: false, intendedCategory: 'UNCLASSIFIED' },
  { base: '이체 박**', mcc: null, meanAmount: 30000, branch: false, intendedCategory: 'UNCLASSIFIED' },
  { base: '이체 최**', mcc: null, meanAmount: 62000, branch: false, intendedCategory: 'UNCLASSIFIED' },
  { base: '카카오페이', mcc: null, meanAmount: 28000, branch: false, intendedCategory: 'UNCLASSIFIED' },
  { base: '토스페이', mcc: null, meanAmount: 19000, branch: false, intendedCategory: 'UNCLASSIFIED' },
  { base: '네이버페이', mcc: null, meanAmount: 34000, branch: false, intendedCategory: 'UNCLASSIFIED' },
  { base: '(주)케이지이니시스', mcc: null, meanAmount: 52000, branch: false, intendedCategory: 'UNCLASSIFIED' },
  { base: '(주)케이알파트너스', mcc: null, meanAmount: 41000, branch: false, intendedCategory: 'UNCLASSIFIED' },
];

/** 월급 입금처 */
export const SALARY = {
  merchantName: '(주)야호컴퍼니',
  amount: 2_850_000,
  dayOfMonth: 25,
  hour: 10,
} as const;
