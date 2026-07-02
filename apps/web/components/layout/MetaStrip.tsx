// components/layout/MetaStrip.tsx
//
// The header band shared by the four data views: the view title + a compact metadata
// row (window, current employee, demo flag) on the left and the PeriodToggle on the
// right. The toggle is the only interactive island. No fabricated metrics here.

import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { WINDOW_DAYS } from '@/lib/config/constants';
import { PeriodToggle } from './PeriodToggle';

export interface MetaStripProps {
  title: string;
  /** optional subtitle / breadcrumb area. */
  subtitle?: ReactNode;
  /** who the view resolves to (display name). */
  who?: string | null;
  isDemo?: boolean;
  /** hide the period toggle (e.g. on Admin). */
  showPeriodToggle?: boolean;
  /** extra right-aligned content before the toggle. */
  actions?: ReactNode;
}

export function MetaStrip({
  title,
  subtitle,
  who,
  isDemo = false,
  showPeriodToggle = true,
  actions,
}: MetaStripProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        padding: '18px 24px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--bg)',
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <h1 className="display" style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.2 }}>
          {title}
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            fontSize: 11.5,
            color: 'var(--mut)',
            fontFamily: 'var(--mono)',
          }}
        >
          <span>{WINDOW_DAYS}-day window</span>
          {who ? (
            <>
              <span aria-hidden style={{ color: 'var(--mut2)' }}>
                ·
              </span>
              <span>{who}</span>
            </>
          ) : null}
          {isDemo ? (
            <>
              <span aria-hidden style={{ color: 'var(--mut2)' }}>
                ·
              </span>
              <span style={{ color: 'var(--effness)' }}>demo</span>
            </>
          ) : null}
          {subtitle ? (
            <>
              <span aria-hidden style={{ color: 'var(--mut2)' }}>
                ·
              </span>
              <span>{subtitle}</span>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {actions}
        {showPeriodToggle ? (
          // useSearchParams (inside PeriodToggle) needs a Suspense boundary for
          // static rendering — provide one with a neutral fallback.
          <Suspense fallback={<span style={{ width: 176, height: 32 }} aria-hidden />}>
            <PeriodToggle />
          </Suspense>
        ) : null}
      </div>
    </header>
  );
}
