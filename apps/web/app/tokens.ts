// Typed mirror of the design tokens in app/globals.css :root.
// Used by inline-SVG charts and chips so hues come from one typed source.
// MUST stay identical to globals.css.

export type Dimension = 'usage' | 'efficiency' | 'effectiveness' | 'proficiency';

export const DIMENSION_HUES: Record<Dimension, string> = {
  usage: '#5865e8',
  efficiency: '#188f78',
  effectiveness: '#d8842b',
  proficiency: '#8755ce',
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  usage: 'Usage / AI-depth',
  efficiency: 'Efficiency',
  effectiveness: 'Effectiveness',
  proficiency: 'Proficiency',
};

// L1 banding colors (L0–L5).
export const BAND_COLORS: Record<string, string> = {
  L0: '#879188',
  L1: '#69746b',
  L2: '#5865e8',
  L3: '#188f78',
  L4: '#d8842b',
  L5: '#8755ce',
};

export const CONFIDENCE_COLORS = {
  High: '#16855b',
  Medium: '#d8842b',
  Low: '#c34b5c',
  Insufficient: '#879188',
} as const;

export const STATUS_COLORS = {
  good: '#16855b',
  bad: '#c34b5c',
  warn: '#d8842b',
  muted: '#879188',
} as const;

export const INK = '#172018';
export const BG = '#f5f7f4';

export function hueFor(d: Dimension): string {
  return DIMENSION_HUES[d];
}
