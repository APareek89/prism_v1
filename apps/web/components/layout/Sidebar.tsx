'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PrismLogo } from '@/components/brand/PrismLogo';
import { Icon } from '@/components/ui/Icon';
import { visibleNavItems, isActive, type NavItem } from '@/lib/nav/routes';
import type { AppRole } from '@/lib/types';

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

export function Sidebar({ roles, workspaceName }: { roles: AppRole[]; workspaceName: string | null }) {
  const pathname = usePathname() ?? '/';
  const items = visibleNavItems(roles);
  const homeHref = roles.includes('admin') || roles.includes('function_lead') ? '/function' : '/me';
  return (
    <aside className="sidebar">
      <Link href={homeHref} className="sidebar-brand" aria-label="Prism home">
        <span className="brand-mark"><PrismLogo size={29} /></span>
        <span className="brand-copy">
          <span className="brand-name">Prism</span>
          <span className="brand-tagline">AI engineering impact</span>
        </span>
      </Link>

      <div className="workspace-switcher">
        <small>Workspace</small>
        <strong>{workspaceName ?? 'Engineering workspace'}</strong>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {GROUPS.map((group) => (
          <div className="nav-group" key={group}>
            <span className="nav-group-label">{group}</span>
            {items.filter((item) => item.group === group).map((item) => (
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
