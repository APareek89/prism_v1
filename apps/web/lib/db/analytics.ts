import { createAdminClient } from '@/lib/supabase/admin';
import { getProcessingPolicy } from '@/lib/configuration/policy';

export interface AnalyticsSnapshot {
  token: {
    sessions: number;
    total: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
    costUsd: number | null;
    providers: Array<{ provider: string; model: string; sessions: number; totalTokens: number; costUsd: number | null }>;
  };
  delivery: {
    mergedPrs: number;
    aiAssistedPrs: number;
    aiPrRate: number | null;
    verifiedLinkedPrs: number;
    avgMergeHours: number | null;
    avgTokensPerMergedPr: number | null;
    costPerMergedPr: number | null;
    costPerAiPr: number | null;
    sizeBuckets: Record<'S' | 'M' | 'L', number>;
    unclassifiedPrs: number;
  };
  movement: {
    current: number | null;
    previous: number | null;
    delta: number | null;
    previousDate: string | null;
    currentDate: string | null;
    configChanged: boolean;
    confidenceChanged: boolean;
    contributions: Array<{ dimension: string; from: number | null; to: number | null; weightedPoints: number | null }>;
  };
}

type Scope = { kind: 'function'; id: string } | { kind: 'employee'; id: string; functionId: string };

export interface AnalyticsFilter {
  employeeIds?: string[];
  repoIds?: string[];
}

export interface OverviewFilterContext {
  filter: AnalyticsFilter;
  active: boolean;
  label: string;
  selected: { repo: string; team: string; manager: string };
  options: {
    repos: string[];
    teams: Array<{ id: string; name: string }>;
    managers: Array<{ id: string; name: string }>;
  };
}

export async function getOverviewFilterContext(
  functionId: string,
  requested: Partial<OverviewFilterContext['selected']>,
): Promise<OverviewFilterContext> {
  const db = createAdminClient();
  const [functionResult, teamResult, membershipResult, employeeResult] = await Promise.all([
    db.from('functions').select('repo_ids').eq('id', functionId).single(),
    db.from('teams').select('id,name,manager_employee_id').eq('function_id', functionId).order('name'),
    db.from('team_memberships').select('team_id,employee_id'),
    db.from('employees').select('id,name').eq('function_id', functionId).eq('active', true).order('name'),
  ]);
  const error = functionResult.error ?? teamResult.error ?? membershipResult.error ?? employeeResult.error;
  if (error) throw new Error(`Overview filters read failed: ${error.message}`);
  const functionRow = functionResult.data as unknown as { repo_ids: unknown } | null;
  const repos = Array.isArray(functionRow?.repo_ids) ? functionRow.repo_ids.filter((repo: unknown): repo is string => typeof repo === 'string') : [];
  const teams = (teamResult.data ?? []) as Array<{ id: string; name: string; manager_employee_id: string | null }>;
  const memberships = (membershipResult.data ?? []) as Array<{ team_id: string; employee_id: string }>;
  const employees = (employeeResult.data ?? []) as Array<{ id: string; name: string }>;
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.name]));
  const managerIds = [...new Set(teams.map((team) => team.manager_employee_id).filter((id): id is string => Boolean(id)))];
  const selectedRepo = repos.includes(requested.repo ?? '') ? requested.repo! : '';
  const selectedTeam = teams.some((team) => team.id === requested.team) ? requested.team! : '';
  const selectedManager = managerIds.includes(requested.manager ?? '') ? requested.manager! : '';
  const employeeSets: Set<string>[] = [];
  if (selectedTeam) employeeSets.push(new Set(memberships.filter((row) => row.team_id === selectedTeam).map((row) => row.employee_id)));
  if (selectedManager) {
    const managedTeams = new Set(teams.filter((team) => team.manager_employee_id === selectedManager).map((team) => team.id));
    employeeSets.push(new Set(memberships.filter((row) => managedTeams.has(row.team_id)).map((row) => row.employee_id)));
  }
  const employeeIds = employeeSets.length
    ? [...employeeSets.reduce((current, next) => new Set([...current].filter((id) => next.has(id))))]
    : undefined;
  const labels = [
    selectedRepo || null,
    teams.find((team) => team.id === selectedTeam)?.name ?? null,
    selectedManager ? `Manager: ${employeeNames.get(selectedManager) ?? 'configured manager'}` : null,
  ].filter((label): label is string => Boolean(label));
  return {
    filter: { employeeIds, repoIds: selectedRepo ? [selectedRepo] : undefined },
    active: Boolean(selectedRepo || selectedTeam || selectedManager),
    label: labels.length ? labels.join(' · ') : 'All configured repositories and measured people',
    selected: { repo: selectedRepo, team: selectedTeam, manager: selectedManager },
    options: {
      repos,
      teams: teams.map((team) => ({ id: team.id, name: team.name })),
      managers: managerIds.map((id) => ({ id, name: employeeNames.get(id) ?? 'Configured manager' })),
    },
  };
}

export async function getAnalytics(scope: Scope, filter: AnalyticsFilter = {}): Promise<AnalyticsSnapshot> {
  const db = createAdminClient();
  const functionId = scope.kind === 'function' ? scope.id : scope.functionId;
  const processingPolicy = await getProcessingPolicy(functionId);
  const trailingSince = new Date(Date.now() - 28 * 86_400_000).toISOString();
  const configuredSince = processingPolicy.measurementStartDate
    ? `${processingPolicy.measurementStartDate}T00:00:00.000Z`
    : trailingSince;
  const since = configuredSince > trailingSince ? configuredSince : trailingSince;
  let sessionsQuery = db.from('cc_sessions').select('provider,model,tokens_in,tokens_out,cache_read,cache_creation,cost_usd,ts').eq('function_id', functionId).gte('ts', since);
  let prsQuery = db.from('gh_prs').select('repo,number,created_at,merged_at,is_merged,ai_assisted,size_bucket').eq('function_id', functionId).eq('is_merged', true).gte('merged_at', since);
  let indexQuery = db.from('index_daily').select('date,l1,l2_usage,l2_eff,l2_effness,l2_prof,confidence,config_version').eq('function_id', functionId).eq('scope', scope.kind).eq('scope_id', scope.id).order('date', { ascending: false }).limit(2);
  let linksQuery = db.from('pr_link_ingest').select('repo,pr_number,employee_id,provider').eq('function_id', functionId).gte('received_at', since);
  if (scope.kind === 'employee') {
    sessionsQuery = sessionsQuery.eq('employee_id', scope.id);
    prsQuery = prsQuery.eq('employee_id', scope.id);
    linksQuery = linksQuery.eq('employee_id', scope.id);
  } else {
    if (filter.employeeIds) {
      const ids = filter.employeeIds.length ? filter.employeeIds : ['00000000-0000-0000-0000-000000000000'];
      sessionsQuery = sessionsQuery.in('employee_id', ids);
      prsQuery = prsQuery.in('employee_id', ids);
      linksQuery = linksQuery.in('employee_id', ids);
    }
    if (filter.repoIds?.length) {
      prsQuery = prsQuery.in('repo', filter.repoIds);
      linksQuery = linksQuery.in('repo', filter.repoIds);
    }
  }
  if (processingPolicy.measurementStartDate) indexQuery = indexQuery.gte('date', processingPolicy.measurementStartDate);
  const [sessionsResult, prsResult, indexResult, linksResult, configResult] = await Promise.all([
    sessionsQuery,
    prsQuery,
    indexQuery,
    linksQuery,
    db.from('index_config').select('version,weights_jsonb').eq('function_id', functionId).order('version', { ascending: false }),
  ]);
  const error = [sessionsResult.error, prsResult.error, indexResult.error, linksResult.error, configResult.error].find(Boolean);
  if (error) throw new Error(`Analytics read failed: ${error.message}`);

  const sessions = ((sessionsResult.data ?? []) as Array<{ provider: string | null; model: string | null; tokens_in: number | string | null; tokens_out: number | string | null; cache_read: number | string | null; cache_creation: number | string | null; cost_usd: number | string | null }>).filter((row) => processingPolicy.enabled(row.provider === 'codex' ? 'llm.session_metadata' : 'claude.session_metadata')).map((row) => {
    const includeTokens = processingPolicy.enabled(row.provider === 'codex' ? 'llm.token_usage' : 'claude.token_usage');
    return includeTokens ? row : { ...row, tokens_in: 0, tokens_out: 0, cache_read: 0, cache_creation: 0, cost_usd: null };
  });
  const prs = (prsResult.data ?? []) as Array<{ repo: string; number: number; created_at: string; merged_at: string | null; ai_assisted: boolean; size_bucket: 'S' | 'M' | 'L' | null }>;
  const links = new Set(((linksResult.data ?? []) as Array<{ repo: string; pr_number: number; provider: string }>).filter((row) => processingPolicy.enabled(row.provider === 'codex' ? 'llm.pr_link' : 'claude.pr_link')).map((row) => `${row.repo}#${row.pr_number}`));
  const sum = (key: 'tokens_in' | 'tokens_out' | 'cache_read' | 'cache_creation') => sessions.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const input = sum('tokens_in'); const output = sum('tokens_out'); const cacheRead = sum('cache_read'); const cacheCreation = sum('cache_creation');
  const costRows = sessions.filter((row) => row.cost_usd !== null);
  const costUsd = costRows.length ? costRows.reduce((total, row) => total + Number(row.cost_usd), 0) : null;
  const providerMap = new Map<string, AnalyticsSnapshot['token']['providers'][number]>();
  for (const row of sessions) {
    const provider = row.provider ?? 'unknown'; const model = row.model ?? 'model unavailable'; const key = `${provider}:${model}`;
    const current = providerMap.get(key) ?? { provider, model, sessions: 0, totalTokens: 0, costUsd: row.cost_usd === null ? null : 0 };
    current.sessions += 1; current.totalTokens += Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0) + Number(row.cache_read ?? 0) + Number(row.cache_creation ?? 0);
    if (row.cost_usd !== null) current.costUsd = (current.costUsd ?? 0) + Number(row.cost_usd);
    providerMap.set(key, current);
  }
  const aiAssistedPrs = prs.filter((pr) => pr.ai_assisted || links.has(`${pr.repo}#${pr.number}`)).length;
  const mergeDurations = prs.map((pr) => pr.merged_at ? (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3_600_000 : null).filter((value): value is number => value !== null && value >= 0);
  const totalTokens = input + output + cacheRead + cacheCreation;
  const sizeBuckets = { S: 0, M: 0, L: 0 }; for (const pr of prs) if (pr.size_bucket) sizeBuckets[pr.size_bucket] += 1;

  const indexRows = (indexResult.data ?? []) as Array<{ date: string; l1: number | string | null; l2_usage: number | string | null; l2_eff: number | string | null; l2_effness: number | string | null; l2_prof: number | string | null; confidence: string; config_version: number }>;
  const current = indexRows[0] ?? null; const previous = indexRows[1] ?? null;
  const configs = new Map(((configResult.data ?? []) as Array<{ version: number; weights_jsonb: Record<string, number> }>).map((row) => [row.version, row.weights_jsonb]));
  const weights = current ? configs.get(current.config_version) ?? {} : {};
  const dimensions = [
    ['usage', 'l2_usage'], ['efficiency', 'l2_eff'], ['effectiveness', 'l2_effness'], ['proficiency', 'l2_prof'],
  ] as const;
  const numberOrNull = (value: number | string | null | undefined) => value === null || value === undefined ? null : Number(value);
  const contributions = dimensions.map(([dimension, column]) => {
    const from = numberOrNull(previous?.[column]); const to = numberOrNull(current?.[column]);
    return { dimension, from, to, weightedPoints: from === null || to === null ? null : (to - from) * Number(weights[dimension] ?? 0) };
  });
  const currentL1 = numberOrNull(current?.l1); const previousL1 = numberOrNull(previous?.l1);

  return {
    token: { sessions: sessions.length, total: totalTokens, input, output, cacheRead, cacheCreation, costUsd, providers: [...providerMap.values()].sort((a, b) => b.totalTokens - a.totalTokens) },
    delivery: {
      mergedPrs: prs.length,
      aiAssistedPrs,
      aiPrRate: prs.length ? (aiAssistedPrs / prs.length) * 100 : null,
      verifiedLinkedPrs: links.size,
      avgMergeHours: mergeDurations.length ? mergeDurations.reduce((a, b) => a + b, 0) / mergeDurations.length : null,
      avgTokensPerMergedPr: prs.length ? totalTokens / prs.length : null,
      costPerMergedPr: costUsd !== null && prs.length ? costUsd / prs.length : null,
      costPerAiPr: costUsd !== null && aiAssistedPrs ? costUsd / aiAssistedPrs : null,
      sizeBuckets,
      unclassifiedPrs: prs.filter((pr) => !pr.size_bucket).length,
    },
    movement: {
      current: currentL1, previous: previousL1, delta: currentL1 !== null && previousL1 !== null ? currentL1 - previousL1 : null,
      previousDate: previous?.date ?? null, currentDate: current?.date ?? null,
      configChanged: Boolean(current && previous && current.config_version !== previous.config_version),
      confidenceChanged: Boolean(current && previous && current.confidence !== previous.confidence),
      contributions,
    },
  };
}
