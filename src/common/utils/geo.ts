/**
 * 지도 계산 — 순수 함수. 외부 지도 SDK 나 네트워크에 의존하지 않는다.
 *
 * 프론트가 어떤 지도 라이브러리(카카오/네이버/Leaflet/Mapbox)를 쓰든 그대로 먹을 수 있는
 * 형태로만 계산한다: 위경도 쌍, 경계 상자(bounds), 중심점, 구간 거리.
 * 타일 좌표나 특정 SDK 의 투영법은 다루지 않는다 — 그건 프론트의 몫이다.
 *
 * 거리는 하버사인(haversine)으로 구한 **직선(대권) 거리**다. 도로 거리가 아니다.
 * 실제 주행거리는 이보다 20~40% 길다고 보면 된다. 화면에서도 그렇게 표기해야 한다.
 */

/** 지구 평균 반지름 (km). WGS84 평균 반지름 6371.0088km 를 반올림한 값. */
const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** 지도 자동 맞춤(fit bounds)에 쓰는 경계 상자 */
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** 소수점 n자리 반올림. 부동소수 오차가 응답에 새는 것을 막는다. */
const round = (value: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/**
 * 좌표가 실제로 쓸 수 있는 값인가.
 *
 * Prisma 의 `Float?` 는 null 을 줄 수 있고, 0/0 은 서아프리카 앞바다(Null Island)라
 * 좌표 누락의 전형적인 증상이다. 둘 다 걸러낸다.
 *
 * 제네릭인 이유: `rows.filter(hasCoords)` 로 걸렀을 때 좌표 외의 필드가 살아 있어야 한다.
 * 반환 타입을 고정하면 필터 뒤에 남는 게 위경도 둘뿐인 객체가 돼 버린다.
 */
export function hasCoords<T extends { latitude: number | null; longitude: number | null }>(
  p: T,
): p is T & { latitude: number; longitude: number } {
  if (p.latitude === null || p.longitude === null) return false;
  if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return false;
  if (p.latitude === 0 && p.longitude === 0) return false;
  return Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}

/**
 * 두 지점 사이의 대권 거리 (km, 소수 둘째 자리).
 *
 * 하버사인 공식. 국내 거리(수백 km 이하)에서는 오차가 0.5% 미만이라 충분하다.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))), 2);
}

/**
 * 경계 상자. 점이 하나뿐이면 north===south 인 0 넓이 상자가 나온다 —
 * 프론트는 그 경우 bounds 대신 center + 기본 줌을 쓰면 된다.
 *
 * 한국은 날짜변경선을 걸치지 않으므로 경도 랩어라운드는 다루지 않는다.
 */
export function computeBounds(points: LatLng[]): MapBounds | null {
  if (points.length === 0) return null;

  let north = points[0].latitude;
  let south = points[0].latitude;
  let east = points[0].longitude;
  let west = points[0].longitude;

  for (const p of points) {
    if (p.latitude > north) north = p.latitude;
    if (p.latitude < south) south = p.latitude;
    if (p.longitude > east) east = p.longitude;
    if (p.longitude < west) west = p.longitude;
  }

  return {
    north: round(north, 6),
    south: round(south, 6),
    east: round(east, 6),
    west: round(west, 6),
  };
}

/**
 * 지도 중심점. **점들의 평균이 아니라 경계 상자의 중심**이다.
 *
 * 평균을 쓰면 한 지역에 마커가 몰렸을 때 중심이 그쪽으로 끌려가 외곽 마커가 화면 밖으로
 * 밀려난다. 경계 중심은 항상 모든 마커를 대칭으로 감싼다.
 */
export function computeCenter(points: LatLng[]): LatLng | null {
  const bounds = computeBounds(points);
  if (!bounds) return null;
  return {
    latitude: round((bounds.north + bounds.south) / 2, 6),
    longitude: round((bounds.east + bounds.west) / 2, 6),
  };
}

/** 경유지 사이의 한 구간 */
export interface RouteLeg {
  /** 출발 경유지의 sortOrder */
  fromSortOrder: number;
  /** 도착 경유지의 sortOrder */
  toSortOrder: number;
  fromPlaceName: string;
  toPlaceName: string;
  /** 직선거리 (km) */
  distanceKm: number;
}

export interface LegInput extends LatLng {
  sortOrder: number;
  placeName: string;
}

/**
 * 경유지 목록을 인접 구간으로 변환한다.
 *
 * 입력 순서를 그대로 따른다 (호출부가 sortOrder 로 정렬해서 넘길 것).
 * 경유지가 1개 이하면 구간이 없으므로 빈 배열이다.
 */
export function buildLegs(stops: LegInput[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < stops.length; i += 1) {
    const from = stops[i - 1];
    const to = stops[i];
    legs.push({
      fromSortOrder: from.sortOrder,
      toSortOrder: to.sortOrder,
      fromPlaceName: from.placeName,
      toPlaceName: to.placeName,
      distanceKm: haversineKm(from, to),
    });
  }
  return legs;
}

/** 구간 거리 합계 (km, 소수 둘째 자리). 구간이 없으면 0. */
export function totalDistanceKm(legs: RouteLeg[]): number {
  return round(
    legs.reduce((sum, leg) => sum + leg.distanceKm, 0),
    2,
  );
}
