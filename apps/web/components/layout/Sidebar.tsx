// components/layout/Sidebar.tsx
//
// The left rail: prism logo + tagline + primary nav. Client component (uses
// usePathname for active state). Nav items come from lib/nav/routes.ts.
// The v3 preview group renders beneath the primary nav with the same link
// treatment and a .grp-style section label (dummy-data enhancement).

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PrismLogo } from '@/components/brand/PrismLogo';
import { NAV_ITEMS, isActive, type NavItem } from '@/lib/nav/routes';

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--ink)' : 'var(--mut)',
        background: active ? 'var(--panel2)' : 'transparent',
        border: `1px solid ${active ? 'var(--line2)' : 'transparent'}`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: active ? 'var(--usage)' : 'var(--mut2)',
        }}
      />
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? '/';

  return (
    <aside
      style={{
        width: 224,
        flexShrink: 0,
        borderRight: '1px solid var(--line)',
        background: 'var(--panel)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: '20px 14px',
        position: 'sticky',
        top: 0,
        height: '100dvh',
      }}
    >
      {/* brand */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' }}>
        <PrismLogo size={30} />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span className="display" style={{ fontSize: 17, fontWeight: 700, letterSpacing: 0.3 }}>
            Prism
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--mut2)' }}>One light · four signals</span>
        </span>
      </Link>

      {/* nav */}
      <nav aria-label="Primary" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
        ))}

      </nav>

      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <p style={{ fontSize: 10.5, color: 'var(--mut2)', lineHeight: 1.5 }}>
          AI-native engineering index. Numbers are deterministic; narrative is grounded.
        </p>
      </div>
    </aside>
  );
}
