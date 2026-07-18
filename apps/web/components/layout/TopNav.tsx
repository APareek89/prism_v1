'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PrismLogo } from '@/components/brand/PrismLogo';
import { Icon } from '@/components/ui/Icon';
import { visibleNavItems, isActive } from '@/lib/nav/routes';
import type { AppRole } from '@/lib/types';
import { useEffect, useState } from 'react';

export function TopNav({ roles }: { roles: AppRole[] }) {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const items = visibleNavItems(roles);
  const homeHref = roles.includes('admin') || roles.includes('function_lead') ? '/function' : '/me';
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);
  return (
    <header className="top-nav">
      <Link href={homeHref} className="top-nav-brand" aria-label="Prism home">
        <span className="brand-mark"><PrismLogo size={27} /></span>
        <span className="brand-copy"><span className="brand-name">Prism</span><span className="brand-tagline">AI engineering impact</span></span>
      </Link>
      <nav id="primary-navigation" className={`top-nav-links${open ? ' open' : ''}`} aria-label="Primary navigation">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return <Link onClick={() => setOpen(false)} key={item.href} href={item.href} title={item.description} aria-current={active ? 'page' : undefined} className={`top-nav-item${active ? ' active' : ''}`}>
            <Icon name={item.icon} size={16} />
            <span>{item.label}</span>
          </Link>;
        })}
      </nav>
      <div className="top-nav-trust"><i /><span>Evidence-bound</span></div>
      <button className="top-nav-menu-button" type="button" aria-controls="primary-navigation" aria-expanded={open} aria-label="Toggle primary navigation" onClick={() => setOpen((current) => !current)}><span /><span /><span /></button>
    </header>
  );
}
