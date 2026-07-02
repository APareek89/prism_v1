import { describe, it, expect } from 'vitest';
import { computeConfidence, bandForScore, insufficientConfidence } from './confidence';
import { DEFAULT_INDEX_CONFIG } from './defaults/index-config.default';
import type { Dimension, L2Result } from './types';

const config = DEFAULT_INDEX_CONFIG;

function l2(met: Partial<Record<Dimension, boolean>>): Record<Dimension, L2Result> {
  const mk = (dimension: Dimension, metMinSignal: boolean): L2Result => ({
    dimension,
    score: 50,
    signals: metMinSignal ? 100 : 0,
    metMinSignal,
    kpis: [],
  });
  return {
    usage: mk('usage', met.usage ?? false),
    efficiency: mk('efficiency', met.efficiency ?? false),
    effectiveness: mk('effectiveness', met.effectiveness ?? false),
    proficiency: mk('proficiency', met.proficiency ?? false),
  };
}

describe('confidence.bandForScore', () => {
  it('maps to High/Medium/Low/Insufficient', () => {
    expect(bandForScore(0.9)).toBe('high');
    expect(bandForScore(0.7)).toBe('medium');
    expect(bandForScore(0.5)).toBe('low');
    expect(bandForScore(0.3)).toBe('insufficient');
  });
  it('uses inclusive lower bounds', () => {
    expect(bandForScore(0.85)).toBe('high');
    expect(bandForScore(0.6)).toBe('medium');
    expect(bandForScore(0.4)).toBe('low');
  });
});

describe('confidence.computeConfidence — qualifying weight sum', () => {
  it('sums the weights of dimensions that met min-signal', () => {
    // effectiveness (.40) + efficiency (.25) = .65 → medium
    const c = computeConfidence(
      l2({ effectiveness: true, efficiency: true }),
      config,
      10,
    );
    expect(c.score).toBeCloseTo(0.65, 6);
    expect(c.band).toBe('medium');
    expect(c.shouldSuppressL1).toBe(false);
  });

  it('all four qualifying → score 1.0 → high', () => {
    const c = computeConfidence(
      l2({ usage: true, efficiency: true, effectiveness: true, proficiency: true }),
      config,
      10,
    );
    expect(c.score).toBeCloseTo(1.0, 6);
    expect(c.band).toBe('high');
  });

  it('suppresses L1 below 0.40 (only usage .10 qualifies)', () => {
    const c = computeConfidence(l2({ usage: true }), config, 10);
    expect(c.score).toBeCloseTo(0.1, 6);
    expect(c.shouldSuppressL1).toBe(true);
    expect(c.band).toBe('insufficient');
  });
});

describe('confidence.computeConfidence — small cohort N<8 drops one band', () => {
  it('demotes the band for a cohort smaller than 8', () => {
    // .65 would be medium; N=3 drops it to low.
    const c = computeConfidence(
      l2({ effectiveness: true, efficiency: true }),
      config,
      3,
    );
    expect(c.cohortPenaltyApplied).toBe(true);
    expect(c.band).toBe('low');
    // the numeric score is unchanged (penalty is a band demotion).
    expect(c.score).toBeCloseTo(0.65, 6);
  });
  it('does not demote at N=8', () => {
    const c = computeConfidence(
      l2({ effectiveness: true, efficiency: true }),
      config,
      8,
    );
    expect(c.cohortPenaltyApplied).toBe(false);
    expect(c.band).toBe('medium');
  });
  it('insufficient is the floor — cannot demote below it', () => {
    const c = computeConfidence(l2({}), config, 1);
    expect(c.band).toBe('insufficient');
  });
});

describe('confidence.insufficientConfidence', () => {
  it('is the suppressed empty-signal result', () => {
    const c = insufficientConfidence();
    expect(c.score).toBe(0);
    expect(c.band).toBe('insufficient');
    expect(c.shouldSuppressL1).toBe(true);
  });
});
