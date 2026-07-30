/**
 * MCC(업종코드) → 카테고리 매핑 (분류 파이프라인 4순위) — **12종 기준**.
 *
 * 전역 키워드 사전이 놓친 건을 업종코드로 건진다.
 * MockTransaction 의 mcc 는 30% 정도가 null 이므로 이 단계도 만능은 아니다 —
 * 그래서 마지막에 UNCLASSIFIED 가 남고, 사용자에게 직접 물어보는 화면이 존재한다.
 */
import type { TxCategory } from '../../../src/common/constants/tx-category';

export interface SeedMccMapping {
  mcc: string;
  category: TxCategory;
  label: string;
}

export const MCC_MAPPINGS: SeedMccMapping[] = [
  // 음식 — MCC 만으로는 배달/외식을 구분할 수 없다. 채널 접두가 있으면 키워드 사전이
  // 먼저 잡으므로, 여기까지 내려온 건 매장 결제로 보고 외식으로 분류한다.
  { mcc: '5811', category: 'DINING_OUT', label: '출장뷔페' },
  { mcc: '5812', category: 'DINING_OUT', label: '일반음식점' },
  { mcc: '5814', category: 'CAFE_SNACK', label: '패스트푸드·카페' },

  // 술+유흥
  { mcc: '5813', category: 'ALCOHOL_NIGHTLIFE', label: '주점·바' },
  { mcc: '5921', category: 'ALCOHOL_NIGHTLIFE', label: '주류 판매점' },

  // 편의점 / 식료품
  { mcc: '5499', category: 'CONVENIENCE_STORE', label: '편의점' },
  { mcc: '5411', category: 'SHOPPING', label: '식료품점·슈퍼마켓' },

  // 쇼핑
  { mcc: '5311', category: 'SHOPPING', label: '백화점' },
  { mcc: '5399', category: 'SHOPPING', label: '잡화·종합소매' },
  { mcc: '5651', category: 'SHOPPING', label: '의류' },
  { mcc: '5661', category: 'SHOPPING', label: '신발' },
  { mcc: '5691', category: 'SHOPPING', label: '의류 액세서리' },
  { mcc: '5712', category: 'SHOPPING', label: '가구' },
  { mcc: '5732', category: 'SHOPPING', label: '전자제품' },
  { mcc: '5912', category: 'SHOPPING', label: '드럭스토어' },
  { mcc: '5977', category: 'SHOPPING', label: '화장품' },
  { mcc: '5999', category: 'SHOPPING', label: '기타 소매' },

  // 교통+자동차
  { mcc: '4111', category: 'TRANSPORT_CAR', label: '대중교통' },
  { mcc: '4112', category: 'TRANSPORT_CAR', label: '철도' },
  { mcc: '4121', category: 'TRANSPORT_CAR', label: '택시' },
  { mcc: '4131', category: 'TRANSPORT_CAR', label: '버스' },
  { mcc: '4784', category: 'TRANSPORT_CAR', label: '통행료' },
  { mcc: '5541', category: 'TRANSPORT_CAR', label: '주유소' },
  { mcc: '5542', category: 'TRANSPORT_CAR', label: '셀프주유소' },
  { mcc: '7512', category: 'TRANSPORT_CAR', label: '렌터카' },
  { mcc: '7523', category: 'TRANSPORT_CAR', label: '주차장' },

  // 여행+숙박
  { mcc: '3000', category: 'TRAVEL_STAY', label: '항공사' },
  { mcc: '3500', category: 'TRAVEL_STAY', label: '호텔' },
  { mcc: '4511', category: 'TRAVEL_STAY', label: '항공' },
  { mcc: '4722', category: 'TRAVEL_STAY', label: '여행사' },
  { mcc: '7011', category: 'TRAVEL_STAY', label: '숙박' },

  // 게임+인앱
  { mcc: '5816', category: 'GAME_INAPP', label: '디지털 게임' },
  { mcc: '7994', category: 'GAME_INAPP', label: '게임·오락실' },
  { mcc: '5817', category: 'GAME_INAPP', label: '앱 인앱결제' },

  // 교육 (문화·여가 포함)
  { mcc: '5942', category: 'EDUCATION', label: '서점' },
  { mcc: '5943', category: 'EDUCATION', label: '문구' },
  { mcc: '8220', category: 'EDUCATION', label: '대학·전문교육' },
  { mcc: '8299', category: 'EDUCATION', label: '학원·교육서비스' },
  { mcc: '7832', category: 'EDUCATION', label: '영화관' },
  { mcc: '7929', category: 'EDUCATION', label: '공연' },
  { mcc: '7991', category: 'EDUCATION', label: '전시·관광지' },

  // 의료+건강+피트니스
  { mcc: '7230', category: 'HEALTH_FITNESS', label: '미용실' },
  { mcc: '7297', category: 'HEALTH_FITNESS', label: '마사지·스파' },
  { mcc: '7997', category: 'HEALTH_FITNESS', label: '헬스·스포츠클럽' },
  { mcc: '8011', category: 'HEALTH_FITNESS', label: '병원' },
  { mcc: '8021', category: 'HEALTH_FITNESS', label: '치과' },
  { mcc: '8043', category: 'HEALTH_FITNESS', label: '안경점' },
  { mcc: '8062', category: 'HEALTH_FITNESS', label: '종합병원' },

  // 구독+OTT
  { mcc: '5968', category: 'SUBSCRIPTION_OTT', label: '정기구독' },
  { mcc: '7841', category: 'SUBSCRIPTION_OTT', label: '영상 스트리밍' },

  // 고정지출 (통신·보험·공과금)
  { mcc: '4814', category: 'FIXED_BILLS', label: '통신요금' },
  { mcc: '4899', category: 'FIXED_BILLS', label: '방송·통신' },
  { mcc: '4900', category: 'FIXED_BILLS', label: '공과금' },
  { mcc: '6300', category: 'FIXED_BILLS', label: '보험' },
];
