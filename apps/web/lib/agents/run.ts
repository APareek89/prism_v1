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
import { assembleScope, assemblePrLevel, type AssembledScope } from './assemble';
import { scopeGraph, prLevelGraph } from './graph';
import type { InsightStateType, PrRecord } from './state';

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

  const configVersion = 'v1';
  const scopes = await listScopes(functionId);

  for (const s of scopes) {
    try {
      const assembled = await assembleScope(functionId, s.scope, s.scopeId, date, configVersion);
      if (!assembled.hasSignal) {
        skipped.push(`${s.scope}:${s.scopeId} (no signal)`);
        continue;
      }
      scopesProcessed += 1;
      const rows = await runOneScope(functionId, assembled);
      if (rows.length > 0) {
        const w = await upsertInsights(rows);
        insightsWritten += w.written;
        if (w.error) errors.push(`${s.scope}:${s.scopeId}: ${w.error}`);
      }
    } catch (e) {
      errors.push(`${s.scope}:${s.scopeId}: ${errMsg(e)}`);
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

  // — improvement rows: rank + est_impact from the code-ranked side-table, zipped by order.
  const improvements = finalState.insights.filter((i) => i.kind === 'improvement_area');
  improvements.forEach((ins, i) => {
    const ranked = assembled.rankedImprovements[i];
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
      est_impact: ranked ? ranked.estImpact : null,
      pr_id: null,
      evidence_jsonb: evidenceJsonb(ins.evidenceRefs),
    });
  });

  // — change rows: est_impact = the code-computed signed delta, zipped by the deltas order.
  const changes = finalState.insights.filter((i) => i.kind === 'change_governance');
  changes.forEach((ins, i) => {
    const delta = finalState.deltas[i];
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
      est_impact: delta ? delta.delta : null,
      pr_id: null,
      evidence_jsonb: evidenceJsonb(ins.evidenceRefs, { direction: delta?.direction ?? null }),
    });
  });

  // — attribution rows: "going well" — no est_impact (read layer ignores it).
  const attributions = finalState.insights.filter((i) => i.kind === 'improvement_attribution');
  attributions.forEach((ins, i) => {
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
      evidence_jsonb: evidenceJsonb(ins.evidenceRefs),
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
  const configVersion = 'v1';
  let prLevelWritten = 0;

  try {
    const { state, prRecords } = await assemblePrLevel(functionId, date, configVersion);
    if (prRecords.length === 0) {
      return {
        ok: true,
        functionId,
        date,
        scopesProcessed: 0,
        insightsWritten: 0,
        prLevelWritten: 0,
        skipped: ['pr_level (no merged PRs in window)'],
        errors: [],
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
        }),
      });
      byScope.set(key, bucket);
    });

    for (const { rows } of byScope.values()) {
      const w = await upsertInsights(rows);
      prLevelWritten += w.written;
      if (w.error) errors.push(w.error);
    }
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
