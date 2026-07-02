// lib/scoring/index-score.ts
//
// L2 (per-dimension) and L1 (overall) index computation (PRD §4.1).
//
//   L2[dim] = weighted mean of that dimension's normalized KPIs (intra-weights)
//   L1      = Σ (weight[dim] · L2[dim])   with dimension weights from config
//
// Every result carries config_version. L1 is null when no dimension produced a
// score (kept consistent with the no-fabricated-numbers contract); banding/
// confidence layer the gates + suppression on top.

import type {
  Dimension,
  KpiNormalized,
  L2Result,
  ScoringConfig,
} from './types';
import { DIMENSION_KPIS, INTRA_WEIGHTS } from './constants';
import { weightedMean } from './math';

const DIMENSIONS: Dimension[] = [
  'usage',
  'efficiency',
  'effectiveness',
  'proficiency',
];

/** Compute one L2 sub-index from its normalized KPIs (intra-dimension weighted mean). */
export function computeL2(
  dimension: Dimension,
  normalized: readonly KpiNormalized[],
  config: ScoringConfig,
): L2Result {
  const dimKpis = normalized.filter((k) => k.dimension === dimension);

  const score = weightedMean(
    dimKpis.map((k) => ({ value: k.norm, weight: INTRA_WEIGHTS[k.kpiId] })),
  );

  const signals = dimKpis.reduce((acc, k) => acc + k.signals, 0);
  const metMinSignal = signals >= config.minSignals[dimension];

  return { dimension, score, signals, metMinSignal, kpis: dimKpis };
}

/** Compute all four L2 sub-indexes. */
export function computeAllL2(
  normalized: readonly KpiNormalized[],
  config: ScoringConfig,
): Record<Dimension, L2Result> {
  const out = {} as Record<Dimension, L2Result>;
  for (const d of DIMENSIONS) out[d] = computeL2(d, normalized, config);
  return out;
}

/**
 * L1 = Σ (dimension weight · L2 score), re-normalizing over dimensions that have a
 * score so a missing dimension doesn't silently zero the index. Returns null when
 * no dimension scored.
 */
export function computeL1(
  l2: Record<Dimension, L2Result>,
  config: ScoringConfig,
): number | null {
  return weightedMean(
    DIMENSIONS.map((d) => ({
      value: l2[d].score,
      weight: config.weights[d],
    })),
  );
}

/** Sanity check: the KPI_DIMENSION map and DIMENSION_KPIS agree (guards refactors). */
export function assertKpiMapsConsistent(): void {
  for (const d of DIMENSIONS) {
    for (const kpiId of DIMENSION_KPIS[d]) {
      if (INTRA_WEIGHTS[kpiId] === undefined) {
        throw new Error(`Missing intra-weight for KPI "${kpiId}"`);
      }
    }
  }
}
