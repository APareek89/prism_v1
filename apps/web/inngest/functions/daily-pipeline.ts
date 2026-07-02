// inngest/functions/daily-pipeline.ts
//
// The durable daily automation loop, as an Inngest function. Bound to TWO triggers:
//   • cron '0 6 * * *' — the scheduled daily run (06:00 UTC).
//   • event 'pipeline.daily.requested' — on-demand / backfill run with the same semantics.
//
// Each stage of the loop runs inside its own `step.run(...)`, so Inngest:
//   • memoizes a step's result — a re-invocation (retry) resumes AFTER the steps that
//     already succeeded rather than re-running them;
//   • retries a failing step independently.
// On top of that, we try/CATCH inside every step so a failing connector or agent degrades to
// a recorded error object instead of throwing — one broken step never aborts the run, and the
// later steps still execute. (Scoring is the one hard prerequisite: if it produced no scored
// member we short-circuit the downstream steps, exactly like runFullLoop's own gate.)
//
// IDEMPOTENCY per (date, function_id):
//   • the function-level `idempotency` key ('prism-daily-{functionId}-{date}') makes Inngest
//     collapse duplicate triggers for the same day into a single run;
//   • every underlying write is already an idempotent upsert on its natural slot (insights
//     slot, open-rec dedupe, UNIQUE(employee,course), comms per (employee,date)), so even a
//     forced re-run replaces rather than duplicates.
//
// KEYLESS-SAFE: the callees are keyless-safe (mock agent model without Anthropic; digests
// only enqueue — the Edge Function is the sole Resend holder). The Inngest client itself needs
// no key to be constructed; INNGEST_* keys only matter for Inngest Cloud. `next build` passes
// with all of them absent.
//
// SERVER-ONLY.

import { inngest } from '../client';
import { runPipeline } from '@/lib/pipeline/run';
import { runInsightsForScope, runPrLevel } from '@/lib/agents';
import { deriveAndStoreRecommendations } from '@/lib/recommendations';
import { assignCourses } from '@/lib/courses/assign';
import { monitorAdoption } from '@/lib/adoption';
import { queueDigests } from '@/lib/email/outbox';
import { resolveBootstrapFunctionId } from '@/app/api/connectors/_lib/route-helpers';

/** Today's date 'YYYY-MM-DD' (UTC). Used when the trigger omits an explicit run date. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Wrap a step body so a throw becomes a recorded `{ ok:false, error }` result instead of
 * aborting the run. Inngest still memoizes the (resolved) result, so a resumed run doesn't
 * repeat a step that already finished — success or handled-failure alike.
 */
async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  try {
    return { ok: true, result: await fn() };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

export const dailyPipeline = inngest.createFunction(
  {
    id: 'daily-pipeline',
    name: 'Prism daily automation loop',
    // Collapse duplicate triggers for the same (function, date) into one run. `event.data`
    // is present for the event trigger; the cron trigger has no data, so the key falls back
    // to the day bucket — still one run per calendar day.
    idempotency: 'event.data.functionId + "-" + (event.data.date ?? event.ts)',
    // Bound conservatively: the loop is heavier than a single request; let one run finish
    // before the next starts for the same function.
    concurrency: { limit: 1 },
  },
  [{ cron: '0 6 * * *' }, { event: 'pipeline.daily.requested' }],
  async ({ event, step, logger }) => {
    // Resolve target (function, date). Event may override; cron uses the bootstrap function.
    const requestedFn = (event?.data as { functionId?: string } | undefined)?.functionId;
    const requestedDate = (event?.data as { date?: string } | undefined)?.date;

    const functionId =
      requestedFn ??
      (await step.run('resolve-function', async () => resolveBootstrapFunctionId()));

    if (!functionId) {
      logger.warn('daily-pipeline: no bootstrap function to run; skipping');
      return { ok: false, skipped: 'no_bootstrap_function' as const };
    }

    const date =
      typeof requestedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
        ? requestedDate
        : today();

    // 1. SCORE — hard prerequisite. runPipeline never throws, but keep it in a step for
    //    durability/memoization.
    const pipeline = await step.run('pipeline', async () => runPipeline({ functionId, date }));

    // Gate: no scored member ⇒ skip narrative steps (nothing real to say). Clean no-op.
    if (pipeline.membersScored === 0) {
      logger.info('daily-pipeline: scoring produced no members; skipping downstream steps', {
        functionId,
        date,
      });
      return {
        ok: pipeline.ok,
        functionId,
        date,
        pipeline,
        downstream: 'skipped_no_members' as const,
      };
    }

    // 2–7 — each guarded so one failing agent/connector doesn't abort the run.
    const insights = await step.run('insights', async () => safe(() => runInsightsForScope(functionId, date)));
    const prLevel = await step.run('pr-level', async () => safe(() => runPrLevel(functionId, date)));
    const recommendations = await step.run('recommendations', async () =>
      safe(() => deriveAndStoreRecommendations(functionId, date)),
    );
    const courses = await step.run('courses', async () => safe(() => assignCourses(functionId, date)));
    const adoption = await step.run('adoption', async () => safe(() => monitorAdoption(functionId, date)));
    const digests = await step.run('digests', async () => safe(() => queueDigests(functionId, date)));

    const allStepsOk = [insights, prLevel, recommendations, courses, adoption, digests].every((s) => s.ok);

    return {
      ok: pipeline.ok && allStepsOk,
      functionId,
      date,
      pipeline,
      insights,
      prLevel,
      recommendations,
      courses,
      adoption,
      digests,
    };
  },
);
