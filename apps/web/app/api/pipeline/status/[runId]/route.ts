// app/api/pipeline/status/[runId]/route.ts
//
// GET /api/pipeline/status/:runId — run-status probe. The M2 pipeline runs SYNCHRONOUSLY
// inside POST /api/pipeline/run (the summary is returned in that response), so there is no
// async job store to query yet. This is a forward-compatible STUB: it acknowledges a runId
// and reports the synchronous-run contract, so a future Inngest/queue-backed pipeline (M4)
// can fill in real per-run status without changing the route shape.
//
// Auth-gated (any authenticated user). Never throws.

import { withAuth } from '@/lib/auth/guards';
import type { AuthUser } from '@/lib/types';
import { ok, badRequest } from '../../../connectors/_lib/route-helpers';

export const dynamic = 'force-dynamic';

export const GET = withAuth<{ params: Promise<{ runId: string }> }>(
  async (_req: Request, _user: AuthUser, ctx): Promise<Response> => {
    const { runId } = await ctx.params;
    if (!runId) return badRequest('missing runId');

    // M2 runs are synchronous — the summary is delivered in the POST /run response.
    // Report a stable, honest shape rather than inventing progress.
    return ok({
      ok: true,
      runId,
      status: 'synchronous',
      detail:
        'Pipeline runs synchronously; the result is returned by POST /api/pipeline/run. ' +
        'Async run tracking arrives with the queue-backed pipeline.',
    });
  },
);
