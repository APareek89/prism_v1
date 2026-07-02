import { describe, it, expect } from 'vitest';
import { normalizeValue, normalizeKpi } from './normalize';
import { DEFAULT_INDEX_CONFIG } from './defaults/index-config.default';
import type { KpiRaw } from './types';

describe('normalize.normalizeValue — higher-is-better', () => {
  const anchor = { floor: 0.5, target: 1.0 }; // AI-assisted share

  it('maps floor → 0 and below floor → 0', () => {
    expect(normalizeValue(0.5, anchor, false)).toBe(0);
    expect(normalizeValue(0.3, anchor, false)).toBe(0);
  });
  it('maps target → 100 and CAPS above target at 100 (no reward beyond good)', () => {
    expect(normalizeValue(1.0, anchor, false)).toBe(100);
    expect(normalizeValue(5.0, anchor, false)).toBe(100); // cap at target
  });
  it('interpolates linearly between floor and target', () => {
    // midpoint 0.75 → 50
    expect(normalizeValue(0.75, anchor, false)).toBe(50);
  });
});

describe('normalize.normalizeValue — inverted (lower-is-better)', () => {
  const anchor = { target: 3, ceil: 12 }; // iterations-to-merge

  it('maps target → 100 and below target → 100 (cap at target)', () => {
    expect(normalizeValue(3, anchor, true)).toBe(100);
    expect(normalizeValue(1, anchor, true)).toBe(100);
  });
  it('maps ceil → 0 and above ceil → 0', () => {
    expect(normalizeValue(12, anchor, true)).toBe(0);
    expect(normalizeValue(20, anchor, true)).toBe(0);
  });
  it('flips direction — a higher raw value yields a LOWER score', () => {
    const better = normalizeValue(5, anchor, true)!;
    const worse = normalizeValue(9, anchor, true)!;
    expect(better).toBeGreaterThan(worse);
  });
  it('interpolates: midpoint 7.5 → 50', () => {
    expect(normalizeValue(7.5, anchor, true)).toBe(50);
  });
});

describe('normalize.normalizeValue — null passthrough', () => {
  it('returns null for a null value (no fabricated score)', () => {
    expect(normalizeValue(null, { floor: 0, target: 1 }, false)).toBeNull();
  });
});

describe('normalize.normalizeKpi', () => {
  it('picks the anchor + inversion flag from config for the KPI', () => {
    const raw: KpiRaw = {
      kpiId: 'ai_iterations_to_merge',
      dimension: 'efficiency',
      value: 3,
      signals: 5,
    };
    const n = normalizeKpi(raw, DEFAULT_INDEX_CONFIG);
    expect(n.inverted).toBe(true);
    expect(n.anchor).toEqual({ target: 3, ceil: 12 });
    expect(n.norm).toBe(100); // at target
  });

  it('normalizes a higher-is-better KPI against its config anchor', () => {
    const raw: KpiRaw = {
      kpiId: 'ai_assisted_pr_share',
      dimension: 'usage',
      value: 0.75,
      signals: 4,
    };
    const n = normalizeKpi(raw, DEFAULT_INDEX_CONFIG);
    expect(n.inverted).toBe(false);
    expect(n.norm).toBe(50); // midpoint of floor .5 / target 1.0
  });
});
