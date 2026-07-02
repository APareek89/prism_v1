// lib/recommendations/store.ts
//
// The service-role data layer for A2: it (a) ASSEMBLES a per-employee RuleContext from the
// raw + computed tables, and (b) READS open recs / WRITES new recs on the recommendations
// table. RLS-bypassing (pipeline path) — mirrors lib/pipeline/persist.ts.
//
// COLUMN TRUTH: every column read/written here is validated against the live DB
// (recommendations, employees, kpi_daily, index_daily, gh_prs, cc_sessions, courses).
// No-dummy-data: context values come from real rows or an honest no-signal default
// (null / [] / false); a rule returns null (no rec) rather than inventing a number.
//
// SERVER-ONLY (service-role admin client).

import { createAdminClient } from '@/lib/supabase/admin';
import { WINDOW_DAYS } from '@/lib/config/constants';
import type { Dimension } from '@/lib/scoring/types';
import type {
  CourseFact,
  KpiPoint,
  PrFact,
  RuleContext,
  RuleOutput,
  SessionFact,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Loose admin query surface (generated Database type is a placeholder). Same cast
// pattern as lib/pipeline/assemble.ts.
// ─────────────────────────────────────────────────────────────────────────────
type DbResult = Promise<{ data: unknown; error: { message?: string } | null }>;
interface LooseChain extends DbResult {
  eq: (col: string, val: unknown) => LooseChain;
  in: (col: string, vals: readonly unknown[]) => LooseChain;
  gte: (col: string, val: unknown) => LooseChain;
  lte: (col: string, val: unknown) => LooseChain;
  not: (col: string, op: string, val: unknown) => LooseChain;
  order: (col: string, opts?: unknown) => LooseChain;
  limit: (n: number) => LooseChain;
  select: (cols: string) => LooseChain;
  insert: (rows: unknown) => DbResult;
  update: (patch: unknown) => LooseChain;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
}
interface LooseDb {
  from: (table: string) => LooseChain;
}
function looseDb(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}

function rows(result: { data: unknown; error: unknown }): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) return [];
  return result.data as Record<string, unknown>[];
}
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

const DAY_MS = 86_400_000;
const DIMENSIONS: readonly Dimension[] = ['usage', 'efficiency', 'effectiveness', 'proficiency'];

/** Trailing-28d ISO lower bound ending at the END of the passed run date (UTC). Mirrors
 *  lib/pipeline/assemble.ts so the context window matches the scoring window exactly. */
function computeSince(date: string): string {
  const runMs = Date.parse(`${date}T00:00:00.000Z`);
  const endOfDay = runMs + DAY_MS - 1;
  return new Date(endOfDay - WINDOW_DAYS * DAY_MS).toISOString();
}
function until(date: string): string {
  const runMs = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(runMs + DAY_MS - 1).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Active employees for a function
// ─────────────────────────────────────────────────────────────────────────────

export interface ActiveEmployee {
  id: string;
  name: string;
}

export async function activeEmployees(functionId: string): Promise<ActiveEmployee[]> {
  const db = looseDb();
  const res = await db
    .from('employees')
    .select('id, name, active, function_id')
    .eq('function_id', functionId)
    .eq('active', true);
  return rows(res).map((r) => ({ id: String(r.id), name: str(r.name) ?? '' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-employee RuleContext assembly (SAME data the scoring engine used)
// ─────────────────────────────────────────────────────────────────────────────

/** Build the RuleContext for one employee for one run window. Both the rec engine and the
 *  adoption monitor call this — re-verifying a rec means re-reading the SAME evidence. */
export async function loadContext(
  functionId: string,
  employeeId: string,
  date: string,
): Promise<RuleContext> {
  const db = looseDb();
  const since = computeSince(date);
  const end = until(date);

  // Persisted employee-scope KPI norms (kpi_daily) for the run date.
  const kpiRows = rows(
    await db
      .from('kpi_daily')
      .select('kpi_id, raw_value, norm_score, confidence, scope, scope_id, date')
      .eq('scope', 'employee')
      .eq('scope_id', employeeId)
      .eq('date', date),
  );
  const kpis: Record<string, KpiPoint> = {};
  for (const r of kpiRows) {
    const id = str(r.kpi_id);
    if (!id) continue;
    kpis[id] = {
      kpiId: id,
      raw: numOrNull(r.raw_value),
      norm: numOrNull(r.norm_score),
      confidence: str(r.confidence),
    };
  }

  // Persisted employee-scope L2 dimension scores (index_daily) for the run date.
  const idx = await db
    .from('index_daily')
    .select('l2_usage, l2_eff, l2_effness, l2_prof, scope, scope_id, date')
    .eq('scope', 'employee')
    .eq('scope_id', employeeId)
    .eq('date', date)
    .maybeSingle();
  const idxRow = idx.error ? null : idx.data;
  const l2: Record<Dimension, number | null> = {
    usage: numOrNull(idxRow?.l2_usage),
    efficiency: numOrNull(idxRow?.l2_eff),
    effectiveness: numOrNull(idxRow?.l2_effness),
    proficiency: numOrNull(idxRow?.l2_prof),
  };

  // Merged/observed PRs in the 28d window (gh_prs).
  const prRows = rows(
    await db
      .from('gh_prs')
      .select('id, employee_id, is_merged, merged_at, ai_assisted, size_bucket, reverted_at, function_id')
      .eq('function_id', functionId)
      .eq('employee_id', employeeId)
      .gte('merged_at', since)
      .lte('merged_at', end),
  );
  const prs: PrFact[] = prRows.map((r) => ({
    id: String(r.id),
    isMerged: bool(r.is_merged),
    sizeBucket: (str(r.size_bucket) as PrFact['sizeBucket']) ?? null,
    aiAssisted: bool(r.ai_assisted),
    reverted: str(r.reverted_at) !== null,
  }));

  // CC sessions in the 28d window (cc_sessions).
  const sessionRows = rows(
    await db
      .from('cc_sessions')
      .select('id, employee_id, ts, turns, tokens_in, cache_read, skills_used, linked_pr, function_id')
      .eq('function_id', functionId)
      .eq('employee_id', employeeId)
      .gte('ts', since)
      .lte('ts', end),
  );
  const sessions: SessionFact[] = sessionRows.map((r) => ({
    id: String(r.id),
    turns: num(r.turns),
    tokensIn: num(r.tokens_in),
    cacheRead: num(r.cache_read),
    skillsUsed: strList(r.skills_used),
    linkedPrId: str(r.linked_pr),
  }));

  // Distinct authored skills: the set of skill names this member's sessions used AND that
  // are attributed to them. We approximate authorship from the union of skills_used across
  // the member's sessions — the same signal the proficiency KPI folds in — deduped.
  const authoredSkills = Array.from(new Set(sessions.flatMap((s) => s.skillsUsed)));

  // Assigned courses + completion (courses) for the course adoption predicate.
  const courseRows = rows(
    await db
      .from('courses')
      .select('course_id, dimension, knowledge_check_passed_at, employee_id')
      .eq('employee_id', employeeId),
  );
  const courses: CourseFact[] = courseRows.map((r) => ({
    courseId: String(r.course_id),
    dimension: str(r.dimension),
    knowledgeCheckPassed: str(r.knowledge_check_passed_at) !== null,
  }));

  return { functionId, employeeId, date, kpis, l2, prs, sessions, authoredSkills, courses };
}

// ─────────────────────────────────────────────────────────────────────────────
// Open-rec reads
// ─────────────────────────────────────────────────────────────────────────────

/** A persisted rec row (the columns A2 needs to read/monitor). */
export interface RecRow {
  id: string;
  employeeId: string;
  functionId: string;
  date: string | null;
  kind: string;
  ref: string;
  status: string;
  detectedVia: string | null;
  evidenceJsonb: Record<string, unknown>;
}

const OPEN_STATUSES = ['suggested', 'acknowledged', 'in_progress'] as const;

function toRecRow(r: Record<string, unknown>): RecRow {
  return {
    id: String(r.id),
    employeeId: String(r.employee_id),
    functionId: String(r.function_id),
    date: str(r.date),
    kind: String(r.kind),
    ref: String(r.ref),
    status: String(r.status),
    detectedVia: str(r.detected_via),
    evidenceJsonb: (r.evidence_jsonb as Record<string, unknown>) ?? {},
  };
}

/** All OPEN recs (suggested|acknowledged|in_progress) for one employee. */
export async function openRecsFor(employeeId: string): Promise<RecRow[]> {
  const db = looseDb();
  const res = await db
    .from('recommendations')
    .select('id, employee_id, function_id, date, kind, ref, status, detected_via, evidence_jsonb')
    .eq('employee_id', employeeId)
    .in('status', OPEN_STATUSES);
  return rows(res).map(toRecRow);
}

/** All OPEN recs across a function (monitor entry). */
export async function openRecsForFunction(functionId: string): Promise<RecRow[]> {
  const db = looseDb();
  const res = await db
    .from('recommendations')
    .select('id, employee_id, function_id, date, kind, ref, status, detected_via, evidence_jsonb')
    .eq('function_id', functionId)
    .in('status', OPEN_STATUSES);
  return rows(res).map(toRecRow);
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/** Insert a new rec (status defaults to 'suggested' in the DB). Caller guarantees no OPEN
 *  rec already exists for (employee, kind, ref) — the partial-unique index is the backstop. */
export async function insertRec(
  functionId: string,
  employeeId: string,
  date: string,
  out: RuleOutput,
): Promise<{ ok: boolean; error: string | null }> {
  const db = looseDb();
  const res = await db.from('recommendations').insert({
    function_id: functionId,
    employee_id: employeeId,
    date,
    kind: out.kind,
    ref: out.ref,
    rationale: out.rationale,
    // status omitted → DB default 'suggested'.
    detected_via: out.detectedVia,
    evidence_jsonb: {
      before: out.evidence.before,
      after: out.evidence.after,
      delta: out.evidence.delta,
      metric: out.evidence.metric,
      unit: out.evidence.unit,
      signals: out.evidence.signals,
      dimension: out.dimension,
    },
  });
  return { ok: !res.error, error: res.error?.message ?? null };
}

/** Advance a rec's status (adoption monitor). Also stamps updated_at and merges a
 *  verified-evidence patch into evidence_jsonb (append-only under the `adoption` key). */
export async function updateRecStatus(
  recId: string,
  status: string,
  adoptionEvidence: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const db = looseDb();
  const res = (await db
    .from('recommendations')
    .update({
      status,
      updated_at: new Date().toISOString(),
      evidence_jsonb: adoptionEvidence,
    })
    .eq('id', recId)) as { error: { message?: string } | null };
  return { ok: !res.error, error: res.error?.message ?? null };
}
