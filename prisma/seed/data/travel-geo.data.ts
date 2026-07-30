/**
 * 여행지·경유지 좌표 (WGS84 / EPSG:4326).
 *
 * ── 정확도에 대한 정직한 고지 ────────────────────────────────────────────────
 * 여기 값은 각 장소의 **공개된 대략적 위치를 손으로 옮겨 적은 근사 좌표**다.
 * 측량값이 아니고, 실제 출입구·주차장 위치와 수십~수백 m 어긋날 수 있다.
 * 지도에 핀을 찍고 "대충 어디쯤이고 얼마나 떨어져 있는지" 를 보여주는 데는 충분하지만,
 * 내비게이션 목적지로 그대로 넘기기에는 부족하다.
 *
 * 실서비스로 갈 때는 카카오/네이버 지오코딩 API 로 상호명을 조회해 이 표를 통째로
 * 교체하면 된다. 스키마(`latitude`/`longitude`)와 지도 API 는 그대로 두면 되고,
 * 바꿀 곳은 이 파일 하나뿐이다.
 *
 * ── 좌표를 여기 따로 둔 이유 ─────────────────────────────────────────────────
 * travel.data.ts 의 경유지 정의에 좌표를 섞으면 한 줄이 너무 길어지고,
 * "이 숫자는 근사값" 이라는 맥락이 41군데로 흩어진다. placeName 을 키로 조인한다.
 *
 * 좌표계는 위도(latitude, 북위 +), 경도(longitude, 동경 +) 순서다.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** 여행지 대표 좌표 — 지도 탭의 여행지 마커 위치 */
export const DESTINATION_COORDS: Record<string, GeoPoint> = {
  GANGJIN: { latitude: 34.6417, longitude: 126.7672 }, // 강진군청 일원
  BOSEONG: { latitude: 34.7714, longitude: 127.08 }, // 보성군청 일원
  GOHEUNG: { latitude: 34.611, longitude: 127.285 }, // 고흥군청 일원
  GOCHANG: { latitude: 35.435, longitude: 126.702 }, // 고창군청 일원
  SINAN: { latitude: 34.833, longitude: 126.351 }, // 신안군청(압해도) 일원
};

/**
 * 경유지 좌표 — `placeName` 을 키로 쓴다.
 *
 * travel.data.ts 의 placeName 과 **글자 하나까지 같아야** 한다.
 * 어긋나면 시드가 즉시 실패한다 (아래 assertGeoCoverage).
 */
export const STOP_COORDS: Record<string, GeoPoint> = {
  // --- 강진 -------------------------------------------------------------------
  백련사: { latitude: 34.6297, longitude: 126.7053 },
  '다산초당 뿌리길': { latitude: 34.6285, longitude: 126.7 },
  다산초당: { latitude: 34.6268, longitude: 126.696 },
  해태식당: { latitude: 34.642, longitude: 126.768 },
  고려청자박물관: { latitude: 34.539, longitude: 126.71 },
  '가우도 출렁다리': { latitude: 34.593, longitude: 126.717 },
  '가우도 청자타워 카페': { latitude: 34.5915, longitude: 126.7195 },
  마량놀토수산시장: { latitude: 34.429, longitude: 126.818 },
  '강진만 생태공원': { latitude: 34.625, longitude: 126.758 },
  '강진 다산독채펜션': { latitude: 34.635, longitude: 126.72 },
  영랑생가: { latitude: 34.6423, longitude: 126.7669 },
  '가우도 오토캠핑장': { latitude: 34.594, longitude: 126.716 },
  '강진 하멜기념관': { latitude: 34.617, longitude: 126.813 },
  '병영 돼지불고기': { latitude: 34.6155, longitude: 126.8115 },

  // --- 보성 -------------------------------------------------------------------
  대한다원: { latitude: 34.736, longitude: 127.079 },
  '다원 녹차 아이스크림': { latitude: 34.7345, longitude: 127.08 },
  보성녹돈식당: { latitude: 34.771, longitude: 127.081 },
  율포해수녹차센터: { latitude: 34.69, longitude: 127.123 },
  '득량역 추억의 거리': { latitude: 34.759, longitude: 127.193 },
  '보성 해양레일바이크': { latitude: 34.693, longitude: 127.13 },
  '율포항 회센터': { latitude: 34.689, longitude: 127.125 },
  율포솔밭해변: { latitude: 34.688, longitude: 127.118 },
  '율포 해수녹차 리조트': { latitude: 34.6895, longitude: 127.124 },
  '제암산 자연휴양림': { latitude: 34.828, longitude: 127.033 },
  '율포솔밭 펜션': { latitude: 34.6885, longitude: 127.1195 },
  '벌교 꼬막정식': { latitude: 34.839, longitude: 127.343 },

  // --- 고흥 -------------------------------------------------------------------
  '나로우주센터 우주과학관': { latitude: 34.431, longitude: 127.535 },
  우주발사전망대: { latitude: 34.479, longitude: 127.472 },
  '고흥 바지락회무침 식당': { latitude: 34.61, longitude: 127.284 },
  남열해돋이해수욕장: { latitude: 34.522, longitude: 127.472 },
  '쑥섬(애도)': { latitude: 34.479, longitude: 127.495 },
  '나로도 항구 카페': { latitude: 34.48, longitude: 127.493 },
  '팔영산 편백숲': { latitude: 34.665, longitude: 127.38 },
  '고흥 유자 한과점': { latitude: 34.57, longitude: 127.24 },
  '나로도 해변 펜션': { latitude: 34.482, longitude: 127.49 },
  '고흥만 수변공원': { latitude: 34.562, longitude: 127.2 },
  '고흥 매생이 칼국수': { latitude: 34.6095, longitude: 127.2855 },
  '팔영산 자연휴양림': { latitude: 34.662, longitude: 127.382 },

  // --- 고창 -------------------------------------------------------------------
  학원농장: { latitude: 35.483, longitude: 126.625 },
  '학원농장 보리밭 카페': { latitude: 35.4835, longitude: 126.626 },
  선운사: { latitude: 35.497, longitude: 126.578 },
  '선운사 앞 풍천장어': { latitude: 35.492, longitude: 126.583 },
  '고창 고인돌 유적지': { latitude: 35.433, longitude: 126.633 },
  '고창읍성(모양성)': { latitude: 35.431, longitude: 126.697 },
  '고창 한정식': { latitude: 35.433, longitude: 126.701 },
  '구시포 해변': { latitude: 35.456, longitude: 126.483 },
  '선운산 유스호스텔': { latitude: 35.493, longitude: 126.582 },
  '선운사 도솔암': { latitude: 35.506, longitude: 126.562 },
  '고창 복분자 와이너리': { latitude: 35.46, longitude: 126.64 },
  '고창읍성 한옥마을': { latitude: 35.4325, longitude: 126.699 },
  '고창 갯벌 소금학교': { latitude: 35.447, longitude: 126.49 },

  // --- 신안 -------------------------------------------------------------------
  '퍼플교(박지도~반월도)': { latitude: 34.729, longitude: 126.118 },
  '반월도 라벤더 정원': { latitude: 34.725, longitude: 126.123 },
  '퍼플섬 보라카페': { latitude: 34.727, longitude: 126.12 },
  '안좌도 뻘낙지 식당': { latitude: 34.739, longitude: 126.135 },
  태평염전: { latitude: 35.013, longitude: 126.152 },
  소금박물관: { latitude: 35.014, longitude: 126.154 },
  '증도 짱뚱어탕 식당': { latitude: 35.006, longitude: 126.161 },
  '엘도라도 해변': { latitude: 34.988, longitude: 126.14 },
  '퍼플섬 게스트하우스': { latitude: 34.728, longitude: 126.121 },
  '자은도 분길해변': { latitude: 34.889, longitude: 126.105 },
  '임자도 대광해수욕장': { latitude: 35.087, longitude: 126.085 },
  '엘도라도 리조트': { latitude: 34.989, longitude: 126.142 },
  '증도 슬로시티 짱뚱어다리': { latitude: 35.009, longitude: 126.158 },
};

/** 호남권 대략 경계 — 좌표 오타(위경도 뒤바뀜 등)를 시드에서 잡기 위한 sanity check */
const HONAM_BOUNDS = { minLat: 33.9, maxLat: 36.3, minLng: 125.8, maxLng: 127.9 };

/**
 * 시드가 부르는 검증기.
 *
 * 좌표 표와 여행지 데이터가 어긋나면 **조용히 마커가 빠지는 대신 시드가 죽는다.**
 * 발표 당일 지도에 핀 하나가 없는 것보다 시드 단계에서 터지는 편이 낫다.
 */
export function assertGeoCoverage(
  destinationCodes: string[],
  stopPlaceNames: string[],
): void {
  const problems: string[] = [];

  for (const code of destinationCodes) {
    if (!DESTINATION_COORDS[code]) problems.push(`여행지 좌표 누락: ${code}`);
  }

  for (const name of new Set(stopPlaceNames)) {
    if (!STOP_COORDS[name]) problems.push(`경유지 좌표 누락: "${name}"`);
  }

  const all: [string, GeoPoint][] = [
    ...Object.entries(DESTINATION_COORDS),
    ...Object.entries(STOP_COORDS),
  ];
  for (const [name, p] of all) {
    if (
      p.latitude < HONAM_BOUNDS.minLat ||
      p.latitude > HONAM_BOUNDS.maxLat ||
      p.longitude < HONAM_BOUNDS.minLng ||
      p.longitude > HONAM_BOUNDS.maxLng
    ) {
      problems.push(
        `좌표가 호남권 밖: "${name}" (${p.latitude}, ${p.longitude}) — 위경도 순서를 확인하세요`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(['여행지 좌표 검증 실패:', ...problems.map((p) => `  - ${p}`)].join('\n'));
  }
}
