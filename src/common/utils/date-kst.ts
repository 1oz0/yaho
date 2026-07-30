/**
 * KST(Asia/Seoul) 날짜 계산 유틸 — 순수 함수.
 *
 * 왜 외부 타임존 라이브러리를 쓰지 않는가:
 *   한국은 1988년 이후 서머타임이 없다. KST 는 항상 UTC+9 고정이므로
 *   오프셋 산술만으로 100% 정확하다. 의존성 하나를 줄이는 편이 낫다.
 *
 * 규약 (docs/design.md §7-1)
 *   - DB 저장은 UTC, 계산은 KST, 응답은 KST ISO 문자열
 *   - 월 경계는 매월 1일 00:00 KST
 *   - 여기 있는 함수는 절대 Date.now() 를 부르지 않는다. now 는 항상 인자로 받는다.
 */

export const KST_OFFSET_MINUTES = 9 * 60;
const KST_OFFSET_MS = KST_OFFSET_MINUTES * 60 * 1000;

/**
 * UTC 시각을 "KST 벽시계 값이 UTC 필드에 담긴" Date 로 옮긴다.
 * 이 결과는 getUTC* 로만 읽어야 한다. 내부 헬퍼.
 */
function shiftToKst(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

function shiftFromKst(shifted: Date): Date {
  return new Date(shifted.getTime() - KST_OFFSET_MS);
}

export function kstYear(date: Date): number {
  return shiftToKst(date).getUTCFullYear();
}

/** 1~12 */
export function kstMonth(date: Date): number {
  return shiftToKst(date).getUTCMonth() + 1;
}

/** 1~31 */
export function kstDayOfMonth(date: Date): number {
  return shiftToKst(date).getUTCDate();
}

/** 0~23 — 페르소나 시간대 축의 입력 */
export function kstHour(date: Date): number {
  return shiftToKst(date).getUTCHours();
}

/** 0(일)~6(토) */
export function kstDayOfWeek(date: Date): number {
  return shiftToKst(date).getUTCDay();
}

/** "2026-07" */
export function kstMonthKey(date: Date): string {
  const s = shiftToKst(date);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "2026-07-30" */
export function kstDateKey(date: Date): string {
  const s = shiftToKst(date);
  return [
    s.getUTCFullYear(),
    String(s.getUTCMonth() + 1).padStart(2, '0'),
    String(s.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** 해당 날짜의 KST 00:00 에 해당하는 UTC 시각 */
export function startOfKstDay(date: Date): Date {
  const s = shiftToKst(date);
  s.setUTCHours(0, 0, 0, 0);
  return shiftFromKst(s);
}

/** 해당 날짜의 KST 다음날 00:00 (구간 상한, exclusive) */
export function endOfKstDay(date: Date): Date {
  return addDays(startOfKstDay(date), 1);
}

/** 해당 월 1일 KST 00:00 — 월 경계는 항상 1일이다 */
export function startOfKstMonth(date: Date): Date {
  const s = shiftToKst(date);
  s.setUTCDate(1);
  s.setUTCHours(0, 0, 0, 0);
  return shiftFromKst(s);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * KST 기준 월 단위 가감.
 * 항상 "그 달 1일 00:00" 을 기준으로 움직이므로 말일 오버플로 문제가 없다.
 */
export function addKstMonths(date: Date, months: number): Date {
  const s = shiftToKst(startOfKstMonth(date));
  s.setUTCMonth(s.getUTCMonth() + months);
  return shiftFromKst(s);
}

/** 두 시각 사이의 일수 차이 (KST 자정 기준, 정수) */
export function diffKstDays(from: Date, to: Date): number {
  const a = startOfKstDay(from).getTime();
  const b = startOfKstDay(to).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** KST ISO 8601 문자열. 예: "2026-07-30T19:24:00+09:00" */
export function toKstIso(date: Date): string {
  const s = shiftToKst(date);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}` +
    `T${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}:${pad(s.getUTCSeconds())}` +
    `.${pad(s.getUTCMilliseconds(), 3)}+09:00`
  );
}

/** null 안전 버전 — 응답 직렬화에서 자주 쓴다 */
export function toKstIsoOrNull(date: Date | null | undefined): string | null {
  return date ? toKstIso(date) : null;
}

/** KST 벽시계 값으로 Date 를 만든다. 시드 데이터 생성에 쓴다. */
export function kstDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  return shiftFromKst(new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0)));
}

/** 월 구간. start 이상, end 미만. */
export interface MonthWindow {
  /** "2026-06" */
  key: string;
  /** 해당 월 1일 00:00 KST */
  start: Date;
  /** 다음 달 1일 00:00 KST (exclusive) */
  end: Date;
}

/**
 * now 기준 "직전 n개 완결 월" 을 오래된 순으로 반환한다.
 *
 * 완결 월 = 1일부터 말일까지가 모두 지난 달.
 * now 가 속한 달은 진행 중이므로 제외된다. (§6-1 — 부분 월은 평균에서 뺀다)
 *
 * 예) now = 2026-07-30, n = 6  →  2026-01 … 2026-06
 */
export function lastNCompleteMonths(now: Date, n: number): MonthWindow[] {
  const currentMonthStart = startOfKstMonth(now);
  const windows: MonthWindow[] = [];
  for (let i = n; i >= 1; i -= 1) {
    const start = addKstMonths(currentMonthStart, -i);
    const end = addKstMonths(currentMonthStart, -i + 1);
    windows.push({ key: kstMonthKey(start), start, end });
  }
  return windows;
}

/** now 가 속한 진행 중인 월. 평균에서는 빼고 챌린지 진척에는 쓴다. */
export function currentPartialMonth(now: Date): MonthWindow {
  const start = startOfKstMonth(now);
  return { key: kstMonthKey(start), start, end: addKstMonths(start, 1) };
}

/** date 가 [start, end) 안에 있는가 */
export function isWithin(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t < end.getTime();
}
