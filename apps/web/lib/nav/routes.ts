// lib/nav/routes.ts
//
// The single source of truth for sidebar nav items (label + path). Components
// consume this; `usePathname` decides the active item. Path strings come from
// lib/config/constants ROUTES so there's one place to change them.

import { ROUTES } from '@/lib/config/constants';
import type { AppRole } from '@/lib/types';

export interface NavItem {
  label: string;
  description: string;
  icon: 'overview' | 'people' | 'sparkles' | 'plug' | 'sliders' | 'target' | 'bolt' | 'activity';
  group: 'Measure' | 'Improve' | 'System';
  href: string;
  /** match `pathname.startsWith(matchPrefix)` for active state. */
  matchPrefix: string;
  roles: readonly AppRole[];
}

/** Primary nav — impact views, private workspace, connections, and model setup. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Overview', description: 'Organization impact', icon: 'overview', group: 'Measure', href: ROUTES.function, matchPrefix: ROUTES.function, roles: ['function_lead', 'admin'] },
  { label: 'People', description: 'Team coaching signals', icon: 'people', group: 'Measure', href: ROUTES.team, matchPrefix: ROUTES.team, roles: ['manager', 'function_lead', 'admin'] },
  { label: 'My View', description: 'Connection and performance', icon: 'sparkles', group: 'Improve', href: ROUTES.me, matchPrefix: ROUTES.me, roles: ['developer', 'manager', 'function_lead', 'admin'] },
  { label: 'My Actions', description: 'Recommendations and courses', icon: 'target', group: 'Improve', href: ROUTES.myActions, matchPrefix: ROUTES.myActions, roles: ['developer', 'manager', 'function_lead', 'admin'] },
  { label: 'Org Actions', description: 'Team interventions', icon: 'bolt', group: 'Improve', href: ROUTES.orgActions, matchPrefix: ROUTES.orgActions, roles: ['manager', 'function_lead', 'admin'] },
  { label: 'Configuration', description: 'Connections, data and access', icon: 'sliders', group: 'System', href: ROUTES.configure, matchPrefix: ROUTES.configure, roles: ['admin'] },
  { label: 'Admin', description: 'Live score trace', icon: 'activity', group: 'System', href: ROUTES.admin, matchPrefix: ROUTES.admin, roles: ['admin'] },
] as const;

/** Whether a nav item is active for the current pathname. */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix === '/') return pathname === '/';
  return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`);
}

export function visibleNavItems(roles: readonly AppRole[]): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.some((role) => roles.includes(role)));
}
