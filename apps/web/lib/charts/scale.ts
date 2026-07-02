// lib/charts/scale.ts
//
// Pure SVG geometry helpers for the inline charts (components/charts/*). NO chart
// library, NO React, NO DOM — just deterministic math producing path strings and
// rectangle geometry from a number[] series.
//
// Ported from the reference `prism_dashboard.html` <script> (areaChart / barChart),
// with the demo-data `Math.random` jitter and innerHTML stripped out: these helpers
// only compute geometry; the components render it. An empty series produces a clean
// "awaiting signal" frame (grid lines only) rather than fabricated points.

/** Default SVG drawing box matching the reference (`viewBox 0 0 520 150`). */
export const CHART_W = 520;
export const CHART_H = 150;
export const CHART_PAD = 8;

/** Clamp a number into the inclusive [min, max] range. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export interface ChartBox {
  /** drawing width (viewBox units). */
  w: number;
  /** drawing height (viewBox units). */
  h: number;
  /** inner padding on every side. */
  pad: number;
}

export const DEFAULT_BOX: ChartBox = { w: CHART_W, h: CHART_H, pad: CHART_PAD };

/**
 * A 1-D linear scale: maps a domain [d0, d1] onto a range [r0, r1].
 * Degenerate domains (d0 === d1) map everything to r0 (no divide-by-zero).
 */
export function linearScale(
  d0: number,
  d1: number,
  r0: number,
  r1: number,
): (v: number) => number {
  const span = d1 - d0;
  if (span === 0) return () => r0;
  const k = (r1 - r0) / span;
  return (v: number) => r0 + (v - d0) * k;
}

/**
 * The y-domain the reference used: a little headroom above the max and a little
 * below the min so the line never touches the frame edges. Returns the padded
 * [min, max] pair, with a safe unit span when the series is flat/empty.
 */
export function yDomain(
  data: readonly number[],
  headroom = 4,
  footroom = 6,
): { min: number; max: number } {
  if (data.length === 0) return { min: 0, max: 1 };
  const max = Math.max(...data) + headroom;
  const min = Math.min(...data) - footroom;
  if (max === min) return { min, max: min + 1 };
  return { min, max };
}

/** A computed (x, y) point in viewBox space. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Evenly-spaced x positions + value-scaled y positions for a line/area series.
 * x spans [pad, w - pad]; y is inverted (larger value → smaller y) within
 * [pad, h - pad]. A single-point series sits at the left edge.
 */
export function linePoints(data: readonly number[], box: ChartBox = DEFAULT_BOX): Point[] {
  const { w, h, pad } = box;
  const n = data.length;
  if (n === 0) return [];
  const { min, max } = yDomain(data);
  const xAt = n === 1 ? () => pad : linearScale(0, n - 1, pad, w - pad);
  const yScale = linearScale(min, max, h - pad, pad); // inverted range
  return data.map((v, i) => ({ x: xAt(i), y: yScale(v) }));
}

/** Build an SVG line `d` from precomputed points (M…L…). */
export function linePath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

/**
 * Build a closed area `d` for a gradient fill: the line, then down to the baseline
 * and back. Mirrors the reference `ar = ln + L… L… Z`.
 */
export function areaPath(points: readonly Point[], box: ChartBox = DEFAULT_BOX): string {
  if (points.length === 0) return '';
  const { h, pad } = box;
  const baseY = h - pad;
  const ln = linePath(points);
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${ln} L${last.x.toFixed(1)} ${baseY} L${first.x.toFixed(1)} ${baseY} Z`;
}

/** Convenience: line + area paths + the end dot for a series, in one call. */
export interface AreaGeometry {
  points: Point[];
  line: string;
  area: string;
  /** end-of-series dot, or null for an empty series. */
  end: Point | null;
}

export function areaGeometry(data: readonly number[], box: ChartBox = DEFAULT_BOX): AreaGeometry {
  const points = linePoints(data, box);
  return {
    points,
    line: linePath(points),
    area: areaPath(points, box),
    end: points.length > 0 ? points[points.length - 1]! : null,
  };
}

/** One bar's geometry (viewBox space). */
export interface BarGeom {
  x: number;
  y: number;
  width: number;
  height: number;
  /** true for the final bar (the reference highlights it at full opacity). */
  last: boolean;
}

/**
 * Bar geometry for a series. Bars are scaled against `max·1.1` (headroom), share
 * 62% of each slot's width, and are centered in the slot — exactly the reference
 * `barChart`. An empty series yields no bars.
 */
export function barGeometry(data: readonly number[], box: ChartBox = DEFAULT_BOX): BarGeom[] {
  const { w, h, pad } = box;
  const n = data.length;
  if (n === 0) return [];
  const peak = Math.max(...data) * 1.1;
  // All-zero (or negative) series → no positive height; render flat at baseline.
  const safePeak = peak > 0 ? peak : 1;
  const slot = (w - 2 * pad) / n;
  const barW = slot * 0.62;
  const innerH = h - 2 * pad;
  return data.map((v, i) => {
    const barH = clamp((v / safePeak) * innerH, 0, innerH);
    const x = pad + i * slot + (slot - barW) / 2;
    return {
      x,
      y: h - pad - barH,
      width: barW,
      height: barH,
      last: i === n - 1,
    };
  });
}

/**
 * Horizontal grid lines (the reference drew 4 evenly-spaced lines). Returns the y
 * coordinates within [pad, h - pad]; used by both real and empty-axes frames.
 */
export function gridLines(box: ChartBox = DEFAULT_BOX, count = 4): number[] {
  const { h, pad } = box;
  const ys: number[] = [];
  const inner = h - 2 * pad;
  const steps = Math.max(count - 1, 1);
  for (let g = 0; g < count; g++) ys.push(pad + (g * inner) / steps);
  return ys;
}

/**
 * "Nice" axis tick values across [min, max] (1/2/5·10ⁿ steps). Pure; used by any
 * axis label rendering. Returns at most `maxTicks` ascending values covering the
 * domain. Safe on degenerate domains.
 */
export function niceTicks(min: number, max: number, maxTicks = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || maxTicks < 1) return [];
  if (min === max) return [min];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const rawStep = (hi - lo) / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step: number;
  if (norm >= 5) step = 5 * mag;
  else if (norm >= 2) step = 2 * mag;
  else step = mag;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= hi + step * 1e-9 && ticks.length <= maxTicks + 1; t += step) {
    // Round to step precision to avoid float drift (e.g. 0.30000000004).
    ticks.push(Number(t.toFixed(10)));
  }
  return ticks;
}
