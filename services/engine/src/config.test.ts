import { describe, expect, it } from 'vitest';
import type { IndexConfig, KpiCatalogRow } from '@prism/contract';
import { disableKpi, enableKpi, indexWeightSum } from './config';

const catalog = [
  { kpi_id: 'ai_share', index_kind: 'main', dimension: 'usage' },
  { kpi_id: 'cadence', index_kind: 'main', dimension: 'usage' },
  { kpi_id: 'iterations', index_kind: 'main', dimension: 'efficiency' },
  { kpi_id: 'tokens', index_kind: 'main', dimension: 'efficiency' },
  { kpi_id: 'revert', index_kind: 'main', dimension: 'outcomes' },
  { kpi_id: 'rework', index_kind: 'main', dimension: 'outcomes' },
  { kpi_id: 'reliability', index_kind: 'diagnostic', dimension: 'outcomes' },
  { kpi_id: 'skills_authored', index_kind: 'harness', dimension: 'harness' },
  { kpi_id: 'verification', index_kind: 'harness', dimension: 'harness' },
  { kpi_id: 'review_loop', index_kind: 'harness', dimension: 'harness' },
  { kpi_id: 'continuity', index_kind: 'harness', dimension: 'harness' },
] as KpiCatalogRow[];

const v1: IndexConfig = {
  weights: {
    ai_share: 7.5, cadence: 7.5, iterations: 17.5, tokens: 17.5, revert: 25, rework: 25,
    skills_authored: 25, verification: 25, review_loop: 25, continuity: 25,
  },
  disabled: [],
};

describe('Configure weight rules', () => {
  it('default config sums to 100 for each index', () => {
    expect(indexWeightSum(catalog, v1, 'main')).toBe(100);
    expect(indexWeightSum(catalog, v1, 'harness')).toBe(100);
  });

  it('deleting a KPI redistributes its weight PROPORTIONALLY across the same index', () => {
    const next = disableKpi(catalog, v1, 'revert');
    expect(next.disabled).toContain('revert');
    expect(next.weights.revert).toBeUndefined();
    // 25 freed over remaining sum 75, proportionally: ai 7.5→10, cadence 7.5→10,
    // iterations 17.5→23.3, tokens 17.5→23.3, rework 25→33.3 (one gets drift fix).
    expect(indexWeightSum(catalog, next, 'main')).toBeCloseTo(100, 5);
    expect(next.weights.rework).toBeGreaterThan(33);
    expect(next.weights.ai_share).toBeCloseTo(10, 0);
    // Harness untouched.
    expect(indexWeightSum(catalog, next, 'harness')).toBe(100);
  });

  it('deleting a harness KPI keeps harness at 100 without touching main', () => {
    const next = disableKpi(catalog, v1, 'review_loop');
    expect(indexWeightSum(catalog, next, 'harness')).toBeCloseTo(100, 5);
    expect(next.weights.verification).toBeCloseTo(33.3, 1);
    expect(indexWeightSum(catalog, next, 'main')).toBe(100);
  });

  it('diagnostic KPIs carry no weight and cannot be disabled into the math', () => {
    const next = disableKpi(catalog, v1, 'reliability');
    expect(next).toEqual(v1);
  });

  it('re-enabling scales the index back to 100', () => {
    const withoutRevert = disableKpi(catalog, v1, 'revert');
    const back = enableKpi(catalog, withoutRevert, 'revert', 25);
    expect(back.disabled).not.toContain('revert');
    expect(indexWeightSum(catalog, back, 'main')).toBeCloseTo(100, 0);
  });

  it('disable is idempotent', () => {
    const once = disableKpi(catalog, v1, 'revert');
    expect(disableKpi(catalog, once, 'revert')).toEqual(once);
  });
});
