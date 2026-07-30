import { normalizeMerchantName } from './normalizer';

describe('normalizeMerchantName — 배달 채널 접두', () => {
  it('채널을 분리하되 버리지 않는다 (배달/외식 구분의 근거)', () => {
    const r = normalizeMerchantName('배민)한식대첩 광주상무점');
    expect(r.channel).toBe('배민');
    expect(r.normalized).toBe('한식대첩');
    expect(r.matchTarget).toBe('배민한식대첩');
  });

  it('채널이 없으면 normalized 와 matchTarget 이 같다', () => {
    const r = normalizeMerchantName('송정떡갈비 광주수완점');
    expect(r.channel).toBeNull();
    expect(r.normalized).toBe('송정떡갈비');
    expect(r.matchTarget).toBe('송정떡갈비');
  });

  it('같은 가게라도 채널 유무에 따라 matchTarget 이 달라진다', () => {
    const delivery = normalizeMerchantName('배민)교촌치킨 상무센트럴점');
    const dineIn = normalizeMerchantName('교촌치킨 상무센트럴점');
    // 묶기 키(normalized)는 같고 — 같은 가게이므로
    expect(delivery.normalized).toBe(dineIn.normalized);
    // 매칭 대상은 다르다 — 하나는 배달, 하나는 외식으로 분류되어야 하므로
    expect(delivery.matchTarget).not.toBe(dineIn.matchTarget);
  });

  it.each([
    ['쿠팡이츠)버거킹 광주치평점', '쿠팡이츠', '버거킹'],
    ['요기요)피자스쿨 광주풍암점', '요기요', '피자스쿨'],
    ['배달의민족)본죽', '배달의민족', '본죽'],
  ])('%s → 채널 %s / core %s', (raw, channel, normalized) => {
    const r = normalizeMerchantName(raw);
    expect(r.channel).toBe(channel);
    expect(r.normalized).toBe(normalized);
  });

  it('채널 구분자가 공백이나 다른 기호여도 인식한다', () => {
    expect(normalizeMerchantName('배민 ) 곱창고').channel).toBe('배민');
    expect(normalizeMerchantName('요기요-피자스쿨').channel).toBe('요기요');
  });
});

describe('normalizeMerchantName — 사업자 형태 제거', () => {
  it.each([
    ['(주)아웃백스테이크하우스', '아웃백스테이크하우스'],
    ['주식회사에이블리', '에이블리'],
    ['㈜케이지이니시스', '케이지이니시스'],
    ['(유)광주개인택시', '광주개인택시'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeMerchantName(raw).normalized).toBe(expected);
  });
});

describe('normalizeMerchantName — 지점 접미사 제거', () => {
  it.each([
    ['GS25 광주치평점', 'gs25'],
    ['스타벅스 광주상무점', '스타벅스'],
    ['CGV 광주터미널점', 'cgv'],
    ['역전할머니맥주 상무센트럴점', '역전할머니맥주'],
    ['CJ올리브영 광주충장로점', 'cj올리브영'],
    ['롯데백화점 광주점', '롯데백화점'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeMerchantName(raw).normalized).toBe(expected);
  });

  it('지점명이 없으면 그대로 둔다', () => {
    expect(normalizeMerchantName('무등산보리밥').normalized).toBe('무등산보리밥');
    expect(normalizeMerchantName('광주시립미술관').normalized).toBe('광주시립미술관');
  });

  it('상호 자체가 "점"으로 끝나도 잘라내지 않는다', () => {
    // 공백으로 분리된 마지막 토큰이 아니면 건드리지 않는다
    expect(normalizeMerchantName('백화점').normalized).toBe('백화점');
  });

  it('붙어 있는 지점명은 자르지 않는다 (잘못 자르는 것보다 안전하다)', () => {
    // "스타벅스광주상무" 처럼 엉뚱하게 잘리느니 통째로 두고 부분문자열 매칭에 맡긴다
    const r = normalizeMerchantName('스타벅스광주상무점');
    expect(r.normalized).toBe('스타벅스광주상무점');
    expect(r.normalized).toContain('스타벅스'); // 전역 규칙은 여전히 매칭된다
  });
});

describe('normalizeMerchantName — 공백·특수문자·대소문자', () => {
  it('공백과 특수문자를 제거한다', () => {
    expect(normalizeMerchantName('이체 김**').normalized).toBe('이체김');
    expect(normalizeMerchantName('S-OIL 주유소').normalized).toBe('soil주유소');
  });

  it('영문은 소문자로 접는다', () => {
    expect(normalizeMerchantName('GS25').normalized).toBe('gs25');
    expect(normalizeMerchantName('29CM').normalized).toBe('29cm');
  });

  it('표기가 달라도 같은 키로 묶인다', () => {
    const a = normalizeMerchantName('GS25 광주치평점');
    const b = normalizeMerchantName('gs25  광주수완점');
    expect(a.normalized).toBe(b.normalized);
  });

  it('빈 문자열과 공백만 있는 입력을 안전하게 처리한다', () => {
    expect(normalizeMerchantName('').normalized).toBe('');
    expect(normalizeMerchantName('   ').normalized).toBe('');
    expect(normalizeMerchantName('***').normalized).toBe('');
  });

  it('결정론적이다 — 같은 입력이면 항상 같은 출력', () => {
    const raw = '배민)엽기떡볶이 광주첨단점';
    const first = normalizeMerchantName(raw);
    for (let i = 0; i < 50; i += 1) {
      expect(normalizeMerchantName(raw)).toEqual(first);
    }
  });
});
