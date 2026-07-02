// Bands + gates (main index only — the harness index has NO bands).
// L0 gate: AI-assisted share < 15% forces L0 · Dormant whatever the number.
// L5 gate: the top band requires multiplier signal ≥ 1, else caps at L4.

import { BAND_FLOORS, L0_GATE_AI_SHARE_PCT, type Band } from '@prism/contract';

export function bandForScore(score: number): Band {
  for (const { min, band } of BAND_FLOORS) {
    if (score >= min) return band;
  }
  return 'L0';
}

export interface GateInput {
  score: number;
  aiSharePct: number | null;   // KPI 1 raw value
  multiplierSignal: number;    // # of this dev's skills invoked (with output) by others
}

export interface GateOutcome {
  band: Band;
  l0_forced: boolean;
  l5_capped: boolean;
}

export function applyGates({ score, aiSharePct, multiplierSignal }: GateInput): GateOutcome {
  if (aiSharePct !== null && aiSharePct < L0_GATE_AI_SHARE_PCT) {
    return { band: 'L0', l0_forced: true, l5_capped: false };
  }
  let band = bandForScore(score);
  let capped = false;
  if (band === 'L5' && multiplierSignal < 1) {
    band = 'L4';
    capped = true;
  }
  return { band, l0_forced: false, l5_capped: capped };
}
