import { describe, it, expect } from 'vitest';
import {
  sizeScore,
  freezeThresholds,
  bucketForScore,
  bucketPr,
  needsTieBreak,
} from './sizing';
import { DEFAULT_INDEX_CONFIG } from './defaults/index-config.default';
import { makePr, sizingPrs } from './__fixtures__/rows';

const config = DEFAULT_INDEX_CONFIG;

describe('sizing.sizeScore', () => {
  it('computes files + hunks + 2·modules + 3·blast', () => {
    // 3 + 4 + 2·1 + 3·1 = 12
    expect(
      sizeScore({ files: 3, hunks: 4, modules: 1, blast: 1 }, config),
    ).toBe(12);
  });
  it('weights modules ×2 and blast ×3', () => {
    expect(sizeScore({ files: 0, hunks: 0, modules: 2, blast: 0 }, config)).toBe(
      4,
    );
    expect(sizeScore({ files: 0, hunks: 0, modules: 0, blast: 1 }, config)).toBe(
      3,
    );
  });
});

describe('sizing.freezeThresholds', () => {
  it('derives calibrated tertiles from 90-day merged PRs', () => {
    const t = freezeThresholds(sizingPrs(), config);
    expect(t.calibrated).toBe(true);
    expect(t.p33).toBeLessThan(t.p66);
  });
  it('falls back to cold-start defaults on empty sample (S≤6 / L>18)', () => {
    const t = freezeThresholds([], config);
    expect(t.calibrated).toBe(false);
    expect(t.p33).toBe(6); // cold-start sMax
    expect(t.p66).toBe(18); // cold-start lMin
  });
  it('ignores un-merged PRs when freezing', () => {
    const prs = [
      makePr({ prId: 'a', files: 1, hunks: 1, modules: 0, blast: 0, isMerged: true }),
      makePr({ prId: 'b', files: 99, hunks: 99, isMerged: false }),
    ];
    const t = freezeThresholds(prs, config);
    // only the merged PR (score 2) informs the tertiles.
    expect(t.p33).toBe(2);
    expect(t.p66).toBe(2);
  });
});

describe('sizing.bucketForScore (cold-start S≤6 · M 7–18 · L>18)', () => {
  const cold = { p33: 6, p66: 18, calibrated: false };
  it('buckets S at/below 6', () => {
    expect(bucketForScore(6, cold)).toBe('S');
    expect(bucketForScore(3, cold)).toBe('S');
  });
  it('buckets M between 7 and 18', () => {
    expect(bucketForScore(7, cold)).toBe('M');
    expect(bucketForScore(18, cold)).toBe('M');
  });
  it('buckets L above 18', () => {
    expect(bucketForScore(19, cold)).toBe('L');
  });
});

describe('sizing.bucketPr', () => {
  it('sizes and buckets in one call', () => {
    const cold = { p33: 6, p66: 18, calibrated: false };
    const pr = makePr({ files: 1, hunks: 1, modules: 0, blast: 0 }); // score 2
    const out = bucketPr(pr, cold, config);
    expect(out.score).toBe(2);
    expect(out.bucket).toBe('S');
  });
});

describe('sizing.needsTieBreak (±10% of a boundary, never primary)', () => {
  const t = { p33: 10, p66: 20, calibrated: true };

  it('flags a score within 10% of the S/M boundary', () => {
    expect(needsTieBreak(10.5, t, config)).toBe(true); // within ±1 of 10
    expect(needsTieBreak(9.5, t, config)).toBe(true);
  });
  it('flags a score within 10% of the M/L boundary', () => {
    expect(needsTieBreak(21, t, config)).toBe(true); // within ±2 of 20
  });
  it('does NOT flag a score comfortably inside a bucket', () => {
    expect(needsTieBreak(15, t, config)).toBe(false);
  });
  it('never decides the bucket — bucketForScore is authoritative', () => {
    // A borderline score still buckets deterministically regardless of tie-break.
    expect(bucketForScore(10.5, t)).toBe('M'); // > p33 → M
    expect(needsTieBreak(10.5, t, config)).toBe(true);
  });
  it('uses an absolute band near a zero boundary', () => {
    const z = { p33: 0, p66: 20, calibrated: true };
    expect(needsTieBreak(0.05, z, config)).toBe(true); // within absolute 0.1
  });
});
