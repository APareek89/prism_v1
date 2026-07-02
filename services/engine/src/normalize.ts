// Anchor normalization — spec §2: at/below floor → 0, at/above target → 100,
// proportional between, NO bonus beyond target; lower-is-better inverts
// (≤target → 100, ≥ceil → 0). No denominator → null (honest no-signal).

import type { KpiCatalogRow } from '@prism/contract';

export function normalize(raw: number | null, catalogRow: Pick<KpiCatalogRow, 'direction' | 'anchor'>): number | null {
  if (raw === null || Number.isNaN(raw)) return null;
  const { direction, anchor } = catalogRow;
  if (direction === 'up') {
    const floor = anchor.floor ?? 0;
    const target = anchor.target;
    if (target === floor) return raw >= target ? 100 : 0;
    return round1(clamp(((raw - floor) / (target - floor)) * 100));
  }
  const target = anchor.target;
  const ceil = anchor.ceil ?? target;
  if (ceil === target) return raw <= target ? 100 : 0;
  return round1(clamp(((ceil - raw) / (ceil - target)) * 100));
}

export const clamp = (n: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, n));
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Percentage helper that keeps null-denominators null. */
export const pct = (num: number, den: number): number | null =>
  den > 0 ? round1((num / den) * 100) : null;

export const mean = (xs: number[]): number | null =>
  xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
