import { createAdminClient } from '@/lib/supabase/admin';
import { DATA_CATALOGUE, disabledDimensionReason, type DataSource } from './catalog';
import type { Dimension } from '@/lib/ui/view-models';
import { DIMENSION_KPIS, INTRA_WEIGHTS, isInverted } from '@/lib/scoring/constants';
import { DEFAULT_INDEX_CONFIG } from '@/lib/scoring/defaults/index-config.default';

type Json = Record<string, unknown>;

export interface ConfigurationSnapshot {
  function: { id: string; name: string; repoIds: string[] };
  profile: {
    allowedProviders: string[];
    connectionMethods: string[];
    measurementStartDate: string;
    completed: Record<'connection' | 'data' | 'index' | 'organization' | 'access', string | null>;
  };
  github: { connected: boolean; org: string | null; appRepoIds: string[]; lastSyncAt: string | null; lastError: string | null };
  preferences: Record<string, boolean>;
  sourceStatus: Record<DataSource, { available: boolean; detail: string }>;
  index: {
    version: number;
    weights: Record<Dimension, number>;
    minimumSignals: Record<Dimension, number>;
    disabledReasons: Partial<Record<Dimension, string>>;
    availableKpis: string[];
    kpis: Array<{ id: string; label: string; dimension: Dimension; intraWeight: number; direction: 'higher' | 'lower'; anchorLabel: string; hasSignal: boolean }>;
  };
  employees: Array<{ id: string; name: string; email: string | null; githubHandle: string | null; designation: string | null; active: boolean; role: 'admin' | 'management' | 'manager' | 'member'; teamName: string | null }>;
  teams: Array<{ id: string; name: string; managerEmployeeId: string | null; members: number }>;
  audit: Array<{ id: number; section: string; action: string; actorName: string | null; createdAt: string; before: Json; after: Json }>;
  catalogue: typeof DATA_CATALOGUE;
}

export interface ConnectionPolicy {
  allowedProviders: Array<'codex' | 'claude_code'>;
  connectionMethods: Array<'email' | 'terminal'>;
}

export async function getConnectionPolicy(functionId: string): Promise<ConnectionPolicy> {
  const { data, error } = await admin().from('workspace_configuration').select('allowed_ai_providers,connection_methods').eq('function_id', functionId).maybeSingle();
  if (error) throw new Error(`Connection policy read failed: ${error.message}`);
  const row = data as { allowed_ai_providers?: unknown; connection_methods?: unknown } | null;
  return {
    allowedProviders: strings(row?.allowed_ai_providers, ['codex', 'claude_code']).filter((value): value is 'codex' | 'claude_code' => value === 'codex' || value === 'claude_code'),
    connectionMethods: strings(row?.connection_methods, ['email', 'terminal']).filter((value): value is 'email' | 'terminal' => value === 'email' || value === 'terminal'),
  };
}

function admin() {
  return createAdminClient() as ReturnType<typeof createAdminClient>;
}

function asObject(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function strings(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback;
}

export async function getConfigurationSnapshot(functionId: string): Promise<ConfigurationSnapshot> {
  const db = admin();
  const [fnResult, profileResult, connectorResult, prefResult, configResult, employeeResult, roleResult, teamResult, membershipResult, auditResult, kpiResult, telemetryResult, connectorStatusResult] = await Promise.all([
    db.from('functions').select('id,name,repo_ids').eq('id', functionId).single(),
    db.from('workspace_configuration').select('*').eq('function_id', functionId).maybeSingle(),
    db.from('connectors').select('status,config_jsonb,last_sync_at,last_error').eq('function_id', functionId).eq('type', 'github').maybeSingle(),
    db.from('data_processing_preferences').select('data_key,enabled').eq('function_id', functionId),
    db.from('index_config').select('version,weights_jsonb,anchors_jsonb').eq('function_id', functionId).order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('employees').select('id,name,email,github_handle,designation,active').eq('function_id', functionId).order('name'),
    db.from('employee_roles').select('employee_id,role').eq('function_id', functionId),
    db.from('teams').select('id,name,manager_employee_id').eq('function_id', functionId).order('name'),
    db.from('team_memberships').select('team_id,employee_id'),
    db.from('configuration_audit').select('id,section,action,actor_employee_id,before_jsonb,after_jsonb,created_at').eq('function_id', functionId).order('created_at', { ascending: false }).limit(30),
    db.from('kpi_daily').select('kpi_id').eq('function_id', functionId).gt('signal_count', 0),
    db.from('telemetry_connections').select('provider,status').eq('function_id', functionId).eq('status', 'connected'),
    db.from('connectors').select('type,status').eq('function_id', functionId),
  ]);

  const errors = [fnResult, profileResult, connectorResult, prefResult, configResult, employeeResult, roleResult, teamResult, membershipResult, auditResult, kpiResult, telemetryResult, connectorStatusResult]
    .map((result) => result.error?.message)
    .filter(Boolean);
  if (errors.length) throw new Error(`Configuration read failed: ${errors.join('; ')}`);

  const fn = fnResult.data as unknown as { id: string; name: string; repo_ids: string[] };
  const profile = profileResult.data as Record<string, unknown> | null;
  const connector = connectorResult.data as { status: string; config_jsonb: unknown; last_sync_at: string | null; last_error: string | null } | null;
  const connectorConfig = asObject(connector?.config_jsonb);
  const liveProviders = new Set(((telemetryResult.data ?? []) as Array<{ provider: string }>).map((row) => row.provider));
  const connectorStatuses = new Map(((connectorStatusResult.data ?? []) as Array<{ type: string; status: string }>).map((row) => [row.type, row.status]));
  const sourceStatus: ConfigurationSnapshot['sourceStatus'] = {
    github: { available: connector?.status === 'connected', detail: connector?.status === 'connected' ? 'Live organization source' : 'Connect GitHub first' },
    codex: { available: liveProviders.has('codex'), detail: liveProviders.has('codex') ? 'At least one live user' : 'Awaiting a personal connection' },
    claude_code: { available: liveProviders.has('claude_code'), detail: liveProviders.has('claude_code') ? 'At least one live user' : 'Awaiting a personal connection' },
    sentry: { available: connectorStatuses.get('sentry') === 'connected', detail: connectorStatuses.get('sentry') === 'connected' ? 'Live incident source' : 'Not connected yet' },
  };
  const prefs = Object.fromEntries(((prefResult.data ?? []) as Array<{ data_key: string; enabled: boolean }>).map((row) => [row.data_key, row.enabled]));
  const preferences = Object.fromEntries(DATA_CATALOGUE.map((item) => [item.key, prefs[item.key] ?? (item.required || sourceStatus[item.source].available)]));
  const enabledKeys = new Set(Object.entries(preferences).filter(([, enabled]) => enabled).map(([key]) => key));
  const config = configResult.data as { version: number; weights_jsonb: unknown; anchors_jsonb: unknown } | null;
  const rawWeights = asObject(config?.weights_jsonb);
  const rawAnchors = asObject(config?.anchors_jsonb);
  const dimensions: Dimension[] = ['usage', 'efficiency', 'effectiveness', 'proficiency'];
  const fallbackWeights: Record<Dimension, number> = { usage: 10, efficiency: 25, effectiveness: 40, proficiency: 25 };
  const weights = Object.fromEntries(dimensions.map((dimension) => [dimension, typeof rawWeights[dimension] === 'number' ? Math.round((rawWeights[dimension] as number) * 100) : fallbackWeights[dimension]])) as Record<Dimension, number>;
  const disabledReasons = Object.fromEntries(dimensions.map((dimension) => [dimension, disabledDimensionReason(dimension, enabledKeys)]).filter(([, reason]) => reason)) as Partial<Record<Dimension, string>>;
  const availableKpis = [...new Set(((kpiResult.data ?? []) as Array<{ kpi_id: string }>).map((row) => row.kpi_id))].sort();
  const liveKpis = new Set(availableKpis);
  const kpis = dimensions.flatMap((dimension) => DIMENSION_KPIS[dimension].map((id) => {
    const anchor = asObject(rawAnchors[id]);
    const fallback = DEFAULT_INDEX_CONFIG.anchors[id];
    const target = typeof anchor.target === 'number' ? anchor.target : fallback.target;
    const inverted = isInverted(id);
    const boundary = inverted
      ? (typeof anchor.ceil === 'number' ? anchor.ceil : fallback.ceil)
      : (typeof anchor.floor === 'number' ? anchor.floor : fallback.floor);
    return {
      id,
      label: id.split('_').map((part) => part[0]!.toUpperCase() + part.slice(1)).join(' '),
      dimension,
      intraWeight: Math.round(INTRA_WEIGHTS[id] * 100),
      direction: inverted ? 'lower' as const : 'higher' as const,
      anchorLabel: inverted ? `100 at ≤ ${target}; 0 at ≥ ${boundary}` : `0 at ≤ ${boundary}; 100 at ≥ ${target}`,
      hasSignal: liveKpis.has(id),
    };
  }));

  const roles = new Map<string, string[]>();
  for (const row of (roleResult.data ?? []) as Array<{ employee_id: string; role: string }>) roles.set(row.employee_id, [...(roles.get(row.employee_id) ?? []), row.role]);
  const memberships = (membershipResult.data ?? []) as Array<{ team_id: string; employee_id: string }>;
  const teams = (teamResult.data ?? []) as Array<{ id: string; name: string; manager_employee_id: string | null }>;
  const teamByEmployee = new Map(memberships.map((membership) => [membership.employee_id, teams.find((team) => team.id === membership.team_id)?.name ?? null]));
  const employeeNames = new Map(((employeeResult.data ?? []) as Array<{ id: string; name: string }>).map((employee) => [employee.id, employee.name]));

  return {
    function: { id: fn.id, name: fn.name, repoIds: fn.repo_ids ?? [] },
    profile: {
      allowedProviders: strings(profile?.allowed_ai_providers, ['codex', 'claude_code']),
      connectionMethods: strings(profile?.connection_methods, ['email', 'terminal']),
      measurementStartDate: typeof profile?.measurement_start_date === 'string' ? profile.measurement_start_date : new Date().toISOString().slice(0, 10),
      completed: {
        connection: typeof profile?.connection_confirmed_at === 'string' ? profile.connection_confirmed_at : null,
        data: typeof profile?.data_confirmed_at === 'string' ? profile.data_confirmed_at : null,
        index: typeof profile?.index_confirmed_at === 'string' ? profile.index_confirmed_at : null,
        organization: typeof profile?.organization_confirmed_at === 'string' ? profile.organization_confirmed_at : null,
        access: typeof profile?.access_confirmed_at === 'string' ? profile.access_confirmed_at : null,
      },
    },
    github: {
      connected: connector?.status === 'connected',
      org: typeof connectorConfig.org === 'string' ? connectorConfig.org : null,
      appRepoIds: strings(connectorConfig.repo_ids, []),
      lastSyncAt: connector?.last_sync_at ?? null,
      lastError: connector?.last_error ?? null,
    },
    preferences,
    sourceStatus,
    index: {
      version: config?.version ?? 1,
      weights,
      minimumSignals: { ...DEFAULT_INDEX_CONFIG.minSignals },
      disabledReasons,
      availableKpis,
      kpis,
    },
    employees: ((employeeResult.data ?? []) as Array<{ id: string; name: string; email: string | null; github_handle: string | null; designation: string | null; active: boolean }>).map((employee) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      githubHandle: employee.github_handle,
      designation: employee.designation,
      active: employee.active,
      role: displayRole(roles.get(employee.id) ?? []),
      teamName: teamByEmployee.get(employee.id) ?? null,
    })),
    teams: teams.map((team) => ({ id: team.id, name: team.name, managerEmployeeId: team.manager_employee_id, members: memberships.filter((membership) => membership.team_id === team.id).length })),
    audit: ((auditResult.data ?? []) as Array<{ id: number; section: string; action: string; actor_employee_id: string | null; before_jsonb: unknown; after_jsonb: unknown; created_at: string }>).map((row) => ({ id: row.id, section: row.section, action: row.action, actorName: row.actor_employee_id ? employeeNames.get(row.actor_employee_id) ?? null : null, createdAt: row.created_at, before: asObject(row.before_jsonb), after: asObject(row.after_jsonb) })),
    catalogue: DATA_CATALOGUE,
  };
}

function displayRole(roles: string[]): ConfigurationSnapshot['employees'][number]['role'] {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('function_lead')) return 'management';
  if (roles.includes('manager')) return 'manager';
  return 'member';
}
