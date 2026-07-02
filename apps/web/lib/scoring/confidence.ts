// lib/scoring/confidence.ts
//
// Confidence (PRD §4.6):
//   score = Σ of L2 dimension weights whose min-signal threshold is met
//   bands: High ≥ .85 · Medium .60–.85 · Low .40–.60 · Insufficient < .40
//   small cohort (N < 8) drops one band
//   shouldSuppressL1 = score < .40  → drives empty/awaiting-signal states
//
// "Drops one band" is applied to the resolved band label (High→Medium→Low→
// Insufficient), not to the numeric score — the score is the qualifying-weight sum
// and is reported as-is; the cohort penalty is a band-label demotion.

import type {
  ConfidenceBand,
  ConfidenceResult,
  Dimension,
  L2Result,
  ScoringConfig,
} from './types';
import {
  CONFIDENCE_THRESHOLDS,
  SMALL_COHORT_N,
  SUPPRESS_L1_BELOW,
} from './constants';

const DIMENSIONS: Dimension[] = [
  'usage',
  'efficiency',
  'effectiveness',
  'proficiency',
];

const BAND_ORDER: ConfidenceBand[] = ['high', 'medium', 'low', 'insufficient'];

/** Map a numeric confidence score (0–1) to its band. */
export function bandForScore(score: number): ConfidenceBand {
  if (score >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (score >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  if (score >= CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'insufficient';
}

/** Demote a band by one step (cohort penalty); insufficient is the floor. */
function dropOneBand(band: ConfidenceBand): ConfidenceBand {
  const i = BAND_ORDER.indexOf(band);
  return BAND_ORDER[Math.min(i + 1, BAND_ORDER.length - 1)]!;
}

/**
 * Compute confidence from the four L2 results.
 *
 * @param l2          per-dimension results (carry metMinSignal).
 * @param config      scoring config (dimension weights + min signals).
 * @param cohortSize  N members in the cohort; N < 8 drops one band (PRD §4.6).
 */
export function computeConfidence(
  l2: Record<Dimension, L2Result>,
  config: ScoringConfig,
  cohortSize: number,
): ConfidenceResult {
  let score = 0;
  for (const d of DIMENSIONS) {
    if (l2[d].metMinSignal) score += config.weights[d];
  }
  // Float-safety: clamp to [0,1].
  score = Math.min(1, Math.max(0, score));

  let band = bandForScore(score);
  const cohortPenaltyApplied = cohortSize < SMALL_COHORT_N;
  if (cohortPenaltyApplied) band = dropOneBand(band);

  return {
    score,
    band,
    shouldSuppressL1: score < SUPPRESS_L1_BELOW,
    cohortPenaltyApplied,
  };
}

/** The empty/no-signal confidence result (used for empty-rows members). */
export function insufficientConfidence(): ConfidenceResult {
  return {
    score: 0,
    band: 'insufficient',
    shouldSuppressL1: true,
    cohortPenaltyApplied: false,
  };
}
