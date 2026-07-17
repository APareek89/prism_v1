// lib/auth/session.ts
//
// The one real-user auth resolver:
//   Supabase auth.users.id → public.employees.user_id → employee_roles.
// There is deliberately no demo identity or synthetic fallback. An unlinked login
// returns null, and the auth callback explains how an administrator can link it.

import { isConfigured } from '@/lib/config/env';
import { appTable, createClient } from '@/lib/supabase/server';
import type { AppRole, AuthUser } from '@/lib/types';

export async function getAuthUser(): Promise<AuthUser | null> {
  if (!isConfigured('supabase')) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return getEmployeeForUid(user.id, user.email ?? null);
}

export async function getEmployeeForUid(uid: string, email: string | null): Promise<AuthUser | null> {
  if (!isConfigured('supabase')) return null;
  const supabase = await createClient();
  const db = appTable(supabase);

  const { data: employee } = await db
    .from('employees')
    .select('id, function_id, name, email, is_demo')
    .eq('user_id', uid)
    .maybeSingle();
  if (!employee) return null;

  const emp = employee as {
    id: string;
    function_id: string;
    name: string;
    email: string | null;
    is_demo: boolean;
  };
  const { data: roleRows } = await db.from('employee_roles').select('role').eq('employee_id', emp.id);
  const roles = (((roleRows ?? []) as { role: AppRole }[]) || []).map((row) => row.role);

  return {
    userId: uid,
    employeeId: emp.id,
    functionId: emp.function_id,
    displayName: emp.name,
    email: emp.email ?? email,
    roles: roles.length > 0 ? roles : ['developer'],
    isDemo: false,
  };
}

export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized: no linked authenticated user.');
  return user;
}
