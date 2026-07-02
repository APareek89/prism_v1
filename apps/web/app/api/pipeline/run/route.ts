// app/api/pipeline/run/route.ts
//
// POST /api/pipeline/run — run the FULL M4 automation loop on demand for the bootstrap
// function ("Run pipeline now" in Admin).
//
// This is the same loop the durable Inngest daily function runs, driven synchronously here
// via the ONE shared orchestrator (lib/pipeline/full-loop.runFullLoop):
//   scoring (runPipeline) → insights + pr_level → recommendations → courses → adoption →
//   digests. Scoring is the hard prerequisite; if it produces no scored member the narrative
//   steps are skipped (nothing real to narrate) rather than emitting empty rows.
//
// KEYLESS-SAFE end-to-end: agents fall back to a mock model when ANTHROPIC_API_KEY is absent;
// digests only ENQUEUE (the send-digest Edge Function is the sole RESEND_API_KEY holder and
// no-ops without it). runFullLoop constructs no client and never throws — each step is guarded.
//
// Admin-gated (run_pipeline capability). Returns the FullLoopResult so the button surfaces the
// per-step summaries. `ok` = scoring ran cleanly AND no step threw; optional-connector / agent
// soft errors are non-fatal `warnings`, not failures.

import { withAdmin } from '@/lib/auth/guards';
import { runFullLoop } from '@/lib/pipeline/full-loop';
import {
  ok,
  badRequest,
  serverError,
  resolveBootstrapFunctionId,
  readJson,
  errMessage,
} from '../../connectors/_lib/route-helpers';

export const dynamic = 'force-dynamic';
// The full loop (ingest + agents + digests) can exceed the default serverless budget; give
// it headroom. Ignored locally; honored on platforms that read the segment config.
export const maxDuration = 300;

/** Today's date as 'YYYY-MM-DD' (UTC) — the run date for the loop. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const POST = withAdmin(async (req: Request): Promise<Response> => {
  const functionId = await resolveBootstrapFunctionId();
  if (!functionId) return badRequest('no bootstrap function to score');

  const body = (await readJson<{ date?: string }>(req)) ?? {};
  const date =
    typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today();

  try {
    const summary = await runFullLoop({ functionId, date });
    // Always 200 — runFullLoop encodes per-step outcome in the body; a soft failure is not
    // an HTTP error (the caller inspects summary.ok / summary.warnings).
    return ok(summary, 200);
  } catch (e) {
    return serverError(errMessage(e));
  }
});
