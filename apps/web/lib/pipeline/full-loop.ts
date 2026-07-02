// lib/pipeline/full-loop.ts
//
// THE full M4 automation loop, as ONE reusable orchestrator so the on-demand route
// (app/api/pipeline/run) and the durable Inngest daily function run the EXACT same steps
// in the EXACT same order:
//
//   1. runPipeline               → ingest → link → blame → assemble → computeDaily → persist
//                                  (M2; owns pipeline internals — we only CALL it)
//   2. runInsightsForScope       → improvement/change/attribution insights (function + employees)
//   3. runPrLevel                → pr_level coaching insights
//   4. deriveAndStoreRecommendations → deterministic skill/process/course recs
//   5. assignCourses             → micro-course assignment for weak dimensions
//   6. monitorAdoption           → advance open recs on fresh evidence
//   7. queueDigests              → render + enqueue the daily email digests
//
// DESIGN INVARIANTS this module upholds (M1/M2 lessons + M4 hard rules):
//   • KEYLESS-SAFE: every callee is already keyless-safe (agents fall back to a mock model
//       when ANTHROPIC_API_KEY is absent; queueDigests only enqueues — the Edge Function is
//       the sole Resend holder and no-ops without a key). This module constructs no client
//       and reads no key directly, so it is safe to import/run with keys absent.
//   • FAULT ISOLATION: each step is wrapped so one failing connector/agent does NOT abort the
//       run. Scoring (step 1) is the hard prerequisite for everything downstream; if it fails
//       we record the failure and SKIP the dependent steps (they have nothing real to narrate)
//       — never fabricating rows. All later steps are independent and each is caught on its own.
//   • DETERMINISM BOUNDARY: untouched. This module orchestrates; it computes no scores and
//       invents no numbers. Every callee keeps numbers in code and the LLM to narrative only.
//
// The per-step summaries are collected verbatim so the caller (route response / Inngest run
// output) reflects exactly what each subsystem reported.
//
// SERVER-ONLY.

import { runPipeline, type PipelineSummary } from './run';
import { runInsightsForScope, runPrLevel, type AgentRunResult } from '@/lib/agents';
import { deriveAndStoreRecommendations, type DeriveResult } from '@/lib/recommendations';
import { assignCourses, type AssignCoursesSummary } from '@/lib/courses/assign';
import { monitorAdoption, type MonitorResult } from '@/lib/adoption';
import { queueDigests, type QueueDigestsResult } from '@/lib/email/outbox';

// ─────────────────────────────────────────────────────────────────────────────
// Result shape — one field per step, plus a top-level ok + notes rollup.
// ─────────────────────────────────────────────────────────────────────────────

export interface FullLoopResult {
  functionId: string;
  date: string;
  /** true when scoring ran AND no step threw. Optional-connector / agent-soft errors that
   *  the sub-summaries collect are surfaced as `warnings`, not failures (matches runPipeline's
   *  "ok = steps ran cleanly" contract). */
  ok: boolean;
  /** the scoring pass (always attempted first). */
  pipeline: PipelineSummary;
  /** downstream automation summaries — null when SKIPPED because scoring failed. */
  insights: AgentRunResult | null;
  prLevel: AgentRunResult | null;
  recommendations: DeriveResult | null;
  courses: AssignCoursesSummary | null;
  adoption: MonitorResult | null;
  digests: QueueDigestsResult | null;
  /** non-fatal notes: a step that threw, or sub-summary soft errors, gathered for the caller. */
  warnings: string[];
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Run one automation step under a guard: on throw, push a warning and return `fallback`
 * (so the loop keeps going). A step that RESOLVES with its own `errors[]` is not a throw —
 * those soft errors are folded into `warnings` by the caller.
 */
async function guarded<T>(
  label: string,
  warnings: string[],
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    warnings.push(`${label}: ${errMsg(e)}`);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// runFullLoop — the whole loop, once, for (functionId, date).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the complete daily automation loop for a function + run date. Never throws — each
 * step is guarded. Scoring runs first and gates the narrative steps: if scoring did not
 * produce a scored member, the downstream agents/recs/courses/digests are SKIPPED (there is
 * nothing real to narrate) and returned as null, leaving the loop a clean no-op rather than
 * emitting empty rows.
 */
export async function runFullLoop(args: { functionId: string; date: string }): Promise<FullLoopResult> {
  const { functionId, date } = args;
  const warnings: string[] = [];

  // 1. SCORE (hard prerequisite). runPipeline never throws, but guard anyway for symmetry.
  const pipeline = await guarded('pipeline', warnings, () => runPipeline({ functionId, date }), {
    ok: false,
    functionId,
    date,
    membersScored: 0,
    functionL1: null,
    confidence: 'insufficient' as const,
    band: null,
    counts: {
      employees: 0,
      windowPrs: 0,
      sessions: 0,
      deploys: 0,
      blameLines: 0,
      sizingPrs: 0,
      kpiRowsWritten: 0,
      indexRowsWritten: 0,
    },
    steps: [{ step: 'pipeline', ok: false, detail: 'threw before returning a summary' }],
    errors: ['pipeline threw'],
  });
  // Fold the pipeline's own soft errors into warnings (they don't fail the loop).
  if (pipeline.errors.length) warnings.push(...pipeline.errors.map((e) => `pipeline: ${e}`));

  // Gate: no scored member ⇒ nothing real for the agents to narrate. Skip cleanly.
  if (pipeline.membersScored === 0) {
    warnings.push('downstream skipped: scoring produced no members (empty/insufficient signal)');
    return {
      functionId,
      date,
      ok: pipeline.ok,
      pipeline,
      insights: null,
      prLevel: null,
      recommendations: null,
      courses: null,
      adoption: null,
      digests: null,
      warnings,
    };
  }

  // 2. INSIGHTS — improvement/change/attribution for function + each employee scope.
  const insights = await guarded('insights', warnings, () => runInsightsForScope(functionId, date), null);
  if (insights?.errors.length) warnings.push(...insights.errors.map((e) => `insights: ${e}`));

  // 3. PR-LEVEL — coaching insights per merged PR.
  const prLevel = await guarded('prLevel', warnings, () => runPrLevel(functionId, date), null);
  if (prLevel?.errors.length) warnings.push(...prLevel.errors.map((e) => `prLevel: ${e}`));

  // 4. RECOMMENDATIONS — deterministic rules → new open recs.
  const recommendations = await guarded('recommendations', warnings, () => deriveAndStoreRecommendations(functionId, date), null);
  if (recommendations?.errors.length) warnings.push(...recommendations.errors.map((e) => `recommendations: ${e}`));

  // 5. COURSES — assign a micro-course to weak-dimension employees.
  const courses = await guarded('courses', warnings, () => assignCourses(functionId, date), null);
  if (courses?.errors.length) warnings.push(...courses.errors.map((e) => `courses: ${e}`));

  // 6. ADOPTION — advance open recs on fresh evidence (runs AFTER recs are derived).
  const adoption = await guarded('adoption', warnings, () => monitorAdoption(functionId, date), null);
  if (adoption?.errors.length) warnings.push(...adoption.errors.map((e) => `adoption: ${e}`));

  // 7. DIGESTS — render + enqueue the daily email (no send here; Edge Function drains).
  const digests = await guarded('digests', warnings, () => queueDigests(functionId, date), null);

  // ok = scoring ran cleanly AND no step threw. Sub-summary soft errors are warnings only.
  const noThrows =
    insights !== null &&
    prLevel !== null &&
    recommendations !== null &&
    courses !== null &&
    adoption !== null &&
    digests !== null;

  return {
    functionId,
    date,
    ok: pipeline.ok && noThrows,
    pipeline,
    insights,
    prLevel,
    recommendations,
    courses,
    adoption,
    digests,
    warnings,
  };
}
