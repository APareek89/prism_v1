import { describe, it, expect } from 'vitest';
import { computeL2, computeAllL2, computeL1, assertKpiMapsConsistent } from './index-score';
import { DEFAULT_INDEX_CONFIG } from './defaults/index-config.default';
import type { KpiNormalized } from './types';

const config = DEFAULT_INDEX_CONFIG;

function norm(
  kpiId: KpiNormalized['kpiId'],
  dimension: KpiNormalized['dimension'],
  normScore: number | null,
  signals = 5,
): KpiNormalized {
  return {
    kpiId,
    dimension,
    value: 0,
    signals,
    norm: normScore,
    anchor: { target: 1 },
    inverted: false,
  };
}

describe('index-score.computeL2', () => {
  it('weights usage KPIs by their intra-weights (.40/.35/.25)', () => {
    const kpis = [
      norm('ai_assisted_pr_share', 'usage', 100),
      norm('agentic_depth_share', 'usage', 0),
      norm('tool_session_cadence', 'usage', 0),
    ];
    // 100·.40 + 0·.35 + 0·.25 = 40
    expect(computeL2('usage', kpis, config).score).toBeCloseTo(40, 6);
  });

  it('re-normalizes weights when a KPI is null (drops it)', () => {
    const kpis = [
      norm('ai_assisted_pr_share', 'usage', 100), // weight .40
      norm('agentic_depth_share', 'usage', null), // dropped
      norm('tool_session_cadence', 'usage', 0), // weight .25
    ];
    // (100·.40 + 0·.25) / (.40 + .25) = 40/.65 ≈ 61.54
    expect(computeL2('usage', kpis, config).score).toBeCloseTo(40 / 0.65, 4);
  });

  it('flags metMinSignal against the dimension threshold', () => {
    const kpis = [norm('ai_assisted_pr_share', 'usage', 100, 1)];
    // usage min-signal default is 3; one KPI with 1 signal → not met.
    expect(computeL2('usage', kpis, config).metMinSignal).toBe(false);
  });

  it('score is null when every KPI is null', () => {
    const kpis = [norm('ai_assisted_pr_share', 'usage', null)];
    expect(computeL2('usage', kpis, config).score).toBeNull();
  });
});

describe('index-score.computeL1', () => {
  it('is Σ(dimension weight · L2 score) — Usage.10/Eff.25/Effness.40/Prof.25', () => {
    const kpis = [
      norm('ai_assisted_pr_share', 'usage', 100, 5),
      norm('agentic_depth_share', 'usage', 100, 5),
      norm('tool_session_cadence', 'usage', 100, 5),
      norm('ai_iterations_to_merge', 'efficiency', 100, 5),
      norm('suggestion_acceptance_rate', 'efficiency', 100, 5),
      norm('tokens_to_shipped', 'efficiency', 100, 5),
      norm('merged_without_revert_rate', 'effectiveness', 100, 5),
      norm('ai_code_retention_30d', 'effectiveness', 100, 5),
      norm('change_failure_rate', 'effectiveness', 100, 5),
      norm('defect_rework_rate', 'effectiveness', 100, 5),
      norm('effective_skill_leverage', 'proficiency', 100, 5),
      norm('distinct_skills_authored', 'proficiency', 100, 5),
      norm('multiplier_signal', 'proficiency', 100, 5),
    ];
    const l2 = computeAllL2(kpis, config);
    // all dimensions = 100 → L1 = 100
    expect(computeL1(l2, config)).toBeCloseTo(100, 6);
  });

  it('weights effectiveness most heavily (.40)', () => {
    const kpis = [
      // only effectiveness scores 100; all others 0
      norm('ai_assisted_pr_share', 'usage', 0),
      norm('ai_iterations_to_merge', 'efficiency', 0),
      norm('merged_without_revert_rate', 'effectiveness', 100),
      norm('effective_skill_leverage', 'proficiency', 0),
    ];
    const l2 = computeAllL2(kpis, config);
    // L1 = .40·100 = 40
    expect(computeL1(l2, config)).toBeCloseTo(40, 6);
  });

  it('returns null when no dimension produced a score', () => {
    const l2 = computeAllL2([], config);
    expect(computeL1(l2, config)).toBeNull();
  });
});

describe('index-score.assertKpiMapsConsistent', () => {
  it('does not throw — every KPI has an intra-weight', () => {
    expect(() => assertKpiMapsConsistent()).not.toThrow();
  });
});
