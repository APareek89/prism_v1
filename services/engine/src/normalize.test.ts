import { describe, expect, it } from 'vitest';
import { normalize, pct, mean } from './normalize';

const up = (floor: number, target: number) => ({ direction: 'up' as const, anchor: { floor, target } });
const down = (target: number, ceil: number) => ({ direction: 'down' as const, anchor: { target, ceil } });

describe('normalize — anchor math (spec §2)', () => {
  it('up: at/below floor → 0, at/above target → 100, proportional between', () => {
    expect(normalize(50, up(50, 100))).toBe(0);
    expect(normalize(30, up(50, 100))).toBe(0);
    expect(normalize(100, up(50, 100))).toBe(100);
    expect(normalize(80, up(50, 100))).toBe(60);           // lab KPI 1 example
    expect(normalize(45, up(30, 80))).toBe(30);            // lab KPI 3 example
  });

  it('up: NO bonus beyond target', () => {
    expect(normalize(120, up(50, 100))).toBe(100);
  });

  it('down (inverted): at/below target → 100, at/above ceil → 0', () => {
    expect(normalize(3, down(3, 12))).toBe(100);
    expect(normalize(12, down(3, 12))).toBe(0);
    expect(normalize(14, down(3, 12))).toBe(0);
    expect(normalize(6, down(3, 12))).toBe(66.7);          // lab KPI 4 example
    expect(normalize(40, down(30, 90))).toBe(83.3);        // lab KPI 6 example
    expect(normalize(25, down(5, 30))).toBe(20);           // lab KPI 10 example
    expect(normalize(8.3, down(5, 30))).toBe(86.8);        // lab KPI 9 example (~87)
  });

  it('null in → null out (honest no-signal, never 0-by-default)', () => {
    expect(normalize(null, up(50, 100))).toBeNull();
    expect(normalize(Number.NaN, up(50, 100))).toBeNull();
  });

  it('pct keeps null denominators null', () => {
    expect(pct(1, 0)).toBeNull();
    expect(pct(1, 2)).toBe(50);
  });

  it('mean of empty is null', () => {
    expect(mean([])).toBeNull();
    expect(mean([4, 5, 4.33])).toBe(4.4);
  });
});
