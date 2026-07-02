// lib/scoring/math.ts
//
// Pure numeric leaf utilities. No I/O, no clock. These are the most-tested
// primitives in the engine; everything downstream composes them. All functions
// are total: they never throw on empty/degenerate input, returning null or a safe
// default so the no-fabricated-numbers contract holds end-to-end.

/** Sum of a list (0 for empty). */
export function sum(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

/** Arithmetic mean, or null for an empty list (never fabricate a 0). */
export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return sum(xs) / xs.length;
}

/** Median of a list, or null for empty. Even-length → average of the two middles.
 *  This is the headline aggregator for Function L1 (PRD §4.7) — robust to outliers. */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Linear-interpolated percentile (q in [0,1]) using the "R-7"/Excel PERCENTILE.INC
 *  convention. Returns null for empty input. */
export function percentile(xs: readonly number[], q: number): number | null {
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0]!;
  const clampedQ = clamp(q, 0, 1);
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = clampedQ * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

/** Clamp x into [min, max]. */
export function clamp(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

/** Winsorize: clip every value into [p(lower), p(upper)] (PRD §4.4 cleans inputs
 *  before normalizing). Empty input → empty output. */
export function winsorize(
  xs: readonly number[],
  lower: number,
  upper: number,
): number[] {
  if (xs.length === 0) return [];
  const lo = percentile(xs, lower);
  const hi = percentile(xs, upper);
  if (lo === null || hi === null) return [...xs];
  // Guard against inverted bounds from pathological percentile args.
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  return xs.map((x) => clamp(x, a, b));
}

/** Division that returns null when the denominator is 0 (no fabricated rates). */
export function safeDiv(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Weighted mean over (value, weight) pairs. Null values are dropped and their
 *  weight is excluded so the remaining weights re-normalize. Returns null if no
 *  non-null value carries positive weight. */
export function weightedMean(
  pairs: ReadonlyArray<{ value: number | null; weight: number }>,
): number | null {
  let acc = 0;
  let wsum = 0;
  for (const { value, weight } of pairs) {
    if (value === null || weight <= 0) continue;
    acc += value * weight;
    wsum += weight;
  }
  if (wsum === 0) return null;
  return acc / wsum;
}

/** Frozen tertile cutoffs (p33, p66) over a sample. Returns null cutoffs when the
 *  sample is empty so callers fall back to cold-start defaults (PRD §4.3.4). */
export function tertiles(
  xs: readonly number[],
): { p33: number; p66: number } | null {
  if (xs.length === 0) return null;
  const p33 = percentile(xs, 1 / 3);
  const p66 = percentile(xs, 2 / 3);
  if (p33 === null || p66 === null) return null;
  return { p33, p66 };
}

/** Round to `dp` decimal places (presentation/persistence stability). */
export function round(x: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
