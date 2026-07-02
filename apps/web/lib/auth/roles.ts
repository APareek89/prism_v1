// lib/auth/roles.ts
//
// Role resolution + capability checks (architecture §0/§12.5). The access model:
//   - developer    → own My view + function aggregates
//   - manager      → team aggregates + per-member COACHING (NOT reports' raw PRs)
//   - function_lead→ function + team aggregates
//   - admin        → connectors / roster / config / run pipeline
// No manager-facing per-engineer ranking export anywhere. In the single-user demo the
// user holds all roles, but `can()` is the real gate every server path uses.

import type { AppRole, AuthUser, Capability } from '@/lib/types';

/** Capability → roles that grant it. */
const CAPABILITY_GRANTS: Record<Capability, AppRole[]> = {
  // Everyone authenticated can see their own view.
  view_own: ['developer', 'manager', 'function_lead', 'admin'],
  // Function-level aggregates (median L1, spectrum) are visible to all roles.
  view_function_aggregates: ['developer', 'manager', 'function_lead', 'admin'],
  // Team aggregates: managers + function leads (+ admin).
  view_team_aggregates: ['manager', 'function_lead', 'admin'],
  // Per-member coaching narrative (NOT raw PRs): managers + function leads.
  view_member_coaching: ['manager', 'function_lead', 'admin'],
  // Raw PR drill-in for another member: explicitly NO manager. Admin only (audit).
  view_member_raw_prs: ['admin'],
  // Config edits: admin only.
  edit_config: ['admin'],
  // Roster CRUD: admin only.
  manage_roster: ['admin'],
  // Connector connect/scan: admin only.
  manage_connectors: ['admin'],
  // Run the pipeline on demand: admin only.
  run_pipeline: ['admin'],
};

/** True if the user holds any of the given roles. */
export function hasRole(user: Pick<AuthUser, 'roles'>, ...roles: AppRole[]): boolean {
  return roles.some((r) => user.roles.includes(r));
}

export function isAdmin(user: Pick<AuthUser, 'roles'>): boolean {
  return user.roles.includes('admin');
}

/**
 * The single capability gate. A user can do `capability` iff they hold a role that
 * grants it. Special-case: a manager may view a *report's* coaching but never their
 * raw PRs — that distinction is encoded in the two separate capabilities above.
 */
export function can(user: Pick<AuthUser, 'roles'>, capability: Capability): boolean {
  const grants = CAPABILITY_GRANTS[capability];
  return grants.some((r) => user.roles.includes(r));
}

/**
 * Whether `user` may view `targetEmployeeId`'s detail at all. A user always sees
 * their own; managers/leads/admin see others (coaching-level); raw-PR access is
 * gated separately by `can(user, 'view_member_raw_prs')`.
 */
export function canViewMember(
  user: Pick<AuthUser, 'roles' | 'employeeId'>,
  targetEmployeeId: string,
): boolean {
  if (user.employeeId === targetEmployeeId) return true;
  return can(user, 'view_member_coaching');
}
