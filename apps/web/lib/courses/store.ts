// lib/courses/store.ts
//
// The ONLY read/write surface for the `courses` table (migration 0012). All
// writes go through the service-role admin client (createAdminClient) per the
// M4 ownership map. The generated Database type is an empty placeholder, so we
// use a loose client (as unknown as LooseDb) exactly like lib/pipeline/persist.ts
// and lib/db/onboarding.ts, and keep row shapes typed locally.
//
// COLUMN TRUTH (validated against the live DB, 0012):
//   courses(id, function_id, employee_id, dimension, course_id, title, url,
//           als_user_ref, due_at, progress_pct, status, knowledge_check_passed_at,
//           created_at, updated_at)
//   status enum: assigned | in_progress | completed   (no 'unavailable')
//   UNIQUE(employee_id, course_id)
//
// HARD RULES honored here:
//   - No dummy rows: we only INSERT when a real catalogue course is being assigned.
//   - Completion is Prism-owned: only setKnowledgeCheckPassed() sets
//     knowledge_check_passed_at + status='completed'. Progress alone never completes.

import { createAdminClient } from '@/lib/supabase/admin';
import type { Dimension } from '@/lib/ui/view-models';

// ─────────────────────────────────────────────────────────────────────────────
// Loose admin surface (mirrors lib/pipeline/persist.ts)
// ─────────────────────────────────────────────────────────────────────────────

type QueryResult<T> = Promise<{ data: T | null; error: { message?: string } | null }>;

interface LooseFilter {
  select: (cols: string) => LooseFilter;
  eq: (col: string, val: unknown) => LooseFilter;
  in: (col: string, vals: unknown[]) => LooseFilter;
  order: (col: string, opts?: { ascending?: boolean }) => LooseFilter;
  limit: (n: number) => LooseFilter;
  maybeSingle: () => QueryResult<unknown>;
  single: () => QueryResult<unknown>;
  then: <R>(onfulfilled: (v: { data: unknown; error: { message?: string } | null }) => R) => Promise<R>;
}
interface LooseTable {
  select: (cols: string) => LooseFilter;
  insert: (rows: unknown) => { select: (cols: string) => { maybeSingle: () => QueryResult<unknown> } } & QueryResult<unknown>;
  update: (patch: unknown) => LooseFilter;
}
interface LooseDb {
  from: (table: string) => LooseTable;
}

function db(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row shape
// ─────────────────────────────────────────────────────────────────────────────

export type CourseStatus = 'assigned' | 'in_progress' | 'completed';

export interface CourseRow {
  id: string;
  function_id: string;
  employee_id: string;
  dimension: string | null;
  course_id: string;
  title: string | null;
  url: string | null;
  als_user_ref: string | null;
  due_at: string | null;
  progress_pct: number;
  status: CourseStatus;
  knowledge_check_passed_at: string | null;
  created_at: string;
  updated_at: string;
}

const COURSE_COLS =
  'id, function_id, employee_id, dimension, course_id, title, url, als_user_ref, due_at, progress_pct, status, knowledge_check_passed_at, created_at, updated_at';

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The employee's currently-open course, if any. "Open" = not completed. Used by
 * the assigner to avoid double-assigning while a course is still in flight, and
 * by poll/check to locate the row to update. Newest open row wins.
 */
export async function getOpenCourse(employeeId: string): Promise<CourseRow | null> {
  const { data, error } = await db()
    .from('courses')
    .select(COURSE_COLS)
    .eq('employee_id', employeeId)
    .in('status', ['assigned', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getOpenCourse: ${error.message ?? 'query failed'}`);
  return (data as CourseRow | null) ?? null;
}

/** Fetch a specific (employee, course_id) row — the UNIQUE key. Null if unassigned. */
export async function getCourseFor(
  employeeId: string,
  courseId: string,
): Promise<CourseRow | null> {
  const { data, error } = await db()
    .from('courses')
    .select(COURSE_COLS)
    .eq('employee_id', employeeId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (error) throw new Error(`getCourseFor: ${error.message ?? 'query failed'}`);
  return (data as CourseRow | null) ?? null;
}

/** Fetch one course row by primary key. */
export async function getCourseById(id: string): Promise<CourseRow | null> {
  const { data, error } = await db()
    .from('courses')
    .select(COURSE_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getCourseById: ${error.message ?? 'query failed'}`);
  return (data as CourseRow | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

export interface InsertCourseInput {
  functionId: string;
  employeeId: string;
  dimension: Dimension;
  courseId: string;
  title: string;
  /** Hosted URL (from client.resolveCourseUrl). null when the studio is off / unresolved. */
  url: string | null;
  /** ALS-user↔employee link captured at assignment. null until wired. */
  alsUserRef: string | null;
  /** Due date ISO timestamp. null = no due date. */
  dueAt: string | null;
}

/**
 * Insert a new assignment (status='assigned', progress 0). Relies on the
 * UNIQUE(employee_id, course_id) constraint; if a duplicate is attempted the
 * insert errors and we surface it (callers guard with getOpenCourse/getCourseFor
 * first, so this is a belt-and-suspenders path). Returns the inserted row.
 */
export async function insertAssignment(input: InsertCourseInput): Promise<CourseRow> {
  const row = {
    function_id: input.functionId,
    employee_id: input.employeeId,
    dimension: input.dimension,
    course_id: input.courseId,
    title: input.title,
    url: input.url,
    als_user_ref: input.alsUserRef,
    due_at: input.dueAt,
    progress_pct: 0,
    status: 'assigned' as CourseStatus,
  };
  const { data, error } = await db().from('courses').insert(row).select(COURSE_COLS).maybeSingle();
  if (error) throw new Error(`insertAssignment: ${error.message ?? 'insert failed'}`);
  return data as CourseRow;
}

/**
 * Patch progress. Clamps to [0,100]. Advances status assigned→in_progress on
 * first real progress, but NEVER to completed (completion is Prism-owned via the
 * knowledge check). If a URL was resolved late (studio came online), it can be
 * backfilled here.
 */
export async function updateProgress(
  id: string,
  patch: { progressPct?: number; url?: string | null },
): Promise<void> {
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof patch.progressPct === 'number') {
    const pct = Math.max(0, Math.min(100, Math.round(patch.progressPct)));
    set.progress_pct = pct;
    // Move off 'assigned' once there is real progress, but stop short of 'completed'.
    if (pct > 0) set.status = 'in_progress';
  }
  if (patch.url !== undefined) set.url = patch.url;

  const { error } = await db()
    .from('courses')
    .update(set)
    .eq('id', id)
    // Guard: never downgrade a completed course back to in_progress.
    .in('status', ['assigned', 'in_progress'])
    .then((r) => r as { data: unknown; error: { message?: string } | null });
  if (error) throw new Error(`updateProgress: ${error.message ?? 'update failed'}`);
}

/**
 * Persist the ALS-user↔employee link. Called at assignment (or later, once the
 * learner authenticates against the studio). Idempotent overwrite.
 */
export async function setAlsUserRef(id: string, alsUserRef: string): Promise<void> {
  const { error } = await db()
    .from('courses')
    .update({ als_user_ref: alsUserRef, updated_at: new Date().toISOString() })
    .eq('id', id)
    .then((r) => r as { data: unknown; error: { message?: string } | null });
  if (error) throw new Error(`setAlsUserRef: ${error.message ?? 'update failed'}`);
}

/**
 * The ONLY path to completion. Sets knowledge_check_passed_at + status='completed'
 * + progress 100. Called exclusively when every lesson's knowledge check passed
 * (aggregated by the check route / poll). `passedAt` defaults to now.
 */
export async function setKnowledgeCheckPassed(id: string, passedAt?: string): Promise<void> {
  const when = passedAt ?? new Date().toISOString();
  const { error } = await db()
    .from('courses')
    .update({
      knowledge_check_passed_at: when,
      status: 'completed' as CourseStatus,
      progress_pct: 100,
      updated_at: when,
    })
    .eq('id', id)
    .then((r) => r as { data: unknown; error: { message?: string } | null });
  if (error) throw new Error(`setKnowledgeCheckPassed: ${error.message ?? 'update failed'}`);
}
