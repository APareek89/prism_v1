// lib/types/auth.ts
//
// Auth CONTRACTS — the resolved identity every server component / route works with.
// `lib/auth/session.ts` is the ONE resolver that produces an `AuthUser`; everything
// downstream reads roles/capabilities off it (never a hardcoded user — multi-employee
// readiness, architecture §9).

import type { AppRole } from './db';

export type { AppRole };

/** Capabilities checked via `can(user, capability)` (architecture §0/§12.5). */
export type Capability =
  | 'view_own'
  | 'view_function_aggregates'
  | 'view_team_aggregates'
  | 'view_member_coaching'
  | 'view_member_raw_prs'
  | 'edit_config'
  | 'manage_roster'
  | 'manage_connectors'
  | 'run_pipeline';

/** The resolved current employee bound to a real Supabase JWT. */
export interface AuthUser {
  /** auth.users id. */
  userId: string;
  employeeId: string;
  functionId: string;
  displayName: string;
  email: string | null;
  roles: AppRole[];
  /** Retained for compatibility; always false in the real-user application. */
  isDemo: boolean;
}
