// lib/connectors/github/db.ts
//
// The loose service-role write surface for the GitHub connector's RAW tables
// (gh_prs / gh_commits / blame_snapshots) and read-only config lookups
// (index_config / connectors / functions). The generated `Database` placeholder has
// empty Tables, so — exactly like lib/db/_base and lib/connectors/status — every query
// goes through this loosely-typed cast of the admin client.
//
// RLS-bypassing: connectors run outside a user request. SERVER-ONLY; never bundle.

import { createAdminClient } from '@/lib/supabase/admin';

export interface AdminFilter
  extends Promise<{ data: unknown; error: { message?: string } | null }> {
  eq: (col: string, val: unknown) => AdminFilter;
  is: (col: string, val: unknown) => AdminFilter;
  order: (col: string, opts?: unknown) => AdminFilter;
  limit: (n: number) => AdminFilter;
  select: (cols?: string) => AdminFilter;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
  single: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
}
export interface AdminTable {
  select: (cols: string) => AdminFilter;
  insert: (rows: unknown) => AdminFilter;
  update: (patch: unknown) => AdminFilter;
  upsert: (rows: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => AdminFilter;
}
export interface AdminDb {
  from: (table: string) => AdminTable;
}

/** The RLS-bypassing admin db, loosely typed for the empty generated Tables. */
export function adminDb(): AdminDb {
  return createAdminClient() as unknown as AdminDb;
}
