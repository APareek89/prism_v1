import { describe, it, expect } from 'vitest';
import { resolveWindow, addDays, isWithinWindow } from './window';

describe('window.resolveWindow', () => {
  it('builds a trailing 28-day compute window ending on the run date', () => {
    const w = resolveWindow('2026-06-30');
    expect(w.compute.end).toBe('2026-06-30');
    expect(w.compute.days).toBe(28);
    expect(w.compute.start).toBe('2026-06-03'); // 30 − 27 days
  });

  it('builds a trailing 90-day sizing window', () => {
    const w = resolveWindow('2026-06-30');
    expect(w.sizing.end).toBe('2026-06-30');
    expect(w.sizing.days).toBe(90);
    expect(w.sizing.start).toBe('2026-04-02'); // 90-day trailing inclusive
  });

  it('the period toggle changes only presentation (granularity + baseline), not the window', () => {
    const daily = resolveWindow('2026-06-30', 'daily');
    const weekly = resolveWindow('2026-06-30', 'weekly');
    const monthly = resolveWindow('2026-06-30', 'monthly');

    // the 28-day score window is identical across periods.
    expect(weekly.compute).toEqual(daily.compute);
    expect(monthly.compute).toEqual(daily.compute);

    // only granularity + baseline differ.
    expect(daily.trendGranularity).toBe('day');
    expect(weekly.trendGranularity).toBe('week');
    expect(monthly.trendGranularity).toBe('month');

    expect(daily.deltaBaselineDate).toBe('2026-06-29'); // −1 day
    expect(weekly.deltaBaselineDate).toBe('2026-06-23'); // −7 days
    expect(monthly.deltaBaselineDate).toBe('2026-05-31'); // −30 days
  });

  it('is deterministic — no clock; same run date → same window', () => {
    expect(resolveWindow('2026-06-30')).toEqual(resolveWindow('2026-06-30'));
  });

  it('throws on a malformed or impossible date', () => {
    expect(() => resolveWindow('2026-6-30')).toThrow();
    expect(() => resolveWindow('2026-02-30')).toThrow();
  });
});

describe('window.addDays', () => {
  it('adds and subtracts whole days across month boundaries', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('window.isWithinWindow', () => {
  it('is inclusive of both endpoints', () => {
    const w = resolveWindow('2026-06-30').compute;
    expect(isWithinWindow('2026-06-03', w)).toBe(true);
    expect(isWithinWindow('2026-06-30', w)).toBe(true);
    expect(isWithinWindow('2026-06-02', w)).toBe(false);
    expect(isWithinWindow('2026-07-01', w)).toBe(false);
  });
});
