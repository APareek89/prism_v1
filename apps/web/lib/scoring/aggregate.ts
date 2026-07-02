// lib/scoring/aggregate.ts
//
// Function-scope aggregation (PRD §4.7). The headline Function L1 is the MEDIAN of
// member L1s (robust to outliers); the mean is available as a secondary signal. The
// L2 sub-indexes are likewise medianed per dimension. This is N-member-native: a
// single-user demo is just N=1 of the same median path — there is NO special case
// for N=1 (a 1-element median is that element).
//
// After medianing we RE-BAND and RE-CONFIDENCE at function scope: the band uses the
// function-level AI-active share + multiplier signal, and confidence uses the
// function-level L2 min-signal qualification with the cohort-size (N) penalty.

import type {
  Dimension,
  FunctionAggregate,
  IndexResult,
  L2Result,
  ScoringConfig,
} from './types';
import { median, mean } from './math';
import { computeBand } from './banding';
import { computeConfidence } from './confidence';

export type { FunctionAggregate } from './types';

const DIMENSIONS: Dimension[] = [
  'usage',
  'efficiency',
  'effectiveness',
  'proficiency',
];

/** Collect the non-null L2 scores for a dimension across members. */
function dimensionScores(
  members: readonly IndexResult[],
  dim: Dimension,
): number[] {
  const out: number[] = [];
  for (const m of members) {
    const s = m.l2[dim].score;
    if (s !== null) out.push(s);
  }
  return out;
}

/**
 * Aggregate member IndexResults into a function-scope result.
 *
 * - Function L1 = median of member L1s (mean kept as secondary).
 * - Function L2[dim] = median of member L2[dim] scores.
 * - AI-active share / multiplier signal are aggregated (median share, summed
 *   multiplier) to re-apply the L0/L5 band gates at function scope.
 * - Confidence is recomputed from the *aggregated* L2 min-signal qualification with
 *   the N<8 cohort penalty.
 *
 * Members whose L1 is suppressed (null) are excluded from the L1 median (they carry
 * no number to median), but their dimension signals still inform function-level
 * min-signal qualification via the aggregated L2 results.
 */
export function aggregateFunction(
  members: readonly IndexResult[],
  config: ScoringConfig,
  scopeId: string,
  date: string,
): FunctionAggregate {
  const memberCount = members.length;

  // Median (and mean) of the members that produced an L1.
  const l1s = members
    .map((m) => m.l1)
    .filter((x): x is number => x !== null);
  const l1 = median(l1s);
  const l1Mean = mean(l1s);

  // Build aggregated L2 results (median score per dimension; signals summed so the
  // function-level min-signal qualification reflects the whole cohort's evidence).
  const l2 = {} as Record<Dimension, L2Result>;
  for (const dim of DIMENSIONS) {
    const scores = dimensionScores(members, dim);
    const aggScore = median(scores);
    const signals = members.reduce((acc, m) => acc + m.l2[dim].signals, 0);
    l2[dim] = {
      dimension: dim,
      score: aggScore,
      signals,
      metMinSignal: signals >= config.minSignals[dim],
      // KPIs are not re-medianed element-wise (member KPI shapes differ); the
      // dimension score is the robust function-level number agents narrate.
      kpis: [],
    };
  }

  // Function-level band gates: median AI-active share, summed multiplier signal.
  const aiShares = members
    .map((m) => m.aiActiveShare)
    .filter((x): x is number => x !== null);
  const aiActiveShare = median(aiShares);
  const multiplierSignal = members.reduce(
    (acc, m) => acc + m.multiplierSignal,
    0,
  );

  const confidence = computeConfidence(l2, config, memberCount);
  const suppressedL1 = confidence.shouldSuppressL1 ? null : l1;

  const band = computeBand({
    l1: suppressedL1,
    aiActiveShare,
    multiplierSignal,
  });

  // Function tokens/PR = sum-of-tokens ÷ sum-of-merged-PRs is not reconstructable
  // from member IndexResults alone; we median the member tokens/PR as the robust
  // function-level cost lens (compute-daily can override with an exact sum).
  const tokenLensValues = members
    .map((m) => m.tokensPerPr.tokensPerPr)
    .filter((x): x is number => x !== null);
  const tokensPerPr = median(tokenLensValues);

  return {
    scope: 'function',
    scopeId,
    date,
    configVersion: config.configVersion,
    l1: suppressedL1,
    l2,
    band,
    confidence,
    tokensPerPr: {
      tokensPerPr,
      cacheReadShare: median(
        members
          .map((m) => m.tokensPerPr.cacheReadShare)
          .filter((x): x is number => x !== null),
      ),
      compactionSignal: median(
        members
          .map((m) => m.tokensPerPr.compactionSignal)
          .filter((x): x is number => x !== null),
      ),
      mergedPrs: members.reduce(
        (acc, m) => acc + m.tokensPerPr.mergedPrs,
        0,
      ),
    },
    aiActiveShare,
    multiplierSignal,
    l1Mean,
    memberCount,
  };
}
