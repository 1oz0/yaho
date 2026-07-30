/**
 * 호남권(광주·전남·전북) 인구소멸위험지역 여행지 데이터.
 *
 * 프롬프트 §6-5 요구: 강진·보성·고흥·고창·신안 5곳 필수, 각 여행지에 루트 2개 + 리뷰 3~5건.
 *
 * `extinctionRiskIndexBp` 는 소멸위험지수 × 10000 이다 (Decimal 금지 → basis point).
 * 지수 값은 목업이지만 `regionCode` 와 함께 두었으므로, 추후 한국고용정보원의
 * 실제 소멸위험지수 데이터로 컬럼만 갱신하면 된다.
 *
 * 소멸위험지수 해석: 0.2 미만 = 소멸고위험, 0.2~0.5 = 소멸위험진입, 0.5~1.0 = 소멸주의
 */

export interface SeedRouteStop {
  placeName: string;
  description: string;
  stopType: 'SIGHT' | 'MEAL' | 'CAFE' | 'ACTIVITY' | 'STAY';
  stayMinutes: number;
  estimatedAmount: number;
  /** 1박 2일 처방전의 Day 구분 (§12-3). 생략하면 1. */
  day?: 1 | 2;
  /** 야호 제휴 할인율 (%). 15 → 15%. 서버가 basis point 로 변환해 저장한다. */
  discountRate?: number;
  /** 제휴처 표기명. discountRate 가 있을 때만 쓴다. */
  partnerName?: string;
}

export interface SeedRoute {
  title: string;
  theme: 'FOOD' | 'HEALING' | 'ACTIVITY' | 'HISTORY';
  summary: string;
  /**
   * 방문 순서대로. **Day1 이 먼저, Day2 가 뒤**여야 한다 (시드가 검증한다).
   * Day1 마지막은 숙소(STAY)로 끝난다 — 1박 2일이므로.
   */
  stops: SeedRouteStop[];
}

export interface SeedReview {
  authorNickname: string;
  rating: number;
  content: string;
  /** 방문 시점 (앵커로부터 며칠 전) */
  daysAgo: number;
  helpfulCount: number;
}

export interface SeedDestination {
  code: string;
  name: string;
  province: string;
  regionCode: string;
  extinctionRiskIndexBp: number;
  riskGrade: string;
  tagline: string;
  summary: string;
  description: string;
  heroImageUrl: string;

  /** 이 여행지의 챌린지 기간(주). 여행지가 기간을 정한다 (§12-2). */
  challengeWeeks: 2 | 4 | 8;
  /** 챌린지 목표액 = 예상 여행 경비 (원). S10 카드에 그대로 찍힌다. */
  targetSavingAmount: number;
  /** 광주 출발 편도 교통비 (원) */
  oneWayFareAmount: number;
  /** 광주에서 편도 소요 시간 (분) */
  travelMinutesFromGwangju: number;

  /** 1박 2일이 기본이므로 전부 1 */
  recommendedNights: number;
  /** S10 카드의 한 줄 카피 */
  catchphrase: string;

  photos: { caption: string }[];
  routes: SeedRoute[];
  reviews: SeedReview[];
}

const img = (code: string, n: number): string =>
  `https://images.yaho.kr/destinations/${code.toLowerCase()}/${n}.jpg`;

export const DESTINATIONS: SeedDestination[] = [
  // -------------------------------------------------------------------------
  {
    code: 'GANGJIN',
    name: '강진',
    province: '전라남도',
    regionCode: '46810',
    extinctionRiskIndexBp: 1580, // 0.158
    riskGrade: '소멸고위험',
    tagline: '다산이 18년을 머문 남도의 서재',
    summary: '청자와 다산초당, 그리고 남도 한정식. 느리게 걷기 좋은 도시입니다.',
    description:
      '강진은 고려청자의 본향이자 정약용이 유배 시절 18년을 보낸 곳입니다. ' +
      '가우도 출렁다리에서 강진만을 내려다보고, 백련사 동백숲을 지나 다산초당까지 걷는 ' +
      '오솔길이 이 도시의 진짜 얼굴입니다. 남도 한정식 한 상이면 하루가 완성됩니다.',
    heroImageUrl: img('GANGJIN', 0),
    challengeWeeks: 2,
    targetSavingAmount: 140_000,
    oneWayFareAmount: 12_000,
    travelMinutesFromGwangju: 70,
    recommendedNights: 1,
    catchphrase: '지친 위장과 지갑에 휴식을',
    photos: [
      { caption: '가우도 출렁다리에서 본 강진만' },
      { caption: '다산초당으로 오르는 뿌리길' },
      { caption: '백련사 동백숲' },
      { caption: '강진 청자박물관' },
      { caption: '남도 한정식 한 상' },
      { caption: '해질녘 강진만 갈대밭' },
    ],
    routes: [
      {
        title: '강진 다산 사색 코스',
        theme: 'HISTORY',
        summary: '백련사에서 다산초당까지 숲길을 걷고, 이튿날 청자의 역사를 만나는 1박 2일',
        stops: [
          { day: 1, placeName: '백련사', description: '동백숲으로 유명한 천년 고찰. 봄에는 붉은 융단이 깔립니다.', stopType: 'SIGHT', stayMinutes: 60, estimatedAmount: 0 },
          { day: 1, placeName: '다산초당 뿌리길', description: '백련사에서 초당까지 이어지는 800m 숲길. 정약용이 오갔던 길입니다.', stopType: 'ACTIVITY', stayMinutes: 50, estimatedAmount: 0 },
          { day: 1, placeName: '다산초당', description: '목민심서가 쓰인 자리. 마루에 앉아 강진만을 내려다봅니다.', stopType: 'SIGHT', stayMinutes: 40, estimatedAmount: 0 },
          { day: 1, placeName: '해태식당', description: '강진 남도 한정식. 상다리가 휘는 정식 한 상.', stopType: 'MEAL', stayMinutes: 80, estimatedAmount: 32_000 },
          { day: 1, placeName: '강진 다산독채펜션', description: '다산초당 아래 독채 한 채. 마당에서 강진만이 보입니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 78_000, discountRate: 20, partnerName: '강진 다산독채펜션' },
          { day: 2, placeName: '영랑생가', description: '「모란이 피기까지는」의 시인 김영랑이 나고 자란 집. 초가와 장독대가 그대로입니다.', stopType: 'SIGHT', stayMinutes: 50, estimatedAmount: 0 },
          { day: 2, placeName: '고려청자박물관', description: '청자 가마터 위에 세워진 박물관. 물레 체험도 가능합니다.', stopType: 'SIGHT', stayMinutes: 70, estimatedAmount: 4_000, discountRate: 15, partnerName: '고려청자박물관' },
        ],
      },
      {
        title: '강진 바다 드라이브 코스',
        theme: 'HEALING',
        summary: '가우도 출렁다리에서 노을까지, 이튿날 병영 옛길을 걷는 1박 2일',
        stops: [
          { day: 1, placeName: '가우도 출렁다리', description: '강진만 위를 걸어 섬으로 들어갑니다. 짚트랙도 있습니다.', stopType: 'ACTIVITY', stayMinutes: 90, estimatedAmount: 12_000 },
          { day: 1, placeName: '가우도 청자타워 카페', description: '섬 정상 전망 카페. 강진만이 한눈에 들어옵니다.', stopType: 'CAFE', stayMinutes: 50, estimatedAmount: 8_000 },
          { day: 1, placeName: '마량놀토수산시장', description: '주말마다 열리는 항구 시장. 제철 회를 포장할 수 있습니다.', stopType: 'MEAL', stayMinutes: 70, estimatedAmount: 28_000 },
          { day: 1, placeName: '강진만 생태공원', description: '해질녘 갈대밭 산책로. 노을 사진 명소입니다.', stopType: 'SIGHT', stayMinutes: 60, estimatedAmount: 0 },
          { day: 1, placeName: '가우도 오토캠핑장', description: '섬 안 캠핑장. 텐트 없이 갈 수 있는 카라반 동이 있습니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 55_000, discountRate: 15, partnerName: '가우도 오토캠핑장' },
          { day: 2, placeName: '강진 하멜기념관', description: '하멜이 7년간 머문 병영성 옆. 표류기의 무대가 여기입니다.', stopType: 'SIGHT', stayMinutes: 50, estimatedAmount: 2_000 },
          { day: 2, placeName: '병영 돼지불고기', description: '병영시장 노포. 연탄에 구워 나오는 백반입니다.', stopType: 'MEAL', stayMinutes: 60, estimatedAmount: 14_000 },
        ],
      },
    ],
    reviews: [
      { authorNickname: '느린여행자', rating: 5, content: '뿌리길 걷는데 진짜 시간이 멈춘 느낌이었어요. 사람도 적고 조용해서 혼자 가기 딱 좋습니다.', daysAgo: 42, helpfulCount: 23 },
      { authorNickname: '광주사는집순이', rating: 4, content: '광주에서 차로 1시간 조금 넘어요. 당일치기로 충분한데 한정식 먹고 나면 졸려서 1박 추천.', daysAgo: 88, helpfulCount: 17 },
      { authorNickname: '청자덕후', rating: 5, content: '청자박물관 물레 체험이 생각보다 재밌었습니다. 만든 건 한 달 뒤에 택배로 와요.', daysAgo: 130, helpfulCount: 9 },
      { authorNickname: '가우도러버', rating: 4, content: '출렁다리 무료입니다. 짚트랙은 유료인데 한 번쯤은 탈 만해요.', daysAgo: 61, helpfulCount: 14 },
    ],
  },

  // -------------------------------------------------------------------------
  {
    code: 'BOSEONG',
    name: '보성',
    province: '전라남도',
    regionCode: '46780',
    extinctionRiskIndexBp: 1420,
    riskGrade: '소멸고위험',
    tagline: '초록이 끝까지 이어지는 차밭의 도시',
    summary: '대한다원 계단식 차밭과 율포 해수녹차탕. 초록과 바다를 하루에 봅니다.',
    description:
      '보성은 한국에서 가장 넓은 차밭을 가진 곳입니다. 대한다원의 계단식 녹차밭은 ' +
      '사진 어디를 찍어도 초록이 가득하고, 삼나무길을 지나 전망대에 오르면 밭 전체가 펼쳐집니다. ' +
      '차밭에서 내려와 율포해수욕장에서 녹차 해수탕에 몸을 담그면 하루의 피로가 사라집니다.',
    heroImageUrl: img('BOSEONG', 0),
    challengeWeeks: 2,
    targetSavingAmount: 160_000,
    oneWayFareAmount: 15_000,
    travelMinutesFromGwangju: 90,
    recommendedNights: 1,
    catchphrase: '카페인 대신 초록빛 여유를',
    photos: [
      { caption: '대한다원 계단식 차밭' },
      { caption: '차밭 입구 삼나무길' },
      { caption: '녹차밭 전망대에서 본 능선' },
      { caption: '율포solbeach 해변'.replace('solbeach', '솔밭') },
      { caption: '보성 녹차 아이스크림' },
      { caption: '차밭 야간 조명' },
    ],
    routes: [
      {
        title: '보성 초록 힐링 코스',
        theme: 'HEALING',
        summary: '차밭을 천천히 걷고 녹차 해수탕에서 자는 1박 2일',
        stops: [
          { day: 1, placeName: '대한다원', description: '삼나무길을 지나 계단식 차밭 전망대까지. 왕복 1시간 코스입니다.', stopType: 'SIGHT', stayMinutes: 100, estimatedAmount: 4_000, discountRate: 15, partnerName: '대한다원' },
          { day: 1, placeName: '다원 녹차 아이스크림', description: '차밭 입구의 명물. 진한 녹차향이 납니다.', stopType: 'CAFE', stayMinutes: 25, estimatedAmount: 5_000 },
          { day: 1, placeName: '보성녹돈food'.replace('food', '식당'), description: '녹차를 먹여 키운 녹돈 삼겹살.', stopType: 'MEAL', stayMinutes: 80, estimatedAmount: 26_000 },
          { day: 1, placeName: '율포 해수녹차 리조트', description: '해수녹차탕이 딸린 숙소. 차밭을 걷고 바로 몸을 담글 수 있습니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 66_000, discountRate: 20, partnerName: '율포 해수녹차 리조트' },
          { day: 2, placeName: '율포해수녹차센터', description: '바닷물에 녹차를 우린 해수탕. 아침에 들르면 한적합니다.', stopType: 'ACTIVITY', stayMinutes: 90, estimatedAmount: 9_000, discountRate: 15, partnerName: '율포해수녹차센터' },
          { day: 2, placeName: '제암산 자연휴양림', description: '편백숲 산책로. 정상까지 안 가도 숲길만으로 충분합니다.', stopType: 'ACTIVITY', stayMinutes: 80, estimatedAmount: 3_000 },
        ],
      },
      {
        title: '보성 바다와 기차 코스',
        theme: 'ACTIVITY',
        summary: '득량역 추억거리와 해변 레일바이크, 이튿날 벌교 꼬막까지 가는 1박 2일',
        stops: [
          { day: 1, placeName: '득량역 추억의 거리', description: '1970년대 거리를 재현한 간이역. 교복 대여 사진 촬영이 인기입니다.', stopType: 'SIGHT', stayMinutes: 60, estimatedAmount: 5_000 },
          { day: 1, placeName: '보성 해양레일바이크', description: '바다를 끼고 달리는 레일바이크. 2인승 기준입니다.', stopType: 'ACTIVITY', stayMinutes: 70, estimatedAmount: 24_000, discountRate: 10, partnerName: '보성 해양레일바이크' },
          { day: 1, placeName: '율포항 회센터', description: '항구 바로 앞 회센터. 제철 생선을 고르면 바로 손질해 줍니다.', stopType: 'MEAL', stayMinutes: 80, estimatedAmount: 26_000 },
          { day: 1, placeName: '율포솔밭 펜션', description: '해송 숲 바로 앞 펜션. 파도 소리가 들립니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 56_000, discountRate: 20, partnerName: '율포솔밭 펜션' },
          { day: 2, placeName: '율포솔밭해변', description: '해송 숲이 이어지는 조용한 해변. 아침 산책이 좋습니다.', stopType: 'SIGHT', stayMinutes: 50, estimatedAmount: 0 },
          { day: 2, placeName: '벌교 꼬막정식', description: '『태백산맥』의 무대 벌교. 꼬막 한 상이 열두 가지로 나옵니다.', stopType: 'MEAL', stayMinutes: 80, estimatedAmount: 25_000 },
        ],
      },
    ],
    reviews: [
      { authorNickname: '초록중독', rating: 5, content: '차밭 전망대까지 은근 오르막이라 운동화 필수예요. 근데 올라가면 진짜 장관입니다.', daysAgo: 35, helpfulCount: 31 },
      { authorNickname: '해수탕마니아', rating: 5, content: '녹차 해수탕 강력 추천. 차밭 걷고 나서 들어가면 다리가 살아나요.', daysAgo: 70, helpfulCount: 19 },
      { authorNickname: '주말드라이버', rating: 4, content: '주말 오전엔 사람 많아요. 9시 오픈하자마자 가는 게 사진 찍기 좋습니다.', daysAgo: 21, helpfulCount: 26 },
      { authorNickname: '레일바이크초보', rating: 4, content: '레일바이크 페달 은근 힘들어요. 그래도 바다 보면서 타는 건 처음이라 좋았습니다.', daysAgo: 112, helpfulCount: 8 },
      { authorNickname: '득량역감성', rating: 5, content: '득량역 진짜 소소한데 사진은 제일 잘 나왔어요. 필름카메라 들고 가세요.', daysAgo: 55, helpfulCount: 12 },
    ],
  },

  // -------------------------------------------------------------------------
  {
    code: 'GOHEUNG',
    name: '고흥',
    province: '전라남도',
    regionCode: '46770',
    extinctionRiskIndexBp: 1210,
    riskGrade: '소멸고위험',
    tagline: '한국의 우주가 시작되는 반도',
    summary: '나로우주센터와 팔영산, 그리고 끝없는 남해 해안도로.',
    description:
      '고흥은 한국 우주 발사체가 하늘로 오르는 땅입니다. 나로우주센터 우주과학관에서 ' +
      '발사체를 보고, 팔영산 능선에 오르면 다도해가 발밑에 펼쳐집니다. ' +
      '해안도로를 따라 달리다 보면 사람보다 바다가 많은 구간이 계속됩니다.',
    heroImageUrl: img('GOHEUNG', 0),
    challengeWeeks: 4,
    targetSavingAmount: 140_000,
    oneWayFareAmount: 18_000,
    travelMinutesFromGwangju: 120,
    recommendedNights: 1,
    catchphrase: '화면 대신 우주와 바다를',
    photos: [
      { caption: '나로우주센터 우주과학관' },
      { caption: '팔영산 능선에서 본 다도해' },
      { caption: '고흥 해안도로' },
      { caption: '쑥섬 정원' },
      { caption: '고흥 유자차와 한과' },
      { caption: '남열해돋이해수욕장' },
    ],
    routes: [
      {
        title: '고흥 우주 탐험 코스',
        theme: 'ACTIVITY',
        summary: '우주과학관에서 시작해 이튿날 해돋이를 보고 오는 1박 2일',
        stops: [
          { day: 1, placeName: '나로우주센터 우주과학관', description: '실물 크기 발사체 모형과 무중력 체험. 아이 없이 가도 재밌습니다.', stopType: 'SIGHT', stayMinutes: 110, estimatedAmount: 6_000, discountRate: 15, partnerName: '나로우주센터 우주과학관' },
          { day: 1, placeName: '우주발사전망대', description: '7층 전망대에서 발사장 방향 바다를 봅니다.', stopType: 'SIGHT', stayMinutes: 45, estimatedAmount: 2_000 },
          { day: 1, placeName: '고흥 바지락회무침 식당', description: '고흥 앞바다 바지락으로 만든 새콤한 회무침.', stopType: 'MEAL', stayMinutes: 70, estimatedAmount: 22_000 },
          { day: 1, placeName: '나로도 해변 펜션', description: '나로도 항구 앞 펜션. 일출 시간에 맞춰 나서기 좋습니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 72_000, discountRate: 20, partnerName: '나로도 해변 펜션' },
          { day: 2, placeName: '남열해돋이해수욕장', description: '서핑도 가능한 해변. 일출 명소로 유명합니다.', stopType: 'SIGHT', stayMinutes: 60, estimatedAmount: 0 },
          { day: 2, placeName: '고흥만 수변공원', description: '방조제를 따라 이어지는 산책로. 철새가 많습니다.', stopType: 'SIGHT', stayMinutes: 60, estimatedAmount: 0 },
        ],
      },
      {
        title: '고흥 섬과 능선 코스',
        theme: 'HEALING',
        summary: '쑥섬 정원에서 팔영산 편백숲까지, 걷는 시간이 긴 1박 2일',
        stops: [
          { day: 1, placeName: '쑥섬(애도)', description: '고양이와 꽃으로 유명한 작은 섬. 배로 5분 들어갑니다.', stopType: 'ACTIVITY', stayMinutes: 120, estimatedAmount: 12_000 },
          { day: 1, placeName: '나로도 항구 카페', description: '항구 바로 앞 카페. 배 시간 기다리기 좋습니다.', stopType: 'CAFE', stayMinutes: 40, estimatedAmount: 7_000 },
          { day: 1, placeName: '고흥 매생이 칼국수', description: '겨울 고흥 매생이로 끓인 칼국수. 국물이 진합니다.', stopType: 'MEAL', stayMinutes: 60, estimatedAmount: 12_000 },
          { day: 1, placeName: '팔영산 자연휴양림', description: '숲속의 집 통나무 객실. 밤에 별이 잘 보입니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 58_000, discountRate: 15, partnerName: '팔영산 자연휴양림' },
          { day: 2, placeName: '팔영산 편백숲', description: '정상까지 안 가도 편백숲 산책로만으로 충분합니다.', stopType: 'ACTIVITY', stayMinutes: 90, estimatedAmount: 0 },
          { day: 2, placeName: '고흥 유자 한과점', description: '고흥 유자로 만든 한과와 유자차. 선물용으로 인기입니다.', stopType: 'CAFE', stayMinutes: 30, estimatedAmount: 15_000, discountRate: 10, partnerName: '고흥 유자 한과점' },
        ],
      },
    ],
    reviews: [
      { authorNickname: '우주덕', rating: 5, content: '우주과학관 생각보다 알차요. 발사 일정 있으면 그때 맞춰 가면 더 좋습니다.', daysAgo: 48, helpfulCount: 21 },
      { authorNickname: '고양이집사', rating: 5, content: '쑥섬 고양이들 진짜 순해요. 배 시간표 미리 확인하고 가세요, 자주 없습니다.', daysAgo: 95, helpfulCount: 34 },
      { authorNickname: '드라이브광', rating: 4, content: '해안도로가 진짜 최고. 대신 차 없으면 이동이 좀 힘들어요.', daysAgo: 27, helpfulCount: 18 },
    ],
  },

  // -------------------------------------------------------------------------
  {
    code: 'GOCHANG',
    name: '고창',
    province: '전라북도',
    regionCode: '45790',
    extinctionRiskIndexBp: 1690,
    riskGrade: '소멸고위험',
    tagline: '가을이면 분홍으로 물드는 청보리밭의 고장',
    summary: '학원농장 청보리밭·메밀꽃밭, 고인돌 유적, 선운사 꽃무릇까지.',
    description:
      '고창은 계절이 가장 선명하게 드러나는 곳입니다. 봄에는 청보리, 가을에는 메밀꽃과 ' +
      '선운사 꽃무릇이 산자락을 덮습니다. 유네스코 세계유산 고인돌 유적지와 ' +
      '읍성 성곽길까지 더하면 하루가 짧습니다.',
    heroImageUrl: img('GOCHANG', 0),
    challengeWeeks: 4,
    targetSavingAmount: 160_000,
    oneWayFareAmount: 20_000,
    travelMinutesFromGwangju: 130,
    recommendedNights: 1,
    catchphrase: '계절이 바뀌는 걸 눈으로 보는 이틀',
    photos: [
      { caption: '학원농장 청보리밭' },
      { caption: '선운사 꽃무릇 군락' },
      { caption: '고창읍성 성곽길' },
      { caption: '고인돌 유적지' },
      { caption: '고창 풍천장어 한 상' },
      { caption: '구시포 해변 노을' },
    ],
    routes: [
      {
        title: '고창 계절 꽃길 코스',
        theme: 'HEALING',
        summary: '학원농장에서 선운사까지 계절꽃을 따라 걷고, 이튿날 산길로 오르는 1박 2일',
        stops: [
          { day: 1, placeName: '학원농장', description: '봄엔 청보리, 가을엔 메밀꽃. 드넓은 밭 사이로 난 길을 걷습니다.', stopType: 'SIGHT', stayMinutes: 80, estimatedAmount: 0 },
          { day: 1, placeName: '학원농장 보리밭 카페', description: '밭이 보이는 통유리 카페. 보리빵이 유명합니다.', stopType: 'CAFE', stayMinutes: 40, estimatedAmount: 9_000 },
          { day: 1, placeName: '선운사', description: '가을 꽃무릇, 봄 동백으로 유명한 절. 계곡길이 예쁩니다.', stopType: 'SIGHT', stayMinutes: 90, estimatedAmount: 4_000 },
          { day: 1, placeName: '선운사 앞 풍천장어', description: '고창 하면 풍천장어. 복분자주와 함께 나옵니다.', stopType: 'MEAL', stayMinutes: 80, estimatedAmount: 38_000, discountRate: 10, partnerName: '선운사풍천장어' },
          { day: 1, placeName: '선운산 유스호스텔', description: '선운사 입구 숙소. 아침 일찍 도솔암까지 오르기 좋습니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 62_000, discountRate: 20, partnerName: '선운산 유스호스텔' },
          { day: 2, placeName: '선운사 도솔암', description: '계곡을 따라 40분 오르면 나오는 암자. 마애불이 있습니다.', stopType: 'ACTIVITY', stayMinutes: 100, estimatedAmount: 0 },
          { day: 2, placeName: '고창 복분자 와이너리', description: '복분자주 시음과 견학. 운전자는 대신 잼을 삽니다.', stopType: 'CAFE', stayMinutes: 60, estimatedAmount: 12_000, discountRate: 15, partnerName: '고창 복분자 와이너리' },
        ],
      },
      {
        title: '고창 역사 성곽 코스',
        theme: 'HISTORY',
        summary: '고인돌 유적과 읍성 성곽을 걷고, 이튿날 서해 갯벌로 나가는 1박 2일',
        stops: [
          { day: 1, placeName: '고창 고인돌 유적지', description: '세계에서 가장 밀집된 고인돌 군락. 탐방 열차가 있습니다.', stopType: 'SIGHT', stayMinutes: 90, estimatedAmount: 3_000 },
          { day: 1, placeName: '고창읍성(모양성)', description: '성곽 한 바퀴 도는 답성놀이 코스. 1시간이면 충분합니다.', stopType: 'ACTIVITY', stayMinutes: 70, estimatedAmount: 3_000 },
          { day: 1, placeName: '고창 한정식', description: '읍성 근처 백반집. 반찬 가짓수가 놀랍습니다.', stopType: 'MEAL', stayMinutes: 70, estimatedAmount: 18_000 },
          { day: 1, placeName: '고창읍성 한옥마을', description: '성곽 바로 아래 한옥 숙소. 아궁이 온돌방이 있습니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 70_000, discountRate: 20, partnerName: '고창읍성 한옥마을' },
          { day: 2, placeName: '고창 갯벌 소금학교', description: '람사르 습지 고창갯벌. 소금 만들기 체험이 있습니다.', stopType: 'ACTIVITY', stayMinutes: 90, estimatedAmount: 8_000, discountRate: 15, partnerName: '고창 갯벌 소금학교' },
          { day: 2, placeName: '구시포 해변', description: '서해 노을 명소. 해수찜으로도 유명합니다.', stopType: 'SIGHT', stayMinutes: 60, estimatedAmount: 0 },
        ],
      },
    ],
    reviews: [
      { authorNickname: '보리밭산책', rating: 5, content: '4월 말 청보리밭 진짜 초록초록해요. 사진 백 장은 찍은 듯.', daysAgo: 100, helpfulCount: 29 },
      { authorNickname: '장어킬러', rating: 5, content: '풍천장어는 비싼데 값은 합니다. 둘이 1인분 반이면 충분해요.', daysAgo: 33, helpfulCount: 22 },
      { authorNickname: '유적답사반', rating: 4, content: '고인돌 유적 넓어서 탐방열차 타는 걸 추천. 걸으면 다리 아픕니다.', daysAgo: 76, helpfulCount: 11 },
      { authorNickname: '꽃무릇시즌', rating: 5, content: '9월 중순 선운사 꽃무릇 시기 맞춰 갔는데 인생 사진 건졌어요.', daysAgo: 15, helpfulCount: 38 },
    ],
  },

  // -------------------------------------------------------------------------
  {
    code: 'SINAN',
    name: '신안',
    province: '전라남도',
    regionCode: '46910',
    extinctionRiskIndexBp: 980,
    riskGrade: '소멸고위험',
    tagline: '1004개의 섬, 색으로 칠해진 바다',
    summary: '퍼플섬 보라색 마을, 증도 태평염전, 섬마다 다른 색을 입은 천사의 섬.',
    description:
      '신안은 1004개의 섬으로 이루어져 있어 "천사의 섬"이라 불립니다. ' +
      '반월도·박지도는 지붕부터 다리까지 온통 보라색으로 칠해진 퍼플섬이고, ' +
      '증도의 태평염전은 국내 최대 규모 소금밭입니다. 섬마다 색과 표정이 다릅니다.',
    heroImageUrl: img('SINAN', 0),
    challengeWeeks: 8,
    targetSavingAmount: 280_000,
    oneWayFareAmount: 32_000,
    travelMinutesFromGwangju: 120,
    recommendedNights: 1,
    catchphrase: '모든 것을 비우는 섬 요양',
    photos: [
      { caption: '퍼플섬 보라색 다리' },
      { caption: '반월도 라벤더 정원' },
      { caption: '증도 태평염전' },
      { caption: '소금박물관' },
      { caption: '신안 뻘낙지 한 상' },
      { caption: '엘도라도 해변 노을' },
    ],
    routes: [
      {
        title: '신안 퍼플섬 코스',
        theme: 'ACTIVITY',
        summary: '온통 보라색인 섬을 걷고, 이튿날 사람 없는 해변으로 건너가는 1박 2일',
        stops: [
          { day: 1, placeName: '퍼플교(박지도~반월도)', description: '바다 위를 걷는 보라색 목교. 보라색 옷이나 소지품이 있으면 입장 할인.', stopType: 'ACTIVITY', stayMinutes: 90, estimatedAmount: 8_200, discountRate: 15, partnerName: '퍼플섬 관광안내소' },
          { day: 1, placeName: '반월도 라벤더 정원', description: '6~7월엔 라벤더가 만개합니다.', stopType: 'SIGHT', stayMinutes: 50, estimatedAmount: 0 },
          { day: 1, placeName: '퍼플섬 보라카페', description: '보라색 음료와 디저트. 콘셉트가 끝까지 갑니다.', stopType: 'CAFE', stayMinutes: 40, estimatedAmount: 8_000 },
          { day: 1, placeName: '안좌도 뻘낙지 식당', description: '신안 갯벌 낙지. 연포탕이 시원합니다.', stopType: 'MEAL', stayMinutes: 80, estimatedAmount: 32_900 },
          { day: 1, placeName: '퍼플섬 게스트하우스', description: '섬 안 유일한 숙소. 밤에 다리 조명이 보라색으로 켜집니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 95_890, discountRate: 25, partnerName: '퍼플섬 게스트하우스' },
          { day: 2, placeName: '자은도 분길해변', description: '천사대교를 건너 닿는 해변. 여름에도 한적합니다.', stopType: 'SIGHT', stayMinutes: 70, estimatedAmount: 0 },
          { day: 2, placeName: '임자도 대광해수욕장', description: '12km 백사장. 모래가 단단해 자전거도 달립니다.', stopType: 'SIGHT', stayMinutes: 80, estimatedAmount: 0 },
        ],
      },
      {
        title: '신안 소금과 갯벌 코스',
        theme: 'HISTORY',
        summary: '증도 태평염전에서 소금의 역사를 보고, 이튿날 갯벌 노을로 마무리하는 1박 2일',
        stops: [
          { day: 1, placeName: '태평염전', description: '국내 최대 단일 염전. 소금 채취 체험이 가능합니다.', stopType: 'SIGHT', stayMinutes: 80, estimatedAmount: 11_000, discountRate: 15, partnerName: '태평염전' },
          { day: 1, placeName: '소금박물관', description: '석조 소금창고를 개조한 박물관.', stopType: 'SIGHT', stayMinutes: 50, estimatedAmount: 3_000 },
          { day: 1, placeName: '증도 짱뚱어탕 식당', description: '갯벌 짱뚱어로 끓인 탕. 호불호 갈리지만 별미입니다.', stopType: 'MEAL', stayMinutes: 70, estimatedAmount: 16_000 },
          { day: 1, placeName: '엘도라도 리조트', description: '증도 서쪽 끝. 객실 창으로 바로 노을이 들어옵니다.', stopType: 'STAY', stayMinutes: 660, estimatedAmount: 54_800, discountRate: 15, partnerName: '엘도라도 리조트' },
          { day: 2, placeName: '증도 슬로시티 짱뚱어다리', description: '갯벌 위를 가로지르는 470m 목교. 물때에 맞춰 가세요.', stopType: 'ACTIVITY', stayMinutes: 60, estimatedAmount: 0 },
          { day: 2, placeName: '엘도라도 해변', description: '증도 서쪽 해변. 노을 시간에 맞춰 가세요.', stopType: 'SIGHT', stayMinutes: 70, estimatedAmount: 0 },
        ],
      },
    ],
    reviews: [
      { authorNickname: '보라덕후', rating: 5, content: '보라색 옷 입고 가면 입장료 할인돼요! 진짜 온 섬이 보라색이라 신기했습니다.', daysAgo: 39, helpfulCount: 45 },
      { authorNickname: '섬여행중독', rating: 4, content: '이동 시간이 좀 걸려요. 1박 이상 잡는 걸 추천합니다. 당일치기는 빡세요.', daysAgo: 64, helpfulCount: 27 },
      { authorNickname: '염전구경', rating: 5, content: '태평염전 소금 채취 체험 재밌었어요. 여름엔 진짜 더우니 모자 챙기세요.', daysAgo: 82, helpfulCount: 13 },
      { authorNickname: '노을수집가', rating: 5, content: '엘도라도 해변 노을이 인생 노을이었습니다. 삼각대 가져가세요.', daysAgo: 18, helpfulCount: 20 },
      { authorNickname: '낙지사랑', rating: 4, content: '뻘낙지 연포탕 국물이 진짜 시원해요. 값은 좀 나갑니다.', daysAgo: 120, helpfulCount: 7 },
    ],
  },
];

/** 제휴 쿠폰 — 여행지 연계 */
export interface SeedCoupon {
  code: string;
  partnerName: string;
  title: string;
  description: string;
  destinationCode: string | null;
  discountType: 'RATE' | 'AMOUNT';
  discountValue: number;
  minSpendAmount: number;
  maxDiscountAmount: number | null;
  validDays: number;
}

export const COUPONS: SeedCoupon[] = [
  { code: 'GANGJIN_STAY_20', partnerName: '강진 다산독채펜션', title: '숙박 20% 할인', description: '강진 지역 제휴 숙소 1박 20% 할인 (최대 3만원)', destinationCode: 'GANGJIN', discountType: 'RATE', discountValue: 20, minSpendAmount: 50_000, maxDiscountAmount: 30_000, validDays: 60 },
  { code: 'BOSEONG_TEA_5000', partnerName: '대한다원', title: '입장료 5,000원 할인', description: '보성 대한다원 입장 및 기념품 5,000원 할인', destinationCode: 'BOSEONG', discountType: 'AMOUNT', discountValue: 5_000, minSpendAmount: 0, maxDiscountAmount: null, validDays: 90 },
  { code: 'BOSEONG_SPA_15', partnerName: '율포해수녹차센터', title: '해수녹차탕 15% 할인', description: '율포 해수녹차탕 이용권 15% 할인', destinationCode: 'BOSEONG', discountType: 'RATE', discountValue: 15, minSpendAmount: 0, maxDiscountAmount: 10_000, validDays: 60 },
  { code: 'GOHEUNG_SPACE_3000', partnerName: '나로우주센터 우주과학관', title: '관람료 3,000원 할인', description: '고흥 나로우주센터 우주과학관 관람료 할인', destinationCode: 'GOHEUNG', discountType: 'AMOUNT', discountValue: 3_000, minSpendAmount: 0, maxDiscountAmount: null, validDays: 90 },
  { code: 'GOCHANG_EEL_10', partnerName: '선운사풍천장어', title: '풍천장어 10% 할인', description: '고창 선운사 인근 제휴 장어집 10% 할인', destinationCode: 'GOCHANG', discountType: 'RATE', discountValue: 10, minSpendAmount: 30_000, maxDiscountAmount: 15_000, validDays: 45 },
  { code: 'SINAN_PURPLE_25', partnerName: '퍼플섬 게스트하우스', title: '숙박 25% 할인', description: '신안 퍼플섬 인근 제휴 게스트하우스 25% 할인', destinationCode: 'SINAN', discountType: 'RATE', discountValue: 25, minSpendAmount: 40_000, maxDiscountAmount: 40_000, validDays: 60 },
  { code: 'HONAM_TRAIN_10000', partnerName: '야호 제휴 교통', title: '호남선 왕복 1만원 지원', description: '호남권 어느 여행지든 사용 가능한 교통비 지원 쿠폰', destinationCode: null, discountType: 'AMOUNT', discountValue: 10_000, minSpendAmount: 0, maxDiscountAmount: null, validDays: 120 },
];
