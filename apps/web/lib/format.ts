// lib/format.ts
//
// PRESENTATION formatters only. This module never does scoring math — it takes
// already-computed numbers and renders them. (All scoring lives in lib/scoring.)
// Null-safe everywhere: a null value renders as the "no signal" em-dash, never 0.

/** The canonical "no signal yet" glyph — used instead of fabricating a 0. */
export const NO_SIGNAL = '—';

/** Format an L1/L2 score (0–100) to a whole number, or — when null. */
export function fmtScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_SIGNAL;
  return String(Math.round(value));
}

/** Format a 0–1 ratio as a percentage (e.g. 0.42 → "42%"), or — when null. */
export function fmtPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_SIGNAL;
  return `${(value * 100).toFixed(digits)}%`;
}

/** Format a signed delta with arrow-free sign (e.g. +3, -2, 0), or — when null. */
export function fmtDelta(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_SIGNAL;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return '0';
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}`;
}

/** Direction of a delta for arrow/coloring (null → 'flat'). */
export function deltaDirection(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

/** Format a token count compactly (1234 → "1.2k", 1_200_000 → "1.2M"), or — when null. */
export function fmtTokens(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NO_SIGNAL;
  const n = Math.abs(value);
  if (n >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** Format a timestamp/date as a relative string ("3d ago", "just now"), or — when null.
 *  `now` is injectable for deterministic tests. */
export function fmtRelativeTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return NO_SIGNAL;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return NO_SIGNAL;
  const diffMs = now.getTime() - then.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}
