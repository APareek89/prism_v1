'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PrismLogo } from '@/components/brand/PrismLogo';
import { Icon } from '@/components/ui/Icon';
import { NAV_ITEMS, isActive, type NavItem } from '@/lib/nav/routes';

const GROUPS = ['Measure', 'Improve', 'System'] as const;

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} aria-label={item.label} aria-current={active ? 'page' : undefined} className={`nav-item${active ? ' active' : ''}`}>
      <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
      <span className="nav-copy">
        <strong>{item.label}</strong>
        <small>{item.description}</small>
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? '/';
  return (
    <aside className="sidebar">
      <Link href="/function" className="sidebar-brand" aria-label="Prism overview">
        <span className="brand-mark"><PrismLogo size={29} /></span>
        <span className="brand-copy">
          <span className="brand-name">Prism</span>
          <span className="brand-tagline">AI engineering impact</span>
        </span>
      </Link>

      <div className="workspace-switcher">
        <small>Workspace</small>
        <strong>Engineering function</strong>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {GROUPS.map((group) => (
          <div className="nav-group" key={group}>
            <span className="nav-group-label">{group}</span>
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="engine-state"><i /> Deterministic engine online</div>
        <p>Scores are computed from evidence. AI only narrates what the engine already knows.</p>
      </div>
    </aside>
  );
}
