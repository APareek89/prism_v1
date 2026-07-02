// components/ui/EmptyState.tsx
//
// The canonical "awaiting signal" treatment — the no-dummy-data primitive. Every view
// renders this until real data exists (architecture §0.4). Dark instrument-panel
// aesthetic: a faint pulsing dot, a title, and a one-line hint. No fabricated numbers.

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Short headline, e.g. "Awaiting signal". */
  title?: string;
  /** One-line guidance, e.g. "connect sources in Admin". */
  hint?: string;
  /** Optional CTA (e.g. a link to Admin). */
  action?: ReactNode;
  /** Render compact (inline within a panel) vs full-height. */
  compact?: boolean;
}

export function EmptyState({
  title = 'Awaiting signal',
  hint = 'connect sources in Admin to populate this view',
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 10,
        padding: compact ? '24px 16px' : '56px 24px',
        color: 'var(--mut)',
        minHeight: compact ? undefined : 220,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--mut2)',
          boxShadow: '0 0 0 4px rgba(95,106,131,0.15)',
          animation: 'prism-pulse 2.4s ease-in-out infinite',
        }}
      />
      <div
        className="display"
        style={{ fontSize: 15, color: 'var(--ink)', letterSpacing: 0.2 }}
      >
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--mut)', maxWidth: 340 }}>{hint}</div>
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}

      {/* keyframes scoped inline; reduced-motion handled globally in globals.css */}
      <style>{`
        @keyframes prism-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
