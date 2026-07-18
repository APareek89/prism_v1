// Admin-only read model for explaining one live score from raw evidence through the
// existing deterministic engine. This module never persists and never reimplements
// scoring: it reuses assembleMembers() + computeDaily(), then annotates their output.

import { createAdminClient } from '@/lib/supabase/admin';
import { assembleMembers } from '@/lib/pipeline/assemble';
import { computeDaily } from '@/lib/scoring/compute-daily';
import { resolveScoringConfig } from '@/lib/scoring/config';
import { INTRA_WEIGHTS } from '@/lib/scoring/constants';
import type {
  Dimension,
  IndexResult,
  KpiAnchor,
  KpiId,
  KpiNormalized,
  ScoringConfig,
} from '@/lib/scoring/types';

const DAY_MS = 86_400_000;
const DIMENSIONS: Dimension[] = ['usage', 'efficiency', 'effectiveness', 'proficiency'];

const KPI_COPY: Record<KpiId, { label: string; formula: string; source: string }> = {
  ai_assisted_pr_share: {
    label: 'AI-assisted PR share',
    formula: 'merged PRs with confirmed AI evidence ÷ all merged PRs',
    source: 'scoring/kpis/usage.ts',
  },
  agentic_depth_share: {
    label: 'Agentic-depth share',
    formula: 'merged PRs with ≥50% AI-originated accepted hunks ÷ merged PRs',
    source: 'scoring/kpis/usage.ts',
  },
  tool_session_cadence: {
    label: 'Tool-session cadence',
    formula: 'distinct AI coding days ÷ observed working days',
    source: 'scoring/kpis/usage.ts',
  },
  ai_iterations_to_merge: {
    label: 'AI iterations to merge',
    formula: 'mean session turns per linked merged PR, compared within S/M/L buckets',
    source: 'scoring/kpis/efficiency.ts',
  },
  suggestion_acceptance_rate: {
    label: 'Suggestion acceptance',
    formula: 'accepted code-edit suggestions ÷ suggestions offered',
    source: 'scoring/kpis/efficiency.ts',
  },
  tokens_to_shipped: {
    label: 'Tokens to shipped',
    formula: 'input + output tokens ÷ merged PRs (lower is better)',
    source: 'scoring/kpis/efficiency.ts',
  },
  merged_without_revert_rate: {
    label: 'Merged without revert',
    formula: '1 − non-self reverts within 14 days ÷ AI-linked merged PRs',
    source: 'scoring/kpis/effectiveness.ts',
  },
  ai_code_retention_30d: {
    label: 'AI code retention at 30 days',
    formula: 'AI-attributed lines still alive at 30 days ÷ AI lines merged',
    source: 'scoring/kpis/effectiveness.ts',
  },
  change_failure_rate: {
    label: 'Change failure rate',
    formula: 'failed AI-assisted deploys ÷ AI-assisted deploys (lower is better)',
    source: 'scoring/kpis/effectiveness.ts',
  },
  defect_rework_rate: {
    label: 'Defect rework rate',
    formula: 'fix follow-ups on the same hunks within 14 days ÷ merged PRs',
    source: 'scoring/kpis/effectiveness.ts',
  },
  effective_skill_leverage: {
    label: 'Effective skill leverage',
    formula: '30-day retention on skill-using PRs − retention on other PRs',
    source: 'scoring/kpis/proficiency.ts',
  },
  distinct_skills_authored: {
    label: 'Distinct skills authored',
    formula: 'count of distinct authored skill or agent instruction files',
    source: 'scoring/kpis/proficiency.ts',
  },
  multiplier_signal: {
    label: 'Multiplier signal',
    formula: 'authored skills used by at least one other engineer',
    source: 'scoring/kpis/proficiency.ts',
  },
};

export interface TraceKpi {
  id: KpiId;
  label: string;
  formula: string;
  source: string;
  raw: number | null;
  normalized: number | null;
  signals: number;
  inverted: boolean;
  anchor: KpiAnchor;
  configuredWeightPct: number;
  effectiveVotePct: number;
  contribution: number | null;
}

export interface TraceDimension {
  id: Dimension;
  score: number | null;
  signals: number;
  minSignals: number;
  metMinSignal: boolean;
  configuredWeightPct: number;
  effectiveVotePct: number;
  contributionToL1: number | null;
  kpis: TraceKpi[];
}

export interface CalculationBreakdown {
  l1: number | null;
  band: string;
  confidenceScore: number;
  confidenceBand: string;
  suppressesL1: boolean;
  cohortSize: number;
  cohortPenaltyApplied: boolean;
  aiActiveShare: number | null;
  multiplierSignal: number;
  tokensPerPr: number | null;
  configVersion: string;
  dimensions: TraceDimension[];
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Presentation-only expansion of the engine result; summed contributions equal engine L1/L2. */
export function buildCalculationBreakdown(
  result: IndexResult,
  config: ScoringConfig,
  cohortSize: number,
): CalculationBreakdown {
  const scoredDimensionWeight = DIMENSIONS.reduce(
    (sum, dimension) => sum + (result.l2[dimension].score === null ? 0 : config.weights[dimension]),
    0,
  );

  const dimensions = DIMENSIONS.map((dimension): TraceDimension => {
    const l2 = result.l2[dimension];
    const scoredKpiWeight = l2.kpis.reduce(
      (sum, kpi) => sum + (kpi.norm === null ? 0 : INTRA_WEIGHTS[kpi.kpiId]),
      0,
    );
    const kpis = l2.kpis.map((kpi: KpiNormalized): TraceKpi => {
      const configuredWeight = INTRA_WEIGHTS[kpi.kpiId];
      const effectiveWeight = kpi.norm === null || scoredKpiWeight === 0
        ? 0
        : configuredWeight / scoredKpiWeight;
      return {
        id: kpi.kpiId,
        label: KPI_COPY[kpi.kpiId].label,
        formula: KPI_COPY[kpi.kpiId].formula,
        source: KPI_COPY[kpi.kpiId].source,
        raw: kpi.value,
        normalized: kpi.norm,
        signals: kpi.signals,
        inverted: kpi.inverted,
        anchor: kpi.anchor,
        configuredWeightPct: round(configuredWeight * 100, 1),
        effectiveVotePct: round(effectiveWeight * 100, 1),
        contribution: kpi.norm === null ? null : round(kpi.norm * effectiveWeight),
      };
    });
    const effectiveDimensionWeight = l2.score === null || scoredDimensionWeight === 0
      ? 0
      : config.weights[dimension] / scoredDimensionWeight;
    return {
      id: dimension,
      score: l2.score,
      signals: l2.signals,
      minSignals: config.minSignals[dimension],
      metMinSignal: l2.metMinSignal,
      configuredWeightPct: round(config.weights[dimension] * 100, 1),
      effectiveVotePct: round(effectiveDimensionWeight * 100, 1),
      contributionToL1: l2.score === null ? null : round(l2.score * effectiveDimensionWeight),
      kpis,
    };
  });

  return {
    l1: result.l1,
    band: result.band,
    confidenceScore: result.confidence.score,
    confidenceBand: result.confidence.band,
    suppressesL1: result.confidence.shouldSuppressL1,
    cohortSize,
    cohortPenaltyApplied: result.confidence.cohortPenaltyApplied,
    aiActiveShare: result.aiActiveShare,
    multiplierSignal: result.multiplierSignal,
    tokensPerPr: result.tokensPerPr.tokensPerPr,
    configVersion: result.configVersion,
    dimensions,
  };
}

type DbResult = Promise<{ data: unknown; error: { message?: string } | null }>;
interface Query extends DbResult {
  eq: (column: string, value: unknown) => Query;
  gte: (column: string, value: unknown) => Query;
  lte: (column: string, value: unknown) => Query;
  order: (column: string, options?: { ascending?: boolean }) => Query;
  limit: (count: number) => Query;
}
interface Table { select: (columns: string) => Query }
interface LooseDb { from: (table: string) => Table }

function db(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}

async function read(query: Query, label: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message ?? 'query failed'}`);
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function asNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function asNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : asNumber(value);
}

export interface TracePerson {
  id: string;
  name: string;
  email: string | null;
  githubHandle: string | null;
}

export interface TracePr {
  id: string;
  repo: string;
  number: number;
  title: string;
  createdAt: string | null;
  mergedAt: string | null;
  merged: boolean;
  aiAssisted: boolean;
  files: number;
  hunks: number;
  modules: number;
  blast: number;
  sizeScore: number;
  sizeBucket: string | null;
  revertedAt: string | null;
}

export interface TraceCommit {
  sha: string;
  repo: string;
  prNumber: number | null;
  timestamp: string | null;
  aiAssisted: boolean;
  hasAiTrailer: boolean;
  effect: string;
}

export interface TraceSession {
  sessionId: string;
  provider: string;
  timestamp: string | null;
  turns: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  linkedPr: string | null;
  sourceEventCount: number;
}

export interface TraceLink {
  prId: string;
  sessionId: string;
  method: string;
  confidence: number;
}

export interface TraceAgentOutput {
  type: 'agent insight' | 'deterministic recommendation';
  title: string;
  body: string;
  dimension: string | null;
  impact: number | null;
  evidence: Record<string, unknown>;
}

export interface LiveCalculationTrace {
  date: string;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  person: TracePerson;
  people: TracePerson[];
  counts: {
    employees: number;
    prs: number;
    commits: number;
    sessions: number;
    links: number;
    agentOutputs: number;
  };
  member: CalculationBreakdown;
  function: CalculationBreakdown;
  prs: TracePr[];
  commits: TraceCommit[];
  sessions: TraceSession[];
  links: TraceLink[];
  agentOutputs: TraceAgentOutput[];
}

export async function getLiveCalculationTrace(args: {
  functionId: string;
  employeeId: string;
  date: string;
}): Promise<LiveCalculationTrace | null> {
  const { functionId, date } = args;
  const end = `${date}T23:59:59.999Z`;
  const start = new Date(Date.parse(`${date}T00:00:00.000Z`) - 27 * DAY_MS).toISOString();
  const database = db();

  const peopleRows = await read(
    database
      .from('employees')
      .select('id, name, email, github_handle, function_id, active, is_demo')
      .eq('function_id', functionId)
      .eq('active', true)
      .eq('is_demo', false)
      .order('name', { ascending: true }),
    'employees',
  );
  const people = peopleRows.map((row): TracePerson => ({
    id: String(row.id),
    name: String(row.name ?? 'Unknown'),
    email: asString(row.email),
    githubHandle: asString(row.github_handle),
  }));
  const person = people.find((candidate) => candidate.id === args.employeeId) ?? people[0];
  if (!person) return null;

  const assembled = await assembleMembers(functionId, date);
  const computed = computeDaily({
    date,
    functionId,
    members: assembled.members,
    sizingPrs: assembled.sizingPrs,
    config: assembled.config,
  });
  const memberResult = computed.members.find((candidate) => candidate.scopeId === person.id);
  if (!memberResult) return null;
  const config = resolveScoringConfig(assembled.config);

  const [prRows, commitRows, sessionRows, linkRows, insightRows, recommendationRows] =
    await Promise.all([
      read(
        database
          .from('gh_prs')
          .select('id, employee_id, repo, number, title, created_at, merged_at, is_merged, ai_assisted, files, hunks, modules, blast, size_score, size_bucket, reverted_at')
          .eq('function_id', functionId)
          .eq('employee_id', person.id)
          .order('created_at', { ascending: false })
          .limit(200),
        'gh_prs',
      ),
      read(
        database
          .from('gh_commits')
          .select('employee_id, repo, sha, pr_number, ts, ai_assisted, coauthor_trailer')
          .eq('function_id', functionId)
          .eq('employee_id', person.id)
          .gte('ts', start)
          .lte('ts', end)
          .order('ts', { ascending: false })
          .limit(300),
        'gh_commits',
      ),
      read(
        database
          .from('cc_sessions')
          .select('id, employee_id, session_id, provider, ts, turns, tokens_in, tokens_out, cache_read, linked_pr, source_event_count')
          .eq('function_id', functionId)
          .eq('employee_id', person.id)
          .gte('ts', start)
          .lte('ts', end)
          .order('ts', { ascending: false })
          .limit(200),
        'cc_sessions',
      ),
      read(
        database
          .from('pr_ai_link')
          .select('pr_id, cc_session_id, method, confidence, function_id')
          .eq('function_id', functionId)
          .order('created_at', { ascending: false })
          .limit(300),
        'pr_ai_link',
      ),
      read(
        database
          .from('insights')
          .select('date, scope, scope_id, kind, title, body, dimension, est_impact, evidence_jsonb')
          .eq('function_id', functionId)
          .eq('scope', 'employee')
          .eq('scope_id', person.id)
          .eq('date', date)
          .order('rank', { ascending: true }),
        'insights',
      ),
      read(
        database
          .from('recommendations')
          .select('employee_id, date, ref, rationale, evidence_jsonb')
          .eq('function_id', functionId)
          .eq('employee_id', person.id)
          .eq('date', date)
          .order('created_at', { ascending: false }),
        'recommendations',
      ),
    ]);

  const prs = prRows
    .filter((row) => {
      const created = asString(row.created_at) ?? '';
      const merged = asString(row.merged_at) ?? '';
      return (created >= start && created <= end) || (merged >= start && merged <= end);
    })
    .map((row): TracePr => ({
      id: String(row.id),
      repo: String(row.repo ?? ''),
      number: asNumber(row.number),
      title: String(row.title ?? 'Untitled pull request'),
      createdAt: asString(row.created_at),
      mergedAt: asString(row.merged_at),
      merged: row.is_merged === true,
      aiAssisted: row.ai_assisted === true,
      files: asNumber(row.files),
      hunks: asNumber(row.hunks),
      modules: asNumber(row.modules),
      blast: asNumber(row.blast),
      sizeScore: asNumber(row.size_score),
      sizeBucket: asString(row.size_bucket),
      revertedAt: asString(row.reverted_at),
    }));
  const prIds = new Set(prs.map((pr) => pr.id));
  const sessionIds = new Set(sessionRows.map((row) => String(row.id)));

  const commits = commitRows.map((row): TraceCommit => {
    const prNumber = asNullableNumber(row.pr_number);
    const aiAssisted = row.ai_assisted === true;
    return {
      sha: String(row.sha ?? ''),
      repo: String(row.repo ?? ''),
      prNumber,
      timestamp: asString(row.ts),
      aiAssisted,
      hasAiTrailer: asString(row.coauthor_trailer) !== null,
      effect: prNumber === null
        ? 'Recorded, but it will not vote until it belongs to a pull request.'
        : aiAssisted
          ? 'AI evidence for the linked PR; it can affect Usage and outcome KPIs after merge.'
          : 'Delivery evidence for the PR denominator; no AI attribution from this commit.',
    };
  });
  const sessions = sessionRows.map((row): TraceSession => ({
    sessionId: String(row.session_id ?? row.id),
    provider: String(row.provider ?? 'unknown'),
    timestamp: asString(row.ts),
    turns: asNumber(row.turns),
    tokensIn: asNumber(row.tokens_in),
    tokensOut: asNumber(row.tokens_out),
    cacheRead: asNumber(row.cache_read),
    linkedPr: asString(row.linked_pr),
    sourceEventCount: asNumber(row.source_event_count),
  }));
  const links = linkRows
    .filter((row) => prIds.has(String(row.pr_id)) || sessionIds.has(String(row.cc_session_id)))
    .map((row): TraceLink => ({
      prId: String(row.pr_id),
      sessionId: String(row.cc_session_id),
      method: String(row.method ?? 'unknown'),
      confidence: asNumber(row.confidence),
    }));
  const agentOutputs: TraceAgentOutput[] = [
    ...insightRows.map((row): TraceAgentOutput => ({
      type: 'agent insight',
      title: String(row.title ?? 'Insight'),
      body: String(row.body ?? ''),
      dimension: asString(row.dimension),
      impact: asNullableNumber(row.est_impact),
      evidence: typeof row.evidence_jsonb === 'object' && row.evidence_jsonb !== null
        ? (row.evidence_jsonb as Record<string, unknown>)
        : {},
    })),
    ...recommendationRows.map((row): TraceAgentOutput => ({
      type: 'deterministic recommendation',
      title: String(row.ref ?? 'Recommendation').replaceAll('-', ' '),
      body: String(row.rationale ?? ''),
      dimension: null,
      impact: null,
      evidence: typeof row.evidence_jsonb === 'object' && row.evidence_jsonb !== null
        ? (row.evidence_jsonb as Record<string, unknown>)
        : {},
    })),
  ];

  return {
    date,
    windowStart: start.slice(0, 10),
    windowEnd: date,
    generatedAt: new Date().toISOString(),
    person,
    people,
    counts: {
      employees: people.length,
      prs: prs.length,
      commits: commits.length,
      sessions: sessions.length,
      links: links.length,
      agentOutputs: agentOutputs.length,
    },
    member: buildCalculationBreakdown(memberResult, config, assembled.members.length),
    function: buildCalculationBreakdown(computed.function, config, assembled.members.length),
    prs,
    commits,
    sessions,
    links,
    agentOutputs,
  };
}
