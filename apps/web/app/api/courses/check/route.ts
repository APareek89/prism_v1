// app/api/courses/check/route.ts
//
// POST /api/courses/check — the PRISM-OWNED knowledge check.
//
// Why this exists (M2 landmine #2): the Agentic Learning Studio has NO completion
// webhook, and its POST /api/check is public + STATELESS — it grades ONE question
// and forgets it. Completion of an assigned course therefore has to be owned by
// Prism. This route:
//   1. Authenticates the learner (withAuth → their employee row).
//   2. Locates their open course (or the course_row_id they pass).
//   3. For EACH submitted answer, proxies the studio's /api/check (client.checkQuestion).
//   4. Aggregates per lesson (poll.aggregateVerdict) — deterministic pass/fail.
//   5. Sets courses.knowledge_check_passed_at + status='completed' ONLY when every
//      lesson's every question passed (poll.applyVerdict → store.setKnowledgeCheckPassed).
//
// Grades are computed by the studio per question; the COMPLETION decision is
// deterministic Prism code. Missing evidence (studio unreachable for any question)
// can never complete a course.
//
// GRACEFUL DEGRADATION: when the studio is unconfigured, every proxied question
// returns { unavailable:true }; the verdict is incompleteEvidence and the course
// stays open. The route responds 200 with that verdict rather than erroring.

import { withAuth } from '@/lib/auth/guards';
import type { AuthUser } from '@/lib/types';
import { checkQuestion, studioConfigured, type CheckQuestionInput } from '@/lib/courses/client';
import { getCourseById } from '@/lib/courses/store';
import {
  aggregateVerdict,
  applyVerdict,
  openCourseForEmployee,
  type GradedQuestion,
} from '@/lib/courses/poll';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Request contract
// ─────────────────────────────────────────────────────────────────────────────

interface AnswerInput {
  /** Studio artifact (lesson) id the question lives in. */
  lessonId: string;
  /** knowledgeCheck block id within the lesson. */
  blockId: string;
  /** question id within the block. */
  questionId: string;
  /** MCQ selection (0-based) OR free-text answer — exactly one is used. */
  choiceIndex?: number;
  text?: string;
}

interface CheckRequestBody {
  /** Optional explicit course row id; otherwise the learner's open course is used. */
  courseRowId?: string;
  answers?: AnswerInput[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers (local — mirrors the connectors route-helpers shape)
// ─────────────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function badRequest(error: string): Response {
  return json({ error }, 400);
}

async function readBody(req: Request): Promise<CheckRequestBody | null> {
  try {
    return (await req.json()) as CheckRequestBody;
  } catch {
    return null;
  }
}

function isValidAnswer(a: unknown): a is AnswerInput {
  if (!a || typeof a !== 'object') return false;
  const r = a as Record<string, unknown>;
  const hasIds =
    typeof r.lessonId === 'string' &&
    typeof r.blockId === 'string' &&
    typeof r.questionId === 'string';
  const hasResponse = typeof r.choiceIndex === 'number' || typeof r.text === 'string';
  return hasIds && hasResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export const POST = withAuth(async (req: Request, user: AuthUser): Promise<Response> => {
  const body = await readBody(req);
  if (!body) return badRequest('invalid JSON body');

  const answers = Array.isArray(body.answers) ? body.answers.filter(isValidAnswer) : [];
  if (answers.length === 0) {
    return badRequest('answers[] required — each with lessonId, blockId, questionId and choiceIndex|text');
  }

  // Locate the course to grade: explicit row id (verified to belong to the learner)
  // or the learner's single open course.
  let courseRowId: string;
  if (typeof body.courseRowId === 'string' && body.courseRowId.length > 0) {
    const course = await getCourseById(body.courseRowId);
    if (!course) return json({ error: 'course not found' }, 404);
    if (course.employee_id !== user.employeeId) return json({ error: 'forbidden' }, 403);
    courseRowId = course.id;
  } else {
    const open = await openCourseForEmployee(user.employeeId);
    if (!open) return json({ error: 'no open course to check' }, 404);
    courseRowId = open.id;
  }

  // Proxy each answer to the studio (client degrades to unavailable when the studio
  // is off). The per-question studio artifactId is the lessonId supplied by the
  // caller (an ALS artifact id).
  const graded: GradedQuestion[] = [];
  for (const a of answers) {
    const input: CheckQuestionInput = {
      artifactId: a.lessonId,
      blockId: a.blockId,
      questionId: a.questionId,
      ...(typeof a.choiceIndex === 'number' ? { choiceIndex: a.choiceIndex } : {}),
      ...(typeof a.text === 'string' ? { text: a.text } : {}),
    };
    const result = await checkQuestion(input);
    graded.push({ lessonId: a.lessonId, questionId: a.questionId, result });
  }

  // Deterministic aggregation + Prism-owned completion transition.
  const verdict = aggregateVerdict(graded);
  const applied = await applyVerdict(courseRowId, verdict);

  return json({
    courseRowId,
    studioConfigured: studioConfigured(),
    completed: applied.completed,
    status: applied.status,
    progressPct: applied.progressPct,
    incompleteEvidence: applied.incompleteEvidence,
    verdict: {
      totalQuestions: verdict.totalQuestions,
      passedQuestions: verdict.passedQuestions,
      lessons: verdict.lessons,
    },
    // Per-question feedback echoed back for the UI (studio explanation/feedback).
    results: graded.map((g) => ({
      lessonId: g.lessonId,
      questionId: g.questionId,
      correct: g.result.correct,
      unavailable: g.result.unavailable,
      explanation: g.result.explanation,
      feedback: g.result.feedback,
    })),
  });
});
