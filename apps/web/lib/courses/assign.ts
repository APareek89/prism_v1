// lib/courses/assign.ts
//
// assignCourses(functionId, date) — the A4 entry point for the daily pipeline.
//
// For every active employee in the function it:
//   1. Reads their latest index_daily L2 scores (usage/eff/effness/prof).
//   2. Picks the WEAKEST dimension that is BELOW the coaching threshold.
//   3. If the employee has no open course, assigns the catalogue course for that
//      weak dimension (writing a courses row: dimension, course_id, title, url,
//      due_at, status='assigned'); persists als_user_ref when known.
//   4. If the catalogue has no slug for that dimension, records the result as
//      'unavailable' (IN MEMORY ONLY) — no row, no fabricated link.
//
// DETERMINISM BOUNDARY (HARD RULE): every NUMBER here — the weak-dimension pick,
// the below-threshold test, the due-date offset — is computed in CODE from real
// index_daily scores. No LLM is involved. The catalogue title is a fixed string,
// not model output.
//
// The scores compared are REAL (computed by lib/scoring and persisted to
// index_daily). WEAK_L2_THRESHOLD is a Prism coaching POLICY constant (index_config
// carries KPI anchors + dimension weights, not a per-dimension coaching gate), so
// it lives here as documented config, not fabricated data.

import { createAdminClient } from '@/lib/supabase/admin';
import type { Dimension } from '@/lib/ui/view-models';
import { catalogueFor } from './catalogue';
import { resolveCourseUrl } from './client';
import { getOpenCourse, getCourseFor, insertAssignment, type CourseRow } from './store';

// ─────────────────────────────────────────────────────────────────────────────
// Policy constants (computed-in-code thresholds; not model output, not dummy data)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L2 scores are 0–100 (lib/scoring/normalize). A dimension is "weak" (a coaching
 * candidate) when its score is strictly below this gate. 60 = "below competent".
 * Tunable policy; kept explicit so the threshold is auditable and never inferred
 * by an LLM.
 */
export const WEAK_L2_THRESHOLD = 60;

/** Days a learner has to complete an assigned course (drives courses.due_at). */
export const COURSE_DUE_DAYS = 14;

// ─────────────────────────────────────────────────────────────────────────────
// Loose admin read surface (index_daily / employees are not in generated types)
// ─────────────────────────────────────────────────────────────────────────────

interface LooseFilter {
  select: (cols: string) => LooseFilter;
  eq: (col: string, val: unknown) => LooseFilter;
  order: (col: string, opts?: { ascending?: boolean }) => LooseFilter;
  limit: (n: number) => LooseFilter;
  maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
  then: <R>(
    onfulfilled: (v: { data: unknown; error: { message?: string } | null }) => R,
  ) => Promise<R>;
}
interface LooseDb {
  from: (table: string) => { select: (cols: string) => LooseFilter };
}
function db(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension ↔ index_daily column mapping (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

const DIMENSION_COLUMN: Record<Dimension, keyof EmployeeL2> = {
  usage: 'l2_usage',
  efficiency: 'l2_eff',
  effectiveness: 'l2_effness',
  proficiency: 'l2_prof',
};
const DIMENSIONS: Dimension[] = ['usage', 'efficiency', 'effectiveness', 'proficiency'];

interface EmployeeL2 {
  l2_usage: number | null;
  l2_eff: number | null;
  l2_effness: number | null;
  l2_prof: number | null;
}

interface EmployeeLite {
  id: string;
  active: boolean | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result reporting (in-memory; the caller/pipeline logs it, nothing is faked in DB)
// ─────────────────────────────────────────────────────────────────────────────

export type AssignOutcome =
  | 'assigned' //   new courses row written
  | 'already_open' // employee already has an open course; skipped
  | 'no_weak_dimension' // no dimension below threshold; nothing to assign
  | 'no_scores' //  no index_daily row for the employee yet
  | 'unavailable'; // weak dimension found but no catalogue slug → NOT persisted

export interface EmployeeAssignResult {
  employeeId: string;
  outcome: AssignOutcome;
  dimension?: Dimension;
  score?: number;
  courseId?: string;
  /** Present only for outcome==='assigned'. */
  courseRowId?: string;
  /** True when a course was assigned but no hosted URL could be resolved (studio off/unresolved). */
  urlDegraded?: boolean;
}

export interface AssignCoursesSummary {
  functionId: string;
  date: string;
  assigned: number;
  skipped: number;
  unavailable: number;
  results: EmployeeAssignResult[];
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Weak-dimension selection (pure, deterministic)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The weakest dimension strictly below the threshold, or null when none qualify.
 * Ties broken by the fixed DIMENSIONS order (deterministic). Null scores are
 * treated as "no signal" and skipped (not assumed weak) — we never coach on
 * absent data.
 */
export function weakestBelowThreshold(
  l2: EmployeeL2,
  threshold = WEAK_L2_THRESHOLD,
): { dimension: Dimension; score: number } | null {
  let best: { dimension: Dimension; score: number } | null = null;
  for (const dim of DIMENSIONS) {
    const score = l2[DIMENSION_COLUMN[dim]];
    if (score === null || score === undefined) continue;
    if (score >= threshold) continue;
    if (best === null || score < best.score) best = { dimension: dim, score };
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

async function activeEmployees(functionId: string): Promise<EmployeeLite[]> {
  const rows = await db()
    .from('employees')
    .select('id, active')
    .eq('function_id', functionId)
    .then((r) => {
      if (r.error) throw new Error(`activeEmployees: ${r.error.message ?? 'query failed'}`);
      return (r.data as EmployeeLite[] | null) ?? [];
    });
  return rows.filter((e) => e.active !== false);
}

/**
 * Latest employee-scope L2 scores at or before `date`. We take the most recent
 * index_daily row for the employee up to and including the run date so a run for
 * a given day coaches on that day's picture (deterministic per date).
 */
async function latestL2(
  employeeId: string,
  date: string,
): Promise<EmployeeL2 | null> {
  const rows = await db()
    .from('index_daily')
    .select('l2_usage, l2_eff, l2_effness, l2_prof, date, scope, scope_id')
    .eq('scope', 'employee')
    .eq('scope_id', employeeId)
    // NOTE: supabase lte would be ideal; the loose surface exposes eq/order/limit.
    // We order desc by date and take the first row <= run date in code below.
    .order('date', { ascending: false })
    .then((r) => {
      if (r.error) throw new Error(`latestL2: ${r.error.message ?? 'query failed'}`);
      return (r.data as (EmployeeL2 & { date: string })[] | null) ?? [];
    });
  const row = rows.find((r) => r.date <= date);
  if (!row) return null;
  return {
    l2_usage: row.l2_usage,
    l2_eff: row.l2_eff,
    l2_effness: row.l2_effness,
    l2_prof: row.l2_prof,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/** due_at = date + COURSE_DUE_DAYS, as an ISO timestamp (end of that day, UTC). */
function dueAtFrom(date: string): string {
  const base = new Date(`${date}T00:00:00Z`);
  const due = new Date(base.getTime() + COURSE_DUE_DAYS * 86_400_000);
  return due.toISOString();
}

/**
 * Assign a micro-course to each active employee whose weakest dimension is below
 * threshold and who has no open course. Idempotent per day: re-running skips
 * employees who already have an open course (or the exact (employee, course_id)
 * row). Never throws for a single employee — errors are collected per employee so
 * one bad row can't abort the batch.
 */
export async function assignCourses(
  functionId: string,
  date: string,
): Promise<AssignCoursesSummary> {
  const summary: AssignCoursesSummary = {
    functionId,
    date,
    assigned: 0,
    skipped: 0,
    unavailable: 0,
    results: [],
    errors: [],
  };

  let employees: EmployeeLite[];
  try {
    employees = await activeEmployees(functionId);
  } catch (e) {
    summary.errors.push(errMsg(e));
    return summary;
  }

  for (const emp of employees) {
    try {
      const result = await assignForEmployee(functionId, emp.id, date);
      summary.results.push(result);
      if (result.outcome === 'assigned') summary.assigned += 1;
      else if (result.outcome === 'unavailable') summary.unavailable += 1;
      else summary.skipped += 1;
    } catch (e) {
      summary.errors.push(`employee ${emp.id}: ${errMsg(e)}`);
      summary.skipped += 1;
    }
  }

  return summary;
}

/** Per-employee assignment. Exported for targeted (re)assignment + tests. */
export async function assignForEmployee(
  functionId: string,
  employeeId: string,
  date: string,
  alsUserRef: string | null = null,
): Promise<EmployeeAssignResult> {
  // Don't stack courses: one open course at a time.
  const open: CourseRow | null = await getOpenCourse(employeeId);
  if (open) {
    return { employeeId, outcome: 'already_open', courseId: open.course_id };
  }

  const l2 = await latestL2(employeeId, date);
  if (!l2) return { employeeId, outcome: 'no_scores' };

  const weak = weakestBelowThreshold(l2);
  if (!weak) return { employeeId, outcome: 'no_weak_dimension' };

  const entry = catalogueFor(weak.dimension);
  if (!entry) {
    // Weak dimension identified but no curated course exists → unavailable.
    // HARD RULE: do not fabricate a course/link; do not write a row.
    return {
      employeeId,
      outcome: 'unavailable',
      dimension: weak.dimension,
      score: weak.score,
    };
  }

  // Idempotency belt: if this exact (employee, course_id) was ever assigned and is
  // now closed (adopted/completed) the UNIQUE constraint would still block a new
  // insert. Surface as already_open so we don't error the batch.
  const existing = await getCourseFor(employeeId, entry.courseId);
  if (existing) {
    return { employeeId, outcome: 'already_open', courseId: entry.courseId };
  }

  // Resolve the hosted URL (null when the studio is off/unreachable/unresolved).
  const url = await resolveCourseUrl(entry.courseId);

  const row = await insertAssignment({
    functionId,
    employeeId,
    dimension: weak.dimension,
    courseId: entry.courseId,
    title: entry.title,
    url,
    alsUserRef,
    dueAt: dueAtFrom(date),
  });

  return {
    employeeId,
    outcome: 'assigned',
    dimension: weak.dimension,
    score: weak.score,
    courseId: entry.courseId,
    courseRowId: row.id,
    urlDegraded: url === null,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
