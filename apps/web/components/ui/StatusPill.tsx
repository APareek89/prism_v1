// components/ui/StatusPill.tsx
//
// A small status pill for connector health / generic states. Tone maps to the
// good/warn/bad/muted hues.

import type { ReactNode } from 'react';
import { STATUS_COLORS } from '@/app/tokens';

export type StatusTone = 'good' | 'warn' | 'bad' | 'muted';

const TONE_COLOR: Record<StatusTone, string> = {
  good: STATUS_COLORS.good,
  warn: STATUS_COLORS.warn,
  bad: STATUS_COLORS.bad,
  muted: STATUS_COLORS.muted,
};

export interface StatusPillProps {
  tone?: StatusTone;
  children: ReactNode;
}

export function StatusPill({ tone = 'muted', children }: StatusPillProps) {
  const color = TONE_COLOR[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        color,
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {children}
    </span>
  );
}
