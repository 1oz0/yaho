/**
 * AI 응답 검증 · 일정 계산 · 폴백 선택 — 전부 순수 함수.
 *
 * Claude 가 돌려준 것은 "장소 선택 + 순서 + 문구" 뿐이고, 여기서 아래를 전부 서버가 확정한다:
 *   - 존재하지 않는 장소 걸러내기 (환각 방어)
 *   - 중복 제거, 개수 검증
 *   - 도착 시각 (시작 시각 + 체류 + 이동시간 누적)
 *   - 금액·소요시간 합계
 *
 * 그래서 이 파일에는 네트워크도 Nest 의존성도 없다. 단위 테스트로 전부 덮인다.
 */
import type { TimeBand } from '../../common/constants/persona';
import type { PersonaCategory } from '../../common/constants/persona-category';
import { haversineKm, hasCoords } from '../../common/utils/geo';
import {
  MAX_COURSE_STOPS,
  MIN_COURSE_STOPS,
  MIN_DAY1_STOPS,
  MIN_DAY2_STOPS,
  type AiCourseDraft,
} from './course-prompt';

// ---------------------------------------------------------------------------
// 이동 시간 추정
// ---------------------------------------------------------------------------

/**
 * 시골 국도·지방도 평균 주행 속도 (km/h).
 * 호남권 여행지 대부분이 왕복 2차선 국도라 고속도로 기준(100km/h)은 현실과 멀다.
 */
const AVERAGE_SPEED_KMH = 50;

/** 주차·도보·길찾기에 붙는 최소 여유 (분). 아무리 가까워도 이만큼은 걸린다. */
const MIN_TRAVEL_MINUTES = 10;

/**
 * 두 경유지 사이 이동 시간 추정 (분, 5분 단위 올림).
 *
 * 직선거리 기반이라 실제 도로 거리보다 짧다. 이를 보정하려고 우회계수 1.3 을 곱한다
 * (일반적인 도로우회율 1.2~1.4 의 중간값). 정확한 값이 필요하면 지도 API 의
 * 경로탐색 결과로 대체해야 하지만, "대략 몇 분 걸리는지" 를 보여주는 데는 충분하다.
 */
export const DETOUR_FACTOR = 1.3;

export function estimateTravelMinutes(
  from: { latitude: number | null; longitude: number | null },
  to: { latitude: number | null; longitude: number | null },
): number {
  if (!hasCoords(from) || !hasCoords(to)) return MIN_TRAVEL_MINUTES;

  const roadKm = haversineKm(from, to) * DETOUR_FACTOR;
  const minutes = (roadKm / AVERAGE_SPEED_KMH) * 60;
  const rounded = Math.ceil(minutes / 5) * 5;
  return Math.max(MIN_TRAVEL_MINUTES, rounded);
}

// ---------------------------------------------------------------------------
// 시각 산술 ("HH:MM")
// ---------------------------------------------------------------------------

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeString(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function parseMinutesOfDay(time: string): number {
  const m = TIME_PATTERN.exec(time);
  if (!m) throw new Error(`잘못된 시각 형식: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 자정을 넘기면 그대로 24시간을 감아 표기한다 (하루 코스라 실제로는 거의 없다). */
export function formatMinutesOfDay(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 페르소나 시간대별 기본 출발 시각 (Day 1).
 *
 * 심야형이라고 밤에 출발시킬 수는 없으니, "평소 활동이 늦은 사람일수록 조금 늦게 출발"
 * 정도로만 반영한다. AI 가 startTime 을 유효하게 주면 그 값이 우선이고,
 * 이 표는 폴백이거나 AI 값이 형식에 안 맞을 때 쓴다.
 */
export const DEFAULT_START_TIME: Record<TimeBand, string> = {
  MORNING: '08:30',
  LUNCH: '10:30',
  EVENING: '12:00',
  NIGHT: '13:00',
};

/**
 * Day 2 시작 시각 (§12-3).
 *
 * 하루가 바뀌면 시계를 다시 아침으로 돌린다 — 숙소 체류 11시간을 그대로 누적하면
 * "다음 날 새벽 3시 도착" 같은 일정이 나온다. 페르소나 시간대를 반영하지 않는 이유는
 * 체크아웃 시간이 정해져 있어 늦게 시작할 수 없기 때문이다.
 */
export const DAY2_START_TIME = '09:00';

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

/** 시드에서 온 경유지 원본. 금액·시간·좌표·할인의 유일한 출처다. */
export interface SeedStop {
  placeName: string;
  description: string;
  stopType: string;
  stayMinutes: number;
  estimatedAmount: number;
  latitude: number | null;
  longitude: number | null;
  /** 야호 제휴 할인율 × 10000 (15% = 1500). 없으면 null. */
  discountRateBp: number | null;
  partnerName: string | null;
}

/** 1박 2일의 Day 구분 */
export type DayNumber = 1 | 2;

/** 시드 루트의 경유지 — Day 구분을 이미 갖고 있다 */
export type SeedRouteStop = SeedStop & { dayNumber: DayNumber };

export function isStay(stop: { stopType: string }): boolean {
  return stop.stopType === 'STAY';
}

/** 검증을 통과한 경유지 — AI 문구와 시드 수치가 합쳐진 상태 */
export interface ValidatedStop {
  seed: SeedStop;
  dayNumber: DayNumber;
  activity: string;
  personaTip: string;
}

export interface ValidatedCourse {
  title: string;
  summary: string;
  personaFitReason: string;
  budgetNote: string;
  /** Day 1 시작 시각. Day 2 는 항상 DAY2_START_TIME 에 시작한다. */
  startTime: string;
  packingTips: string[];
  stops: ValidatedStop[];
  /** AI 가 지어낸(후보에 없던) 장소명. 폴백은 아니지만 로그에 남길 가치가 있다. */
  droppedPlaceNames: string[];
}

export type ValidationResult =
  | { ok: true; course: ValidatedCourse }
  | { ok: false; reason: string };

/** 문자열 정리 — 앞뒤 공백 제거 후 상한 길이로 자른다. */
function clean(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

/**
 * Claude 응답을 검증해 확정 코스로 바꾼다.
 *
 * structured outputs 가 **형태**는 보장하지만 **내용**은 보장하지 않는다.
 * 여기서 막는 것: 후보에 없는 장소, 중복 방문, 경유지 부족, 빈 문구, 잘못된 시각.
 */
export function validateAiCourse(
  draft: AiCourseDraft,
  candidates: SeedStop[],
  fallbackStartTime: string,
): ValidationResult {
  const byName = new Map(candidates.map((c) => [c.placeName, c]));

  if (!Array.isArray(draft.stops)) {
    return { ok: false, reason: 'stops 가 배열이 아닙니다.' };
  }

  const stops: ValidatedStop[] = [];
  const droppedPlaceNames: string[] = [];
  const seen = new Set<string>();

  for (const raw of draft.stops) {
    const name = clean(raw?.placeName, 100);
    const seed = byName.get(name);

    // 후보에 없는 장소 = 환각. 좌표도 금액도 없으니 버린다.
    if (!seed) {
      if (name.length > 0) droppedPlaceNames.push(name);
      continue;
    }
    if (seen.has(name)) continue; // 같은 곳 두 번 방문은 코스가 아니다
    seen.add(name);

    stops.push({
      seed,
      dayNumber: raw?.day === 2 ? 2 : 1,
      activity: clean(raw?.activity, 200) || seed.description,
      personaTip: clean(raw?.personaTip, 120),
    });

    if (stops.length >= MAX_COURSE_STOPS) break;
  }

  if (stops.length < MIN_COURSE_STOPS) {
    return {
      ok: false,
      reason:
        `유효한 경유지가 ${stops.length}곳뿐입니다 (최소 ${MIN_COURSE_STOPS}곳 필요). ` +
        (droppedPlaceNames.length > 0
          ? `후보에 없는 장소: ${droppedPlaceNames.join(', ')}`
          : ''),
    };
  }

  // --- 1박 2일 구조 검증 (§12-3) --------------------------------------------
  // Day 를 섞어서 주면 순서대로 정렬한다. 모델이 순서를 어긴 것뿐이지 코스 자체는 쓸 수 있다.
  stops.sort((a, b) => a.dayNumber - b.dayNumber);

  const day1 = stops.filter((s) => s.dayNumber === 1);
  const day2 = stops.filter((s) => s.dayNumber === 2);
  const stays = stops.filter((s) => isStay(s.seed));

  if (day1.length < MIN_DAY1_STOPS) {
    return { ok: false, reason: `Day1 경유지가 ${day1.length}곳입니다 (${MIN_DAY1_STOPS}곳 이상 필요).` };
  }
  if (day2.length < MIN_DAY2_STOPS) {
    return { ok: false, reason: `Day2 경유지가 ${day2.length}곳입니다 (${MIN_DAY2_STOPS}곳 이상 필요).` };
  }
  if (stays.length !== 1) {
    return { ok: false, reason: `숙소(STAY)가 ${stays.length}곳입니다 (1박이므로 정확히 1곳).` };
  }

  // 숙소는 Day1 의 마지막이어야 한다. 아니면 그 자리로 옮긴다 —
  // "숙소에 들렀다가 다시 관광지로" 같은 동선은 나오면 안 된다.
  const stay = stays[0];
  if (stay.dayNumber !== 1 || day1[day1.length - 1] !== stay) {
    const withoutStay = stops.filter((s) => s !== stay);
    const reordered = [
      ...withoutStay.filter((s) => s.dayNumber === 1),
      { ...stay, dayNumber: 1 as DayNumber },
      ...withoutStay.filter((s) => s.dayNumber === 2),
    ];
    stops.length = 0;
    stops.push(...reordered);
    // Day2 가 비면 안 되므로 다시 확인한다 (숙소가 Day2 의 유일한 항목이었던 경우)
    if (stops.filter((s) => s.dayNumber === 2).length < MIN_DAY2_STOPS) {
      return { ok: false, reason: '숙소를 Day1 로 옮기면 Day2 가 비어 버립니다.' };
    }
  }

  const title = clean(draft.title, 60);
  const summary = clean(draft.summary, 200);
  if (title.length === 0 || summary.length === 0) {
    return { ok: false, reason: '제목 또는 요약이 비어 있습니다.' };
  }

  const startTime =
    typeof draft.startTime === 'string' && isValidTimeString(draft.startTime.trim())
      ? draft.startTime.trim()
      : fallbackStartTime;

  const packingTips = (Array.isArray(draft.packingTips) ? draft.packingTips : [])
    .map((t) => clean(t, 80))
    .filter((t) => t.length > 0)
    .slice(0, 4);

  return {
    ok: true,
    course: {
      title,
      summary,
      personaFitReason: clean(draft.personaFitReason, 400),
      budgetNote: clean(draft.budgetNote, 200),
      startTime,
      packingTips,
      stops,
      droppedPlaceNames,
    },
  };
}

// ---------------------------------------------------------------------------
// 일정 계산
// ---------------------------------------------------------------------------

export interface ScheduledStop {
  sortOrder: number;
  dayNumber: DayNumber;
  placeName: string;
  stopType: string;
  arrivalTime: string;
  stayMinutes: number;
  /** 할인 전 금액 (원) */
  estimatedAmount: number;
  /** 제휴 할인액 (원). 제휴처가 아니면 0. */
  discountAmount: number;
  /** 할인 적용 후 실제 지불 금액 (원) */
  payableAmount: number;
  discountRateBp: number | null;
  partnerName: string | null;
  activity: string;
  personaTip: string;
  latitude: number | null;
  longitude: number | null;
  /** 직전 경유지에서 여기까지의 이동 추정 시간 (분). 각 Day 의 첫 경유지는 0. */
  travelMinutesFromPrevious: number;
}

export interface DaySchedule {
  dayNumber: DayNumber;
  startTime: string;
  endTime: string;
  /** 이 날의 체류 + 이동 시간 (분). 숙박 시간은 포함하지 않는다. */
  durationMinutes: number;
  /** 이 날 경유지의 할인 후 금액 합 (원) */
  subtotalAmount: number;
  stops: ScheduledStop[];
}

export interface ScheduledCourse {
  stops: ScheduledStop[];
  days: DaySchedule[];
  /** 경유지 할인 전 금액의 합 (원) */
  stopsGrossAmount: number;
  /** 제휴 할인 총액 (원) */
  discountAmount: number;
  /** 경유지 할인 후 금액의 합 (원) */
  totalEstimatedAmount: number;
  /** Day1 + Day2 의 활동 시간 합 (분). **숙박 시간은 빼고 센다.** */
  totalDurationMinutes: number;
}

/** 제휴 할인액. 원 단위로 내림한다 — 표시 금액보다 더 깎이면 안 된다. */
export function discountOf(amount: number, rateBp: number | null): number {
  if (!rateBp || rateBp <= 0) return 0;
  return Math.floor((amount * rateBp) / 10_000);
}

/**
 * 도착 시각과 합계를 확정한다 (§12-3).
 *
 * ── Day 를 나누는 이유 ──────────────────────────────────────────────────────
 * 숙소 체류가 11시간이라 그냥 이어 붙이면 Day2 첫 경유지가 "새벽 3시 도착"이 된다.
 * 하루가 바뀌면 시계를 아침으로 되돌리고, **총 소요시간에서도 숙박 시간을 뺀다** —
 * "2일 32시간 코스" 는 안내가 아니라 오류다.
 *
 * 총 소요시간에 **이동 시간은 포함**한다. 체류 시간만 더하면
 * "5시간 코스" 라고 해놓고 실제로는 7시간 걸리는 안내가 된다.
 */
export function buildSchedule(stops: ValidatedStop[], day1StartTime: string): ScheduledCourse {
  const scheduled: ScheduledStop[] = [];
  const days: DaySchedule[] = [];

  let sortOrder = 0;

  for (const dayNumber of [1, 2] as const) {
    const dayStops = stops.filter((s) => s.dayNumber === dayNumber);
    if (dayStops.length === 0) continue;

    const startTime = dayNumber === 1 ? day1StartTime : DAY2_START_TIME;
    let cursor = parseMinutesOfDay(startTime);
    const startMinutes = cursor;
    const scheduledForDay: ScheduledStop[] = [];

    for (const [index, item] of dayStops.entries()) {
      const travelMinutes =
        index === 0 ? 0 : estimateTravelMinutes(dayStops[index - 1].seed, item.seed);
      cursor += travelMinutes;

      const discount = discountOf(item.seed.estimatedAmount, item.seed.discountRateBp);
      sortOrder += 1;

      const row: ScheduledStop = {
        sortOrder,
        dayNumber,
        placeName: item.seed.placeName,
        stopType: item.seed.stopType,
        arrivalTime: formatMinutesOfDay(cursor),
        stayMinutes: item.seed.stayMinutes,
        estimatedAmount: item.seed.estimatedAmount,
        discountAmount: discount,
        payableAmount: item.seed.estimatedAmount - discount,
        discountRateBp: item.seed.discountRateBp,
        partnerName: item.seed.partnerName,
        activity: item.activity,
        personaTip: item.personaTip,
        latitude: item.seed.latitude,
        longitude: item.seed.longitude,
        travelMinutesFromPrevious: travelMinutes,
      };
      scheduledForDay.push(row);
      scheduled.push(row);

      // 숙소는 그 날의 마지막이다. 체류(수면) 시간을 시계에 더하지 않는다.
      if (!isStay(item.seed)) cursor += item.seed.stayMinutes;
    }

    days.push({
      dayNumber,
      startTime,
      endTime: formatMinutesOfDay(cursor),
      durationMinutes: cursor - startMinutes,
      subtotalAmount: scheduledForDay.reduce((s, x) => s + x.payableAmount, 0),
      stops: scheduledForDay,
    });
  }

  const stopsGrossAmount = scheduled.reduce((s, x) => s + x.estimatedAmount, 0);
  const discountAmount = scheduled.reduce((s, x) => s + x.discountAmount, 0);

  return {
    stops: scheduled,
    days,
    stopsGrossAmount,
    discountAmount,
    totalEstimatedAmount: stopsGrossAmount - discountAmount,
    totalDurationMinutes: days.reduce((s, d) => s + d.durationMinutes, 0),
  };
}

// ---------------------------------------------------------------------------
// 정산 요약 (화면 S18)
// ---------------------------------------------------------------------------

export interface Settlement {
  /** 챌린지로 아낀 돈 = 여행 예산 (원) */
  savedAmount: number;
  /** 경유지 할인 전 합계 (원) */
  stopsGrossAmount: number;
  /** 야호 제휴 할인 (원). 표시할 때는 음수로 보여준다. */
  discountAmount: number;
  /** 광주 왕복 교통비 (원) = 편도 × 2 */
  transportAmount: number;
  /** 예상 여행 경비 = 경유지(할인 후) + 교통비 (원) */
  totalTripAmount: number;
  /** 아낀 돈 − 여행 경비. 음수면 예산을 넘는다. */
  remainingAmount: number;
  /** 예산 안에서 갈 수 있는가 */
  withinBudget: boolean;
}

/**
 * S18 정산 요약을 계산한다. **AI 가 아니라 서버가 더한다** (§10-2).
 *
 * 교통비는 편도 × 2 다. 코스 경유지에 넣지 않고 여기서만 더하는 이유는,
 * 교통이 AI 코스 후보에 섞이면 "광주역에서 90분 체류" 같은 일정이 나오기 때문이다.
 */
export function computeSettlement(input: {
  savedAmount: number;
  stopsGrossAmount: number;
  discountAmount: number;
  oneWayFareAmount: number;
}): Settlement {
  const transportAmount = input.oneWayFareAmount * 2;
  const totalTripAmount = input.stopsGrossAmount - input.discountAmount + transportAmount;
  const remainingAmount = input.savedAmount - totalTripAmount;

  return {
    savedAmount: input.savedAmount,
    stopsGrossAmount: input.stopsGrossAmount,
    discountAmount: input.discountAmount,
    transportAmount,
    totalTripAmount,
    remainingAmount,
    withinBudget: remainingAmount >= 0,
  };
}

// ---------------------------------------------------------------------------
// 폴백
// ---------------------------------------------------------------------------

/**
 * 페르소나 카테고리 → 선호 루트 테마.
 *
 * Claude 를 못 쓸 때(키 없음·타임아웃·검증 실패) 시드 루트 중 하나를 골라야 하는데,
 * 그 선택도 페르소나를 반영해야 "AI 없이도 개인화된 것처럼" 보인다.
 * 아무 근거 없는 매핑이 아니라 "그 소비 습관이 여행에서 발현될 만한 형태" 로 이었다.
 */
export const PREFERRED_THEME: Record<PersonaCategory, string> = {
  DELIVERY_FOOD: 'FOOD', // 배달로 때우던 끼니 → 현지에서 제대로 먹기
  DINING_OUT: 'FOOD',
  CAFE_SNACK: 'FOOD',
  ALCOHOL_NIGHTLIFE: 'FOOD',
  CONVENIENCE_STORE: 'FOOD',
  SHOPPING: 'ACTIVITY', // 사는 즐거움 → 하는 즐거움으로
  GAME_INAPP: 'ACTIVITY',
  TRANSPORT_CAR: 'ACTIVITY',
  SUBSCRIPTION_OTT: 'HEALING', // 화면 앞의 휴식 → 실제 휴식
  HEALTH_FITNESS: 'HEALING',
  TRAVEL_STAY: 'HEALING',
  EDUCATION: 'HISTORY', // 배우는 데 쓰던 돈 → 현장에서 배우기
};

export interface FallbackRouteCandidate {
  id: string;
  title: string;
  theme: string;
  summary: string;
  sortOrder: number;
  stops: SeedRouteStop[];
}

/**
 * 폴백에 쓸 시드 루트를 고른다.
 *
 * 선호 테마가 있으면 그중 sortOrder 가 앞선 것, 없으면 전체에서 sortOrder 가 앞선 것.
 * **완전히 결정론적**이라 같은 페르소나면 항상 같은 루트가 나온다.
 */
export function pickFallbackRoute(
  routes: FallbackRouteCandidate[],
  category: PersonaCategory,
): FallbackRouteCandidate | null {
  if (routes.length === 0) return null;

  const preferred = PREFERRED_THEME[category];
  const sorted = [...routes].sort((a, b) => a.sortOrder - b.sortOrder);

  return sorted.find((r) => r.theme === preferred) ?? sorted[0];
}

/**
 * 시드 루트를 AI 코스와 같은 모양으로 재구성한다.
 *
 * 문구는 시드에 있는 것을 그대로 쓴다. "AI 인 척" 하지 않고
 * 응답의 `generatedBy: "FALLBACK"` 으로 정직하게 표시한다.
 */
export function buildFallbackCourse(
  route: FallbackRouteCandidate,
  persona: { displayName: string; categoryLabel: string },
  budgetAmount: number,
  timeBand: TimeBand,
): ValidatedCourse {
  const won = (n: number): string => `${n.toLocaleString('ko-KR')}원`;
  const total = route.stops.reduce((s, st) => s + st.estimatedAmount, 0);

  return {
    title: route.title,
    summary: route.summary,
    personaFitReason:
      `${persona.displayName} 유형은 ${persona.categoryLabel}에 지출이 몰려 있습니다. ` +
      `이 코스는 그 소비를 여행지에서의 경험으로 바꿔 보도록 구성된 ${route.theme === 'FOOD' ? '미식' : route.theme === 'HEALING' ? '휴식' : route.theme === 'HISTORY' ? '역사' : '체험'} 코스입니다.`,
    budgetNote:
      `아낀 ${won(budgetAmount)} 중 약 ${won(total)}이면 이 코스를 돌 수 있습니다. ` +
      '남는 금액은 교통비와 숙박에 쓰세요.',
    startTime: DEFAULT_START_TIME[timeBand],
    packingTips: ['편한 신발', '보조배터리', '현금 약간 (소규모 상점은 카드가 안 될 수 있습니다)'],
    stops: route.stops.map((seed) => ({
      seed,
      dayNumber: seed.dayNumber,
      activity: seed.description,
      personaTip: '',
    })),
    droppedPlaceNames: [],
  };
}
