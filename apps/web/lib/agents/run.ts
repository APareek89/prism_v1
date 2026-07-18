// lib/agents/run.ts
//
// The agent-layer entry points. Assemble the deterministic InsightState for each scope,
// run the LangGraph, and PERSIST the narrative into `insights` via the SERVICE-ROLE
// client — idempotent on the unique slot (date, scope, scope_id, kind, rank).
//
// The determinism boundary holds end-to-end here: every NUMBER written to a row
// (est_impact, rank, the PR verdict class, the evidence values) is computed in code
// (assemble.ts / classifyPr); the LLM contributed only title/body/reason/fix, already
// grounding-checked in the nodes. A dropped (ungrounded) item simply isn't in the graph
// output, so it's never persisted.
//
// Exports (per spec): runInsightsForScope(functionId, date), runPrLevel(functionId, date).
//
// SERVER-ONLY (RLS-bypassing insight writes).

import { createAdminClient } from '@/lib/supabase/admin';
import type { Dimension } from '@/lib/scoring/types';
import { assembleScope, assemblePrLevel, loadNarrativeConfig, type AssembledScope } from './assemble';
import { scopeGraph, prLevelGraph } from './graph';
import type { InsightStateType, PrRecord } from './state';
import type { AgentInsight } from '@/lib/types/agents';

// ─────────────────────────────────────────────────────────────────────────────
// Loose admin surface (upsert + delete + read employees). Same pattern as persist.ts.
// ─────────────────────────────────────────────────────────────────────────────
type MutResult = Promise<{ data: unknown; error: { message?: string } | null }>;
interface LooseTable {
  upsert: (rows: unknown, opts?: { onConflict?: string }) => MutResult;
  select: (cols: string) => LooseChain;
  delete: () => LooseChain;
}
interface LooseChain extends MutResult {
  eq: (col: string, val: unknown) => LooseChain;
  in: (col: string, vals: readonly unknown[]) => LooseChain;
}
interface LooseDb {
  from: (table: string) => LooseTable;
}
function looseDb(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─────────────────────────────────────────────────────────────────────────────
// Row builder (the persisted insight row — validated cols in 0012/0030)
//
// AgentKind → DB insights.kind mapping is applied inline per-block in runOneScope:
//   improvement_area → 'improvement', change_governance → 'change',
//   improvement_attribution → 'attribution'. pr_level flows through runPrLevel.
// ─────────────────────────────────────────────────────────────────────────────

interface InsightWriteRow {
  function_id: string;
  date: string;
  scope: 'function' | 'employee';
  scope_id: string;
  kind: string;
  rank: number;
  title: string;
  body: string;
  dimension: string | null;
  est_impact: number | null;
  pr_id: string | null;
  evidence_jsonb: Record<string, unknown>;
}

/** Evidence payload persisted alongside each row (the ids the narrative cited). */
function evidenceJsonb(refs: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { refs, ...extra };
}

const INSIGHT_TRACE_VERSION = 'insight-trace-v1';

function traceJsonb(
  state: InsightStateType,
  insight: AgentInsight,
  candidate: Record<string, unknown>,
): Record<string, unknown> {
  const evidence = state.evidence
    .filter((row) => insight.evidenceRefs.includes(row.id))
    .map((row) => ({ id: row.id, label: row.label, value: row.value, source: row.source ?? 'employee' }));
  const privacy = state.scope === 'function'
    ? 'Organization aggregate only; employee identities and employee narratives excluded.'
    : 'Private employee scope; visible only through the configured authorization boundary.';
  const confidenceReason = `${state.confidenceBand} scope confidence; ${evidence.length} cited evidence row${evidence.length === 1 ? '' : 's'} passed the grounding gate.`;
  return evidenceJsonb(insight.evidenceRefs, {
    traceVersion: INSIGHT_TRACE_VERSION,
    scope: { type: state.scope, id: state.scopeId, privacy },
    candidate,
    output: insight.analysis,
    confidence: { band: state.confidenceBand, score: state.confidence, reason: confidenceReason },
    evidence,
    validation: insight.validation,
    stages: [
      { id: 'evidence_assembly', owner: 'deterministic_code', status: 'accepted', detail: `${state.evidence.length} typed evidence rows assembled.` },
      { id: 'candidate_ranking', owner: 'deterministic_code', status: 'accepted', detail: 'Candidate selected and ranked from measured KPI gaps or strengths.' },
      { id: 'analyst_narration', owner: 'bounded_llm', status: 'accepted', detail: 'Structured coaching contract produced; no score or priority computed.' },
      { id: 'grounding_verification', owner: 'deterministic_code', status: insight.validation.status, detail: `${insight.validation.attempts} attempt${insight.validation.attempts === 1 ? '' : 's'}; every quoted number and evidence reference checked.` },
      { id: 'alternative_check', owner: 'bounded_llm_plus_schema', status: insight.analysis.alternativeExplanation ? 'accepted' : 'rejected', detail: 'A plausible confounder is required before publication.' },
      { id: 'selection', owner: 'deterministic_code', status: 'accepted', detail: 'Coherent grounded output persisted in its idempotent scope/date/rank slot.' },
    ],
  });
}

export interface AgentRunResult {
  ok: boolean;
  functionId: string;
  date: string;
  scopesProcessed: number;
  insightsWritten: number;
  prLevelWritten: number;
  skipped: string[];
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// runInsightsForScope — function + every employee scope
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate + persist improvement / change / attribution insights for a function AND each
 * of its active employees on a run date. Idempotent: each (date, scope, scope_id, kind,
 * rank) slot is upserted, so a re-run replaces rather than duplicates.
 */
export async function runInsightsForScope(
  functionId: string,
  date: string,
): Promise<AgentRunResult> {
  const errors: string[] = [];
  const skipped: string[] = [];
  let insightsWritten = 0;
  let scopesProcessed = 0;
  let consecutiveScopeFailures = 0;

  const config = await loadNarrativeConfig(functionId, date);
  const scopes = await listScopes(functionId);

  for (const s of scopes) {
    try {
      const assembled = await assembleScope(functionId, s.scope, s.scopeId, date, config);
      if (!assembled.hasSignal) {
        const cleared = await replaceScopeInsights([], s.scope, s.scopeId, date);
        if (cleared.error) throw new Error(cleared.error);
        skipped.push(`${s.scope}:${s.scopeId} (no signal)`);
        consecutiveScopeFailures = 0;
        continue;
      }
      scopesProcessed += 1;
      const rows = await runOneScope(functionId, assembled);
      const w = await replaceScopeInsights(rows, s.scope, s.scopeId, date);
      insightsWritten += w.written;
      if (w.error) throw new Error(w.error);
      consecutiveScopeFailures = 0;
    } catch (e) {
      errors.push(`${s.scope}:${s.scopeId}: ${errMsg(e)}`);
      consecutiveScopeFailures += 1;
      if (consecutiveScopeFailures >= 2) {
        skipped.push('remaining insight scopes (circuit breaker after consecutive failures)');
        break;
      }
    }
  }

  return {
    ok: errors.length === 0,
    functionId,
    date,
    scopesProcessed,
    insightsWritten,
    prLevelWritten: 0,
    skipped,
    errors,
  };
}

/** Run the scope graph and map its narrative output to persistable rows (numbers in code). */
async function runOneScope(
  functionId: string,
  assembled: AssembledScope,
): Promise<InsightWriteRow[]> {
  const finalState = (await scopeGraph().invoke(assembled.state)) as InsightStateType;
  const rows: InsightWriteRow[] = [];
  const { scopeId, date } = finalState;
  // assembleScope only ever produces 'function' | 'employee' (never 'team'); narrow it.
  const scope = finalState.scope as 'function' | 'employee';

  // — improvement rows: stable candidate id joins prose back to deterministic math.
  const improvements = finalState.insights.filter((i) => i.kind === 'improvement_area');
  improvements.forEach((ins, i) => {
    const ranked = assembled.rankedImprovements.find((candidate) => candidate.area.kpiId === ins.candidateId);
    if (!ranked) return;
    rows.push({
      function_id: functionId,
      date,
      scope,
      scope_id: scopeId,
      kind: 'improvement',
      rank: i + 1,
      title: ins.title,
      body: ins.body,
      dimension: dimStr(ins.dimension),
      est_impact: ranked.estImpact,
      pr_id: null,
      evidence_jsonb: traceJsonb(finalState, ins, {
        type: 'improvement',
        rank: i + 1,
        kpiId: ranked.area.kpiId,
        dimension: ranked.area.dimension,
        priorityGap: ranked.estImpact,
        priorityMeaning: 'Deterministic weighted distance from the configured target; not predicted causal lift.',
      }),
    });
  });

  // — change rows: stable movement key joins prose back to the measured delta.
  const changes = finalState.insights.filter((i) => i.kind === 'change_governance');
  changes.forEach((ins, i) => {
    const delta = finalState.deltas.find((candidate) => candidate.key === ins.candidateId);
    if (!delta) return;
    rows.push({
      function_id: functionId,
      date,
      scope,
      scope_id: scopeId,
      kind: 'change',
      rank: i + 1,
      title: ins.title,
      body: ins.body,
      dimension: dimStr(ins.dimension),
      est_impact: delta.delta,
      pr_id: null,
      evidence_jsonb: traceJsonb(finalState, ins, {
        type: 'change',
        rank: i + 1,
        key: delta.key,
        direction: delta.direction,
        measuredDelta: delta.delta,
      }),
    });
  });

  // — attribution rows: "going well" — no est_impact (read layer ignores it).
  const attributions = finalState.insights.filter((i) => i.kind === 'improvement_attribution');
  attributions.forEach((ins, i) => {
    const strength = assembled.strengths.find((candidate) => candidate.kpiId === ins.candidateId);
    if (!strength) return;
    rows.push({
      function_id: functionId,
      date,
      scope,
      scope_id: scopeId,
      kind: 'attribution',
      rank: i + 1,
      title: ins.title,
      body: ins.body,
      dimension: dimStr(ins.dimension),
      est_impact: null,
      pr_id: null,
      evidence_jsonb: traceJsonb(finalState, ins, {
        type: 'strength',
        rank: i + 1,
        kpiId: strength.kpiId,
        dimension: strength.dimension,
      }),
    });
  });

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// runPrLevel — pr_level insights (verdict in code, narration from graph)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate + persist pr_level coaching insights for a function on a run date. Each PR's
 * verdict is decided in code; the graph narrates reason + fix. Rows are written at the
 * PR AUTHOR's employee scope so getPrInsights(employeeId) surfaces them; a PR with no
 * resolvable author is written at function scope. Idempotent on (date, employee-scope,
 * kind='pr_level', rank).
 */
export async function runPrLevel(functionId: string, date: string): Promise<AgentRunResult> {
  const errors: string[] = [];
  const config = await loadNarrativeConfig(functionId, date);
  let prLevelWritten = 0;

  try {
    const { state, prRecords } = await assemblePrLevel(functionId, date, config.configVersion);
    if (prRecords.length === 0) {
      const cleared = await replacePrLevelInsights(functionId, date, []);
      return {
        ok: !cleared.error,
        functionId,
        date,
        scopesProcessed: 0,
        insightsWritten: 0,
        prLevelWritten: 0,
        skipped: ['pr_level (no merged PRs in window)'],
        errors: cleared.error ? [cleared.error] : [],
      };
    }

    const finalState = (await prLevelGraph().invoke(state)) as InsightStateType;
    const authorByPr = await prAuthors(prRecords.map((p) => p.prId));

    // Group results by target scope (employee if known, else function). Rank within scope.
    const byScope = new Map<string, { scope: 'function' | 'employee'; scopeId: string; rows: InsightWriteRow[] }>();

    finalState.prLevel.forEach((res) => {
      const pr = prRecords.find((p) => p.prId === res.prId);
      const employeeId = authorByPr.get(res.prId) ?? null;
      const scope: 'function' | 'employee' = employeeId ? 'employee' : 'function';
      const scopeId = employeeId ?? functionId;
      const key = `${scope}:${scopeId}`;
      const bucket = byScope.get(key) ?? { scope, scopeId, rows: [] };
      bucket.rows.push({
        function_id: functionId,
        date: finalState.date,
        scope,
        scope_id: scopeId,
        kind: 'pr_level',
        rank: bucket.rows.length + 1,
        title: prTitle(res.verdict, pr),
        body: res.reason,
        dimension: verdictDimension(res.verdict),
        est_impact: null,
        pr_id: res.prId,
        evidence_jsonb: evidenceJsonb(res.evidenceRefs, {
          verdict: res.verdict,
          fix: res.fix,
          ref: pr?.ref ?? null,
          sizeBucket: pr?.sizeBucket ?? null,
          traceVersion: 'pr-insight-trace-v1',
          candidate: {
            type: 'pr_level',
            prId: res.prId,
            verdict: res.verdict,
            verdictOwner: 'deterministic_classifier',
          },
          output: {
            observation: res.reason,
            interpretation: 'The deterministic verdict identifies a delivery pattern worth reinforcing or correcting.',
            alternativeExplanation: 'Missing or incomplete session linkage may limit attribution even when the delivery verdict is valid.',
            action: res.fix,
            expectedSignal: res.verdict === 'clean' ? 'Comparable changes continue to merge without rework or revert.' : 'The same adverse verdict does not recur on comparable changes.',
            verificationPlan: 'Review the next comparable merged pull request using the same deterministic signals.',
            doNoHarm: 'Do not reduce necessary review, testing, or safe recovery behavior to protect a clean verdict.',
          },
          evidence: finalState.evidence.filter((row) => res.evidenceRefs.includes(row.id)),
          validation: res.validation ?? {},
          stages: [
            { id: 'pr_signal_assembly', owner: 'deterministic_code', status: 'accepted', detail: 'Merged, size, linkage, iteration, revert, and rework signals assembled.' },
            { id: 'verdict_classification', owner: 'deterministic_code', status: 'accepted', detail: `Verdict fixed as ${res.verdict} before narration.` },
            {
              id: 'batch_narration',
              owner: res.narrativeSource === 'deterministic_fallback' ? 'deterministic_code' : 'bounded_llm',
              status: 'accepted',
              detail: res.narrativeSource === 'deterministic_fallback'
                ? 'The bounded narrator failed grounding; safe number-free fallback prose was used.'
                : 'Reason and fix narrated in one bounded PR batch.',
            },
            { id: 'grounding_verification', owner: 'deterministic_code', status: 'accepted', detail: 'Numbers and evidence references checked per PR.' },
            { id: 'selection', owner: 'deterministic_code', status: 'accepted', detail: 'Idempotent PR-level insight persisted for the author scope.' },
          ],
        }),
      });
      byScope.set(key, bucket);
    });

    const write = await replacePrLevelInsights(
      functionId,
      date,
      Array.from(byScope.values()).flatMap((bucket) => bucket.rows),
    );
    prLevelWritten += write.written;
    if (write.error) errors.push(write.error);
  } catch (e) {
    errors.push(errMsg(e));
  }

  return {
    ok: errors.length === 0,
    functionId,
    date,
    scopesProcessed: 0,
    insightsWritten: 0,
    prLevelWritten,
    skipped: [],
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence + small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Upsert insight rows on the idempotent slot (date, scope, scope_id, kind, rank). */
async function upsertInsights(rows: InsightWriteRow[]): Promise<{ written: number; error: string | null }> {
  if (rows.length === 0) return { written: 0, error: null };
  const { error } = await looseDb()
    .from('insights')
    .upsert(rows, { onConflict: 'date,scope,scope_id,kind,rank' });
  return { written: error ? 0 : rows.length, error: error?.message ?? null };
}

const SCOPE_INSIGHT_KINDS = ['improvement', 'change', 'attribution'] as const;

/**
 * Publish a coherent same-day scope snapshot. New/retained rows are upserted first; only
 * after that succeeds are obsolete rank slots removed. This prevents a shorter batch or
 * one grounding drop from leaving an old narrative attached to today's evidence.
 */
async function replaceScopeInsights(
  nextRows: InsightWriteRow[],
  scope: 'function' | 'employee',
  scopeId: string,
  date: string,
): Promise<{ written: number; error: string | null }> {
  const written = await upsertInsights(nextRows);
  if (written.error) return written;

  const db = looseDb();
  const current = await db
    .from('insights')
    .select('id,kind,rank,date,scope,scope_id')
    .eq('date', date)
    .eq('scope', scope)
    .eq('scope_id', scopeId)
    .in('kind', SCOPE_INSIGHT_KINDS);
  if (current.error) return { written: written.written, error: current.error.message ?? 'failed to verify insight snapshot' };

  const expected = new Set(nextRows.map((row) => `${row.kind}:${row.rank}`));
  const staleIds = (Array.isArray(current.data) ? current.data : [])
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .filter((row) => !expected.has(`${String(row.kind)}:${String(row.rank)}`))
    .map((row) => String(row.id));
  if (staleIds.length === 0) return written;

  const removed = await db.from('insights').delete().in('id', staleIds);
  return {
    written: written.written,
    error: removed.error?.message ?? null,
  };
}

/** Replace the function's same-day PR narrative snapshot after a successful batch write. */
async function replacePrLevelInsights(
  functionId: string,
  date: string,
  nextRows: InsightWriteRow[],
): Promise<{ written: number; error: string | null }> {
  const written = await upsertInsights(nextRows);
  if (written.error) return written;

  const db = looseDb();
  const current = await db
    .from('insights')
    .select('id,scope,scope_id,kind,rank,date,function_id')
    .eq('function_id', functionId)
    .eq('date', date)
    .eq('kind', 'pr_level');
  if (current.error) return { written: written.written, error: current.error.message ?? 'failed to verify PR insight snapshot' };

  const expected = new Set(nextRows.map((row) => `${row.scope}:${row.scope_id}:${row.rank}`));
  const staleIds = (Array.isArray(current.data) ? current.data : [])
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .filter((row) => !expected.has(`${String(row.scope)}:${String(row.scope_id)}:${String(row.rank)}`))
    .map((row) => String(row.id));
  if (staleIds.length === 0) return written;

  const removed = await db.from('insights').delete().in('id', staleIds);
  return { written: written.written, error: removed.error?.message ?? null };
}

interface ScopeRef {
  scope: 'function' | 'employee';
  scopeId: string;
}

/** The function scope + every active employee scope. */
async function listScopes(functionId: string): Promise<ScopeRef[]> {
  const raw = await looseDb()
    .from('employees')
    .select('id, active, function_id')
    .eq('function_id', functionId)
    .eq('active', true);
  if (raw.error) throw new Error(raw.error.message ?? 'failed to load active insight scopes');
  const emps = Array.isArray(raw.data) ? (raw.data as Array<{ id: string }>) : [];
  return [
    { scope: 'function', scopeId: functionId },
    ...emps.map((e) => ({ scope: 'employee' as const, scopeId: String(e.id) })),
  ];
}

/** Map prId → author employee_id (for pr_level scope routing). */
async function prAuthors(prIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (prIds.length === 0) return out;
  const raw = await looseDb().from('gh_prs').select('id, employee_id').in('id', prIds);
  const rows = Array.isArray(raw.data) ? (raw.data as Array<{ id: string; employee_id: string | null }>) : [];
  for (const r of rows) {
    if (r.employee_id) out.set(String(r.id), String(r.employee_id));
  }
  return out;
}

function dimStr(d: Dimension | null): string | null {
  return d ?? null;
}

/** A pr_level insight title whose words let the read layer's inferFlag map back to the verdict. */
function prTitle(verdict: string, pr: PrRecord | undefined): string {
  const ref = pr?.ref ? `${pr.ref} ` : '';
  switch (verdict) {
    case 'revert':
      return `${ref}reverted after merge`;
    case 'ai_slop':
      return `${ref}ai-slop: rework after merge`;
    case 're_prompt':
      return `${ref}re-prompt loop before merge`;
    default:
      return `${ref}${pr?.aiLinked ? 'clean AI-assisted merge' : 'clean merge'}`;
  }
}

/** Dimension tag for a pr_level verdict (effectiveness for failures, efficiency for loops). */
function verdictDimension(verdict: string): string {
  if (verdict === 'revert' || verdict === 'ai_slop') return 'effectiveness';
  if (verdict === 're_prompt') return 'efficiency';
  return 'usage';
}
