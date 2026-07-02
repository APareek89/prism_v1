// components/ui/ConfidenceChip.tsx
//
// Confidence band chip (High / Medium / Low / Insufficient). Color from
// app/tokens.ts CONFIDENCE_COLORS. "Insufficient" is the keyless/no-signal default.

import type { ConfidenceBand } from '@/lib/types';
import { CONFIDENCE_COLORS } from '@/app/tokens';

const LABELS: Record<ConfidenceBand, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  insufficient: 'Insufficient',
};

const COLOR_BY_BAND: Record<ConfidenceBand, string> = {
  high: CONFIDENCE_COLORS.High,
  medium: CONFIDENCE_COLORS.Medium,
  low: CONFIDENCE_COLORS.Low,
  insufficient: CONFIDENCE_COLORS.Insufficient,
};

export interface ConfidenceChipProps {
  band: ConfidenceBand | null | undefined;
}

export function ConfidenceChip({ band }: ConfidenceChipProps) {
  const resolved: ConfidenceBand = band ?? 'insufficient';
  const color = COLOR_BY_BAND[resolved];
  return (
    <span
      title={`Confidence: ${LABELS[resolved]}`}
      style={{
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
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {LABELS[resolved]} confidence
    </span>
  );
}
