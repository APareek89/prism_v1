// Typed mirror of the design tokens in app/globals.css :root.
// Used by inline-SVG charts and chips so hues come from one typed source.
// MUST stay identical to globals.css.

export type Dimension = 'usage' | 'efficiency' | 'effectiveness' | 'proficiency';

export const DIMENSION_HUES: Record<Dimension, string> = {
  usage: '#5b8def',
  efficiency: '#2dd4bf',
  effectiveness: '#f5a524',
  proficiency: '#a78bfa',
};

export const DIMENSION_LABELS: Record<Dimension, string> = {
  usage: 'Usage / AI-depth',
  efficiency: 'Efficiency',
  effectiveness: 'Effectiveness',
  proficiency: 'Proficiency',
};

// L1 banding colors (L0–L5).
export const BAND_COLORS: Record<string, string> = {
  L0: '#5f6a83',
  L1: '#5f6a83',
  L2: '#5b8def',
  L3: '#2dd4bf',
  L4: '#f5a524',
  L5: '#a78bfa',
};

export const CONFIDENCE_COLORS = {
  High: '#3ecf8e',
  Medium: '#f5a524',
  Low: '#f0616d',
  Insufficient: '#5f6a83',
} as const;

export const STATUS_COLORS = {
  good: '#3ecf8e',
  bad: '#f0616d',
  warn: '#f5a524',
  muted: '#5f6a83',
} as const;

export const INK = '#eef1f7';
export const BG = '#0d111c';

export function hueFor(d: Dimension): string {
  return DIMENSION_HUES[d];
}
