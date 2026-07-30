/**
 * 페르소나 48종 — `페르소나 완성.xlsx` 확정안을 그대로 옮긴 것.
 *
 *   12개 카테고리 × 4개 시간대 = 48종
 *
 * 시간대 경계는 코드의 TIME_BANDS 와 정확히 일치한다.
 *   22~05 심야새벽 = NIGHT / 05~11 아침 = MORNING / 11~17 낮 = LUNCH / 17~22 저녁 = EVENING
 *
 * displayName 은 엑셀 원본 그대로다. tagline / description 은 엑셀에 없어서
 * 시간대·카테고리 조합으로 생성한다 — 문구를 바꾸려면 이 파일만 고치면 된다.
 */
import type { TimeBand } from '../../../src/common/constants/persona';
import type { PersonaCategory } from '../../../src/common/constants/persona-category';

/** 엑셀 열 순서: 심야새벽 → 아침 → 낮 → 저녁 */
const COLUMN_ORDER: TimeBand[] = ['NIGHT', 'MORNING', 'LUNCH', 'EVENING'];

/** 엑셀 행 순서 그대로. [카테고리, 심야새벽, 아침, 낮, 저녁] */
const GRID: [PersonaCategory, string, string, string, string][] = [
  ['DELIVERY_FOOD', '야식 배달 러버', '해장 배달 러버', '런치 단골배달족', '혈당스파이크 취침형'],
  ['DINING_OUT', '심야 국밥 순례자', '아침 백반족', '런치 원정대', '저녁 회식 고정러'],
  ['CAFE_SNACK', '밤샘 카페인러', '모닝커피 루틴러', '오후 당충전러', '저녁 디저트 마무리족'],
  ['ALCOHOL_NIGHTLIFE', '새벽 마지막잔 사수대', '해장 한잔파', '낮술 낭만파', '퇴근 후 한잔러'],
  ['TRANSPORT_CAR', '막차 놓친 택시러', '지각 방지 택시러', '한낮 자유 드라이버', '퇴근길 택시러'],
  ['SHOPPING', '새벽 충동 지름신', '얼리버드 쇼퍼', '한낮 쇼핑러', '마감 할인 헌터'],
  ['GAME_INAPP', '새벽 뽑기 지름신', '출근 전 일일퀘스트족', '점심 짬 게이머', '저녁 정주행 과금러'],
  ['SUBSCRIPTION_OTT', '새벽 정주행러', '출근길 스트리밍족', '틀어놓는 구독러', '저녁 정주행 고정러'],
  ['CONVENIENCE_STORE', '심야 편의점 단골', '아침 삼각김밥족', '낮 간식 충전러', '퇴근길 편의점러'],
  ['HEALTH_FITNESS', '심야 상비약족', '새벽 헬스 얼리버드', '점심 짬 운동러', '퇴근 후 운동러'],
  ['EDUCATION', '새벽 인강 완주러', '미라클모닝 공부러', '낮 시간 자기계발러', '퇴근 후 클래스족'],
  ['TRAVEL_STAY', '새벽 특가 사냥꾼', '얼리버드 예약러', '점심시간 여행 계획러', '퇴근 후 떠날 궁리족'],
];

/**
 * 시간대별 톤. 엑셀 B 사본의 주석("충동" / "얼리버드, 부지런")을 반영했다.
 */
const TIME_COPY: Record<TimeBand, { window: string; phrase: string; tone: string; iconSuffix: string }> = {
  NIGHT: {
    window: '밤 10시~새벽 5시',
    phrase: '모두가 잠든 시간',
    tone: '충동적으로 지갑이 열리는 때예요.',
    iconSuffix: 'night',
  },
  MORNING: {
    window: '아침 5시~11시',
    phrase: '하루를 여는 아침',
    tone: '부지런한 얼리버드형이에요.',
    iconSuffix: 'morning',
  },
  LUNCH: {
    window: '낮 11시~오후 5시',
    phrase: '해가 높은 한낮',
    tone: '일과 사이사이에 쓰는 편이에요.',
    iconSuffix: 'lunch',
  },
  EVENING: {
    window: '저녁 5시~밤 10시',
    phrase: '하루를 마무리하는 저녁',
    tone: '퇴근 후 보상 소비가 많아요.',
    iconSuffix: 'evening',
  },
};

const CATEGORY_COPY: Record<PersonaCategory, { label: string; verb: string; iconKey: string }> = {
  DELIVERY_FOOD: { label: '배달음식', verb: '배달앱을 켜는', iconKey: 'delivery' },
  DINING_OUT: { label: '외식', verb: '밖에서 한 끼 해결하는', iconKey: 'dining' },
  CAFE_SNACK: { label: '카페+간식', verb: '커피와 간식을 챙기는', iconKey: 'cafe' },
  ALCOHOL_NIGHTLIFE: { label: '술+유흥', verb: '한잔 기울이는', iconKey: 'alcohol' },
  TRANSPORT_CAR: { label: '교통+자동차', verb: '이동에 돈을 쓰는', iconKey: 'transport' },
  SHOPPING: { label: '쇼핑', verb: '장바구니를 채우는', iconKey: 'shopping' },
  GAME_INAPP: { label: '게임+인앱', verb: '게임에 결제하는', iconKey: 'game' },
  SUBSCRIPTION_OTT: { label: '구독+OTT', verb: '구독 서비스를 켜두는', iconKey: 'subscription' },
  CONVENIENCE_STORE: { label: '편의점', verb: '편의점에 들르는', iconKey: 'convenience' },
  HEALTH_FITNESS: { label: '의료+건강+피트니스', verb: '건강에 투자하는', iconKey: 'health' },
  EDUCATION: { label: '교육', verb: '배움에 지갑을 여는', iconKey: 'education' },
  TRAVEL_STAY: { label: '여행+숙박', verb: '떠날 준비를 하는', iconKey: 'travel' },
};

export interface SeedPersona {
  code: string;
  timeBand: TimeBand;
  category: PersonaCategory;
  displayName: string;
  tagline: string;
  description: string;
  iconKey: string;
}

/** 48행을 만든다 */
export function buildPersonaRows(): SeedPersona[] {
  const rows: SeedPersona[] = [];

  for (const [category, ...names] of GRID) {
    COLUMN_ORDER.forEach((timeBand, index) => {
      const cat = CATEGORY_COPY[category];
      const time = TIME_COPY[timeBand];

      rows.push({
        code: `${timeBand}_${category}`,
        timeBand,
        category,
        displayName: names[index],
        tagline: `${time.phrase}, ${cat.verb} 당신`,
        description:
          `${time.window} 사이에 결제가 가장 많고, 그중 지출이 가장 큰 항목은 ‘${cat.label}’입니다. ` +
          `${time.tone} 이 습관에서 조금만 덜어내면 호남 어딘가에 다녀올 수 있어요.`,
        iconKey: `${cat.iconKey}-${time.iconSuffix}`,
      });
    });
  }

  return rows;
}

export const EXPECTED_PERSONA_COUNT = GRID.length * COLUMN_ORDER.length;
