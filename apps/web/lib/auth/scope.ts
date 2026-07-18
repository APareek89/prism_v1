import { createAdminClient } from '@/lib/supabase/admin';
import { hasRole } from './roles';
import type { AuthUser } from '@/lib/types';

/** null means organization-wide; a Set is the exact employee scope. */
export async function visibleEmployeeIds(user: AuthUser): Promise<Set<string> | null> {
  if (hasRole(user, 'admin', 'function_lead')) return null;
  if (!hasRole(user, 'manager')) return new Set([user.employeeId]);
  const db: any = createAdminClient();
  const { data: teams, error: teamError } = await db.from('teams').select('id').eq('function_id', user.functionId).eq('manager_employee_id', user.employeeId);
  if (teamError) throw new Error(`Manager scope read failed: ${teamError.message}`);
  const teamIds = ((teams ?? []) as Array<{ id: string }>).map((team) => team.id);
  if (!teamIds.length) return new Set([user.employeeId]);
  const { data: memberships, error } = await db.from('team_memberships').select('employee_id').in('team_id', teamIds);
  if (error) throw new Error(`Manager membership read failed: ${error.message}`);
  return new Set([user.employeeId, ...((memberships ?? []) as Array<{ employee_id: string }>).map((row) => row.employee_id)]);
}
export async function canAccessEmployee(user: AuthUser, employeeId: string): Promise<boolean> {
  const visible = await visibleEmployeeIds(user);
  return visible === null || visible.has(employeeId);
}

export async function managedTeamIds(user: AuthUser): Promise<string[] | null> {
  if (hasRole(user, 'admin', 'function_lead')) return null;
  if (!hasRole(user, 'manager')) return [];
  const db: any = createAdminClient();
  const { data, error } = await db.from('teams').select('id').eq('function_id', user.functionId).eq('manager_employee_id', user.employeeId);
  if (error) throw new Error(`Manager team scope read failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}
