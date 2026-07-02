// lib/db/onboarding.ts
//
// Low-level employee CRUD via the SERVICE-ROLE client (RLS-bypassing). This is the
// data-access floor under lib/onboarding/* — it owns the exact `employees` columns
// (migration 0003) and nothing else. No business rules here (attribution/match-status
// decisions live in lib/onboarding/provision.ts); this layer just reads + writes rows.
//
// AUTHORITATIVE employees columns (0003): id, user_id, function_id, name, designation,
//   github_handle(citext), email(citext), claude_account_uuid, attribution_mode(enum),
//   match_status('linked'|'byo'|'unmatched'), active, is_demo, created_at, updated_at.
// Unique partial indexes on github_handle, claude_account_uuid (citext → case-insens).
//
// SERVER-ONLY: imports the service-role admin client; never bundle into the client.

import { createAdminClient } from '@/lib/supabase/admin';
import type { AttributionMode } from '@/lib/types/db';

// ─────────────────────────────────────────────────────────────────────────────
// Loose query surface (the generated Database has empty Tables)
// ─────────────────────────────────────────────────────────────────────────────

interface LooseResult extends Promise<{ data: unknown; error: { message?: string } | null }> {
  eq: (col: string, val: unknown) => LooseResult;
  or: (filter: string) => LooseResult;
  select: (cols?: string) => LooseResult;
  limit: (n: number) => LooseResult;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
  single: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
}
interface LooseTable {
  select: (cols: string) => LooseResult;
  insert: (rows: unknown) => LooseResult;
  update: (patch: unknown) => LooseResult;
}
interface LooseAdmin {
  from: (table: string) => LooseTable;
}
function admin(): LooseAdmin {
  return createAdminClient() as unknown as LooseAdmin;
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee row (the columns this layer reads/writes)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeRecord {
  id: string;
  function_id: string;
  name: string;
  designation: string | null;
  github_handle: string | null;
  email: string | null;
  claude_account_uuid: string | null;
  attribution_mode: AttributionMode;
  match_status: 'linked' | 'byo' | 'unmatched';
  active: boolean;
  is_demo: boolean;
}

const EMPLOYEE_COLS =
  'id, function_id, name, designation, github_handle, email, claude_account_uuid, attribution_mode, match_status, active, is_demo';

function asEmployee(row: Record<string, unknown> | null): EmployeeRecord | null {
  if (!row) return null;
  return {
    id: row.id as string,
    function_id: row.function_id as string,
    name: row.name as string,
    designation: (row.designation as string | null) ?? null,
    github_handle: (row.github_handle as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    claude_account_uuid: (row.claude_account_uuid as string | null) ?? null,
    attribution_mode: row.attribution_mode as AttributionMode,
    match_status: (row.match_status as EmployeeRecord['match_status']) ?? 'unmatched',
    active: (row.active as boolean) ?? true,
    is_demo: (row.is_demo as boolean) ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/** Find an employee in a function by github_handle (citext, case-insensitive). */
export async function findByGithubHandle(
  functionId: string,
  handle: string,
): Promise<EmployeeRecord | null> {
  try {
    const { data, error } = await admin()
      .from('employees')
      .select(EMPLOYEE_COLS)
      .eq('function_id', functionId)
      .eq('github_handle', handle)
      .maybeSingle();
    return error ? null : asEmployee(data);
  } catch {
    return null;
  }
}

/** Find an employee in a function by email (citext, case-insensitive). */
export async function findByEmail(functionId: string, email: string): Promise<EmployeeRecord | null> {
  try {
    const { data, error } = await admin()
      .from('employees')
      .select(EMPLOYEE_COLS)
      .eq('function_id', functionId)
      .eq('email', email)
      .maybeSingle();
    return error ? null : asEmployee(data);
  } catch {
    return null;
  }
}

/** Find an employee by claude_account_uuid (within a function). */
export async function findByClaudeUuid(
  functionId: string,
  uuid: string,
): Promise<EmployeeRecord | null> {
  try {
    const { data, error } = await admin()
      .from('employees')
      .select(EMPLOYEE_COLS)
      .eq('function_id', functionId)
      .eq('claude_account_uuid', uuid)
      .maybeSingle();
    return error ? null : asEmployee(data);
  } catch {
    return null;
  }
}

/**
 * Resolve an existing employee by identity precedence: github_handle, then email,
 * then claude_account_uuid (the first that matches a row). Used by idempotent upsert.
 */
export async function findByIdentity(
  functionId: string,
  identity: { githubHandle?: string | null; email?: string | null; claudeAccountUuid?: string | null },
): Promise<EmployeeRecord | null> {
  if (identity.githubHandle) {
    const byHandle = await findByGithubHandle(functionId, identity.githubHandle);
    if (byHandle) return byHandle;
  }
  if (identity.email) {
    const byEmail = await findByEmail(functionId, identity.email);
    if (byEmail) return byEmail;
  }
  if (identity.claudeAccountUuid) {
    const byUuid = await findByClaudeUuid(functionId, identity.claudeAccountUuid);
    if (byUuid) return byUuid;
  }
  return null;
}

/** The is_demo "self" employee for a function, if one exists. */
export async function findSelfEmployee(functionId: string): Promise<EmployeeRecord | null> {
  try {
    const { data, error } = await admin()
      .from('employees')
      .select(EMPLOYEE_COLS)
      .eq('function_id', functionId)
      .eq('is_demo', true)
      .limit(1)
      .maybeSingle();
    return error ? null : asEmployee(data);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/** The mutable employee fields a write may set. */
export interface EmployeeWrite {
  function_id?: string;
  name?: string;
  designation?: string | null;
  github_handle?: string | null;
  email?: string | null;
  claude_account_uuid?: string | null;
  attribution_mode?: AttributionMode;
  match_status?: 'linked' | 'byo' | 'unmatched';
  active?: boolean;
  is_demo?: boolean;
}

/** Insert a new employee row, returning the created record (or null on error). */
export async function insertEmployee(input: EmployeeWrite & { function_id: string; name: string }): Promise<EmployeeRecord | null> {
  try {
    const { data, error } = await admin()
      .from('employees')
      .insert({ ...input, updated_at: new Date().toISOString() })
      .select(EMPLOYEE_COLS)
      .single();
    return error ? null : asEmployee(data);
  } catch {
    return null;
  }
}

/** Patch an existing employee by id, returning the updated record (or null on error). */
export async function updateEmployee(id: string, patch: EmployeeWrite): Promise<EmployeeRecord | null> {
  try {
    const { data, error } = await admin()
      .from('employees')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(EMPLOYEE_COLS)
      .single();
    return error ? null : asEmployee(data);
  } catch {
    return null;
  }
}
