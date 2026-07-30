import {
  currentPartialMonth,
  diffKstDays,
  kstDate,
  kstHour,
  kstMonthKey,
  lastNCompleteMonths,
  startOfKstDay,
  startOfKstMonth,
  toKstIso,
} from './date-kst';

describe('KST 변환', () => {
  it('UTC 자정은 KST 오전 9시다', () => {
    expect(kstHour(new Date('2026-07-30T00:00:00Z'))).toBe(9);
  });

  it('UTC 16시는 KST 다음날 새벽 1시다 (날짜 경계 넘김)', () => {
    const d = new Date('2026-07-30T16:00:00Z');
    expect(kstHour(d)).toBe(1);
    expect(kstMonthKey(d)).toBe('2026-07');
    expect(toKstIso(d)).toBe('2026-07-31T01:00:00.000+09:00');
  });

  it('kstDate 로 만든 값은 다시 읽어도 동일하다', () => {
    const d = kstDate(2026, 7, 30, 19, 24, 0);
    expect(toKstIso(d)).toBe('2026-07-30T19:24:00.000+09:00');
    expect(kstHour(d)).toBe(19);
  });

  it('심야 거래(KST 23시)는 UTC 로는 같은 날 14시다', () => {
    const d = kstDate(2026, 7, 30, 23, 30);
    expect(d.toISOString()).toBe('2026-07-30T14:30:00.000Z');
    expect(kstHour(d)).toBe(23);
  });
});

describe('startOfKstDay / startOfKstMonth', () => {
  it('KST 자정으로 내림한다', () => {
    const d = kstDate(2026, 7, 30, 23, 59, 59);
    expect(toKstIso(startOfKstDay(d))).toBe('2026-07-30T00:00:00.000+09:00');
  });

  it('월 경계는 항상 1일 00:00 이다', () => {
    const d = kstDate(2026, 7, 30, 12, 0);
    expect(toKstIso(startOfKstMonth(d))).toBe('2026-07-01T00:00:00.000+09:00');
  });

  it('월 첫날 새벽에도 그 달 1일로 정렬된다', () => {
    const d = kstDate(2026, 7, 1, 0, 30);
    expect(toKstIso(startOfKstMonth(d))).toBe('2026-07-01T00:00:00.000+09:00');
  });
});

describe('lastNCompleteMonths — 직전 n개 완결 월 (§6-1)', () => {
  it('진행 중인 달은 제외하고 오래된 순으로 6개월을 준다', () => {
    const now = kstDate(2026, 7, 30, 12, 0);
    const months = lastNCompleteMonths(now, 6);
    expect(months.map((m) => m.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });

  it('연도 경계를 넘어간다', () => {
    const now = kstDate(2026, 2, 15, 12, 0);
    expect(lastNCompleteMonths(now, 3).map((m) => m.key)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('각 구간은 [1일 00:00, 다음달 1일 00:00) 이며 서로 맞닿는다', () => {
    const months = lastNCompleteMonths(kstDate(2026, 7, 30), 6);
    for (let i = 1; i < months.length; i += 1) {
      expect(months[i].start.getTime()).toBe(months[i - 1].end.getTime());
    }
    expect(toKstIso(months[0].start)).toBe('2026-01-01T00:00:00.000+09:00');
    expect(toKstIso(months[5].end)).toBe('2026-07-01T00:00:00.000+09:00');
  });

  it('진행 중인 부분 월은 별도로 얻는다 (평균에서 빼고 진척에는 쓴다)', () => {
    const partial = currentPartialMonth(kstDate(2026, 7, 30));
    expect(partial.key).toBe('2026-07');
    expect(toKstIso(partial.start)).toBe('2026-07-01T00:00:00.000+09:00');
    expect(toKstIso(partial.end)).toBe('2026-08-01T00:00:00.000+09:00');
  });
});

describe('diffKstDays', () => {
  it('KST 자정 기준 일수 차이를 센다', () => {
    expect(diffKstDays(kstDate(2026, 7, 1), kstDate(2026, 7, 30))).toBe(29);
  });

  it('같은 날의 다른 시각은 0일이다', () => {
    expect(diffKstDays(kstDate(2026, 7, 30, 0, 1), kstDate(2026, 7, 30, 23, 59))).toBe(0);
  });
});
