/** 시드 기반 난수(mulberry32). 게임플레이와 이펙트의 난수는 모두 여기서 나온다. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length) % list.length];
  }

  weighted(weights: Record<string, number>): string {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = this.next() * total;
    let last = '';
    for (const k in weights) {
      last = k;
      r -= weights[k];
      if (r <= 0) return k;
    }
    return last;
  }

  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }
}

/** 이펙트용 공용 난수. 게임플레이 판정에는 씬이 가진 Rng 를 쓴다. */
export const fxRng = new Rng(20261117);

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number): number => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** 결정적 값 노이즈 [-1, 1]. 카메라 쉐이크에 쓴다. */
export function pseudoNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const h = (n: number): number => {
    const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
