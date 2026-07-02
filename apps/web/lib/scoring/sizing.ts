// lib/scoring/sizing.ts
//
// Deterministic PR sizing — no LLM on the core path (PRD §4.3).
//
//   size_score = files + hunks + 2·modules + 3·blast        (weights from config)
//   bucket     = S | M | L  via FROZEN tertiles of size_score over the repo's
//                trailing-90-day merged PRs (S ≤ p33 · M p33–p66 · L > p66),
//                falling back to cold-start S ≤ 6 · M 7–18 · L > 18 until calibrated.
//
// needsTieBreak() ONLY flags a PR within ±10% of a boundary as a tie-break
// CANDIDATE. The LLM tie-break lives outside this engine and is never primary — the
// deterministic bucket above always decides the bucket on its own (PRD §4.3.5).

import type { PrRow, ScoringConfig, SizeBucket } from './types';
import { tertiles } from './math';

/** The diff signals sizing needs (a structural subset of PrRow). */
export interface SizeSignals {
  files: number;
  hunks: number;
  modules: number;
  blast: 0 | 1;
}

/** size_score = files + hunks + modulesWeight·modules + blastWeight·blast. */
export function sizeScore(signals: SizeSignals, config: ScoringConfig): number {
  const { modulesWeight, blastWeight } = config.sizing;
  return (
    signals.files +
    signals.hunks +
    modulesWeight * signals.modules +
    blastWeight * signals.blast
  );
}

/** Frozen S/M/L cutoffs. Two p-values: at/below `p33` → S, above `p66` → L. */
export interface SizeThresholds {
  p33: number;
  p66: number;
  /** true when these came from real 90-day tertiles; false → cold-start defaults. */
  calibrated: boolean;
}

/**
 * Freeze S/M/L thresholds from the trailing-90-day merged-PR size_scores.
 * The caller is responsible for passing only the 90-day merged PRs (window.ts +
 * the data layer scope it). Empty sample → cold-start defaults (PRD §4.3.4).
 */
export function freezeThresholds(
  trailing90dMergedPrs: readonly PrRow[],
  config: ScoringConfig,
): SizeThresholds {
  const scores = trailing90dMergedPrs
    .filter((pr) => pr.isMerged)
    .map((pr) => sizeScore(pr, config));
  const t = tertiles(scores);
  if (t === null) {
    const { sMax, lMin } = config.sizing.coldStart;
    return { p33: sMax, p66: lMin, calibrated: false };
  }
  return { p33: t.p33, p66: t.p66, calibrated: true };
}

/** Bucket a size_score against frozen thresholds: S ≤ p33 · M ≤ p66 · L otherwise. */
export function bucketForScore(
  score: number,
  thresholds: SizeThresholds,
): SizeBucket {
  if (score <= thresholds.p33) return 'S';
  if (score <= thresholds.p66) return 'M';
  return 'L';
}

/** Convenience: size + bucket a single PR against frozen thresholds. */
export function bucketPr(
  pr: PrRow,
  thresholds: SizeThresholds,
  config: ScoringConfig,
): { score: number; bucket: SizeBucket } {
  const score = sizeScore(pr, config);
  return { score, bucket: bucketForScore(score, thresholds) };
}

/**
 * Tie-break CANDIDACY only: true when `score` falls within ±tieBreakBand of either
 * the S/M or M/L boundary. This NEVER decides the bucket — bucketForScore already
 * did that deterministically. It exists so an out-of-engine LLM step can be invoked
 * for the genuinely borderline PRs (PRD §4.3.5).
 *
 * The band is a fraction of the boundary value (e.g. 0.10 → within 10% of the
 * threshold). When a boundary is 0 we fall back to an absolute ±tieBreakBand window
 * so the check stays meaningful near zero.
 */
export function needsTieBreak(
  score: number,
  thresholds: SizeThresholds,
  config: ScoringConfig,
): boolean {
  const band = config.sizing.tieBreakBand;
  for (const boundary of [thresholds.p33, thresholds.p66]) {
    const half = boundary === 0 ? band : Math.abs(boundary) * band;
    if (Math.abs(score - boundary) <= half) return true;
  }
  return false;
}
