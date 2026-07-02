// app/not-found.tsx
//
// 404 in the instrument-panel aesthetic.

import Link from 'next/link';
import { PrismLogo } from '@/components/brand/PrismLogo';
import { ROUTES } from '@/lib/config/constants';

export default function NotFound() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 48,
        textAlign: 'center',
      }}
    >
      <PrismLogo size={40} />
      <h1 className="display" style={{ fontSize: 22, fontWeight: 700 }}>
        404 — no signal here
      </h1>
      <p style={{ color: 'var(--mut)', fontSize: 13.5, maxWidth: 360 }}>
        This route refracts to nothing. Head back to the Function view.
      </p>
      <Link
        href={ROUTES.function}
        style={{
          marginTop: 6,
          padding: '8px 16px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--line2)',
          background: 'var(--panel2)',
          color: 'var(--ink)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Back to Function
      </Link>
    </div>
  );
}
