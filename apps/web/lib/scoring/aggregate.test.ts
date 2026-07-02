import { describe, it, expect } from 'vitest';
import { aggregateFunction } from './aggregate';
import { DEFAULT_INDEX_CONFIG } from './defaults/index-config.default';
import type { Dimension, IndexResult, L2Result } from './types';

const config = DEFAULT_INDEX_CONFIG;

function l2All(score: number | null, signals = 100): Record<Dimension, L2Result> {
  const mk = (dimension: Dimension): L2Result => ({
    dimension,
    score,
    signals,
    metMinSignal: signals >= config.minSignals[dimension],
    kpis: [],
  });
  return {
    usage: mk('usage'),
    efficiency: mk('efficiency'),
    effectiveness: mk('effectiveness'),
    proficiency: mk('proficiency'),
  };
}

function member(
  id: string,
  l1: number | null,
  l2Score: number | null = l1,
): IndexResult {
  return {
    scope: 'employee',
    scopeId: id,
    date: '2026-06-30',
    configVersion: config.configVersion,
    l1,
    l2: l2All(l2Score),
    band: 'L3',
    confidence: {
      score: 1,
      band: 'high',
      shouldSuppressL1: false,
      cohortPenaltyApplied: false,
    },
    tokensPerPr: {
      tokensPerPr: 30000,
      cacheReadShare: 0.6,
      compactionSignal: 0.1,
      mergedPrs: 6,
    },
    aiActiveShare: 0.9,
    multiplierSignal: 1,
  };
}

describe('aggregate.aggregateFunction — median over N members', () => {
  it('Function L1 is the MEDIAN of member L1s (not the mean)', () => {
    const members = [member('a', 20), member('b', 50), member('c', 80)];
    const agg = aggregateFunction(members, config, 'fn', '2026-06-30');
    expect(agg.l1).toBe(50); // median
    expect(agg.l1Mean).toBeCloseTo(50, 6); // here mean == median, both 50
    expect(agg.memberCount).toBe(3);
  });

  it('is robust to an outlier — median ignores one extreme member', () => {
    // mean would be dragged to (40+50+1000)/3 ≈ 363; median stays 50.
    const members = [member('a', 40), member('b', 50), member('c', 1000)];
    const agg = aggregateFunction(members, config, 'fn', '2026-06-30');
    expect(agg.l1).toBe(50);
    expect(agg.l1Mean).toBeGreaterThan(300); // mean is dragged; median is not
  });

  it('N=1 identity case — the function L1 equals the single member L1', () => {
    const members = [member('solo', 63)];
    const agg = aggregateFunction(members, config, 'fn', '2026-06-30');
    expect(agg.l1).toBe(63);
    expect(agg.memberCount).toBe(1);
  });

  it('medians the L2 sub-indexes per dimension', () => {
    const members = [member('a', 0, 10), member('b', 0, 20), member('c', 0, 30)];
    const agg = aggregateFunction(members, config, 'fn', '2026-06-30');
    expect(agg.l2.effectiveness.score).toBe(20); // median of 10/20/30
  });

  it('excludes suppressed (null L1) members from the L1 median', () => {
    const members = [member('a', 40), member('b', null), member('c', 60)];
    const agg = aggregateFunction(members, config, 'fn', '2026-06-30');
    // median of [40, 60] = 50 (the null member contributes no number)
    expect(agg.l1).toBe(50);
    expect(agg.memberCount).toBe(3); // N still counts all members for the cohort rule
  });

  it('sums multiplier signal across members for the function L5 gate', () => {
    const members = [member('a', 90), member('b', 90)];
    const agg = aggregateFunction(members, config, 'fn', '2026-06-30');
    expect(agg.multiplierSignal).toBe(2);
  });

  it('applies the N<8 cohort confidence penalty at function scope', () => {
    const members = [member('a', 50), member('b', 50), member('c', 50)];
    const agg = aggregateFunction(members, config, 'fn', '2026-06-30');
    expect(agg.confidence.cohortPenaltyApplied).toBe(true);
  });

  it('sums merged PRs across members for the function cost lens denominator', () => {
    const members = [member('a', 50), member('b', 50)];
    const agg = aggregateFunction(members, config, 'fn', '2026-06-30');
    expect(agg.tokensPerPr.mergedPrs).toBe(12);
  });
});
