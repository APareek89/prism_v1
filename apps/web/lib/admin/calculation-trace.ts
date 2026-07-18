// Admin-only read model for explaining one live score from raw evidence through the
// existing deterministic engine. This module never persists and never reimplements
// scoring: it reuses assembleMembers() + computeDaily(), then annotates their output.

import { createAdminClient } from '@/lib/supabase/admin';
import { assembleMembers } from '@/lib/pipeline/assemble';
import { computeDaily } from '@/lib/scoring/compute-daily';
import { resolveScoringConfig } from '@/lib/scoring/config';
import { computeL1 } from '@/lib/scoring/index-score';
import { applyAntiGaming } from '@/lib/scoring/anti-gaming';
import {
  BAND_THRESHOLDS,
  INTRA_WEIGHTS,
  L0_AI_ACTIVE_GATE,
  SMALL_COHORT_N,
  SUPPRESS_L1_BELOW,
} from '@/lib/scoring/constants';
import type {
  Dimension,
  IndexResult,
  KpiAnchor,
  KpiId,
  KpiNormalized,
  MemberRawRows,
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
  rawEquation: string;
  source: string;
  raw: number | null;
  normalized: number | null;
  signals: number;
  inverted: boolean;
  anchor: KpiAnchor;
  configuredWeightPct: number;
  effectiveVotePct: number;
  contribution: number | null;
  normalizationEquation: string;
  weightedEquation: string;
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
  confidenceWeightPct: number;
  availableKpiWeightPct: number;
  scoreEquation: string;
  l1ContributionEquation: string;
  kpis: TraceKpi[];
}

export interface CalculationBreakdown {
  l1: number | null;
  preConfidenceL1: number | null;
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
  availableDimensionWeightPct: number;
  l1Equation: string;
  confidenceEquation: string;
  publicationEquation: string;
  bandEquation: string;
  dimensions: TraceDimension[];
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function eqNumber(value: number | null | undefined, places = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'null';
  return Number(value.toFixed(places)).toString();
}

function normalizedEquation(kpi: KpiNormalized): string {
  if (kpi.value === null || kpi.norm === null) return 'No denominator → raw = null → normalized = null';
  const raw = eqNumber(kpi.value);
  const result = eqNumber(kpi.norm, 2);
  if (kpi.inverted) {
    const ceil = kpi.anchor.ceil;
    if (ceil === undefined) return 'Invalid inverted anchor → normalized = null';
    if (kpi.value <= kpi.anchor.target) {
      return `${raw} ≤ target ${eqNumber(kpi.anchor.target)} → normalized = 100 (cap at good)`;
    }
    if (kpi.value >= ceil) {
      return `${raw} ≥ ceiling ${eqNumber(ceil)} → normalized = 0`;
    }
    return `clamp[100 × (${eqNumber(ceil)} − ${raw}) ÷ (${eqNumber(ceil)} − ${eqNumber(kpi.anchor.target)})] = ${result}`;
  }
  const floor = kpi.anchor.floor;
  if (floor === undefined) return 'Invalid higher-is-better anchor → normalized = null';
  if (kpi.value >= kpi.anchor.target) {
    return `${raw} ≥ target ${eqNumber(kpi.anchor.target)} → normalized = 100 (cap at good)`;
  }
  if (kpi.value <= floor) return `${raw} ≤ floor ${eqNumber(floor)} → normalized = 0`;
  return `clamp[100 × (${raw} − ${eqNumber(floor)}) ÷ (${eqNumber(kpi.anchor.target)} − ${eqNumber(floor)})] = ${result}`;
}

function rawEvidenceEquations(input: MemberRawRows): Partial<Record<KpiId, string>> {
  const rows = applyAntiGaming(input);
  const merged = rows.prs.filter((pr) => pr.isMerged);
  const aiMerged = merged.filter((pr) => pr.aiLinked);
  const reverts = aiMerged.filter((pr) => pr.revertedWithin14d && !pr.isSelfRevert);
  const activeDays = new Set(rows.sessions.map((session) => session.day)).size;
  const offered = rows.sessions.reduce((sum, session) => sum + session.suggestionsOffered, 0);
  const accepted = rows.sessions.reduce((sum, session) => sum + session.suggestionsAccepted, 0);
  const tokens = rows.sessions.reduce((sum, session) => sum + session.tokensIn + session.tokensOut, 0);
  const linkedSessions = rows.sessions.filter((session) => session.linkedPrId !== null);
  const linkedTurns = linkedSessions.reduce((sum, session) => sum + session.turns, 0);
  const aiLinesMerged = aiMerged.reduce((sum, pr) => sum + pr.aiLinesMerged, 0);
  const aiLinesAlive = aiMerged.reduce((sum, pr) => sum + pr.aiLinesAliveAt30d, 0);
  const aiDeploys = rows.deploys.filter((deploy) => deploy.aiAssisted);
  const failedDeploys = aiDeploys.filter((deploy) => deploy.changeFailed);
  const rework = merged.filter((pr) => pr.defectReworkWithin14d);
  const skillNames = new Set(rows.skills.map((skill) => skill.skillName));
  const reusedSkills = rows.skills.filter((skill) => skill.usedByOthersCount >= 1);
  const skillOutputSessions = rows.sessions.filter(
    (session) => session.producedOutput && session.skillsUsed.length > 0 && session.linkedPrId,
  );

  return {
    ai_assisted_pr_share: `${aiMerged.length} AI-linked merged PRs ÷ ${merged.length} merged PRs`,
    agentic_depth_share: `${merged.filter((pr) => pr.agenticMajority).length} agentic-majority PRs ÷ ${merged.length} merged PRs`,
    tool_session_cadence: `${activeDays} distinct session days ÷ ${rows.meta.workingDays} working days`,
    ai_iterations_to_merge: `${linkedTurns} turns across ${linkedSessions.length} linked sessions; engine averages turns/PR inside S/M/L, then averages populated buckets`,
    suggestion_acceptance_rate: `${accepted} accepted suggestions ÷ ${offered} offered suggestions`,
    tokens_to_shipped: `${tokens} measured input+output tokens ÷ ${merged.length} merged PRs`,
    merged_without_revert_rate: `1 − (${reverts.length} non-self reverts ÷ ${aiMerged.length} AI-linked merged PRs)`,
    ai_code_retention_30d: `${aiLinesAlive} AI-attributed lines alive ÷ ${aiLinesMerged} AI-attributed lines merged`,
    change_failure_rate: `${failedDeploys.length} failed AI deploys ÷ ${aiDeploys.length} AI deploys`,
    defect_rework_rate: `${rework.length} merged PRs with same-hunk fix follow-up ÷ ${merged.length} merged PRs`,
    effective_skill_leverage: `${skillOutputSessions.length} linked output sessions used a skill; engine subtracts non-skill PR retention from skill-PR retention`,
    distinct_skills_authored: `${skillNames.size} distinct authored skill/instruction files`,
    multiplier_signal: `${reusedSkills.length} authored skills used by at least one other engineer`,
  };
}

/** Presentation-only expansion of the engine result; summed contributions equal engine L1/L2. */
export function buildCalculationBreakdown(
  result: IndexResult,
  config: ScoringConfig,
  cohortSize: number,
  rawEquations: Partial<Record<KpiId, string>> = {},
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
      const contribution = kpi.norm === null ? null : kpi.norm * effectiveWeight;
      return {
        id: kpi.kpiId,
        label: KPI_COPY[kpi.kpiId].label,
        formula: KPI_COPY[kpi.kpiId].formula,
        rawEquation: rawEquations[kpi.kpiId] ?? `Engine raw value = ${eqNumber(kpi.value)}`,
        source: KPI_COPY[kpi.kpiId].source,
        raw: kpi.value,
        normalized: kpi.norm,
        signals: kpi.signals,
        inverted: kpi.inverted,
        anchor: kpi.anchor,
        configuredWeightPct: round(configuredWeight * 100, 1),
        effectiveVotePct: round(effectiveWeight * 100, 1),
        contribution: contribution === null ? null : round(contribution),
        normalizationEquation: normalizedEquation(kpi),
        weightedEquation: kpi.norm === null
          ? 'normalized = null → excluded from the L2 numerator and denominator'
          : `(${eqNumber(kpi.norm, 2)} × ${eqNumber(configuredWeight)}) ÷ ${eqNumber(scoredKpiWeight)} = ${eqNumber(contribution, 2)} L2 points`,
      };
    });
    const effectiveDimensionWeight = l2.score === null || scoredDimensionWeight === 0
      ? 0
      : config.weights[dimension] / scoredDimensionWeight;
    const l2Numerator = l2.kpis.reduce(
      (sum, kpi) => sum + (kpi.norm === null ? 0 : kpi.norm * INTRA_WEIGHTS[kpi.kpiId]),
      0,
    );
    const l2Terms = l2.kpis
      .filter((kpi) => kpi.norm !== null)
      .map((kpi) => `${eqNumber(kpi.norm, 2)}×${eqNumber(INTRA_WEIGHTS[kpi.kpiId])}`)
      .join(' + ');
    const l1Contribution = l2.score === null ? null : l2.score * effectiveDimensionWeight;
    return {
      id: dimension,
      score: l2.score,
      signals: l2.signals,
      minSignals: config.minSignals[dimension],
      metMinSignal: l2.metMinSignal,
      configuredWeightPct: round(config.weights[dimension] * 100, 1),
      effectiveVotePct: round(effectiveDimensionWeight * 100, 1),
      contributionToL1: l1Contribution === null ? null : round(l1Contribution),
      confidenceWeightPct: l2.metMinSignal ? round(config.weights[dimension] * 100, 1) : 0,
      availableKpiWeightPct: round(scoredKpiWeight * 100, 1),
      scoreEquation: l2.score === null
        ? 'No normalized KPI values → L2 = null'
        : `(${l2Terms || '0'}) ÷ ${eqNumber(scoredKpiWeight)} = ${eqNumber(l2Numerator / scoredKpiWeight, 2)}`,
      l1ContributionEquation: l2.score === null
        ? 'L2 = null → dimension weight removed from L1 denominator'
        : `(${eqNumber(l2.score, 2)} × ${eqNumber(config.weights[dimension])}) ÷ ${eqNumber(scoredDimensionWeight)} = ${eqNumber(l1Contribution, 2)} L1 points`,
      kpis,
    };
  });

  const preConfidenceL1 = result.scope === 'function' ? result.l1 : computeL1(result.l2, config);
  const l1Terms = dimensions
    .filter((dimension) => dimension.score !== null)
    .map((dimension) => `${eqNumber(dimension.score, 2)}×${eqNumber(config.weights[dimension.id])}`)
    .join(' + ');
  const qualifying = dimensions
    .filter((dimension) => dimension.metMinSignal)
    .map((dimension) => `${dimension.id} ${eqNumber(config.weights[dimension.id] * 100, 1)}%`);
  const numericBand = preConfidenceL1 === null
    ? 'none'
    : (BAND_THRESHOLDS.find((threshold) => preConfidenceL1 >= threshold.min)?.band ?? 'L1');
  const bandEquation = result.aiActiveShare === null || result.aiActiveShare < L0_AI_ACTIVE_GATE
    ? `AI-active share ${eqNumber(result.aiActiveShare)} < ${L0_AI_ACTIVE_GATE} → L0 gate → ${result.band}`
    : result.l1 === null
      ? `Published L1 is null → L0 → ${result.band}`
      : numericBand === 'L5' && result.multiplierSignal <= 0
        ? `numeric ${numericBand} from L1 ${eqNumber(preConfidenceL1, 2)}, but multiplier signal = 0 → cap at ${result.band}`
        : `L1 ${eqNumber(preConfidenceL1, 2)} → numeric ${numericBand}; gates pass → ${result.band}`;

  return {
    l1: result.l1,
    preConfidenceL1,
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
    availableDimensionWeightPct: round(scoredDimensionWeight * 100, 1),
    l1Equation: result.scope === 'function'
      ? `Function L1 is the median of publishable employee L1 values = ${eqNumber(result.l1, 2)}`
      : preConfidenceL1 === null
        ? 'No scored dimensions → pre-confidence L1 = null'
        : `(${l1Terms || '0'}) ÷ ${eqNumber(scoredDimensionWeight)} = ${eqNumber(preConfidenceL1, 2)}`,
    confidenceEquation: `${qualifying.join(' + ') || 'no dimension met its minimum'} = ${eqNumber(result.confidence.score * 100, 1)}% numeric confidence${cohortSize < SMALL_COHORT_N ? `; N=${cohortSize}<${SMALL_COHORT_N} drops the label one band` : ''}`,
    publicationEquation: `${eqNumber(result.confidence.score, 2)} ${result.confidence.score < SUPPRESS_L1_BELOW ? '<' : '≥'} ${SUPPRESS_L1_BELOW} → published L1 = ${eqNumber(result.l1, 2)}`,
    bandEquation,
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
  id: string;
  connectionId: string | null;
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

export interface TracePrLinkEvidence {
  id: string;
  provider: string;
  sessionId: string;
  repo: string;
  prNumber: number;
  sha: string | null;
  branch: string | null;
  source: string;
  verifiedAt: string | null;
  receivedAt: string | null;
  linkState: 'linked at 0.99' | 'session pending' | 'pipeline pending';
  linkedPrId: string | null;
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
    prLinkEvidence: number;
    links: number;
    agentOutputs: number;
  };
  member: CalculationBreakdown;
  function: CalculationBreakdown;
  prs: TracePr[];
  commits: TraceCommit[];
  sessions: TraceSession[];
  prLinkEvidence: TracePrLinkEvidence[];
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

  const [prRows, commitRows, sessionRows, prLinkEvidenceRows, linkRows, insightRows, recommendationRows] =
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
          .select('id, employee_id, connection_id, session_id, provider, ts, turns, tokens_in, tokens_out, cache_read, linked_pr, source_event_count')
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
          .from('pr_link_ingest')
          .select('id, employee_id, connection_id, provider, source_session_id, repo, pr_number, sha, branch, source, github_verified_at, received_at')
          .eq('function_id', functionId)
          .eq('employee_id', person.id)
          .gte('received_at', start)
          .lte('received_at', end)
          .order('received_at', { ascending: false })
          .limit(200),
        'pr_link_ingest',
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
    id: String(row.id),
    connectionId: asString(row.connection_id),
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
  const prLinkEvidence = prLinkEvidenceRows.map((row): TracePrLinkEvidence => {
    const connectionId = asString(row.connection_id);
    const sourceSessionId = String(row.source_session_id ?? '');
    const session = sessions.find(
      (candidate) => candidate.connectionId === connectionId && candidate.sessionId === sourceSessionId,
    );
    const pr = prs.find(
      (candidate) => candidate.repo.toLowerCase() === String(row.repo ?? '').toLowerCase()
        && candidate.number === asNumber(row.pr_number),
    );
    const linked = session && pr
      ? links.find((candidate) => candidate.sessionId === session.id && candidate.prId === pr.id && candidate.method === 'pr_link')
      : null;
    return {
      id: String(row.id),
      provider: String(row.provider ?? 'unknown'),
      sessionId: sourceSessionId,
      repo: String(row.repo ?? ''),
      prNumber: asNumber(row.pr_number),
      sha: asString(row.sha),
      branch: asString(row.branch),
      source: String(row.source ?? 'unknown'),
      verifiedAt: asString(row.github_verified_at),
      receivedAt: asString(row.received_at),
      linkState: linked ? 'linked at 0.99' : session ? 'pipeline pending' : 'session pending',
      linkedPrId: linked?.prId ?? null,
    };
  });
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
      prLinkEvidence: prLinkEvidence.length,
      links: links.length,
      agentOutputs: agentOutputs.length,
    },
    member: buildCalculationBreakdown(
      memberResult,
      config,
      assembled.members.length,
      rawEvidenceEquations(
        assembled.members.find((member) => member.meta.memberId === person.id) ?? {
          meta: { memberId: person.id, workingDays: 0 },
          prs: [], sessions: [], deploys: [], skills: [],
        },
      ),
    ),
    function: buildCalculationBreakdown(computed.function, config, assembled.members.length),
    prs,
    commits,
    sessions,
    prLinkEvidence,
    links,
    agentOutputs,
  };
}
