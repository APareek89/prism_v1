// lib/nav/routes.ts
//
// The single source of truth for sidebar nav items (label + path + dimension-neutral
// icon hint). Components consume this; `usePathname` decides the active item. Path
// strings come from lib/config/constants ROUTES so there's one place to change them.

import { ROUTES } from '@/lib/config/constants';

export interface NavItem {
  label: string;
  href: string;
  /** match `pathname.startsWith(matchPrefix)` for active state. */
  matchPrefix: string;
}

/** Primary nav (Function / Team / My view). Admin is not part of this build. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Function', href: ROUTES.function, matchPrefix: ROUTES.function },
  { label: 'Team', href: ROUTES.team, matchPrefix: ROUTES.team },
  { label: 'My view', href: ROUTES.me, matchPrefix: ROUTES.me },
] as const;

/**
 * v3 preview group (feat/v3-preview) — dummy-data enhancement, rendered as its
 * own labeled section in the sidebar beneath the primary nav.
 */
export const V3_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Team', href: '/v3', matchPrefix: '/v3' },
  { label: 'My View', href: '/v3/me', matchPrefix: '/v3/me' },
  { label: 'Configure', href: '/v3/configure', matchPrefix: '/v3/configure' },
] as const;

/** Whether a nav item is active for the current pathname. */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix === '/') return pathname === '/';
  return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`);
}

/**
 * Active item within a group where prefixes nest (e.g. /v3 vs /v3/me):
 * the LONGEST matching prefix wins, so exactly one item lights up.
 */
export function activeItem(pathname: string, items: readonly NavItem[]): NavItem | null {
  let best: NavItem | null = null;
  for (const item of items) {
    if (isActive(pathname, item) && (!best || item.matchPrefix.length > best.matchPrefix.length)) {
      best = item;
    }
  }
  return best;
}
