import {
  buildLegs,
  computeBounds,
  computeCenter,
  hasCoords,
  haversineKm,
  totalDistanceKm,
  type LegInput,
} from './geo';

const 강진 = { latitude: 34.6417, longitude: 126.7672 };
const 보성 = { latitude: 34.7714, longitude: 127.08 };
const 신안 = { latitude: 34.833, longitude: 126.351 };

describe('haversineKm', () => {
  it('같은 지점이면 0', () => {
    expect(haversineKm(강진, 강진)).toBe(0);
  });

  it('대칭이다 — a→b 와 b→a 가 같다', () => {
    expect(haversineKm(강진, 보성)).toBe(haversineKm(보성, 강진));
  });

  it('강진↔보성 직선거리가 상식적인 범위 (25~40km)', () => {
    const d = haversineKm(강진, 보성);
    expect(d).toBeGreaterThan(25);
    expect(d).toBeLessThan(40);
  });

  it('적도에서 경도 1도는 약 111km', () => {
    const d = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('위도 1도는 어디서나 약 111km', () => {
    const 적도 = haversineKm({ latitude: 0, longitude: 127 }, { latitude: 1, longitude: 127 });
    const 한국 = haversineKm({ latitude: 34, longitude: 127 }, { latitude: 35, longitude: 127 });
    expect(Math.abs(적도 - 한국)).toBeLessThan(1);
  });

  it('소수 둘째 자리까지만 반환한다', () => {
    const d = haversineKm(강진, 신안);
    expect(d).toBe(Math.round(d * 100) / 100);
  });
});

describe('computeBounds', () => {
  it('빈 배열이면 null', () => {
    expect(computeBounds([])).toBeNull();
  });

  it('점이 하나면 넓이 0 의 상자', () => {
    const b = computeBounds([강진])!;
    expect(b.north).toBe(b.south);
    expect(b.east).toBe(b.west);
  });

  it('모든 점을 포함한다', () => {
    const b = computeBounds([강진, 보성, 신안])!;
    for (const p of [강진, 보성, 신안]) {
      expect(p.latitude).toBeLessThanOrEqual(b.north);
      expect(p.latitude).toBeGreaterThanOrEqual(b.south);
      expect(p.longitude).toBeLessThanOrEqual(b.east);
      expect(p.longitude).toBeGreaterThanOrEqual(b.west);
    }
  });

  it('북/동이 남/서보다 크거나 같다', () => {
    const b = computeBounds([강진, 보성, 신안])!;
    expect(b.north).toBeGreaterThanOrEqual(b.south);
    expect(b.east).toBeGreaterThanOrEqual(b.west);
  });
});

describe('computeCenter', () => {
  it('빈 배열이면 null', () => {
    expect(computeCenter([])).toBeNull();
  });

  it('점이 하나면 그 점 자신', () => {
    expect(computeCenter([강진])).toEqual(강진);
  });

  /**
   * 이 테스트가 핵심이다. 평균 중심이면 몰려 있는 두 점 쪽으로 끌려가지만,
   * 경계 중심은 바깥 점까지 대칭으로 감싼다 — 그래야 마커가 화면 밖으로 안 밀린다.
   */
  it('마커가 한쪽에 몰려도 경계의 중심을 쓴다 (평균이 아니다)', () => {
    const points = [
      { latitude: 34.0, longitude: 126.0 },
      { latitude: 34.0, longitude: 126.0 },
      { latitude: 34.0, longitude: 126.0 },
      { latitude: 36.0, longitude: 128.0 },
    ];
    const center = computeCenter(points)!;
    expect(center.latitude).toBe(35);
    expect(center.longitude).toBe(127);
  });
});

describe('buildLegs / totalDistanceKm', () => {
  const stops: LegInput[] = [
    { sortOrder: 1, placeName: '백련사', ...강진 },
    { sortOrder: 2, placeName: '대한다원', ...보성 },
    { sortOrder: 3, placeName: '태평염전', ...신안 },
  ];

  it('경유지 n개면 구간은 n-1개', () => {
    expect(buildLegs(stops)).toHaveLength(2);
  });

  it('경유지가 1개 이하면 구간이 없다', () => {
    expect(buildLegs([stops[0]])).toEqual([]);
    expect(buildLegs([])).toEqual([]);
  });

  it('입력 순서를 그대로 이어 붙인다', () => {
    const legs = buildLegs(stops);
    expect(legs[0]).toMatchObject({ fromPlaceName: '백련사', toPlaceName: '대한다원' });
    expect(legs[1]).toMatchObject({ fromPlaceName: '대한다원', toPlaceName: '태평염전' });
  });

  it('합계는 각 구간의 합이다', () => {
    const legs = buildLegs(stops);
    const expected = legs.reduce((s, l) => s + l.distanceKm, 0);
    expect(totalDistanceKm(legs)).toBeCloseTo(expected, 2);
  });

  it('구간이 없으면 합계 0', () => {
    expect(totalDistanceKm([])).toBe(0);
  });
});

describe('hasCoords', () => {
  it('정상 좌표는 통과', () => {
    expect(hasCoords({ latitude: 34.6, longitude: 126.7 })).toBe(true);
  });

  it('null 은 거른다', () => {
    expect(hasCoords({ latitude: null, longitude: 126.7 })).toBe(false);
    expect(hasCoords({ latitude: 34.6, longitude: null })).toBe(false);
  });

  /** 0,0 은 좌표 누락의 전형적 증상(Null Island)이라 유효값으로 보지 않는다 */
  it('0,0 은 거른다', () => {
    expect(hasCoords({ latitude: 0, longitude: 0 })).toBe(false);
  });

  it('범위를 벗어난 값은 거른다', () => {
    expect(hasCoords({ latitude: 91, longitude: 126 })).toBe(false);
    expect(hasCoords({ latitude: 34, longitude: 181 })).toBe(false);
    expect(hasCoords({ latitude: Number.NaN, longitude: 126 })).toBe(false);
  });
});
