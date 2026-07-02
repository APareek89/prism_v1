// lib/scoring/banding.ts
//
// L0–L5 banding (PRD §4.5).
//
//   L0 Dormant     — AI-active rate < 0.15 forces L0 (gate)
//   L1 Basic       0–34
//   L2 Productive  35–54
//   L3 Workflow    55–69
//   L4 Power       70–84
//   L5 Multiplier  85–100  — requires multiplier signal > 0 (gate); else caps at L4

import type { Band } from './types';
import { BAND_THRESHOLDS, L0_AI_ACTIVE_GATE } from './constants';

export interface BandingInput {
  /** the L1 score (0–100), or null when suppressed/uncomputable. */
  l1: number | null;
  /** AI-active share (linked AI PRs ÷ merged PRs), or null when no merged PRs. */
  aiActiveShare: number | null;
  /** total multiplier signal (authored skills reused by ≥1 other). */
  multiplierSignal: number;
}

/**
 * Resolve the L0–L5 band.
 *
 * Gates:
 *  - L0: AI-active share < 0.15 forces L0 (even with a high L1). A null share is
 *    treated as below the gate (no evidence of AI activity → Dormant).
 *  - L5: requires multiplierSignal > 0; without it the band caps at L4 even at
 *    L1 ≥ 85.
 *
 * When L1 is null (suppressed), band is L0 — the UI shows an empty/awaiting-signal
 * state rather than a fabricated level.
 */
export function computeBand(input: BandingInput): Band {
  const { l1, aiActiveShare, multiplierSignal } = input;

  // L0 gate: dormant when AI activity is below the floor (or absent).
  if (aiActiveShare === null || aiActiveShare < L0_AI_ACTIVE_GATE) {
    return 'L0';
  }

  // No computable L1 → no level above dormant.
  if (l1 === null) return 'L0';

  // Numeric band (highest threshold the score clears).
  let band: Band = 'L1';
  for (const t of BAND_THRESHOLDS) {
    if (l1 >= t.min) {
      band = t.band;
      break;
    }
  }

  // L5 gate: top band requires a multiplier signal; else cap at L4.
  if (band === 'L5' && !(multiplierSignal > 0)) {
    band = 'L4';
  }

  return band;
}
