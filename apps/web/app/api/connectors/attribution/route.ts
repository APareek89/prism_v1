// app/api/connectors/attribution/route.ts
//
// GET/POST /api/connectors/attribution — the org-level "how unmatched telemetry streams
// are handled" policy from the Admin AttributionSelector (Org workspace · BYO
// reimbursement · Hybrid).
//
// This is a FUNCTION-LEVEL policy (not the per-employee AttributionMode enum), so we
// persist it on the claude_code connector's config_jsonb under `attribution_policy`
// (the Claude-Code stream is what the policy governs). GET returns the current value
// (default 'hybrid'); POST stores a new one.
//
// Admin-gated. Never throws.

import { withAdmin } from '@/lib/auth/guards';
import { getConnectorRecord, upsertConfig } from '@/lib/connectors/status';
import {
  ok,
  badRequest,
  serverError,
  resolveBootstrapFunctionId,
  readJson,
  errMessage,
} from '../_lib/route-helpers';

export const dynamic = 'force-dynamic';

type AttributionPolicy = 'org' | 'byo' | 'hybrid';
const POLICIES: AttributionPolicy[] = ['org', 'byo', 'hybrid'];

function readPolicy(config: Record<string, unknown> | undefined): AttributionPolicy {
  const v = config?.attribution_policy;
  return typeof v === 'string' && (POLICIES as string[]).includes(v) ? (v as AttributionPolicy) : 'hybrid';
}

export const GET = withAdmin(async (): Promise<Response> => {
  const functionId = await resolveBootstrapFunctionId();
  if (!functionId) return ok({ ok: true, mode: 'hybrid' });
  try {
    const rec = await getConnectorRecord(functionId, 'claude_code');
    return ok({ ok: true, mode: readPolicy(rec?.config_jsonb) });
  } catch (e) {
    return serverError(errMessage(e));
  }
});

export const POST = withAdmin(async (req: Request): Promise<Response> => {
  const body = await readJson<{ mode?: string }>(req);
  if (!body) return badRequest('invalid JSON body');
  const mode = body.mode;
  if (!mode || !(POLICIES as string[]).includes(mode)) {
    return badRequest(`mode must be one of ${POLICIES.join(', ')}`);
  }

  const functionId = await resolveBootstrapFunctionId();
  if (!functionId) return badRequest('no bootstrap function');

  try {
    // Merge the policy onto the claude_code connector config WITHOUT flipping its status
    // (pass the existing status so an unconfigured connector stays 'not_configured').
    const rec = await getConnectorRecord(functionId, 'claude_code');
    const res = await upsertConfig(
      functionId,
      'claude_code',
      { attribution_policy: mode },
      rec?.status ?? 'not_configured',
    );
    if (!res.ok) return serverError(res.error ?? 'failed to persist attribution policy');
    return ok({ ok: true, mode });
  } catch (e) {
    return serverError(errMessage(e));
  }
});
