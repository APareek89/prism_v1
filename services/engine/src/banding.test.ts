import { describe, expect, it } from 'vitest';
import { applyGates, bandForScore } from './banding';

describe('bands + gates (main index)', () => {
  it('band floors match the lab: 85/70/55/35/1/0', () => {
    expect(bandForScore(85)).toBe('L5');
    expect(bandForScore(84.9)).toBe('L4');
    expect(bandForScore(70)).toBe('L4');
    expect(bandForScore(55)).toBe('L3');
    expect(bandForScore(35)).toBe('L2');
    expect(bandForScore(34.9)).toBe('L1');
    expect(bandForScore(1)).toBe('L1');
    expect(bandForScore(0.5)).toBe('L0');
  });

  it('L0 gate: AI share < 15% forces Dormant whatever the number', () => {
    const g = applyGates({ score: 72, aiSharePct: 11, multiplierSignal: 2 });
    expect(g.band).toBe('L0');
    expect(g.l0_forced).toBe(true);
  });

  it('L0 gate passes at exactly 15% and above (lab: 17% passes "barely")', () => {
    expect(applyGates({ score: 21.8, aiSharePct: 17, multiplierSignal: 0 }).band).toBe('L1');
    expect(applyGates({ score: 21.8, aiSharePct: 15, multiplierSignal: 0 }).l0_forced).toBe(false);
  });

  it('L5 gate: 85+ without a multiplier signal caps at L4', () => {
    const capped = applyGates({ score: 92, aiSharePct: 90, multiplierSignal: 0 });
    expect(capped.band).toBe('L4');
    expect(capped.l5_capped).toBe(true);
    const passed = applyGates({ score: 92, aiSharePct: 90, multiplierSignal: 1 });
    expect(passed.band).toBe('L5');
    expect(passed.l5_capped).toBe(false);
  });

  it('null AI share does not force L0 (no denominator ≠ dormant)', () => {
    expect(applyGates({ score: 40, aiSharePct: null, multiplierSignal: 0 }).l0_forced).toBe(false);
  });
});
