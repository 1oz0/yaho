import { applyBlur, type BlurablePhoto } from './blur-policy';

const photos = (n: number): BlurablePhoto[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    imageUrl: `https://images.yaho.kr/x/${i + 1}.jpg`,
    caption: `사진 ${i + 1}`,
    revealOrder: i + 1,
  }));

const revealedIds = (r: ReturnType<typeof applyBlur>) =>
  r.photos.filter((p) => !p.blurred).map((p) => p.id);

describe('applyBlur — 공개 장수 = ceil(progressRate × 전체) (§6-5)', () => {
  it.each([
    [0, 0],
    [0.01, 1],
    [0.16, 1], // ceil(0.96) = 1
    [0.17, 2], // ceil(1.02) = 2
    [0.5, 3],
    [0.83, 5], // ceil(4.98) = 5
    [1, 6],
  ])('진척률 %s → %i장 공개 (전체 6장)', (rate, expected) => {
    const r = applyBlur(photos(6), rate);
    expect(r.revealedCount).toBe(expected);
    expect(revealedIds(r)).toHaveLength(expected);
  });

  it('revealOrder 가 앞선 것부터 공개한다', () => {
    const r = applyBlur(photos(6), 0.5);
    expect(revealedIds(r)).toEqual(['p1', 'p2', 'p3']);
  });

  it('입력 순서가 뒤섞여 있어도 revealOrder 순으로 공개한다', () => {
    const shuffled = [...photos(6)].reverse();
    const r = applyBlur(shuffled, 0.5);
    expect(revealedIds(r)).toEqual(['p1', 'p2', 'p3']);
    expect(r.photos.map((p) => p.revealOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('진척률 100% 면 전부 공개', () => {
    const r = applyBlur(photos(6), 1);
    expect(r.photos.every((p) => !p.blurred)).toBe(true);
    expect(r.revealedCount).toBe(6);
  });

  it('100% 를 넘어도(초과 달성) 전부 공개에서 멈춘다', () => {
    const r = applyBlur(photos(6), 2.5);
    expect(r.revealedCount).toBe(6);
    expect(r.photos.every((p) => !p.blurred)).toBe(true);
  });

  it('진척률 0 이면 전부 블러', () => {
    const r = applyBlur(photos(6), 0);
    expect(r.revealedCount).toBe(0);
    expect(r.photos.every((p) => p.blurred)).toBe(true);
  });

  it('음수 진척률(과소비)도 0 으로 처리한다', () => {
    const r = applyBlur(photos(6), -0.5);
    expect(r.revealedCount).toBe(0);
  });
});

describe('applyBlur — URL 은 항상 내려간다', () => {
  it('블러 처리된 사진도 imageUrl 과 caption 을 가진다', () => {
    const r = applyBlur(photos(6), 0.3);
    const blurredOnes = r.photos.filter((p) => p.blurred);
    expect(blurredOnes.length).toBeGreaterThan(0);
    expect(blurredOnes.every((p) => p.imageUrl.startsWith('https://'))).toBe(true);
    expect(blurredOnes.every((p) => p.caption.length > 0)).toBe(true);
  });
});

describe('applyBlur — 방어', () => {
  it('사진이 없어도 안전하다', () => {
    const r = applyBlur([], 0.5);
    expect(r).toEqual({ photos: [], revealedCount: 0, totalCount: 0 });
  });

  it('사진이 1장이면 진척률이 조금만 올라도 공개된다', () => {
    expect(applyBlur(photos(1), 0.01).revealedCount).toBe(1);
    expect(applyBlur(photos(1), 0).revealedCount).toBe(0);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const original = photos(3);
    const snapshot = JSON.stringify(original);
    applyBlur(original, 0.5);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('결정론적이다', () => {
    const input = photos(6);
    const first = JSON.stringify(applyBlur(input, 0.42));
    for (let i = 0; i < 20; i += 1) {
      expect(JSON.stringify(applyBlur(input, 0.42))).toBe(first);
    }
  });
});
