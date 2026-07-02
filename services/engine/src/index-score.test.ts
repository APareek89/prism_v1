import { describe, expect, it } from 'vitest';
import type { KpiResult } from './types';
import { computeIndexes } from './index-score';
import { CATALOG, CONFIG_V1 } from './__fixtures__/mini';

const kpi = (kpi_id: string, score: number | null, raw_value: number | null = score, index_kind: 'main' | 'harness' | 'diagnostic' = 'main'): KpiResult =>
  ({ kpi_id, index_kind, raw_value, score, signal_count: 5, tier: null, meta: {} } as KpiResult);

const SIGNALS = { mergedPrs: 12, sessions: 18, aiPrs: 4, connectedSessions: 15, multiplierSignal: 0 };

describe('index assembly — the lab worked example (Dev X)', () => {
  // Usage L2 = mean(0, 30) = 15 · Efficiency = mean(0, 83) = 41.5 · Outcomes =
  // mean(0, 20) = 10 → MAIN = 0.15·15 + 0.35·41.5 + 0.50·10 = 21.8 → L1 (17% share).
  const kpis = [
    kpi('ai_share', 0, 17), kpi('cadence', 30, 45),
    kpi('iterations', 0, 14), kpi('tokens', 83, 40),
    kpi('revert', 0, 50), kpi('rework', 20, 25),
    kpi('skills_authored', 0, 0, 'harness'), kpi('verification', 0, 0, 'harness'),
    kpi('review_loop', 0, 0, 'harness'), kpi('continuity', 0, 17, 'harness'),
  ];

  it('MAIN = 21.8 → L1 Basic; dimensions 15 / 41.5 / 10; HARNESS = 0, no band', () => {
    const [main, harness] = computeIndexes(kpis, CATALOG, CONFIG_V1, SIGNALS);
    expect(main!.score).toBe(21.8);
    expect(main!.band).toBe('L1');
    expect(main!.gates.l0_forced).toBe(false);   // 17% ≥ 15% — passes barely
    expect(main!.dimensions).toEqual({ usage: 15, efficiency: 41.5, outcomes: 10 });
    expect(harness!.score).toBe(0);
    expect(harness!.band).toBeNull();            // the harness index has NO bands
  });

  it('L0 gate: share 11% forces Dormant at the same numbers', () => {
    const gated = kpis.map((k) => (k.kpi_id === 'ai_share' ? { ...k, raw_value: 11 } : k));
    const [main] = computeIndexes(gated, CATALOG, CONFIG_V1, SIGNALS);
    expect(main!.band).toBe('L0');
    expect(main!.gates.l0_forced).toBe(true);
  });

  it('L5 gate: a 90-score dev without a multiplier caps at L4; with one, L5', () => {
    const hot = kpis.map((k) => ({ ...k, score: 90, raw_value: 90 }));
    const [capped] = computeIndexes(hot, CATALOG, CONFIG_V1, SIGNALS);
    expect(capped!.band).toBe('L4');
    expect(capped!.gates.l5_capped).toBe(true);
    const [l5] = computeIndexes(hot, CATALOG, CONFIG_V1, { ...SIGNALS, multiplierSignal: 1 });
    expect(l5!.band).toBe('L5');
  });

  it('null-score KPIs do not vote — weights renormalize (no fake zeros)', () => {
    const withNull = kpis.map((k) => (k.kpi_id === 'iterations' ? { ...k, score: null, raw_value: null } : k));
    const [main] = computeIndexes(withNull, CATALOG, CONFIG_V1, SIGNALS);
    // (0·7.5 + 30·7.5 + 83·17.5 + 0·25 + 20·25) / 82.5 = 2177.5−0… = 2177.5 minus iterations' 0×17.5 → 2177.5; /82.5
    expect(main!.score).toBe(26.4);
    expect(main!.dimensions.efficiency).toBe(83); // tokens alone carries the dimension
  });

  it('confidence below the 0.40 floor suppresses the index (score null), never a shaky number', () => {
    const [main, harness] = computeIndexes(kpis, CATALOG, CONFIG_V1,
      { mergedPrs: 1, sessions: 2, aiPrs: 0, connectedSessions: 2, multiplierSignal: 0 });
    expect(main!.score).toBeNull();
    expect(main!.band).toBeNull();
    expect(harness!.score).toBeNull();
    expect(main!.confidence).toBeLessThan(0.4);
  });

  it('a disabled KPI is excluded and its weight redistributed at the config layer', () => {
    const config = {
      weights: { ...CONFIG_V1.weights, ai_share: 10, cadence: 10, iterations: 23.3, tokens: 23.3, revert: 33.4 },
      disabled: ['rework' as const],
    };
    delete (config.weights as Record<string, number>).rework;
    const [main] = computeIndexes(kpis, CATALOG, config, SIGNALS);
    // (0·10 + 30·10 + 0·23.3 + 83·23.3 + 0·33.4) / 100 = (300 + 1933.9) / 100
    expect(main!.score).toBe(22.3);
  });
});
