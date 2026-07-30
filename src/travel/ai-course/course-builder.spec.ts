import type { AiCourseDraft } from './course-prompt';
import {
  DAY2_START_TIME,
  DEFAULT_START_TIME,
  computeSettlement,
  discountOf,
  PREFERRED_THEME,
  buildFallbackCourse,
  buildSchedule,
  estimateTravelMinutes,
  formatMinutesOfDay,
  isValidTimeString,
  parseMinutesOfDay,
  pickFallbackRoute,
  validateAiCourse,
  type FallbackRouteCandidate,
  type SeedRouteStop,
} from './course-builder';
import { PERSONA_CATEGORIES } from '../../common/constants/persona-category';
import { TIME_BANDS } from '../../common/constants/persona';

const stop = (
  placeName: string,
  overrides: Partial<SeedRouteStop> = {},
): SeedRouteStop => ({
  placeName,
  description: `${placeName} 설명`,
  stopType: 'SIGHT',
  stayMinutes: 60,
  estimatedAmount: 10_000,
  latitude: 34.6,
  longitude: 126.7,
  dayNumber: 1,
  discountRateBp: null,
  partnerName: null,
  ...overrides,
});

const CANDIDATES: SeedRouteStop[] = [
  stop('백련사', { latitude: 34.6297, longitude: 126.7053 }),
  stop('다산초당', { latitude: 34.6268, longitude: 126.696, estimatedAmount: 0 }),
  stop('해태식당', {
    latitude: 34.642,
    longitude: 126.768,
    stopType: 'MEAL',
    stayMinutes: 80,
    estimatedAmount: 32_000,
  }),
  stop('강진 다산독채펜션', {
    latitude: 34.635,
    longitude: 126.72,
    stopType: 'STAY',
    stayMinutes: 660,
    estimatedAmount: 78_000,
    discountRateBp: 2000,
    partnerName: '강진 다산독채펜션',
  }),
  stop('영랑생가', { latitude: 34.6423, longitude: 126.7669, estimatedAmount: 0, dayNumber: 2 }),
  stop('고려청자박물관', {
    latitude: 34.539,
    longitude: 126.71,
    estimatedAmount: 4_000,
    dayNumber: 2,
    discountRateBp: 1500,
    partnerName: '고려청자박물관',
  }),
];

const draft = (overrides: Partial<AiCourseDraft> = {}): AiCourseDraft => ({
  title: '강진 다산 사색 코스',
  summary: '숲길을 걷고 남도 한상을 받는 하루',
  personaFitReason: '배달로 때우던 끼니를 제대로 된 한 상으로 바꿔 봅니다.',
  budgetNote: '아낀 돈으로 충분합니다.',
  startTime: '09:00',
  packingTips: ['편한 신발', '양산'],
  stops: [
    { placeName: '백련사', day: 1, activity: '동백숲 산책', personaTip: '아침 공기가 좋습니다' },
    { placeName: '다산초당', day: 1, activity: '마루에 앉아 강진만 보기', personaTip: '' },
    { placeName: '해태식당', day: 1, activity: '남도 한정식', personaTip: '배달앱 대신 여기서' },
    { placeName: '강진 다산독채펜션', day: 1, activity: '독채에서 하룻밤', personaTip: '' },
    { placeName: '영랑생가', day: 2, activity: '초가 마당 둘러보기', personaTip: '' },
    { placeName: '고려청자박물관', day: 2, activity: '물레 체험', personaTip: '' },
  ],
  ...overrides,
});

describe('시각 산술', () => {
  it('HH:MM 형식을 검증한다', () => {
    expect(isValidTimeString('09:00')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('9:00')).toBe(false);
    expect(isValidTimeString('09:60')).toBe(false);
    expect(isValidTimeString('오전 9시')).toBe(false);
  });

  it('parse 와 format 은 왕복한다', () => {
    for (const t of ['00:00', '09:05', '13:30', '23:59']) {
      expect(formatMinutesOfDay(parseMinutesOfDay(t))).toBe(t);
    }
  });

  it('자정을 넘기면 감아서 표기한다', () => {
    expect(formatMinutesOfDay(parseMinutesOfDay('23:30') + 60)).toBe('00:30');
  });
});

describe('estimateTravelMinutes', () => {
  it('좌표가 없으면 최소 여유시간을 준다', () => {
    expect(estimateTravelMinutes(stop('a', { latitude: null }), CANDIDATES[0])).toBe(10);
  });

  it('아주 가까워도 최소 10분은 잡는다 (주차·도보)', () => {
    const a = stop('a', { latitude: 34.6, longitude: 126.7 });
    const b = stop('b', { latitude: 34.6001, longitude: 126.7001 });
    expect(estimateTravelMinutes(a, b)).toBe(10);
  });

  it('멀수록 오래 걸린다 (단조 증가)', () => {
    const base = stop('base', { latitude: 34.6, longitude: 126.7 });
    const near = stop('near', { latitude: 34.7, longitude: 126.7 });
    const far = stop('far', { latitude: 35.5, longitude: 126.7 });
    expect(estimateTravelMinutes(base, far)).toBeGreaterThan(estimateTravelMinutes(base, near));
  });

  it('5분 단위로 떨어진다', () => {
    const a = stop('a', { latitude: 34.6, longitude: 126.7 });
    const b = stop('b', { latitude: 35.0, longitude: 127.1 });
    expect(estimateTravelMinutes(a, b) % 5).toBe(0);
  });

  it('대칭이다', () => {
    expect(estimateTravelMinutes(CANDIDATES[0], CANDIDATES[3])).toBe(
      estimateTravelMinutes(CANDIDATES[3], CANDIDATES[0]),
    );
  });
});

describe('validateAiCourse', () => {
  it('정상 응답을 통과시킨다', () => {
    const r = validateAiCourse(draft(), CANDIDATES, '10:00');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.course.stops).toHaveLength(6);
    expect(r.course.startTime).toBe('09:00');
    expect(r.course.droppedPlaceNames).toEqual([]);
  });

  /** 환각 방어 — 후보에 없는 장소는 좌표도 금액도 없으므로 반드시 버려야 한다 */
  it('후보에 없는 장소를 버리고 기록에 남긴다', () => {
    const r = validateAiCourse(
      draft({
        stops: [
          { placeName: '백련사', day: 1 as const, activity: 'a', personaTip: '' },
          { placeName: '강진 스타벅스 1호점', day: 1 as const, activity: 'b', personaTip: '' },
          { placeName: '다산초당', day: 1 as const, activity: 'c', personaTip: '' },
          { placeName: '강진 다산독채펜션', day: 1 as const, activity: 'd', personaTip: '' },
          { placeName: '영랑생가', day: 2 as const, activity: 'e', personaTip: '' },
          { placeName: '고려청자박물관', day: 2 as const, activity: 'f', personaTip: '' },
        ],
      }),
      CANDIDATES,
      '10:00',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.course.stops.map((s) => s.seed.placeName)).toEqual([
      '백련사', '다산초당', '강진 다산독채펜션', '영랑생가', '고려청자박물관',
    ]);
    expect(r.course.droppedPlaceNames).toEqual(['강진 스타벅스 1호점']);
  });

  it('버린 뒤 경유지가 3곳 미만이면 실패시킨다', () => {
    const r = validateAiCourse(
      draft({
        stops: [
          { placeName: '백련사', day: 1 as const, activity: 'a', personaTip: '' },
          { placeName: '없는곳1', day: 1 as const, activity: 'b', personaTip: '' },
          { placeName: '없는곳2', day: 1 as const, activity: 'c', personaTip: '' },
        ],
      }),
      CANDIDATES,
      '10:00',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('없는곳1');
  });

  it('같은 장소를 두 번 넣으면 한 번만 남긴다', () => {
    const r = validateAiCourse(
      draft({
        stops: [
          { placeName: '백련사', day: 1 as const, activity: 'a', personaTip: '' },
          { placeName: '백련사', day: 1 as const, activity: 'b', personaTip: '' },
          { placeName: '다산초당', day: 1 as const, activity: 'c', personaTip: '' },
          { placeName: '강진 다산독채펜션', day: 1 as const, activity: 'd', personaTip: '' },
          { placeName: '영랑생가', day: 2 as const, activity: 'e', personaTip: '' },
          { placeName: '고려청자박물관', day: 2 as const, activity: 'f', personaTip: '' },
        ],
      }),
      CANDIDATES,
      '10:00',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.course.stops).toHaveLength(5);
  });

  it('경유지가 8곳을 넘으면 앞에서 8곳만 쓴다', () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      stop(`장소${i}`, i === 3 ? { stopType: 'STAY', stayMinutes: 660 } : {}),
    );
    const r = validateAiCourse(
      draft({
        stops: many.map((s, i) => ({ placeName: s.placeName, day: (i <= 3 ? 1 : 2) as 1 | 2, activity: 'a', personaTip: '' })),
      }),
      many,
      '10:00',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.course.stops).toHaveLength(8);
  });

  it('startTime 이 형식에 안 맞으면 폴백 시각을 쓴다', () => {
    const r = validateAiCourse(draft({ startTime: '아침 일찍' }), CANDIDATES, '10:30');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.course.startTime).toBe('10:30');
  });

  it('제목이 비면 실패시킨다', () => {
    const r = validateAiCourse(draft({ title: '   ' }), CANDIDATES, '10:00');
    expect(r.ok).toBe(false);
  });

  it('activity 가 비면 시드 설명으로 채운다', () => {
    const r = validateAiCourse(
      draft({
        stops: [
          { placeName: '백련사', day: 1 as const, activity: '', personaTip: '' },
          { placeName: '다산초당', day: 1 as const, activity: 'c', personaTip: '' },
          { placeName: '강진 다산독채펜션', day: 1 as const, activity: 'd', personaTip: '' },
          { placeName: '영랑생가', day: 2 as const, activity: 'e', personaTip: '' },
          { placeName: '고려청자박물관', day: 2 as const, activity: 'f', personaTip: '' },
        ],
      }),
      CANDIDATES,
      '10:00',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.course.stops[0].activity).toBe('백련사 설명');
  });

  it('준비물 팁은 4개로 자르고 빈 값을 버린다', () => {
    const r = validateAiCourse(
      draft({ packingTips: ['a', '', '  ', 'b', 'c', 'd', 'e'] }),
      CANDIDATES,
      '10:00',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.course.packingTips).toEqual(['a', 'b', 'c', 'd']);
  });

  it('stops 가 배열이 아니면 실패시킨다', () => {
    const bad = draft();
    (bad as unknown as { stops: unknown }).stops = null;
    expect(validateAiCourse(bad, CANDIDATES, '10:00').ok).toBe(false);
  });
});

describe('buildSchedule — 1박 2일 (§12-3)', () => {
  const validated = validateAiCourse(draft(), CANDIDATES, '10:00');
  if (!validated.ok) throw new Error('픽스처가 검증을 통과해야 합니다');
  const schedule = buildSchedule(validated.course.stops, '09:00');

  it('Day 1 / Day 2 로 나뉜다', () => {
    expect(schedule.days.map((d) => d.dayNumber)).toEqual([1, 2]);
    expect(schedule.days[0].stops).toHaveLength(4);
    expect(schedule.days[1].stops).toHaveLength(2);
  });

  it('각 Day 의 첫 경유지는 그 날 시작 시각에 도착하고 이동시간이 0이다', () => {
    expect(schedule.days[0].stops[0].arrivalTime).toBe('09:00');
    expect(schedule.days[0].stops[0].travelMinutesFromPrevious).toBe(0);
    expect(schedule.days[1].stops[0].arrivalTime).toBe(DAY2_START_TIME);
    expect(schedule.days[1].stops[0].travelMinutesFromPrevious).toBe(0);
  });

  /**
   * 이게 이번 단계의 핵심이다. 숙소 체류 660분을 그대로 이어 붙이면
   * Day2 첫 경유지가 "새벽 3시 도착" 이 된다.
   */
  it('Day 2 는 시계를 아침으로 되돌린다 (숙소 11시간이 누적되지 않는다)', () => {
    const day1End = parseMinutesOfDay(schedule.days[0].endTime);
    const day2Start = parseMinutesOfDay(schedule.days[1].startTime);
    expect(day2Start).toBeLessThan(day1End);
  });

  it('도착 시각은 각 Day 안에서만 단조 증가한다', () => {
    for (const day of schedule.days) {
      const times = day.stops.map((s) => parseMinutesOfDay(s.arrivalTime));
      for (let i = 1; i < times.length; i += 1) {
        expect(times[i]).toBeGreaterThan(times[i - 1]);
      }
    }
  });

  it('숙소는 Day 1 의 마지막이다', () => {
    const last = schedule.days[0].stops[schedule.days[0].stops.length - 1];
    expect(last.stopType).toBe('STAY');
  });

  /** "2일 32시간 코스" 는 안내가 아니라 오류다 */
  it('총 소요시간에 숙박 시간이 들어가지 않는다', () => {
    const stayMinutes = schedule.stops.find((s) => s.stopType === 'STAY')!.stayMinutes;
    expect(stayMinutes).toBe(660);
    expect(schedule.totalDurationMinutes).toBeLessThan(660);
  });

  it('총 소요시간 = Day1 + Day2 활동시간', () => {
    expect(schedule.totalDurationMinutes).toBe(
      schedule.days[0].durationMinutes + schedule.days[1].durationMinutes,
    );
  });

  it('할인 전 합계는 경유지 금액의 합이다', () => {
    const expected = validated.course.stops.reduce((s, x) => s + x.seed.estimatedAmount, 0);
    expect(schedule.stopsGrossAmount).toBe(expected);
  });

  it('할인 후 합계 = 할인 전 − 할인액', () => {
    expect(schedule.totalEstimatedAmount).toBe(
      schedule.stopsGrossAmount - schedule.discountAmount,
    );
    expect(schedule.discountAmount).toBeGreaterThan(0); // 펜션 20% + 박물관 15%
  });

  it('경유지별 할인이 정확하다 (원 단위 내림)', () => {
    const 펜션 = schedule.stops.find((s) => s.placeName === '강진 다산독채펜션')!;
    expect(펜션.discountAmount).toBe(discountOf(78_000, 2000)); // 15,600
    expect(펜션.payableAmount).toBe(78_000 - 15_600);
  });

  it('제휴처가 아니면 할인 0', () => {
    const 백련사 = schedule.stops.find((s) => s.placeName === '백련사')!;
    expect(백련사.discountAmount).toBe(0);
    expect(백련사.payableAmount).toBe(백련사.estimatedAmount);
  });

  it('Day 소계는 그 날 경유지의 할인 후 금액 합이다', () => {
    for (const day of schedule.days) {
      expect(day.subtotalAmount).toBe(day.stops.reduce((s, x) => s + x.payableAmount, 0));
    }
  });

  it('sortOrder 는 Day 를 가로질러 1부터 연속이다', () => {
    expect(schedule.stops.map((s) => s.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('좌표를 시드에서 그대로 옮긴다 (지도가 이걸 쓴다)', () => {
    expect(schedule.stops[0].latitude).toBe(34.6297);
    expect(schedule.stops[0].longitude).toBe(126.7053);
  });
});

describe('discountOf', () => {
  it('원 단위로 내림한다 (표시 금액보다 더 깎이면 안 된다)', () => {
    expect(discountOf(8_200, 1500)).toBe(1_230);
    expect(discountOf(11_000, 1500)).toBe(1_650);
    expect(discountOf(54_800, 1500)).toBe(8_220);
  });

  it('할인율이 없으면 0', () => {
    expect(discountOf(50_000, null)).toBe(0);
    expect(discountOf(50_000, 0)).toBe(0);
  });
});

describe('computeSettlement — 화면 S18 정산 요약', () => {
  const s = computeSettlement({
    savedAmount: 140_000,
    stopsGrossAmount: 114_000,
    discountAmount: 16_200,
    oneWayFareAmount: 12_000,
  });

  it('교통비는 편도 × 2 다', () => {
    expect(s.transportAmount).toBe(24_000);
  });

  it('여행 경비 = 경유지(할인 후) + 교통비', () => {
    expect(s.totalTripAmount).toBe(114_000 - 16_200 + 24_000);
  });

  it('잔액 = 아낀 돈 − 여행 경비', () => {
    expect(s.remainingAmount).toBe(140_000 - s.totalTripAmount);
    expect(s.withinBudget).toBe(true);
  });

  it('예산을 넘으면 음수 잔액과 withinBudget=false', () => {
    const over = computeSettlement({
      savedAmount: 50_000,
      stopsGrossAmount: 114_000,
      discountAmount: 0,
      oneWayFareAmount: 12_000,
    });
    expect(over.remainingAmount).toBeLessThan(0);
    expect(over.withinBudget).toBe(false);
  });
});

describe('pickFallbackRoute', () => {
  const routes: FallbackRouteCandidate[] = [
    { id: 'r1', title: '역사 코스', theme: 'HISTORY', summary: '', sortOrder: 0, stops: CANDIDATES },
    { id: 'r2', title: '힐링 코스', theme: 'HEALING', summary: '', sortOrder: 1, stops: CANDIDATES },
  ];

  it('선호 테마가 있으면 그것을 고른다', () => {
    expect(pickFallbackRoute(routes, 'HEALTH_FITNESS')?.id).toBe('r2'); // HEALING
    expect(pickFallbackRoute(routes, 'EDUCATION')?.id).toBe('r1'); // HISTORY
  });

  it('선호 테마가 없으면 sortOrder 가 앞선 것을 고른다', () => {
    expect(pickFallbackRoute(routes, 'DELIVERY_FOOD')?.id).toBe('r1'); // FOOD 없음
  });

  it('결정론적이다 — 여러 번 불러도 같은 결과', () => {
    const picks = Array.from({ length: 5 }, () => pickFallbackRoute(routes, 'SHOPPING')?.id);
    expect(new Set(picks).size).toBe(1);
  });

  it('루트가 없으면 null', () => {
    expect(pickFallbackRoute([], 'SHOPPING')).toBeNull();
  });
});

describe('상수 커버리지', () => {
  /** 카테고리를 추가하고 매핑을 잊으면 폴백이 undefined 테마를 찾게 된다 */
  it('12개 페르소나 카테고리 전부에 선호 테마가 있다', () => {
    for (const c of PERSONA_CATEGORIES) {
      expect(PREFERRED_THEME[c]).toBeDefined();
    }
  });

  it('4개 시간대 전부에 기본 출발 시각이 있고 형식이 맞다', () => {
    for (const t of TIME_BANDS) {
      expect(isValidTimeString(DEFAULT_START_TIME[t])).toBe(true);
    }
  });

  it('늦은 시간대 페르소나일수록 늦게 출발한다', () => {
    const times = TIME_BANDS.map((t) => parseMinutesOfDay(DEFAULT_START_TIME[t]));
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });
});

describe('buildFallbackCourse', () => {
  const route: FallbackRouteCandidate = {
    id: 'r1',
    title: '강진 다산 사색 코스',
    theme: 'HISTORY',
    summary: '숲길을 걷는 하루',
    sortOrder: 0,
    stops: CANDIDATES,
  };

  it('AI 코스와 같은 모양을 만든다', () => {
    const c = buildFallbackCourse(
      route,
      { displayName: '혈당스파이크 취침형', categoryLabel: '배달음식' },
      300_000,
      'EVENING',
    );
    expect(c.title).toBe(route.title);
    expect(c.stops).toHaveLength(CANDIDATES.length);
    expect(c.startTime).toBe(DEFAULT_START_TIME.EVENING);
    expect(c.personaFitReason).toContain('배달음식');
    expect(c.budgetNote).toContain('300,000원');
  });

  it('폴백 코스도 일정 계산을 통과한다', () => {
    const c = buildFallbackCourse(route, { displayName: 'X', categoryLabel: 'Y' }, 100_000, 'MORNING');
    const s = buildSchedule(c.stops, c.startTime);
    expect(s.stops).toHaveLength(CANDIDATES.length);
    expect(s.stopsGrossAmount).toBe(124_000);
    expect(s.days.map((d) => d.dayNumber)).toEqual([1, 2]);
  });
});
