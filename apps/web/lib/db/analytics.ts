import { createAdminClient } from '@/lib/supabase/admin';
import { getProcessingPolicy } from '@/lib/configuration/policy';
import type { Period } from '@/lib/config/constants';

export type TokenCounterStatus = 'captured' | 'not_emitted' | 'not_approved' | 'no_sessions';

export interface AnalyticsSnapshot {
  token: {
    sessions: number;
    total: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
    costUsd: number | null;
    counterStatus: TokenCounterStatus;
    providers: Array<{ provider: string; model: string; sessions: number; totalTokens: number; costUsd: number | null; counterStatus: TokenCounterStatus; previousSessions: number | null; previousTotalTokens: number | null }>;
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
  comparison: {
    available: boolean;
    label: string;
    windowLabel: string;
    token: {
      sessions: number;
      total: number | null;
      input: number | null;
      output: number | null;
      cacheRead: number | null;
      cacheCreation: number | null;
      costUsd: number | null;
    };
    delivery: {
      mergedPrs: number;
      aiAssistedPrs: number;
      aiPrRate: number | null;
      verifiedLinkedPrs: number;
      avgMergeHours: number | null;
      avgTokensPerMergedPr: number | null;
      sizeBuckets: Record<'S' | 'M' | 'L', number>;
    };
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

function periodDays(period: Period): number {
  if (period === 'daily') return 1;
  if (period === 'weekly') return 7;
  return 30;
}

function periodLabel(period: Period): string {
  if (period === 'daily') return 'previous day';
  if (period === 'weekly') return 'previous 7 days';
  return 'previous 30 days';
}

type SessionRow = {
  provider: string | null;
  model: string | null;
  tokens_in: number | string | null;
  tokens_out: number | string | null;
  cache_read: number | string | null;
  cache_creation: number | string | null;
  cost_usd: number | string | null;
  ts: string;
  tokensApproved: boolean;
};
type PrRow = { repo: string; number: number; created_at: string; merged_at: string | null; ai_assisted: boolean; size_bucket: 'S' | 'M' | 'L' | null };
type LinkRow = { repo: string; pr_number: number; provider: string; received_at: string };

function counterStatus(rows: SessionRow[]): TokenCounterStatus {
  if (!rows.length) return 'no_sessions';
  if (rows.every((row) => !row.tokensApproved)) return 'not_approved';
  const captured = rows.some((row) => Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0) + Number(row.cache_read ?? 0) + Number(row.cache_creation ?? 0) > 0);
  return captured ? 'captured' : 'not_emitted';
}

function tokenRollup(rows: SessionRow[]) {
  const sum = (key: 'tokens_in' | 'tokens_out' | 'cache_read' | 'cache_creation') => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const input = sum('tokens_in');
  const output = sum('tokens_out');
  const cacheRead = sum('cache_read');
  const cacheCreation = sum('cache_creation');
  const costRows = rows.filter((row) => row.cost_usd !== null);
  return {
    sessions: rows.length,
    input,
    output,
    cacheRead,
    cacheCreation,
    total: input + output + cacheRead + cacheCreation,
    costUsd: costRows.length ? costRows.reduce((total, row) => total + Number(row.cost_usd), 0) : null,
    counterStatus: counterStatus(rows),
  };
}

function deliveryRollup(prs: PrRow[], links: Set<string>, tokens: ReturnType<typeof tokenRollup>) {
  const aiAssistedPrs = prs.filter((pr) => pr.ai_assisted || links.has(`${pr.repo}#${pr.number}`)).length;
  const mergeDurations = prs.map((pr) => pr.merged_at ? (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3_600_000 : null).filter((value): value is number => value !== null && value >= 0);
  const sizeBuckets = { S: 0, M: 0, L: 0 };
  for (const pr of prs) if (pr.size_bucket) sizeBuckets[pr.size_bucket] += 1;
  const countersCaptured = tokens.counterStatus === 'captured';
  return {
    mergedPrs: prs.length,
    aiAssistedPrs,
    aiPrRate: prs.length ? (aiAssistedPrs / prs.length) * 100 : null,
    verifiedLinkedPrs: links.size,
    avgMergeHours: mergeDurations.length ? mergeDurations.reduce((a, b) => a + b, 0) / mergeDurations.length : null,
    avgTokensPerMergedPr: countersCaptured && prs.length ? tokens.total / prs.length : null,
    costPerMergedPr: tokens.costUsd !== null && prs.length ? tokens.costUsd / prs.length : null,
    costPerAiPr: tokens.costUsd !== null && aiAssistedPrs ? tokens.costUsd / aiAssistedPrs : null,
    sizeBuckets,
    unclassifiedPrs: prs.filter((pr) => !pr.size_bucket).length,
  };
}

export async function getAnalytics(scope: Scope, filter: AnalyticsFilter = {}, period: Period = 'monthly'): Promise<AnalyticsSnapshot> {
  const db = createAdminClient();
  const functionId = scope.kind === 'function' ? scope.id : scope.functionId;
  const processingPolicy = await getProcessingPolicy(functionId);
  const days = periodDays(period);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // Calendar-aligned windows make the daily view become comparable on the next
  // measurement day instead of requiring a full rolling 48 hours. Weekly/monthly
  // views retain complete 7/30-day prior windows.
  const currentBoundary = new Date(todayUtc - (days - 1) * 86_400_000).toISOString();
  const previousBoundary = new Date(todayUtc - (days * 2 - 1) * 86_400_000).toISOString();
  const configuredSince = processingPolicy.measurementStartDate ? `${processingPolicy.measurementStartDate}T00:00:00.000Z` : null;
  const since = configuredSince && configuredSince > previousBoundary ? configuredSince : previousBoundary;
  const comparisonAvailable = !configuredSince || configuredSince <= previousBoundary;
  let sessionsQuery = db.from('cc_sessions').select('provider,model,tokens_in,tokens_out,cache_read,cache_creation,cost_usd,ts').eq('function_id', functionId).gte('ts', since);
  let prsQuery = db.from('gh_prs').select('repo,number,created_at,merged_at,is_merged,ai_assisted,size_bucket').eq('function_id', functionId).eq('is_merged', true).gte('merged_at', since);
  let indexQuery = db.from('index_daily').select('date,l1,l2_usage,l2_eff,l2_effness,l2_prof,confidence,config_version').eq('function_id', functionId).eq('scope', scope.kind).eq('scope_id', scope.id).order('date', { ascending: false }).limit(40);
  // Link membership belongs to the PR's merge window, not the time the link event
  // happened to reach Prism. Fetch the scoped associations and intersect them below.
  let linksQuery = db.from('pr_link_ingest').select('repo,pr_number,employee_id,provider,received_at').eq('function_id', functionId);
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

  const sessions = ((sessionsResult.data ?? []) as Omit<SessionRow, 'tokensApproved'>[]).filter((row) => processingPolicy.enabled(row.provider === 'codex' ? 'llm.session_metadata' : 'claude.session_metadata')).map((row): SessionRow => {
    const includeTokens = processingPolicy.enabled(row.provider === 'codex' ? 'llm.token_usage' : 'claude.token_usage');
    return includeTokens ? { ...row, tokensApproved: true } : { ...row, tokens_in: 0, tokens_out: 0, cache_read: 0, cache_creation: 0, cost_usd: null, tokensApproved: false };
  });
  const prs = (prsResult.data ?? []) as PrRow[];
  const linkRows = ((linksResult.data ?? []) as LinkRow[]).filter((row) => processingPolicy.enabled(row.provider === 'codex' ? 'llm.pr_link' : 'claude.pr_link'));
  const currentSessions = sessions.filter((row) => row.ts >= currentBoundary);
  const previousSessions = sessions.filter((row) => row.ts < currentBoundary);
  const currentPrs = prs.filter((row) => (row.merged_at ?? '') >= currentBoundary);
  const previousPrs = prs.filter((row) => (row.merged_at ?? '') < currentBoundary);
  const allLinks = new Set(linkRows.map((row) => `${row.repo}#${row.pr_number}`));
  const currentLinks = new Set(currentPrs.map((row) => `${row.repo}#${row.number}`).filter((key) => allLinks.has(key)));
  const previousLinks = new Set(previousPrs.map((row) => `${row.repo}#${row.number}`).filter((key) => allLinks.has(key)));
  const currentToken = tokenRollup(currentSessions);
  const previousToken = tokenRollup(previousSessions);
  const currentDelivery = deliveryRollup(currentPrs, currentLinks, currentToken);
  const previousDelivery = deliveryRollup(previousPrs, previousLinks, previousToken);
  const previousProviderMap = new Map<string, { sessions: number; totalTokens: number }>();
  for (const row of previousSessions) {
    const key = `${row.provider ?? 'unknown'}:${row.model ?? 'model unavailable'}`;
    const previous = previousProviderMap.get(key) ?? { sessions: 0, totalTokens: 0 };
    previous.sessions += 1;
    previous.totalTokens += Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0) + Number(row.cache_read ?? 0) + Number(row.cache_creation ?? 0);
    previousProviderMap.set(key, previous);
  }
  const providerMap = new Map<string, AnalyticsSnapshot['token']['providers'][number]>();
  for (const row of currentSessions) {
    const provider = row.provider ?? 'unknown'; const model = row.model ?? 'model unavailable'; const key = `${provider}:${model}`;
    const previous = previousProviderMap.get(key);
    const current = providerMap.get(key) ?? { provider, model, sessions: 0, totalTokens: 0, costUsd: row.cost_usd === null ? null : 0, counterStatus: 'no_sessions' as TokenCounterStatus, previousSessions: comparisonAvailable ? previous?.sessions ?? 0 : null, previousTotalTokens: comparisonAvailable ? previous?.totalTokens ?? 0 : null };
    current.sessions += 1; current.totalTokens += Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0) + Number(row.cache_read ?? 0) + Number(row.cache_creation ?? 0);
    if (row.cost_usd !== null) current.costUsd = (current.costUsd ?? 0) + Number(row.cost_usd);
    providerMap.set(key, current);
  }
  for (const [key, row] of providerMap) {
    const providerRows = currentSessions.filter((session) => `${session.provider ?? 'unknown'}:${session.model ?? 'model unavailable'}` === key);
    row.counterStatus = counterStatus(providerRows);
  }
  // Preserve providers that existed only in the prior period so a drop to zero
  // remains visible instead of silently removing the row.
  if (comparisonAvailable) {
    for (const [key, previous] of previousProviderMap) {
      if (providerMap.has(key)) continue;
      const separator = key.indexOf(':');
      providerMap.set(key, {
        provider: key.slice(0, separator),
        model: key.slice(separator + 1),
        sessions: 0,
        totalTokens: 0,
        costUsd: null,
        counterStatus: 'no_sessions',
        previousSessions: previous.sessions,
        previousTotalTokens: previous.totalTokens,
      });
    }
  }

  const indexRows = (indexResult.data ?? []) as Array<{ date: string; l1: number | string | null; l2_usage: number | string | null; l2_eff: number | string | null; l2_effness: number | string | null; l2_prof: number | string | null; confidence: string; config_version: number }>;
  const current = indexRows[0] ?? null;
  const baselineDate = current ? new Date(`${current.date}T00:00:00.000Z`).getTime() - days * 86_400_000 : null;
  const previous = baselineDate === null ? null : indexRows.find((row) => new Date(`${row.date}T00:00:00.000Z`).getTime() <= baselineDate) ?? null;
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
    token: { sessions: currentToken.sessions, total: currentToken.total, input: currentToken.input, output: currentToken.output, cacheRead: currentToken.cacheRead, cacheCreation: currentToken.cacheCreation, costUsd: currentToken.costUsd, counterStatus: currentToken.counterStatus, providers: [...providerMap.values()].sort((a, b) => b.totalTokens - a.totalTokens) },
    delivery: currentDelivery,
    movement: {
      current: currentL1, previous: previousL1, delta: currentL1 !== null && previousL1 !== null ? currentL1 - previousL1 : null,
      previousDate: previous?.date ?? null, currentDate: current?.date ?? null,
      configChanged: Boolean(current && previous && current.config_version !== previous.config_version),
      confidenceChanged: Boolean(current && previous && current.confidence !== previous.confidence),
      contributions,
    },
    comparison: {
      available: comparisonAvailable,
      label: periodLabel(period),
      windowLabel: period === 'daily' ? 'current day' : period === 'weekly' ? 'current 7 days' : 'current 30 days',
      token: {
        sessions: previousToken.sessions,
        total: previousToken.counterStatus === 'captured' || previousToken.counterStatus === 'no_sessions' ? previousToken.total : null,
        input: previousToken.counterStatus === 'captured' || previousToken.counterStatus === 'no_sessions' ? previousToken.input : null,
        output: previousToken.counterStatus === 'captured' || previousToken.counterStatus === 'no_sessions' ? previousToken.output : null,
        cacheRead: previousToken.counterStatus === 'captured' || previousToken.counterStatus === 'no_sessions' ? previousToken.cacheRead : null,
        cacheCreation: previousToken.counterStatus === 'captured' || previousToken.counterStatus === 'no_sessions' ? previousToken.cacheCreation : null,
        costUsd: previousToken.costUsd,
      },
      delivery: {
        mergedPrs: previousDelivery.mergedPrs,
        aiAssistedPrs: previousDelivery.aiAssistedPrs,
        aiPrRate: previousDelivery.aiPrRate,
        verifiedLinkedPrs: previousDelivery.verifiedLinkedPrs,
        avgMergeHours: previousDelivery.avgMergeHours,
        avgTokensPerMergedPr: previousDelivery.avgTokensPerMergedPr,
        sizeBuckets: previousDelivery.sizeBuckets,
      },
    },
  };
}
