/**
 * 결정론적 난수 생성기 (mulberry32).
 *
 * 시드 데이터는 매 실행마다 달라지면 안 된다 (§4-3).
 * 발표 리허설에서 본 숫자와 본 발표에서 보는 숫자가 반드시 같아야 한다.
 * Math.random() 은 이 프로젝트에서 사용 금지 — ESLint 로 막는다.
 */

export interface Prng {
  /** [0, 1) */
  next(): number;
  /** [min, max] 정수 */
  int(min: number, max: number): number;
  /** [min, max] 실수 */
  float(min: number, max: number): number;
  /** 배열에서 하나 고른다 */
  pick<T>(items: readonly T[]): T;
  /** 가중치에 따라 하나 고른다 */
  weighted<T>(items: readonly { value: T; weight: number }[]): T;
  /** 확률 p 로 true */
  chance(p: number): boolean;
  /** 원본을 바꾸지 않고 섞은 새 배열 */
  shuffle<T>(items: readonly T[]): T[];
}

/** 문자열 시드 → 32bit 정수 (xmur3) */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function createPrng(seed: string | number): Prng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  return {
    next,
    int,
    float: (min, max) => min + next() * (max - min),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick: 빈 배열');
      return items[int(0, items.length - 1)];
    },
    weighted: <T>(items: readonly { value: T; weight: number }[]): T => {
      const total = items.reduce((acc, it) => acc + it.weight, 0);
      if (total <= 0) throw new Error('weighted: 가중치 합이 0 이하');
      let r = next() * total;
      for (const it of items) {
        r -= it.weight;
        if (r <= 0) return it.value;
      }
      return items[items.length - 1].value;
    },
    chance: (p) => next() < p,
    shuffle: <T>(items: readonly T[]): T[] => {
      const arr = [...items];
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}
