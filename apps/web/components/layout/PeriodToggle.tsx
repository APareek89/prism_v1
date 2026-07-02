// components/layout/PeriodToggle.tsx
//
// Daily / Weekly / Monthly toggle. Client component: it writes `?period=` into the URL
// (preserving other params) so RSC views re-render with the new trend granularity +
// delta baseline. Presentation only — it never changes any computed number.

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PERIODS, PERIOD_LABELS, parsePeriod, type Period } from '@/lib/config/constants';

export function PeriodToggle() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const active: Period = parsePeriod(searchParams?.get('period') ?? undefined);

  function select(period: Period) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('period', period);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div
      role="tablist"
      aria-label="Period"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        borderRadius: 999,
        border: '1px solid var(--line)',
        background: 'var(--panel)',
      }}
    >
      {PERIODS.map((p) => {
        const isActive = p === active;
        return (
          <button
            key={p}
            role="tab"
            aria-selected={isActive}
            onClick={() => select(p)}
            style={{
              cursor: 'pointer',
              padding: '5px 12px',
              borderRadius: 999,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--body)',
              color: isActive ? 'var(--ink)' : 'var(--mut)',
              background: isActive ? 'var(--panel2)' : 'transparent',
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}
