// lib/courses/client.ts
//
// The Agentic Learning Studio (ALS) HTTP client. Three jobs:
//   1. Build the hosted course URL from LEARNING_STUDIO_BASE_URL.
//   2. Resolve a catalogue slug → its kick-off lesson (via GET /api/course/:id).
//   3. Proxy ONE knowledge-check answer to the studio's public POST /api/check.
//
// GRACEFUL DEGRADATION (HARD RULE): nothing here throws at import, nothing
// constructs a client eagerly, and every method no-ops safely when the studio is
// not configured (LEARNING_STUDIO_BASE_URL blank → isConfigured('learningStudio')
// is false). Callers get a well-typed "not available" result, never a fabricated
// URL and never an exception that breaks the pipeline.
//
// ALS URL model (verified from the cloned studio, src/server.ts):
//   - A *course* is a set of `lessons` sharing a text `course_id`; the kick-off
//     lesson has course_index = 1. GET /api/course/:courseId (auth) returns the
//     ordered lessons: [{ id, index, title }]. Each lesson `id` is an artifact id.
//   - A lesson/artifact is served (and iframed) at GET /api/artifact/:id — public,
//     same access model as /api/check.
//   - POST /api/check is PUBLIC and STATELESS: it grades ONE question
//     ({ artifactId, blockId, questionId, choiceIndex | text }) and returns
//     { correct, ... }. It tracks NO completion — completion is Prism-owned.

import { serverEnv, isConfigured } from '@/lib/config/env';

// ─────────────────────────────────────────────────────────────────────────────
// URL building
// ─────────────────────────────────────────────────────────────────────────────

/** Trimmed base URL, or null when the studio is not configured. */
function baseUrl(): string | null {
  if (!isConfigured('learningStudio')) return null;
  const raw = serverEnv.LEARNING_STUDIO_BASE_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/**
 * The hosted URL for a specific lesson/artifact id. Null when the studio is
 * unconfigured. This is the only place an ALS URL is minted.
 */
export function artifactUrl(artifactId: string): string | null {
  const base = baseUrl();
  if (!base || !artifactId) return null;
  return `${base}/api/artifact/${encodeURIComponent(artifactId)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth for the studio's auth-gated reads (GET /api/course/:id).
//
// The studio validates an `Authorization: Bearer <token>` against Supabase auth
// (src/lib/auth.ts). Prism has no ALS learner token at pipeline time, so we send
// the token only if one is explicitly provided via env. When absent AND the
// studio has auth ON, the read simply fails and we degrade (null) — we never
// fabricate lessons. When the studio runs auth-OFF (local/dev), the read works
// unauthenticated. This is documented as an assumption; wiring per-employee ALS
// tokens is future work (see als_user_ref in store.ts).
// ─────────────────────────────────────────────────────────────────────────────

function studioAuthHeader(): Record<string, string> {
  const token = serverEnv.LEARNING_STUDIO_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const FETCH_TIMEOUT_MS = 8000;

async function studioFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const base = baseUrl();
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, { ...init, signal: controller.signal });
  } catch {
    // Network error / timeout / studio down → degrade to null, never throw.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Course resolution: slug → kick-off lesson (for the hosted URL)
// ─────────────────────────────────────────────────────────────────────────────

export interface StudioLesson {
  id: string;
  index: number;
  title: string;
}

/**
 * Fetch the ordered lessons of a course slug from the studio. Empty array when
 * the studio is unconfigured, unreachable, unauthenticated, or the slug is
 * unknown. Never throws.
 */
export async function fetchCourseLessons(courseId: string): Promise<StudioLesson[]> {
  const res = await studioFetch(`/api/course/${encodeURIComponent(courseId)}`, {
    method: 'GET',
    headers: { ...studioAuthHeader() },
  });
  if (!res || !res.ok) return [];
  try {
    const body = (await res.json()) as { lessons?: unknown };
    const lessons = Array.isArray(body?.lessons) ? body.lessons : [];
    return lessons
      .map((l): StudioLesson | null => {
        const row = l as { id?: unknown; index?: unknown; title?: unknown };
        if (typeof row.id !== 'string') return null;
        return {
          id: row.id,
          index: typeof row.index === 'number' ? row.index : 0,
          title: typeof row.title === 'string' ? row.title : '',
        };
      })
      .filter((l): l is StudioLesson => l !== null)
      .sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
}

/**
 * Resolve a course slug to the hosted URL of its kick-off lesson (course_index 1,
 * or the lowest index available). Returns null when the studio is unconfigured or
 * the course cannot be resolved — the caller keeps the assignment but with no URL.
 */
export async function resolveCourseUrl(courseId: string): Promise<string | null> {
  if (!baseUrl()) return null;
  const lessons = await fetchCourseLessons(courseId);
  if (lessons.length === 0) return null;
  const kickoff = lessons.find((l) => l.index === 1) ?? lessons[0]!;
  return artifactUrl(kickoff.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge-check proxy: grade ONE question via the studio.
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckQuestionInput {
  /** The studio artifact (lesson) id holding the question. */
  artifactId: string;
  /** The knowledgeCheck block id within the lesson. */
  blockId: string;
  /** The question id within the block. */
  questionId: string;
  /** MCQ selection (0-based), OR free-text answer. Exactly one is used. */
  choiceIndex?: number;
  text?: string;
}

export interface CheckQuestionResult {
  /** Whether the studio graded this answer correct. False on any failure. */
  correct: boolean;
  /** True when the studio could not be reached / is unconfigured (distinct from a wrong answer). */
  unavailable: boolean;
  /** Studio-provided explanation/feedback, when present. */
  explanation?: string;
  feedback?: string;
}

/**
 * Proxy a single knowledge-check answer to POST /api/check. This endpoint is
 * public and stateless in the studio — it grades and returns, tracking nothing.
 * On any transport/config failure we return { correct:false, unavailable:true }
 * so the aggregator can distinguish "studio down" from "answer wrong" and refuse
 * to mark a lesson passed on missing evidence.
 */
export async function checkQuestion(input: CheckQuestionInput): Promise<CheckQuestionResult> {
  const res = await studioFetch('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artifactId: input.artifactId,
      blockId: input.blockId,
      questionId: input.questionId,
      ...(typeof input.choiceIndex === 'number' ? { choiceIndex: input.choiceIndex } : {}),
      ...(typeof input.text === 'string' ? { text: input.text } : {}),
    }),
  });

  if (!res) return { correct: false, unavailable: true };
  if (!res.ok) return { correct: false, unavailable: true };

  try {
    const body = (await res.json()) as {
      correct?: unknown;
      explanation?: unknown;
      feedback?: unknown;
    };
    return {
      correct: body?.correct === true,
      unavailable: false,
      explanation: typeof body?.explanation === 'string' ? body.explanation : undefined,
      feedback: typeof body?.feedback === 'string' ? body.feedback : undefined,
    };
  } catch {
    return { correct: false, unavailable: true };
  }
}

/** Convenience probe used by routes/UI to short-circuit when the studio is off. */
export function studioConfigured(): boolean {
  return baseUrl() !== null;
}
