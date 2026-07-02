import { describe, it, expect } from 'vitest';
import {
  sum,
  mean,
  median,
  percentile,
  clamp,
  winsorize,
  safeDiv,
  weightedMean,
  tertiles,
  round,
} from './math';

describe('math.sum', () => {
  it('sums a list and returns 0 for empty', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
  });
});

describe('math.mean', () => {
  it('returns the arithmetic mean', () => {
    expect(mean([2, 4, 6])).toBe(4);
  });
  it('returns null for an empty list (never fabricates 0)', () => {
    expect(mean([])).toBeNull();
  });
});

describe('math.median', () => {
  it('handles odd length', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('averages the two middles for even length', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('is the element itself for N=1 (identity case)', () => {
    expect(median([42])).toBe(42);
  });
  it('returns null for empty', () => {
    expect(median([])).toBeNull();
  });
  it('is robust to a single large outlier', () => {
    // mean would be dragged to ~204; median stays at 3.
    expect(median([1, 2, 3, 4, 1000])).toBe(3);
  });
});

describe('math.percentile', () => {
  it('returns the min/max at q=0/1', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 1)).toBe(30);
  });
  it('interpolates linearly (R-7)', () => {
    // for [0,10] at q=0.5 → 5
    expect(percentile([0, 10], 0.5)).toBe(5);
  });
  it('returns the single value for a 1-element list', () => {
    expect(percentile([7], 0.5)).toBe(7);
  });
  it('returns null for empty', () => {
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('math.clamp', () => {
  it('clamps below, within, above', () => {
    expect(clamp(-1, 0, 100)).toBe(0);
    expect(clamp(50, 0, 100)).toBe(50);
    expect(clamp(150, 0, 100)).toBe(100);
  });
});

describe('math.winsorize', () => {
  it('clips extremes to the p5/p95 bounds', () => {
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 100];
    const w = winsorize(xs, 0.05, 0.95);
    // the 100 outlier is pulled down to the p95 bound; nothing exceeds it.
    expect(Math.max(...w)).toBeLessThan(100);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(0);
  });
  it('returns [] for empty input', () => {
    expect(winsorize([], 0.05, 0.95)).toEqual([]);
  });
});

describe('math.safeDiv', () => {
  it('divides normally', () => {
    expect(safeDiv(10, 4)).toBe(2.5);
  });
  it('returns null on zero denominator (no fabricated rate)', () => {
    expect(safeDiv(5, 0)).toBeNull();
  });
});

describe('math.weightedMean', () => {
  it('computes a weighted mean', () => {
    expect(
      weightedMean([
        { value: 100, weight: 1 },
        { value: 0, weight: 1 },
      ]),
    ).toBe(50);
  });
  it('drops null values and re-normalizes remaining weights', () => {
    expect(
      weightedMean([
        { value: 80, weight: 0.5 },
        { value: null, weight: 0.5 },
      ]),
    ).toBe(80);
  });
  it('returns null when no non-null value carries weight', () => {
    expect(
      weightedMean([{ value: null, weight: 1 }]),
    ).toBeNull();
  });
});

describe('math.tertiles', () => {
  it('returns p33/p66 cutoffs', () => {
    const t = tertiles([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(t).not.toBeNull();
    expect(t!.p33).toBeLessThan(t!.p66);
  });
  it('returns null for empty (caller falls back to cold-start)', () => {
    expect(tertiles([])).toBeNull();
  });
});

describe('math.round', () => {
  it('rounds to dp', () => {
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(1.005, 2)).toBeCloseTo(1.0, 5);
  });
});
