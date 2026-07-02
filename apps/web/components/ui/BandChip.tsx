// components/ui/BandChip.tsx
//
// L0–L5 band chip. Color comes from app/tokens.ts BAND_COLORS (typed hue source).
// Renders a neutral "—" chip when band is absent (suppressed L1).

import type { Band } from '@/lib/types';
import { BAND_COLORS } from '@/app/tokens';

const BAND_LABELS: Record<Band, string> = {
  L0: 'L0 · Inactive',
  L1: 'L1 · Emerging',
  L2: 'L2 · Adopting',
  L3: 'L3 · Fluent',
  L4: 'L4 · Leading',
  L5: 'L5 · Multiplier',
};

export interface BandChipProps {
  band: Band | null | undefined;
}

export function BandChip({ band }: BandChipProps) {
  if (!band) {
    return (
      <span style={chipStyle('var(--mut2)')} title="Band suppressed — awaiting signal">
        —
      </span>
    );
  }
  const color = BAND_COLORS[band] ?? 'var(--mut2)';
  return (
    <span style={chipStyle(color)} title={BAND_LABELS[band]}>
      {BAND_LABELS[band]}
    </span>
  );
}

function chipStyle(color: string) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
    color,
    border: `1px solid ${color}`,
    background: 'color-mix(in srgb, currentColor 12%, transparent)',
    fontFamily: 'var(--mono)',
    whiteSpace: 'nowrap' as const,
  };
}
