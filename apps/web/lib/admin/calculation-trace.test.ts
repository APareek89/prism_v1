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
    expect(trace.l1Equation).toContain('÷');
    expect(trace.confidenceEquation).toContain('90%');
    expect(trace.publicationEquation).toContain('published L1 = 52');
  });

  it('shows numeric raw, normalization, KPI-weight, L2, confidence, and band equations', () => {
    const result: IndexResult = {
      scope: 'employee', scopeId: 'e1', date: '2026-07-18', configVersion: 'v1',
      l1: null,
      l2: {
        usage: {
          dimension: 'usage', score: 40, signals: 5, metMinSignal: true,
          kpis: [{
            kpiId: 'ai_assisted_pr_share', dimension: 'usage', value: 0.2,
            signals: 5, norm: 40, anchor: { floor: 0, target: 0.5 }, inverted: false,
          }],
        },
        efficiency: { dimension: 'efficiency', score: null, signals: 0, metMinSignal: false, kpis: [] },
        effectiveness: { dimension: 'effectiveness', score: null, signals: 0, metMinSignal: false, kpis: [] },
        proficiency: { dimension: 'proficiency', score: null, signals: 0, metMinSignal: false, kpis: [] },
      },
      band: 'L0',
      confidence: { score: 0.1, band: 'insufficient', shouldSuppressL1: true, cohortPenaltyApplied: false },
      tokensPerPr: { tokensPerPr: null, cacheReadShare: null, compactionSignal: null, mergedPrs: 5 },
      aiActiveShare: 0.2, multiplierSignal: 0,
    };
    const trace = buildCalculationBreakdown(result, DEFAULT_INDEX_CONFIG, 10, {
      ai_assisted_pr_share: '1 AI-linked merged PR ÷ 5 merged PRs',
    });
    const usage = trace.dimensions.find((dimension) => dimension.id === 'usage')!;
    const kpi = usage.kpis[0]!;
    expect(kpi.rawEquation).toBe('1 AI-linked merged PR ÷ 5 merged PRs');
    expect(kpi.normalizationEquation).toContain('100 × (0.2 − 0) ÷ (0.5 − 0)');
    expect(kpi.weightedEquation).toContain('(40 × 0.4) ÷ 0.4 = 40');
    expect(usage.scoreEquation).toContain('(40×0.4) ÷ 0.4 = 40');
    expect(trace.confidenceEquation).toContain('usage 10%');
    expect(trace.bandEquation).toContain('Published L1 is null');
  });
});
