import { describe, it, expect } from 'vitest';
import { computeBand } from './banding';

describe('banding.computeBand — numeric bands', () => {
  const base = { aiActiveShare: 1, multiplierSignal: 1 };
  it('maps L1 score to L1–L5 thresholds', () => {
    expect(computeBand({ ...base, l1: 10 }).valueOf()).toBe('L1'); // 0–34
    expect(computeBand({ ...base, l1: 40 })).toBe('L2'); // 35–54
    expect(computeBand({ ...base, l1: 60 })).toBe('L3'); // 55–69
    expect(computeBand({ ...base, l1: 75 })).toBe('L4'); // 70–84
    expect(computeBand({ ...base, l1: 90 })).toBe('L5'); // 85–100
  });
});

describe('banding.computeBand — L0 gate (AI-active < 0.15)', () => {
  it('forces L0 when AI-active share is below 0.15, even at a high L1', () => {
    expect(
      computeBand({ l1: 90, aiActiveShare: 0.1, multiplierSignal: 5 }),
    ).toBe('L0');
  });
  it('forces L0 when AI-active share is null (no evidence)', () => {
    expect(
      computeBand({ l1: 90, aiActiveShare: null, multiplierSignal: 5 }),
    ).toBe('L0');
  });
  it('does NOT force L0 at exactly the 0.15 gate', () => {
    expect(
      computeBand({ l1: 40, aiActiveShare: 0.15, multiplierSignal: 0 }),
    ).toBe('L2');
  });
});

describe('banding.computeBand — L5 gate (multiplier > 0)', () => {
  it('caps at L4 when L1 ≥ 85 but multiplier signal is 0', () => {
    expect(
      computeBand({ l1: 92, aiActiveShare: 1, multiplierSignal: 0 }),
    ).toBe('L4');
  });
  it('allows L5 when multiplier signal > 0', () => {
    expect(
      computeBand({ l1: 92, aiActiveShare: 1, multiplierSignal: 1 }),
    ).toBe('L5');
  });
});

describe('banding.computeBand — suppressed L1', () => {
  it('returns L0 when L1 is null even with AI activity', () => {
    expect(
      computeBand({ l1: null, aiActiveShare: 0.9, multiplierSignal: 1 }),
    ).toBe('L0');
  });
});
