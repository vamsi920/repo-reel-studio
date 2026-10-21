/**
 * Seeded random numbers for reproducible datasets. Same seed, same data,
 * on every machine: SplitMix32 for seeding and mulberry32 for the stream,
 * both integer-only so there is no floating-point drift between engines.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  float(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** Normal via Box-Muller. */
  normal(mean: number, stddev: number): number;
  /** Zipf-like index in [0, n): index 0 is the most popular. */
  skewedIndex(n: number, exponent?: number): number;
  shuffle<T>(items: readonly T[]): T[];
  /** A child stream, deterministic for (parent seed, label). */
  fork(label: string): Rng;
  readonly seed: number;
}

export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number | string): Rng {
  const numericSeed =
    typeof seed === "number" ? seed >>> 0 : hashString(String(seed));
  const next = mulberry32(numericSeed);
  const rng: Rng = {
    seed: numericSeed,
    next,
    int: (min, max) => {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick from empty list");
      return items[Math.floor(next() * items.length)];
    },
    weighted: (items, weights) => {
      if (items.length === 0) throw new Error("weighted pick from empty list");
      let total = 0;
      for (let i = 0; i < items.length; i++) {
        total += Math.max(0, weights[i] ?? 0);
      }
      if (total <= 0) return rng.pick(items);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= Math.max(0, weights[i] ?? 0);
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
    normal: (mean, stddev) => {
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return (
        mean +
        stddev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
      );
    },
    skewedIndex: (n, exponent = 3) => {
      if (n <= 1) return 0;
      // Power law: u^exponent piles most draws onto the first indices
      // (index 0 is the "busiest" parent) with a long tail to n-1.
      const u = next();
      return Math.min(n - 1, Math.max(0, Math.floor(n * u ** exponent)));
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    fork: (label) => createRng(hashString(`${numericSeed}:${label}`)),
  };
  return rng;
}

/** Deterministic UUID (v4 layout) from the stream. */
export function uuidFrom(rng: Rng): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[8 + rng.int(0, 3)];
    else out += hex[rng.int(0, 15)];
  }
  return out;
}
