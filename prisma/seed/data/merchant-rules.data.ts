/**
 * 전역 키워드 사전 (분류 파이프라인 3순위) — **12종 카테고리 기준**.
 *
 * 매칭 대상은 **정규화된 가맹점명**이다.
 *   "GS25 광주치평점"        → "gs25"
 *   "배민)한식대첩 광주상무점" → 채널 "배민" + core "한식대첩" → 매칭 문자열 "배민한식대첩"
 *   "(주)아웃백스테이크하우스" → "아웃백스테이크하우스"
 * 영문은 소문자로 접는다. 패턴도 소문자로 쓴다.
 *
 * priority 는 **낮을수록 먼저** 평가된다. 구체적인 패턴에 낮은 값을 준다.
 *   10     배달 채널·구독 등 반드시 선점해야 하는 것
 *          (예: "쿠팡이츠" 가 "쿠팡" 보다, "쿠팡와우" 가 "쿠팡" 보다 먼저)
 *   30~60  개별 브랜드
 *   90~98  포괄 키워드 (예: "택시", "편의점")
 *
 * ⚠️ merchants.data.ts 의 UNCLASSIFIABLE_MERCHANTS 에 있는 이름
 *    ("카카오페이", "토스페이", "네이버페이", "이체", "케이지이니시스" 등) 은
 *    여기 절대 넣지 않는다. 넣으면 "확신 못한 N건" 화면이 비어버린다.
 */
import type { TxCategory } from '../../../src/common/constants/tx-category';

export interface SeedMerchantRule {
  pattern: string;
  category: TxCategory;
  priority: number;
  label: string;
}

const rule = (
  pattern: string,
  category: TxCategory,
  priority: number,
  label: string,
): SeedMerchantRule => ({ pattern, category, priority, label });

// ---------------------------------------------------------------------------
// 1) 배달음식 — 채널 접두가 붙으면 무엇을 시켰든 배달이다. 최우선.
// ---------------------------------------------------------------------------
const DELIVERY_FOOD: SeedMerchantRule[] = [
  rule('배민', 'DELIVERY_FOOD', 10, '배달의민족 채널'),
  rule('배달의민족', 'DELIVERY_FOOD', 10, '배달의민족'),
  rule('쿠팡이츠', 'DELIVERY_FOOD', 10, '쿠팡이츠 채널'),
  rule('요기요', 'DELIVERY_FOOD', 10, '요기요 채널'),
  rule('땡겨요', 'DELIVERY_FOOD', 10, '땡겨요 채널'),
  rule('배달통', 'DELIVERY_FOOD', 10, '배달통'),
  rule('배달', 'DELIVERY_FOOD', 95, '포괄 — 모르는 배달 채널도 건진다'),
];

// ---------------------------------------------------------------------------
// 2) 구독+OTT — "쿠팡와우"가 "쿠팡"보다, "유튜브프리미엄"이 먼저 걸려야 한다.
//    ⚠️ 통신·보험·공과금은 여기가 아니라 FIXED_BILLS 다. 구독은 줄일 수 있지만 통신비는 아니다.
// ---------------------------------------------------------------------------
const SUBSCRIPTION_OTT: SeedMerchantRule[] = [
  rule('쿠팡와우', 'SUBSCRIPTION_OTT', 10, '쿠팡 와우멤버십'),
  rule('네이버플러스', 'SUBSCRIPTION_OTT', 10, '네이버 멤버십'),
  rule('넷플릭스', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('netflix', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('유튜브프리미엄', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('youtubepremium', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('디즈니플러스', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('왓챠', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('티빙', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('웨이브', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('쿠팡플레이', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('라프텔', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('애플tv', 'SUBSCRIPTION_OTT', 20, 'OTT'),
  rule('멜론', 'SUBSCRIPTION_OTT', 20, '음원'),
  rule('지니뮤직', 'SUBSCRIPTION_OTT', 20, '음원'),
  rule('플로', 'SUBSCRIPTION_OTT', 20, '음원'),
  rule('스포티파이', 'SUBSCRIPTION_OTT', 20, '음원'),
  rule('spotify', 'SUBSCRIPTION_OTT', 20, '음원'),
  rule('애플뮤직', 'SUBSCRIPTION_OTT', 20, '음원'),
  rule('벅스', 'SUBSCRIPTION_OTT', 20, '음원'),
  rule('chatgpt', 'SUBSCRIPTION_OTT', 20, 'AI 구독'),
  rule('openai', 'SUBSCRIPTION_OTT', 20, 'AI 구독'),
  rule('클로드', 'SUBSCRIPTION_OTT', 20, 'AI 구독'),
  rule('icloud', 'SUBSCRIPTION_OTT', 20, '클라우드 구독'),
  rule('구글원', 'SUBSCRIPTION_OTT', 20, '클라우드 구독'),
  rule('멤버십', 'SUBSCRIPTION_OTT', 92, '포괄'),
  rule('정기구독', 'SUBSCRIPTION_OTT', 92, '포괄'),
];

// ---------------------------------------------------------------------------
// 3) 고정지출 (통신·보험·공과금) — 페르소나 축이 아니고 절약 목표 대상도 아니다.
// ---------------------------------------------------------------------------
const FIXED_BILLS: SeedMerchantRule[] = [
  rule('sk텔레콤', 'FIXED_BILLS', 30, '통신'),
  rule('skt', 'FIXED_BILLS', 30, '통신'),
  rule('kt요금', 'FIXED_BILLS', 30, '통신'),
  rule('lg유플러스', 'FIXED_BILLS', 30, '통신'),
  rule('lgu', 'FIXED_BILLS', 30, '통신'),
  rule('알뜰폰', 'FIXED_BILLS', 30, '통신'),
  rule('통신요금', 'FIXED_BILLS', 30, '통신'),
  rule('삼성화재', 'FIXED_BILLS', 30, '보험'),
  rule('현대해상', 'FIXED_BILLS', 30, '보험'),
  rule('db손해보험', 'FIXED_BILLS', 30, '보험'),
  rule('kb손해보험', 'FIXED_BILLS', 30, '보험'),
  rule('메리츠화재', 'FIXED_BILLS', 30, '보험'),
  rule('한화생명', 'FIXED_BILLS', 30, '보험'),
  rule('삼성생명', 'FIXED_BILLS', 30, '보험'),
  rule('교보생명', 'FIXED_BILLS', 30, '보험'),
  rule('보험료', 'FIXED_BILLS', 90, '보험'),
  rule('도시가스', 'FIXED_BILLS', 40, '공과금'),
  rule('한국전력', 'FIXED_BILLS', 40, '공과금'),
  rule('수도요금', 'FIXED_BILLS', 40, '공과금'),
  rule('관리비', 'FIXED_BILLS', 40, '공과금'),
  rule('아파트관리', 'FIXED_BILLS', 40, '공과금'),
];

// ---------------------------------------------------------------------------
// 4) 술+유흥 — 외식보다 먼저 평가해야 "역전할머니맥주"가 외식으로 새지 않는다.
// ---------------------------------------------------------------------------
const ALCOHOL_NIGHTLIFE: SeedMerchantRule[] = [
  rule('역전할머니맥주', 'ALCOHOL_NIGHTLIFE', 35, '주점'),
  rule('투다리', 'ALCOHOL_NIGHTLIFE', 35, '주점'),
  rule('가르텐비어', 'ALCOHOL_NIGHTLIFE', 35, '주점'),
  rule('생활맥주', 'ALCOHOL_NIGHTLIFE', 35, '주점'),
  rule('와인앤모어', 'ALCOHOL_NIGHTLIFE', 35, '주류'),
  rule('데일리샷', 'ALCOHOL_NIGHTLIFE', 35, '주류'),
  rule('이자카야', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('포차', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('호프', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('맥주', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('술집', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('와인바', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('칵테일', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('요리주점', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('막걸리', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('소주방', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('바텐더', 'ALCOHOL_NIGHTLIFE', 88, '주점'),
  rule('클럽', 'ALCOHOL_NIGHTLIFE', 90, '유흥'),
  rule('노래방', 'ALCOHOL_NIGHTLIFE', 90, '유흥'),
  rule('코인노래', 'ALCOHOL_NIGHTLIFE', 90, '유흥'),
];

// ---------------------------------------------------------------------------
// 5) 편의점 — 카페+간식보다 먼저. 둘 다 소액 다건이라 섞이기 쉽다.
// ---------------------------------------------------------------------------
const CONVENIENCE_STORE: SeedMerchantRule[] = [
  rule('gs25', 'CONVENIENCE_STORE', 35, '편의점'),
  rule('세븐일레븐', 'CONVENIENCE_STORE', 35, '편의점'),
  rule('이마트24', 'CONVENIENCE_STORE', 35, '편의점'),
  rule('미니스톱', 'CONVENIENCE_STORE', 35, '편의점'),
  rule('씨스페이스', 'CONVENIENCE_STORE', 35, '편의점'),
  rule('편의점', 'CONVENIENCE_STORE', 90, '편의점'),
  // "CU 광주상무점" 은 정규화하면 "cu" 2글자만 남는다. 오탐 위험이 있어 가장 뒤로 민다.
  rule('cu', 'CONVENIENCE_STORE', 98, '편의점 CU'),
];

// ---------------------------------------------------------------------------
// 6) 외식
// ---------------------------------------------------------------------------
const DINING_OUT: SeedMerchantRule[] = [
  rule('김밥천국', 'DINING_OUT', 40, '분식'),
  rule('한솥도시락', 'DINING_OUT', 40, '도시락'),
  rule('본죽', 'DINING_OUT', 40, '한식'),
  rule('맘스터치', 'DINING_OUT', 40, '패스트푸드'),
  rule('롯데리아', 'DINING_OUT', 40, '패스트푸드'),
  rule('맥도날드', 'DINING_OUT', 40, '패스트푸드'),
  rule('mcdonald', 'DINING_OUT', 40, '패스트푸드'),
  rule('버거킹', 'DINING_OUT', 40, '패스트푸드'),
  rule('kfc', 'DINING_OUT', 40, '패스트푸드'),
  rule('서브웨이', 'DINING_OUT', 40, '패스트푸드'),
  rule('노브랜드버거', 'DINING_OUT', 40, '패스트푸드'),
  rule('아웃백', 'DINING_OUT', 40, '패밀리레스토랑'),
  rule('빕스', 'DINING_OUT', 40, '패밀리레스토랑'),
  rule('애슐리', 'DINING_OUT', 40, '패밀리레스토랑'),
  rule('스시로', 'DINING_OUT', 40, '일식'),
  rule('갓덴스시', 'DINING_OUT', 40, '일식'),
  rule('미스터피자', 'DINING_OUT', 40, '피자'),
  rule('도미노피자', 'DINING_OUT', 40, '피자'),
  rule('피자헛', 'DINING_OUT', 40, '피자'),
  rule('피자스쿨', 'DINING_OUT', 40, '피자'),
  rule('교촌치킨', 'DINING_OUT', 45, '치킨'),
  rule('bbq', 'DINING_OUT', 45, '치킨'),
  rule('bhc', 'DINING_OUT', 45, '치킨'),
  rule('굽네치킨', 'DINING_OUT', 45, '치킨'),
  rule('네네치킨', 'DINING_OUT', 45, '치킨'),
  rule('처갓집', 'DINING_OUT', 45, '치킨'),
  rule('명륜진사갈비', 'DINING_OUT', 45, '고기'),
  rule('청기와타운', 'DINING_OUT', 45, '고기'),
  rule('송정떡갈비', 'DINING_OUT', 45, '광주 향토'),
  rule('무등산보리밥', 'DINING_OUT', 45, '광주 향토'),
  rule('유가네', 'DINING_OUT', 45, '한식'),
  rule('온기정', 'DINING_OUT', 45, '일식'),
  rule('한식대첩', 'DINING_OUT', 45, '한식'),
  rule('엽기떡볶이', 'DINING_OUT', 45, '분식'),
  rule('신전떡볶이', 'DINING_OUT', 45, '분식'),
  rule('죠스떡볶이', 'DINING_OUT', 45, '분식'),
  rule('마라공방', 'DINING_OUT', 45, '중식'),
  rule('곱창고', 'DINING_OUT', 45, '고기'),
  rule('떡갈비', 'DINING_OUT', 90, '한식'),
  rule('보리밥', 'DINING_OUT', 90, '한식'),
  rule('국밥', 'DINING_OUT', 90, '한식'),
  rule('백반', 'DINING_OUT', 90, '한식'),
  rule('칼국수', 'DINING_OUT', 90, '한식'),
  rule('냉면', 'DINING_OUT', 90, '한식'),
  rule('삼겹살', 'DINING_OUT', 90, '고기'),
  rule('갈비', 'DINING_OUT', 92, '고기'),
  rule('곱창', 'DINING_OUT', 92, '고기'),
  rule('횟집', 'DINING_OUT', 90, '일식'),
  rule('초밥', 'DINING_OUT', 90, '일식'),
  rule('스시', 'DINING_OUT', 92, '일식'),
  rule('파스타', 'DINING_OUT', 90, '양식'),
  rule('스테이크', 'DINING_OUT', 90, '양식'),
  rule('식당', 'DINING_OUT', 95, '일반 식당'),
  rule('분식', 'DINING_OUT', 95, '분식'),
  rule('치킨', 'DINING_OUT', 95, '치킨'),
];

// ---------------------------------------------------------------------------
// 7) 카페+간식
// ---------------------------------------------------------------------------
const CAFE_SNACK: SeedMerchantRule[] = [
  rule('스타벅스', 'CAFE_SNACK', 40, '카페'),
  rule('starbucks', 'CAFE_SNACK', 40, '카페'),
  rule('투썸플레이스', 'CAFE_SNACK', 40, '카페'),
  rule('이디야', 'CAFE_SNACK', 40, '카페'),
  rule('메가엠지씨', 'CAFE_SNACK', 40, '카페'),
  rule('메가커피', 'CAFE_SNACK', 40, '카페'),
  rule('컴포즈커피', 'CAFE_SNACK', 40, '카페'),
  rule('빽다방', 'CAFE_SNACK', 40, '카페'),
  rule('커피빈', 'CAFE_SNACK', 40, '카페'),
  rule('할리스', 'CAFE_SNACK', 40, '카페'),
  rule('파스쿠찌', 'CAFE_SNACK', 40, '카페'),
  rule('폴바셋', 'CAFE_SNACK', 40, '카페'),
  rule('엔제리너스', 'CAFE_SNACK', 40, '카페'),
  rule('탐앤탐스', 'CAFE_SNACK', 40, '카페'),
  rule('공차', 'CAFE_SNACK', 40, '음료'),
  rule('던킨', 'CAFE_SNACK', 40, '베이커리'),
  rule('파리바게뜨', 'CAFE_SNACK', 40, '베이커리'),
  rule('뚜레쥬르', 'CAFE_SNACK', 40, '베이커리'),
  rule('배스킨라빈스', 'CAFE_SNACK', 40, '디저트'),
  rule('설빙', 'CAFE_SNACK', 40, '디저트'),
  rule('카페', 'CAFE_SNACK', 95, '카페'),
  rule('커피', 'CAFE_SNACK', 95, '카페'),
  rule('베이커리', 'CAFE_SNACK', 95, '베이커리'),
  rule('디저트', 'CAFE_SNACK', 95, '디저트'),
];

// ---------------------------------------------------------------------------
// 8) 쇼핑
// ---------------------------------------------------------------------------
const SHOPPING: SeedMerchantRule[] = [
  rule('무신사', 'SHOPPING', 40, '패션'),
  rule('29cm', 'SHOPPING', 40, '패션'),
  rule('지그재그', 'SHOPPING', 40, '패션'),
  rule('에이블리', 'SHOPPING', 40, '패션'),
  rule('브랜디', 'SHOPPING', 40, '패션'),
  rule('유니클로', 'SHOPPING', 40, '패션'),
  rule('자라', 'SHOPPING', 45, '패션'),
  rule('스파오', 'SHOPPING', 40, '패션'),
  rule('탑텐', 'SHOPPING', 40, '패션'),
  rule('abc마트', 'SHOPPING', 40, '신발'),
  rule('나이키', 'SHOPPING', 40, '스포츠'),
  rule('아디다스', 'SHOPPING', 40, '스포츠'),
  rule('올리브영', 'SHOPPING', 40, '뷰티'),
  rule('다이소', 'SHOPPING', 40, '생활용품'),
  rule('아트박스', 'SHOPPING', 40, '생활용품'),
  rule('무인양품', 'SHOPPING', 40, '생활용품'),
  rule('이케아', 'SHOPPING', 40, '가구'),
  rule('오늘의집', 'SHOPPING', 40, '가구'),
  rule('11번가', 'SHOPPING', 45, '오픈마켓'),
  rule('g마켓', 'SHOPPING', 45, '오픈마켓'),
  rule('옥션', 'SHOPPING', 45, '오픈마켓'),
  rule('위메프', 'SHOPPING', 45, '오픈마켓'),
  rule('티몬', 'SHOPPING', 45, '오픈마켓'),
  rule('ssg', 'SHOPPING', 45, '이커머스'),
  rule('마켓컬리', 'SHOPPING', 45, '이커머스'),
  rule('컬리', 'SHOPPING', 50, '이커머스'),
  rule('쿠팡', 'SHOPPING', 60, '이커머스'), // 쿠팡이츠·쿠팡와우·쿠팡플레이보다 뒤
  rule('이마트', 'SHOPPING', 60, '대형마트'), // 이마트24보다 뒤
  rule('홈플러스', 'SHOPPING', 45, '대형마트'),
  rule('롯데마트', 'SHOPPING', 45, '대형마트'),
  rule('코스트코', 'SHOPPING', 45, '대형마트'),
  rule('롯데백화점', 'SHOPPING', 45, '백화점'),
  rule('신세계백화점', 'SHOPPING', 45, '백화점'),
  rule('현대백화점', 'SHOPPING', 45, '백화점'),
  rule('백화점', 'SHOPPING', 90, '백화점'),
  rule('아울렛', 'SHOPPING', 90, '아울렛'),
  rule('마트', 'SHOPPING', 95, '마트'),
];

// ---------------------------------------------------------------------------
// 9) 교통+자동차
// ---------------------------------------------------------------------------
const TRANSPORT_CAR: SeedMerchantRule[] = [
  rule('광주교통공사', 'TRANSPORT_CAR', 40, '지하철'),
  rule('교통공사', 'TRANSPORT_CAR', 50, '지하철'),
  rule('티머니', 'TRANSPORT_CAR', 40, '교통카드'),
  rule('캐시비', 'TRANSPORT_CAR', 40, '교통카드'),
  rule('시내버스', 'TRANSPORT_CAR', 40, '버스'),
  rule('고속버스', 'TRANSPORT_CAR', 40, '버스'),
  rule('코레일', 'TRANSPORT_CAR', 40, '철도'),
  rule('srt', 'TRANSPORT_CAR', 40, '철도'),
  rule('카카오t', 'TRANSPORT_CAR', 40, '택시'),
  rule('카카오택시', 'TRANSPORT_CAR', 40, '택시'),
  rule('타다', 'TRANSPORT_CAR', 45, '택시'),
  rule('개인택시', 'TRANSPORT_CAR', 40, '택시'),
  rule('택시', 'TRANSPORT_CAR', 90, '택시'),
  rule('gs칼텍스', 'TRANSPORT_CAR', 40, '주유'),
  rule('sk에너지', 'TRANSPORT_CAR', 40, '주유'),
  rule('soil', 'TRANSPORT_CAR', 40, '주유'),
  rule('에스오일', 'TRANSPORT_CAR', 40, '주유'),
  rule('현대오일뱅크', 'TRANSPORT_CAR', 40, '주유'),
  rule('주유소', 'TRANSPORT_CAR', 90, '주유'),
  rule('쏘카', 'TRANSPORT_CAR', 40, '카셰어링'),
  rule('그린카', 'TRANSPORT_CAR', 40, '카셰어링'),
  rule('렌터카', 'TRANSPORT_CAR', 90, '렌터카'),
  rule('하이패스', 'TRANSPORT_CAR', 40, '통행료'),
  rule('한국도로공사', 'TRANSPORT_CAR', 40, '통행료'),
  rule('주차장', 'TRANSPORT_CAR', 90, '주차'),
  rule('파킹', 'TRANSPORT_CAR', 90, '주차'),
  rule('지하철', 'TRANSPORT_CAR', 92, '지하철'),
  rule('버스', 'TRANSPORT_CAR', 95, '버스'),
];

// ---------------------------------------------------------------------------
// 10) 게임+인앱 — 새로 추가된 축
// ---------------------------------------------------------------------------
const GAME_INAPP: SeedMerchantRule[] = [
  rule('구글플레이', 'GAME_INAPP', 35, '인앱결제'),
  rule('googleplay', 'GAME_INAPP', 35, '인앱결제'),
  rule('앱스토어', 'GAME_INAPP', 35, '인앱결제'),
  rule('appstore', 'GAME_INAPP', 35, '인앱결제'),
  rule('itunes', 'GAME_INAPP', 35, '인앱결제'),
  rule('스팀', 'GAME_INAPP', 35, '게임'),
  rule('steam', 'GAME_INAPP', 35, '게임'),
  rule('넥슨', 'GAME_INAPP', 35, '게임'),
  rule('엔씨소프트', 'GAME_INAPP', 35, '게임'),
  rule('넷마블', 'GAME_INAPP', 35, '게임'),
  rule('카카오게임즈', 'GAME_INAPP', 30, '게임'),
  rule('라이엇게임즈', 'GAME_INAPP', 35, '게임'),
  rule('블리자드', 'GAME_INAPP', 35, '게임'),
  rule('닌텐도', 'GAME_INAPP', 35, '게임'),
  rule('플레이스테이션', 'GAME_INAPP', 35, '게임'),
  rule('playstation', 'GAME_INAPP', 35, '게임'),
  rule('엑스박스', 'GAME_INAPP', 35, '게임'),
  rule('배틀그라운드', 'GAME_INAPP', 35, '게임'),
  rule('원신', 'GAME_INAPP', 35, '게임'),
  rule('게임즈', 'GAME_INAPP', 90, '게임'),
  rule('인앱결제', 'GAME_INAPP', 90, '인앱결제'),
  rule('pc방', 'GAME_INAPP', 90, '게임'),
];

// ---------------------------------------------------------------------------
// 11) 의료+건강+피트니스
// ---------------------------------------------------------------------------
const HEALTH_FITNESS: SeedMerchantRule[] = [
  rule('스포애니', 'HEALTH_FITNESS', 35, '헬스'),
  rule('에니타임피트니스', 'HEALTH_FITNESS', 35, '헬스'),
  rule('짐데이', 'HEALTH_FITNESS', 35, '헬스'),
  rule('헬스', 'HEALTH_FITNESS', 90, '헬스'),
  rule('피트니스', 'HEALTH_FITNESS', 90, '헬스'),
  rule('요가', 'HEALTH_FITNESS', 90, '운동'),
  rule('필라테스', 'HEALTH_FITNESS', 90, '운동'),
  rule('크로스핏', 'HEALTH_FITNESS', 90, '운동'),
  rule('수영장', 'HEALTH_FITNESS', 90, '운동'),
  rule('골프', 'HEALTH_FITNESS', 90, '운동'),
  rule('클라이밍', 'HEALTH_FITNESS', 90, '운동'),
  rule('병원', 'HEALTH_FITNESS', 90, '의료'),
  rule('의원', 'HEALTH_FITNESS', 92, '의료'),
  rule('치과', 'HEALTH_FITNESS', 90, '의료'),
  rule('한의원', 'HEALTH_FITNESS', 90, '의료'),
  rule('약국', 'HEALTH_FITNESS', 90, '의료'),
  rule('안경', 'HEALTH_FITNESS', 92, '의료'),
  rule('건강검진', 'HEALTH_FITNESS', 90, '의료'),
  rule('영양제', 'HEALTH_FITNESS', 90, '건강'),
  rule('필라이즈', 'HEALTH_FITNESS', 40, '건강'),
];

// ---------------------------------------------------------------------------
// 12) 교육 — 새로 추가된 축
// ---------------------------------------------------------------------------
const EDUCATION: SeedMerchantRule[] = [
  rule('인프런', 'EDUCATION', 35, '온라인 강의'),
  rule('패스트캠퍼스', 'EDUCATION', 35, '온라인 강의'),
  rule('클래스101', 'EDUCATION', 35, '온라인 강의'),
  rule('coursera', 'EDUCATION', 35, '온라인 강의'),
  rule('유데미', 'EDUCATION', 35, '온라인 강의'),
  rule('udemy', 'EDUCATION', 35, '온라인 강의'),
  rule('메가스터디', 'EDUCATION', 35, '입시'),
  rule('해커스', 'EDUCATION', 35, '어학'),
  rule('시원스쿨', 'EDUCATION', 35, '어학'),
  rule('야나두', 'EDUCATION', 35, '어학'),
  rule('듀오링고', 'EDUCATION', 35, '어학'),
  rule('산타토익', 'EDUCATION', 35, '어학'),
  rule('교보문고', 'EDUCATION', 40, '서점'),
  rule('예스24', 'EDUCATION', 40, '서점'),
  rule('yes24', 'EDUCATION', 40, '서점'),
  rule('알라딘', 'EDUCATION', 40, '서점'),
  rule('영풍문고', 'EDUCATION', 40, '서점'),
  rule('밀리의서재', 'EDUCATION', 35, '독서'),
  rule('리디북스', 'EDUCATION', 35, '독서'),
  rule('학원', 'EDUCATION', 90, '학원'),
  rule('스터디카페', 'EDUCATION', 85, '스터디'), // "카페"보다 먼저 걸려야 한다
  rule('독서실', 'EDUCATION', 90, '스터디'),
  rule('강의', 'EDUCATION', 92, '강의'),
  rule('서점', 'EDUCATION', 92, '서점'),
  rule('응시료', 'EDUCATION', 90, '시험'),
];

// ---------------------------------------------------------------------------
// 13) 여행+숙박 — 새로 추가된 축
// ---------------------------------------------------------------------------
const TRAVEL_STAY: SeedMerchantRule[] = [
  rule('야놀자', 'TRAVEL_STAY', 35, '숙박'),
  rule('여기어때', 'TRAVEL_STAY', 35, '숙박'),
  rule('에어비앤비', 'TRAVEL_STAY', 35, '숙박'),
  rule('airbnb', 'TRAVEL_STAY', 35, '숙박'),
  rule('아고다', 'TRAVEL_STAY', 35, '숙박'),
  rule('부킹닷컴', 'TRAVEL_STAY', 35, '숙박'),
  rule('booking', 'TRAVEL_STAY', 35, '숙박'),
  rule('호텔스컴바인', 'TRAVEL_STAY', 35, '숙박'),
  rule('트립닷컴', 'TRAVEL_STAY', 35, '여행'),
  rule('하나투어', 'TRAVEL_STAY', 35, '여행'),
  rule('모두투어', 'TRAVEL_STAY', 35, '여행'),
  rule('인터파크투어', 'TRAVEL_STAY', 30, '여행'),
  rule('스카이스캐너', 'TRAVEL_STAY', 35, '항공'),
  rule('대한항공', 'TRAVEL_STAY', 35, '항공'),
  rule('아시아나', 'TRAVEL_STAY', 35, '항공'),
  rule('제주항공', 'TRAVEL_STAY', 35, '항공'),
  rule('진에어', 'TRAVEL_STAY', 35, '항공'),
  rule('티웨이', 'TRAVEL_STAY', 35, '항공'),
  rule('펜션', 'TRAVEL_STAY', 90, '숙박'),
  rule('게스트하우스', 'TRAVEL_STAY', 90, '숙박'),
  rule('리조트', 'TRAVEL_STAY', 90, '숙박'),
  rule('호텔', 'TRAVEL_STAY', 92, '숙박'),
  rule('모텔', 'TRAVEL_STAY', 92, '숙박'),
];

/**
 * 문화·여가 — 12종 축에 딱 맞는 자리가 없는 항목들.
 * 영화·공연·전시는 "여가"지만 축에 없으므로, 성격이 가장 가까운 교육(문화 소비)으로 보낸다.
 * 미용은 생활 관리라 의료+건강 쪽에 붙인다.
 */
const CULTURE_MISC: SeedMerchantRule[] = [
  rule('cgv', 'EDUCATION', 40, '영화'),
  rule('메가박스', 'EDUCATION', 40, '영화'),
  rule('롯데시네마', 'EDUCATION', 40, '영화'),
  rule('미술관', 'EDUCATION', 60, '전시'),
  rule('박물관', 'EDUCATION', 60, '전시'),
  rule('공연장', 'EDUCATION', 60, '공연'),
  rule('인터파크티켓', 'EDUCATION', 40, '공연'),
  rule('예술의전당', 'EDUCATION', 40, '공연'),
  rule('미용실', 'HEALTH_FITNESS', 90, '미용'),
  rule('헤어', 'HEALTH_FITNESS', 92, '미용'),
  rule('네일', 'HEALTH_FITNESS', 92, '미용'),
  rule('세탁', 'HEALTH_FITNESS', 92, '생활'),
  rule('볼링', 'EDUCATION', 92, '여가'),
];

export const MERCHANT_RULES: SeedMerchantRule[] = [
  ...DELIVERY_FOOD,
  ...SUBSCRIPTION_OTT,
  ...FIXED_BILLS,
  ...ALCOHOL_NIGHTLIFE,
  ...CONVENIENCE_STORE,
  ...DINING_OUT,
  ...CAFE_SNACK,
  ...SHOPPING,
  ...TRANSPORT_CAR,
  ...GAME_INAPP,
  ...HEALTH_FITNESS,
  ...EDUCATION,
  ...TRAVEL_STAY,
  ...CULTURE_MISC,
];
