// lib/nav/routes.ts
//
// The single source of truth for sidebar nav items (label + path). Components
// consume this; `usePathname` decides the active item. Path strings come from
// lib/config/constants ROUTES so there's one place to change them.

import { ROUTES } from '@/lib/config/constants';

export interface NavItem {
  label: string;
  href: string;
  /** match `pathname.startsWith(matchPrefix)` for active state. */
  matchPrefix: string;
}

/** Primary nav — Function / Team / My view / Configure. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Function', href: ROUTES.function, matchPrefix: ROUTES.function },
  { label: 'Team', href: ROUTES.team, matchPrefix: ROUTES.team },
  { label: 'My view', href: ROUTES.me, matchPrefix: ROUTES.me },
  { label: 'Configure', href: ROUTES.configure, matchPrefix: ROUTES.configure },
] as const;

/** Whether a nav item is active for the current pathname. */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix === '/') return pathname === '/';
  return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`);
}
