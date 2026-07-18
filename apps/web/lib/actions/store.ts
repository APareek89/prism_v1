import { createAdminClient } from '@/lib/supabase/admin';
import type { AuthUser } from '@/lib/types';
import { hasRole } from '@/lib/auth/roles';

export interface MyRecommendationAction {
  id: string; kind: string; ref: string; rationale: string; status: string; detectedVia: string | null; evidence: Record<string, unknown>; date: string; lastAction: string | null;
}
export interface CourseAssignment { id: string; title: string; url: string | null; status: string; progressPct: number; dueAt: string | null; }
export interface OrgActionRow { id: string; kind: string; title: string; rationale: string; status: string; dueAt: string | null; ownerName: string | null; teamName: string | null; evidence: Record<string, unknown>; }
export interface OrgActionCandidate { kind: 'connector' | 'course' | 'intervention'; title: string; rationale: string; evidence: Record<string, unknown>; teamId?: string; }

export async function getMyActions(employeeId: string): Promise<{ recommendations: MyRecommendationAction[]; courses: CourseAssignment[] }> {
  const db = createAdminClient();
  const [recResult, courseResult, eventResult] = await Promise.all([
    db.from('recommendations').select('id,kind,ref,rationale,status,detected_via,evidence_jsonb,date').eq('employee_id', employeeId).order('date', { ascending: false }),
    db.from('courses').select('id,title,url,status,progress_pct,due_at').eq('employee_id', employeeId).order('created_at', { ascending: false }),
    db.from('recommendation_action_events').select('recommendation_id,event_type,created_at').eq('employee_id', employeeId).order('created_at', { ascending: false }),
  ]);
  const error = recResult.error ?? courseResult.error ?? eventResult.error; if (error) throw new Error(error.message);
  const latestEvent = new Map<string, string>(); for (const row of (eventResult.data ?? []) as Array<{ recommendation_id: string; event_type: string }>) if (!latestEvent.has(row.recommendation_id)) latestEvent.set(row.recommendation_id, row.event_type);
  return {
    recommendations: ((recResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), kind: String(row.kind), ref: String(row.ref), rationale: String(row.rationale ?? ''), status: String(row.status), detectedVia: row.detected_via ? String(row.detected_via) : null, evidence: (row.evidence_jsonb as Record<string, unknown>) ?? {}, date: String(row.date), lastAction: latestEvent.get(String(row.id)) ?? null })),
    courses: ((courseResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), title: String(row.title ?? 'Assigned learning'), url: row.url ? String(row.url) : null, status: String(row.status), progressPct: Number(row.progress_pct ?? 0), dueAt: row.due_at ? String(row.due_at) : null })),
  };
}

export async function getOrgActions(user: AuthUser): Promise<{ actions: OrgActionRow[]; candidates: OrgActionCandidate[] }> {
  const db = createAdminClient();
  const [actionResult, teamsResult, membershipResult, employeesResult, insightResult, telemetryResult, courseResult] = await Promise.all([
    db.from('org_actions').select('id,kind,title,rationale,status,due_at,owner_employee_id,team_id,evidence_jsonb').eq('function_id', user.functionId).order('created_at', { ascending: false }),
    db.from('teams').select('id,name,manager_employee_id').eq('function_id', user.functionId),
    db.from('team_memberships').select('team_id,employee_id'),
    db.from('employees').select('id,name').eq('function_id', user.functionId).eq('active', true),
    db.from('insights').select('title,body,evidence_jsonb').eq('function_id', user.functionId).eq('scope', 'function').eq('kind', 'improvement').order('date', { ascending: false }).limit(3),
    db.from('telemetry_connections').select('employee_id,status').eq('function_id', user.functionId).eq('status', 'connected'),
    db.from('courses').select('id,status,employee_id').eq('function_id', user.functionId),
  ]);
  const error = actionResult.error ?? teamsResult.error ?? membershipResult.error ?? employeesResult.error ?? insightResult.error ?? telemetryResult.error ?? courseResult.error; if (error) throw new Error(error.message);
  const teams = (teamsResult.data ?? []) as Array<{ id: string; name: string; manager_employee_id: string | null }>;
  const memberships = (membershipResult.data ?? []) as Array<{ team_id: string; employee_id: string }>;
  const employees = (employeesResult.data ?? []) as Array<{ id: string; name: string }>;
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.name])); const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const managerTeamIds = new Set(teams.filter((team) => team.manager_employee_id === user.employeeId).map((team) => team.id));
  const fullOrg = hasRole(user, 'admin', 'function_lead');
  const actions = ((actionResult.data ?? []) as Array<Record<string, unknown>>).filter((row) => fullOrg || (row.team_id && managerTeamIds.has(String(row.team_id)))).map((row) => ({ id: String(row.id), kind: String(row.kind), title: String(row.title), rationale: String(row.rationale), status: String(row.status), dueAt: row.due_at ? String(row.due_at) : null, ownerName: row.owner_employee_id ? employeeNames.get(String(row.owner_employee_id)) ?? null : null, teamName: row.team_id ? teamNames.get(String(row.team_id)) ?? null : null, evidence: (row.evidence_jsonb as Record<string, unknown>) ?? {} }));
  const candidates: OrgActionCandidate[] = [];
  const connectedIds = new Set(((telemetryResult.data ?? []) as Array<{ employee_id: string }>).map((row) => row.employee_id));
  const courses = (courseResult.data ?? []) as Array<{ status: string; employee_id: string }>;
  const scopes = fullOrg
    ? [{ teamId: undefined, label: 'the organization', employeeIds: new Set(employees.map((employee) => employee.id)) }]
    : teams.filter((team) => managerTeamIds.has(team.id)).map((team) => ({ teamId: team.id, label: team.name, employeeIds: new Set(memberships.filter((row) => row.team_id === team.id).map((row) => row.employee_id)) }));
  for (const scope of scopes) {
    const activePeople = employees.filter((employee) => scope.employeeIds.has(employee.id)).length;
    const connectedPeople = employees.filter((employee) => scope.employeeIds.has(employee.id) && connectedIds.has(employee.id)).length;
    if (activePeople && connectedPeople < activePeople) candidates.push({ kind: 'connector', title: `Complete personal AI connections · ${scope.label}`, rationale: `${connectedPeople} of ${activePeople} visible people have a live Codex or Claude Code connection. Improving coverage increases confidence; it does not automatically increase performance.`, evidence: { connectedPeople, activePeople }, teamId: scope.teamId });
    const openCourses = courses.filter((row) => scope.employeeIds.has(row.employee_id) && row.status !== 'completed').length;
    if (openCourses) candidates.push({ kind: 'course', title: `Follow up on assigned learning · ${scope.label}`, rationale: `${openCourses} real course assignment${openCourses === 1 ? ' remains' : 's remain'} open. Review progress without claiming causality.`, evidence: { openCourses }, teamId: scope.teamId });
  }
  if (fullOrg) for (const row of (insightResult.data ?? []) as Array<{ title: string | null; body: string | null; evidence_jsonb: Record<string, unknown> | null }>) if (row.title) candidates.push({ kind: 'intervention', title: row.title, rationale: row.body ?? 'Review the real evidence before assigning an organization action.', evidence: row.evidence_jsonb ?? {} });
  return { actions, candidates };
}

export const PUBLIC_LEARNING_RESOURCES = [
  { title: 'Codex developer guide', provider: 'OpenAI', url: 'https://developers.openai.com/codex', description: 'Official Codex concepts and workflows for engineering tasks.' },
  { title: 'Claude Code common workflows', provider: 'Anthropic', url: 'https://docs.anthropic.com/en/docs/claude-code/common-workflows', description: 'Official workflows for understanding, changing, testing, and shipping code.' },
  { title: 'Claude Code security', provider: 'Anthropic', url: 'https://docs.anthropic.com/en/docs/claude-code/security', description: 'Permissions and safe operating practices for agentic coding.' },
  { title: 'Review pull requests', provider: 'GitHub Skills', url: 'https://github.com/skills/review-pull-requests', description: 'Hands-on practice for review quality and collaborative delivery.' },
  { title: 'Resolve merge conflicts', provider: 'GitHub Skills', url: 'https://github.com/skills/resolve-merge-conflicts', description: 'Hands-on practice for maintaining clean delivery flow.' },
] as const;
