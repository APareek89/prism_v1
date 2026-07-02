// lib/courses/poll.ts
//
// Progress + completion transition manager. Completion is PRISM-OWNED (M2
// landmine #2): the studio exposes NO completion webhook, and POST /api/check is
// stateless/per-question. So Prism decides when a course is "done" — and the ONLY
// definition of done is: every knowledge-check question the learner attempted for
// the course's lessons passed, aggregated per lesson, with all lessons passing.
//
// This module holds the aggregation + transition logic. The check route
// (app/api/courses/check/route.ts) receives a batch of graded questions, this
// module folds them into a pass/fail verdict, and — only on all-pass — flips the
// course to completed via store.setKnowledgeCheckPassed.
//
// DETERMINISM BOUNDARY: the pass/fail verdict is pure boolean arithmetic over the
// per-question results (computed in code). No LLM decides completion. (The studio
// LLM may grade an individual FREE-TEXT question inside /api/check, but the
// aggregate "did the course complete" decision is deterministic Prism code.)

import {
  getCourseById,
  getOpenCourse,
  setKnowledgeCheckPassed,
  updateProgress,
  type CourseRow,
} from './store';
import type { CheckQuestionResult } from './client';

// ─────────────────────────────────────────────────────────────────────────────
// Per-question → per-lesson → course aggregation
// ─────────────────────────────────────────────────────────────────────────────

/** One graded question, tagged with the lesson (artifact) it belongs to. */
export interface GradedQuestion {
  lessonId: string;
  questionId: string;
  result: CheckQuestionResult;
}

export interface LessonVerdict {
  lessonId: string;
  total: number;
  passed: number;
  /** A lesson passes only when every one of its questions passed AND none were unavailable. */
  allPassed: boolean;
  /** True when any question for this lesson could not be graded (studio down) — blocks completion. */
  hadUnavailable: boolean;
}

export interface CourseCompletionVerdict {
  /** Per-lesson breakdown (deterministic). */
  lessons: LessonVerdict[];
  totalQuestions: number;
  passedQuestions: number;
  /** True ⇔ at least one question was graded, every lesson allPassed, and nothing was unavailable. */
  courseComplete: boolean;
  /** True when grading was incomplete because the studio was unreachable for some question. */
  incompleteEvidence: boolean;
}

/**
 * Fold a flat list of graded questions into a per-lesson verdict and an overall
 * course-completion decision. Pure — no I/O. A course is complete only when there
 * is real evidence (≥1 question), every lesson has all its questions correct, and
 * no question came back "unavailable" (missing evidence can never complete a
 * course — HARD RULE: never mark passed on absent data).
 */
export function aggregateVerdict(graded: GradedQuestion[]): CourseCompletionVerdict {
  const byLesson = new Map<string, GradedQuestion[]>();
  for (const g of graded) {
    const arr = byLesson.get(g.lessonId) ?? [];
    arr.push(g);
    byLesson.set(g.lessonId, arr);
  }

  const lessons: LessonVerdict[] = [];
  let totalQuestions = 0;
  let passedQuestions = 0;
  let anyUnavailable = false;

  for (const [lessonId, qs] of byLesson) {
    const total = qs.length;
    const passed = qs.filter((q) => q.result.correct).length;
    const hadUnavailable = qs.some((q) => q.result.unavailable);
    if (hadUnavailable) anyUnavailable = true;
    totalQuestions += total;
    passedQuestions += passed;
    lessons.push({
      lessonId,
      total,
      passed,
      allPassed: total > 0 && passed === total && !hadUnavailable,
      hadUnavailable,
    });
  }

  const courseComplete =
    totalQuestions > 0 && !anyUnavailable && lessons.every((l) => l.allPassed);

  return {
    lessons,
    totalQuestions,
    passedQuestions,
    courseComplete,
    incompleteEvidence: anyUnavailable,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transitions (I/O — service-role writes via store)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApplyVerdictResult {
  courseId: string;
  status: CourseRow['status'];
  completed: boolean;
  /** progress_pct after applying (100 on completion, else % of questions passed). */
  progressPct: number;
  incompleteEvidence: boolean;
}

/**
 * Apply a completion verdict to a course row. On all-pass → mark completed
 * (Prism-owned completion). Otherwise record partial progress as the fraction of
 * questions passed (deterministic), leaving status in_progress/assigned. Never
 * completes on missing evidence.
 */
export async function applyVerdict(
  courseRowId: string,
  verdict: CourseCompletionVerdict,
): Promise<ApplyVerdictResult> {
  const course = await getCourseById(courseRowId);
  if (!course) throw new Error(`applyVerdict: course ${courseRowId} not found`);

  // Already completed → idempotent no-op.
  if (course.status === 'completed') {
    return {
      courseId: courseRowId,
      status: 'completed',
      completed: true,
      progressPct: 100,
      incompleteEvidence: false,
    };
  }

  if (verdict.courseComplete) {
    await setKnowledgeCheckPassed(courseRowId);
    return {
      courseId: courseRowId,
      status: 'completed',
      completed: true,
      progressPct: 100,
      incompleteEvidence: false,
    };
  }

  // Partial: progress = passed / total (0 when no questions). Deterministic.
  const pct =
    verdict.totalQuestions > 0
      ? Math.round((verdict.passedQuestions / verdict.totalQuestions) * 100)
      : course.progress_pct;
  await updateProgress(courseRowId, { progressPct: pct });

  return {
    courseId: courseRowId,
    status: pct > 0 ? 'in_progress' : course.status,
    completed: false,
    progressPct: pct,
    incompleteEvidence: verdict.incompleteEvidence,
  };
}

/**
 * Record incremental lesson progress independent of the knowledge check (e.g. the
 * learner scrolled through N of M lessons). Prism-owned bookkeeping; never
 * completes a course. Clamped in store.updateProgress.
 */
export async function recordProgress(courseRowId: string, progressPct: number): Promise<void> {
  await updateProgress(courseRowId, { progressPct });
}

/**
 * Resolve the employee's open course (helper for the check route, which is keyed
 * by the signed-in employee rather than a course row id). Null when none open.
 */
export async function openCourseForEmployee(employeeId: string): Promise<CourseRow | null> {
  return getOpenCourse(employeeId);
}
