export interface RNG {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: T[]): T;
}

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function createRng(seed: number): RNG {
  let state = seed >>> 0;

  const next = (): number => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(maxExclusive: number) {
      return Math.floor(next() * maxExclusive);
    },
    pick<T>(items: T[]) {
      return items[this.int(items.length)];
    }
  };
}
