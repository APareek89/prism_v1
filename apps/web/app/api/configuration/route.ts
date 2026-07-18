import { z } from 'zod';
import { withAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { DATA_CATALOGUE, disabledDimensionReason } from '@/lib/configuration/catalog';
import type { Dimension } from '@/lib/ui/view-models';

export const dynamic = 'force-dynamic';

const connectionSchema = z.object({
  section: z.literal('connection'),
  allowedProviders: z.array(z.enum(['codex', 'claude_code'])).min(1),
  connectionMethods: z.array(z.enum(['email', 'terminal'])).min(1),
  measurementStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const dataSchema = z.object({
  section: z.literal('data'),
  preferences: z.record(z.string(), z.boolean()),
});
const indexSchema = z.object({
  section: z.literal('index'),
  weights: z.object({ usage: z.number().min(0).max(100), efficiency: z.number().min(0).max(100), effectiveness: z.number().min(0).max(100), proficiency: z.number().min(0).max(100) }),
});
const organizationSchema = z.object({
  section: z.literal('organization'),
  repoIds: z.array(z.string().min(1)),
  people: z.array(z.object({ employeeId: z.string().uuid(), email: z.string().email().nullable(), designation: z.string().max(100).nullable(), teamName: z.string().max(80).nullable() })),
});
const accessSchema = z.object({
  section: z.literal('access'),
  roles: z.array(z.object({ employeeId: z.string().uuid(), role: z.enum(['admin', 'management', 'manager', 'member']) })),
});
const requestSchema = z.discriminatedUnion('section', [connectionSchema, dataSchema, indexSchema, organizationSchema, accessSchema]);

type LooseDb = any;

export const POST = withAdmin(async (request, user) => {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid configuration' }, { status: 400 });
  const db: LooseDb = createAdminClient();
  const now = new Date().toISOString();

  try {
    const before = await readSectionState(db, user.functionId, parsed.data.section);
    switch (parsed.data.section) {
      case 'connection':
        await saveConnection(db, user.functionId, user.employeeId, parsed.data, now);
        break;
      case 'data':
        await requireCompleted(db, user.functionId, 'connection_confirmed_at');
        await saveData(db, user.functionId, user.employeeId, parsed.data.preferences, now);
        break;
      case 'index':
        await requireCompleted(db, user.functionId, 'data_confirmed_at');
        await saveIndex(db, user.functionId, user.employeeId, parsed.data.weights, now);
        break;
      case 'organization':
        await requireCompleted(db, user.functionId, 'index_confirmed_at');
        await saveOrganization(db, user.functionId, user.employeeId, parsed.data, now);
        break;
      case 'access':
        await requireCompleted(db, user.functionId, 'organization_confirmed_at');
        await saveAccess(db, user.functionId, user.employeeId, parsed.data.roles, now);
        break;
    }

    const after = await readSectionState(db, user.functionId, parsed.data.section);
    const { error: auditError } = await db.from('configuration_audit').insert({
      function_id: user.functionId,
      actor_employee_id: user.employeeId,
      section: parsed.data.section,
      action: `${parsed.data.section}.confirmed`,
      before_jsonb: before,
      after_jsonb: after,
    });
    if (auditError) throw new Error(auditError.message);
    return Response.json({ ok: true, section: parsed.data.section });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Configuration update failed' }, { status: 400 });
  }
});

async function readSectionState(db: LooseDb, functionId: string, section: z.infer<typeof requestSchema>['section']): Promise<Record<string, unknown>> {
  if (section === 'connection') {
    const { data, error } = await db.from('workspace_configuration').select('allowed_ai_providers,connection_methods,measurement_start_date,connection_confirmed_at').eq('function_id', functionId).maybeSingle();
    if (error) throw new Error(error.message);
    return { profile: data ?? null };
  }
  if (section === 'data') {
    const { data, error } = await db.from('data_processing_preferences').select('data_key,source,enabled,consent_version,effective_at').eq('function_id', functionId).order('data_key');
    if (error) throw new Error(error.message);
    return { preferences: data ?? [] };
  }
  if (section === 'index') {
    const { data, error } = await db.from('index_config').select('version,weights_jsonb,anchors_jsonb,sizing_jsonb,frozen_at').eq('function_id', functionId).order('version', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return { config: data ?? null };
  }
  if (section === 'organization') {
    const [fnResult, employeeResult, teamResult, membershipResult] = await Promise.all([
      db.from('functions').select('repo_ids').eq('id', functionId).single(),
      db.from('employees').select('id,email,designation').eq('function_id', functionId).order('id'),
      db.from('teams').select('id,name,manager_employee_id').eq('function_id', functionId).order('name'),
      db.from('team_memberships').select('team_id,employee_id,role_title').order('team_id'),
    ]);
    const error = fnResult.error ?? employeeResult.error ?? teamResult.error ?? membershipResult.error;
    if (error) throw new Error(error.message);
    const teamIds = new Set((teamResult.data ?? []).map((team: { id: string }) => team.id));
    return { repositories: fnResult.data?.repo_ids ?? [], people: employeeResult.data ?? [], teams: teamResult.data ?? [], memberships: (membershipResult.data ?? []).filter((row: { team_id: string }) => teamIds.has(row.team_id)) };
  }
  const [roleResult, teamResult] = await Promise.all([
    db.from('employee_roles').select('employee_id,role').eq('function_id', functionId).order('employee_id'),
    db.from('teams').select('id,name,manager_employee_id').eq('function_id', functionId).order('name'),
  ]);
  const error = roleResult.error ?? teamResult.error;
  if (error) throw new Error(error.message);
  return { roles: roleResult.data ?? [], teamManagers: teamResult.data ?? [] };
}

async function profileUpsert(db: LooseDb, functionId: string, employeeId: string, patch: Record<string, unknown>) {
  const { error } = await db.from('workspace_configuration').upsert({ function_id: functionId, updated_by_employee_id: employeeId, updated_at: new Date().toISOString(), ...patch }, { onConflict: 'function_id' });
  if (error) throw new Error(error.message);
}

async function requireCompleted(db: LooseDb, functionId: string, column: string) {
  const { data, error } = await db.from('workspace_configuration').select(column).eq('function_id', functionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.[column]) throw new Error('Complete and confirm the previous configuration step first.');
}

async function saveConnection(db: LooseDb, functionId: string, employeeId: string, input: z.infer<typeof connectionSchema>, now: string) {
  const { data: connector, error } = await db.from('connectors').select('status').eq('function_id', functionId).eq('type', 'github').maybeSingle();
  if (error) throw new Error(error.message);
  if (connector?.status !== 'connected') throw new Error('Connect and successfully sync the GitHub App before confirming this step.');
  await profileUpsert(db, functionId, employeeId, { allowed_ai_providers: input.allowedProviders, connection_methods: input.connectionMethods, measurement_start_date: input.measurementStartDate, connection_confirmed_at: now });
}

async function saveData(db: LooseDb, functionId: string, employeeId: string, preferences: Record<string, boolean>, now: string) {
  for (const item of DATA_CATALOGUE) if (item.required && preferences[item.key] !== true) throw new Error(`${item.label} is required for the core index and cannot be disabled.`);
  for (const prefix of ['llm', 'claude']) {
    if ((preferences[`${prefix}.token_usage`] || preferences[`${prefix}.pr_link`]) && !preferences[`${prefix}.session_metadata`]) {
      throw new Error(`${prefix === 'llm' ? 'Codex' : 'Claude Code'} token and PR-link processing require session metadata to remain enabled.`);
    }
  }
  const rows = DATA_CATALOGUE.map((item) => ({ function_id: functionId, data_key: item.key, source: item.source, enabled: preferences[item.key] === true, consent_version: 1, effective_at: now, updated_by_employee_id: employeeId, updated_at: now }));
  const { error } = await db.from('data_processing_preferences').upsert(rows, { onConflict: 'function_id,data_key' });
  if (error) throw new Error(error.message);
  await profileUpsert(db, functionId, employeeId, { data_confirmed_at: now, data_consent_version: 1 });
}

async function saveIndex(db: LooseDb, functionId: string, employeeId: string, weights: Record<Dimension, number>, now: string) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error(`Index weights must total 100%; current total is ${total}%.`);
  const { data: preferenceRows, error: prefError } = await db.from('data_processing_preferences').select('data_key,enabled').eq('function_id', functionId);
  if (prefError) throw new Error(prefError.message);
  const enabled = new Set<string>(((preferenceRows ?? []) as Array<{ data_key: string; enabled: boolean }>).filter((row) => row.enabled).map((row) => row.data_key));
  for (const dimension of Object.keys(weights) as Dimension[]) {
    const reason = disabledDimensionReason(dimension, enabled);
    if (reason && weights[dimension] > 0) throw new Error(`${dimension} is disabled. Set its weight to 0 and redistribute the remaining weight. ${reason}`);
  }
  const { data: current, error } = await db.from('index_config').select('*').eq('function_id', functionId).order('version', { ascending: false }).limit(1).single();
  if (error) throw new Error(error.message);
  const normalized = Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / 100]));
  const same = Object.entries(normalized).every(([key, value]) => Math.abs(Number(current.weights_jsonb?.[key] ?? -1) - value) < 0.000001);
  if (!same) {
    const { error: insertError } = await db.from('index_config').insert({ function_id: functionId, version: current.version + 1, weights_jsonb: normalized, anchors_jsonb: current.anchors_jsonb, sizing_jsonb: current.sizing_jsonb, ignore_globs: current.ignore_globs, sensitive_globs: current.sensitive_globs, frozen_at: now });
    if (insertError) throw new Error(insertError.message);
  }
  await profileUpsert(db, functionId, employeeId, { index_confirmed_at: now });
}

async function saveOrganization(db: LooseDb, functionId: string, employeeId: string, input: z.infer<typeof organizationSchema>, now: string) {
  const { data: connector, error: connectorError } = await db.from('connectors').select('config_jsonb').eq('function_id', functionId).eq('type', 'github').single();
  if (connectorError) throw new Error(connectorError.message);
  const appRepos = new Set(Array.isArray(connector.config_jsonb?.repo_ids) ? connector.config_jsonb.repo_ids : []);
  if (input.repoIds.some((repo) => !appRepos.has(repo))) throw new Error('Repository scope must be a subset of repositories granted to the GitHub App.');
  if (!input.repoIds.length) throw new Error('Keep at least one repository in measurement scope.');
  const { error: fnError } = await db.from('functions').update({ repo_ids: input.repoIds, updated_at: now }).eq('id', functionId);
  if (fnError) throw new Error(fnError.message);
  for (const person of input.people) {
    const { error } = await db.from('employees').update({ email: person.email, designation: person.designation, updated_at: now }).eq('id', person.employeeId).eq('function_id', functionId);
    if (error) throw new Error(error.message);
  }
  const { data: oldTeams, error: oldTeamError } = await db.from('teams').select('id').eq('function_id', functionId);
  if (oldTeamError) throw new Error(oldTeamError.message);
  const oldIds = (oldTeams ?? []).map((team: { id: string }) => team.id);
  if (oldIds.length) {
    const { error } = await db.from('teams').delete().in('id', oldIds);
    if (error) throw new Error(error.message);
  }
  const teamNames = [...new Set(input.people.map((person) => person.teamName?.trim()).filter((name): name is string => Boolean(name)))];
  const teamIds = new Map<string, string>();
  for (const name of teamNames) {
    const { data: team, error } = await db.from('teams').insert({ function_id: functionId, name, manager_employee_id: null, updated_at: now }).select('id').single();
    if (error) throw new Error(error.message);
    teamIds.set(name, team.id);
  }
  const memberships = input.people.filter((person) => person.teamName?.trim()).map((person) => ({ team_id: teamIds.get(person.teamName!.trim()), employee_id: person.employeeId, role_title: person.designation, updated_at: now }));
  if (memberships.length) {
    const { error } = await db.from('team_memberships').insert(memberships);
    if (error) throw new Error(error.message);
  }
  await profileUpsert(db, functionId, employeeId, { organization_confirmed_at: now });
}

async function saveAccess(db: LooseDb, functionId: string, actorEmployeeId: string, roles: z.infer<typeof accessSchema>['roles'], now: string) {
  const self = roles.find((entry) => entry.employeeId === actorEmployeeId);
  if (!self || self.role !== 'admin') throw new Error('You cannot remove your own administrator access. Assign another administrator before changing your role.');
  const roleMap = { admin: 'admin', management: 'function_lead', manager: 'manager', member: 'developer' } as const;
  for (const entry of roles) {
    const { error: deleteError } = await db.from('employee_roles').delete().eq('function_id', functionId).eq('employee_id', entry.employeeId);
    if (deleteError) throw new Error(deleteError.message);
    const rows = entry.role === 'admin'
      ? [{ employee_id: entry.employeeId, function_id: functionId, role: 'developer' }, { employee_id: entry.employeeId, function_id: functionId, role: 'admin' }]
      : [{ employee_id: entry.employeeId, function_id: functionId, role: roleMap[entry.role] }];
    const { error: insertError } = await db.from('employee_roles').insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
  const { error: clearManagerError } = await db.from('teams').update({ manager_employee_id: null, updated_at: now }).eq('function_id', functionId);
  if (clearManagerError) throw new Error(clearManagerError.message);
  for (const entry of roles.filter((role) => role.role === 'manager')) {
    const { data: memberships, error } = await db.from('team_memberships').select('team_id').eq('employee_id', entry.employeeId);
    if (error) throw new Error(error.message);
    for (const membership of memberships ?? []) {
      const { error: teamError } = await db.from('teams').update({ manager_employee_id: entry.employeeId, updated_at: now }).eq('id', membership.team_id).eq('function_id', functionId);
      if (teamError) throw new Error(teamError.message);
    }
  }
  await profileUpsert(db, functionId, actorEmployeeId, { access_confirmed_at: now });
}
