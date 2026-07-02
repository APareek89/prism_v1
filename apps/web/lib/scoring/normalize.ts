// lib/scoring/normalize.ts
//
// Anchor-based normalization (PRD §4.4) — NOT percentile. Maps a raw KPI value to
// 0–100 against two frozen anchors, flips inverted KPIs, and always clamps + caps
// at target (no reward beyond "good"):
//
//   higher-is-better:                       lower-is-better (inverted):
//     v ≤ floor   → 0                         v ≥ ceil   → 0
//     v ≥ target  → 100                       v ≤ target → 100
//     else 100·(v−floor)/(target−floor)       else 100·(ceil−v)/(ceil−target)
//
// Winsorization (p5/p95) is a cohort-level cleaning step applied to the *sample*
// before anchors are derived/applied; winsorizeValues() exposes it for callers that
// hold a cohort of raw values. Per-value normalization itself just clamps.

import type {
  KpiAnchor,
  KpiId,
  KpiNormalized,
  KpiRaw,
  ScoringConfig,
} from './types';
import { isInverted } from './constants';
import { clamp, winsorize } from './math';

/**
 * Normalize a single raw value to 0–100 against its anchor + direction.
 * Returns null when value is null (no fabricated score). Always clamped to [0,100]
 * and capped at target (the cap is intrinsic to the piecewise map above).
 */
export function normalizeValue(
  value: number | null,
  anchor: KpiAnchor,
  inverted: boolean,
): number | null {
  if (value === null) return null;

  if (inverted) {
    const { target, ceil } = anchor;
    if (ceil === undefined) {
      // Misconfigured anchor — config.ts guards this, but stay total.
      return null;
    }
    if (value <= target) return 100; // at/under "good" → full marks (cap at target)
    if (value >= ceil) return 0;
    const span = ceil - target;
    if (span <= 0) return 0;
    return clamp((100 * (ceil - value)) / span, 0, 100);
  }

  const { floor, target } = anchor;
  if (floor === undefined) {
    return null;
  }
  if (value >= target) return 100; // at/over "good" → cap at target
  if (value <= floor) return 0;
  const span = target - floor;
  if (span <= 0) return 0;
  return clamp((100 * (value - floor)) / span, 0, 100);
}

/** Normalize one raw KPI into a KpiNormalized (carries anchor + inversion flag). */
export function normalizeKpi(raw: KpiRaw, config: ScoringConfig): KpiNormalized {
  const anchor = config.anchors[raw.kpiId];
  const inverted = isInverted(raw.kpiId);
  return {
    ...raw,
    anchor,
    inverted,
    norm: normalizeValue(raw.value, anchor, inverted),
  };
}

/** Normalize all of a member's raw KPIs. */
export function normalizeKpis(
  raws: readonly KpiRaw[],
  config: ScoringConfig,
): KpiNormalized[] {
  return raws.map((r) => normalizeKpi(r, config));
}

/**
 * Cohort-level winsorization helper (PRD §4.4): clip a sample of raw values for one
 * KPI to [p_lower, p_upper] before they feed anchor calibration. The deterministic
 * engine works off frozen anchors, so this is exposed for the (out-of-engine)
 * calibration pass and for cohort-aware tests; the per-value normalizer above does
 * not re-winsorize a single point.
 */
export function winsorizeValues(
  values: readonly number[],
  config: ScoringConfig,
): number[] {
  return winsorize(values, config.winsor.lower, config.winsor.upper);
}

/** Map normalized KPIs by id. */
export function indexNormalized(
  kpis: readonly KpiNormalized[],
): Record<KpiId, KpiNormalized> {
  const out = {} as Record<KpiId, KpiNormalized>;
  for (const k of kpis) out[k.kpiId] = k;
  return out;
}
