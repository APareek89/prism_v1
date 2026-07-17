// lib/auth/workspace.ts
//
// Server-only identity bridge for the personal workspace. GitHub discovers an
// employee first; Supabase Auth creates the login later. The bridge links the two
// only when the normalized email matches one active, unclaimed employee row, or
// when an administrator explicitly invited a known employee.

import { createAdminClient } from '@/lib/supabase/admin';

interface QueryError {
  message?: string;
}

interface WorkspaceResult extends Promise<{ data: unknown; error: QueryError | null }> {
  eq: (column: string, value: unknown) => WorkspaceResult;
  is: (column: string, value: null) => WorkspaceResult;
  limit: (count: number) => WorkspaceResult;
  select: (columns?: string) => WorkspaceResult;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: QueryError | null }>;
}

interface WorkspaceTable {
  select: (columns: string) => WorkspaceResult;
  insert: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => WorkspaceResult;
  update: (patch: Record<string, unknown>) => WorkspaceResult;
}

interface WorkspaceDb {
  from: (table: string) => WorkspaceTable;
}

function db(): WorkspaceDb {
  return createAdminClient() as unknown as WorkspaceDb;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeWorkspaceEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export type ClaimWorkspaceResult =
  | { status: 'linked' | 'already_linked'; employeeId: string }
  | { status: 'no_match' | 'ambiguous' | 'claimed_by_another_user'; employeeId: null };

/**
 * Link a completed Supabase login to the one active employee with the same email.
 * A real authenticated user never falls back to the demo identity when this fails.
 */
export async function claimWorkspaceByEmail(
  userId: string,
  rawEmail: string,
): Promise<ClaimWorkspaceResult> {
  const email = normalizeWorkspaceEmail(rawEmail);
  if (!email) return { status: 'no_match', employeeId: null };

  const existing = await db()
    .from('employees')
    .select('id, user_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message ?? 'Could not resolve workspace access.');
  if (existing.data?.id) {
    const employeeId = String(existing.data.id);
    const normalized = await db()
      .from('employees')
      .update({ is_demo: false, updated_at: new Date().toISOString() })
      .eq('id', employeeId);
    if (normalized.error) {
      throw new Error(normalized.error.message ?? 'Could not normalize workspace access.');
    }
    await ensureWorkspaceRoles(employeeId);
    return { status: 'already_linked', employeeId };
  }

  const matches = await db()
    .from('employees')
    .select('id, user_id, email')
    .eq('email', email)
    .eq('active', true);
  if (matches.error) throw new Error(matches.error.message ?? 'Could not match workspace email.');

  const rows = Array.isArray(matches.data)
    ? (matches.data as Array<{ id: string; user_id: string | null }>)
    : [];
  if (rows.length === 0) return { status: 'no_match', employeeId: null };
  if (rows.length > 1) return { status: 'ambiguous', employeeId: null };
  if (rows[0]!.user_id && rows[0]!.user_id !== userId) {
    return { status: 'claimed_by_another_user', employeeId: null };
  }

  const linked = await db()
    .from('employees')
    .update({
      user_id: userId,
      match_status: 'linked',
      is_demo: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rows[0]!.id)
    .is('user_id', null)
    .select('id')
    .maybeSingle();
  if (linked.error) throw new Error(linked.error.message ?? 'Could not link workspace access.');
  if (!linked.data?.id) return { status: 'claimed_by_another_user', employeeId: null };
  await ensureWorkspaceRoles(String(linked.data.id));
  return { status: 'linked', employeeId: String(linked.data.id) };
}

export interface PreparedWorkspaceInvite {
  employeeId: string;
  employeeName: string;
  email: string;
  existingUserId: string | null;
}

/** Validate and store an administrator-supplied workspace email before inviting. */
export async function prepareWorkspaceInvite(args: {
  functionId: string;
  employeeId: string;
  email: string;
}): Promise<PreparedWorkspaceInvite> {
  const email = normalizeWorkspaceEmail(args.email);
  if (!email) throw new Error('Enter a valid work email address.');

  const employee = await db()
    .from('employees')
    .select('id, name, email, user_id, active')
    .eq('id', args.employeeId)
    .eq('function_id', args.functionId)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (employee.error) throw new Error(employee.error.message ?? 'Could not read employee.');
  if (!employee.data) throw new Error('Employee is not active in this workspace.');

  const collisions = await db()
    .from('employees')
    .select('id')
    .eq('email', email)
    .eq('active', true);
  if (collisions.error) throw new Error(collisions.error.message ?? 'Could not validate email.');
  const collisionRows = Array.isArray(collisions.data)
    ? (collisions.data as Array<{ id: string }>)
    : [];
  if (collisionRows.some((row) => row.id !== args.employeeId)) {
    throw new Error('That email is already assigned to another active team member.');
  }

  const updated = await db()
    .from('employees')
    .update({ email, is_demo: false, updated_at: new Date().toISOString() })
    .eq('id', args.employeeId)
    .eq('function_id', args.functionId)
    .select('id, name, email, user_id')
    .maybeSingle();
  if (updated.error || !updated.data) {
    throw new Error(updated.error?.message ?? 'Could not save workspace email.');
  }

  return {
    employeeId: String(updated.data.id),
    employeeName: String(updated.data.name),
    email,
    existingUserId: updated.data.user_id ? String(updated.data.user_id) : null,
  };
}

/** Bind the exact auth user returned by Supabase's server-side invite operation. */
export async function linkInvitedWorkspaceUser(args: {
  functionId: string;
  employeeId: string;
  userId: string;
}): Promise<void> {
  const employee = await db()
    .from('employees')
    .select('id, user_id')
    .eq('id', args.employeeId)
    .eq('function_id', args.functionId)
    .limit(1)
    .maybeSingle();
  if (employee.error || !employee.data) {
    throw new Error(employee.error?.message ?? 'Employee is not active in this workspace.');
  }
  if (employee.data.user_id && employee.data.user_id !== args.userId) {
    throw new Error('This team member is already linked to another login.');
  }

  const linked = await db()
    .from('employees')
    .update({
      user_id: args.userId,
      match_status: 'linked',
      is_demo: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.employeeId)
    .eq('function_id', args.functionId)
    .select('id')
    .maybeSingle();
  if (linked.error || !linked.data) {
    throw new Error(linked.error?.message ?? 'Could not link the invited login.');
  }
  await ensureWorkspaceRoles(args.employeeId, args.functionId);
}

/**
 * Every linked person is a developer. If the function has no administrator yet,
 * its first real login also becomes the bootstrap admin so the app cannot lock
 * itself out after DEMO_MODE is removed.
 */
async function ensureWorkspaceRoles(employeeId: string, knownFunctionId?: string): Promise<void> {
  let functionId = knownFunctionId ?? null;
  if (!functionId) {
    const employee = await db()
      .from('employees')
      .select('id, function_id')
      .eq('id', employeeId)
      .limit(1)
      .maybeSingle();
    if (employee.error || !employee.data?.function_id) {
      throw new Error(employee.error?.message ?? 'Could not resolve the workspace for this login.');
    }
    functionId = String(employee.data.function_id);
  }

  const ownRoles = await db()
    .from('employee_roles')
    .select('id, role')
    .eq('employee_id', employeeId)
    .eq('function_id', functionId);
  if (ownRoles.error) throw new Error(ownRoles.error.message ?? 'Could not resolve workspace roles.');
  const current = new Set(
    Array.isArray(ownRoles.data)
      ? (ownRoles.data as Array<{ role: string }>).map((row) => row.role)
      : [],
  );

  const admin = await db()
    .from('employee_roles')
    .select('id')
    .eq('function_id', functionId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (admin.error) throw new Error(admin.error.message ?? 'Could not resolve workspace administrator.');

  const roles: Array<Record<string, unknown>> = [];
  if (!current.has('developer')) {
    roles.push({ employee_id: employeeId, function_id: functionId, role: 'developer' });
  }
  if (!admin.data && !current.has('admin')) {
    roles.push({ employee_id: employeeId, function_id: functionId, role: 'admin' });
  }
  if (roles.length === 0) return;

  const inserted = await db().from('employee_roles').insert(roles);
  if (inserted.error) throw new Error(inserted.error.message ?? 'Could not grant workspace roles.');
}
