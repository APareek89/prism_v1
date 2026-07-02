// components/ui/DeltaArrow.tsx
//
// A signed delta with an up/down/flat arrow, colored good/bad. Pure presentation —
// the numeric delta is computed elsewhere; this only renders it. Null → neutral —.

import { deltaDirection, fmtDelta } from '@/lib/format';
import { STATUS_COLORS } from '@/app/tokens';

export interface DeltaArrowProps {
  value: number | null | undefined;
  /** when true, a downward delta is "good" (e.g. tokens/PR, revert rate). */
  invert?: boolean;
  digits?: number;
}

export function DeltaArrow({ value, invert = false, digits = 0 }: DeltaArrowProps) {
  const dir = deltaDirection(value);
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·';

  let color: string = STATUS_COLORS.muted;
  if (dir !== 'flat') {
    const isGood = invert ? dir === 'down' : dir === 'up';
    color = isGood ? STATUS_COLORS.good : STATUS_COLORS.bad;
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color,
        fontFamily: 'var(--mono)',
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      <span aria-hidden>{arrow}</span>
      {fmtDelta(value, digits)}
    </span>
  );
}
