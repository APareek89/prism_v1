// components/ui/Panel.tsx
//
// The base instrument-panel surface. A titled card with optional eyebrow + actions.
// Uses the .panel CSS class (globals.css) for the surface; layout is inline so it
// stays self-contained.

import type { CSSProperties, ReactNode } from 'react';

export interface PanelProps {
  title?: ReactNode;
  /** small uppercase label above the title. */
  eyebrow?: ReactNode;
  /** right-aligned header content (e.g. a chip or toggle). */
  actions?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
  /** remove inner padding (for panels that host their own scroll area). */
  flush?: boolean;
}

export function Panel({ title, eyebrow, actions, children, style, flush = false }: PanelProps) {
  return (
    <section
      className="panel"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: flush ? 0 : undefined, ...style }}
    >
      {(title || eyebrow || actions) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: flush ? '16px 18px 0' : undefined,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {eyebrow ? (
              <span
                style={{
                  fontSize: 10.5,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: 'var(--mut2)',
                }}
              >
                {eyebrow}
              </span>
            ) : null}
            {title ? (
              <h2 className="display" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                {title}
              </h2>
            ) : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </header>
      )}
      <div style={{ padding: flush ? '0 0 0' : undefined }}>{children}</div>
    </section>
  );
}
