import { describe, expect, it } from 'vitest';
import { buildCalculationBreakdown } from './calculation-trace';
import { DEFAULT_INDEX_CONFIG } from '@/lib/scoring/defaults/index-config.default';
import type { Dimension, IndexResult, L2Result } from '@/lib/scoring/types';

const dimensions: Record<Dimension, L2Result> = {
  usage: { dimension: 'usage', score: 80, signals: 4, metMinSignal: true, kpis: [] },
  efficiency: { dimension: 'efficiency', score: 60, signals: 6, metMinSignal: true, kpis: [] },
  effectiveness: { dimension: 'effectiveness', score: 40, signals: 6, metMinSignal: true, kpis: [] },
  proficiency: { dimension: 'proficiency', score: null, signals: 0, metMinSignal: false, kpis: [] },
};

describe('buildCalculationBreakdown', () => {
  it('shows effective L1 contributions that renormalize over scored dimensions', () => {
    const result: IndexResult = {
      scope: 'employee', scopeId: 'e1', date: '2026-07-18', configVersion: 'v1',
      l1: 52, l2: dimensions, band: 'L2',
      confidence: { score: 0.9, band: 'medium', shouldSuppressL1: false, cohortPenaltyApplied: true },
      tokensPerPr: { tokensPerPr: 1000, cacheReadShare: 0.2, compactionSignal: 0.1, mergedPrs: 2 },
      aiActiveShare: 0.5, multiplierSignal: 0,
    };
    const trace = buildCalculationBreakdown(result, DEFAULT_INDEX_CONFIG, 4);
    const sum = trace.dimensions.reduce((total, dimension) => total + (dimension.contributionToL1 ?? 0), 0);
    expect(sum).toBeCloseTo(result.l1!, 1);
    expect(trace.dimensions.find((dimension) => dimension.id === 'proficiency')?.effectiveVotePct).toBe(0);
    expect(trace.cohortPenaltyApplied).toBe(true);
  });
});
