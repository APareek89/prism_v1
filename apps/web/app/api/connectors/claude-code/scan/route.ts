// app/api/connectors/claude-code/scan/route.ts
//
// POST /api/connectors/claude-code/scan — scan the LOCAL ~/.claude session files.
//
// Ensures the is_demo "self employee" exists (so the parsed sessions bind to a REAL
// employees row the pipeline scores), then walks + parses + persists cc_sessions for the
// bootstrap function. Returns the ingest tally (written/skipped) so the Admin button can
// surface "N sessions ingested".
//
// Admin-gated. Keyless-safe: CLAUDE_LOCAL_SESSIONS_DIR has a default; an empty/missing
// dir writes nothing and reports a clean empty result. Never throws.

import { withAdmin } from '@/lib/auth/guards';
import { scanLocalSessions } from '@/lib/connectors/claude-code';
import { ensureSelfEmployee } from '@/lib/onboarding/provision';
import {
  ok,
  badRequest,
  serverError,
  resolveBootstrapFunctionId,
  errMessage,
} from '../../_lib/route-helpers';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (): Promise<Response> => {
  const functionId = await resolveBootstrapFunctionId();
  if (!functionId) return badRequest('no bootstrap function');

  try {
    // 1) Make sure the demo person is a real employees row before sessions bind to it.
    const provision = await ensureSelfEmployee({ functionId });

    // 2) Walk + parse + persist local sessions.
    const result = await scanLocalSessions(functionId);

    return ok({
      ok: result.errors.length === 0,
      ingested: result.written,
      skipped: result.skipped,
      // "unmatched" sessions are those parsed but with no employee binding; in the
      // single-person demo everything binds to the self employee, so this is the
      // skipped count attributable to no-identity rows. Surfaced for the Admin tally.
      unmatched: result.skipped,
      selfEmployeeCreated: provision.created,
      errors: result.errors,
    });
  } catch (e) {
    return serverError(errMessage(e));
  }
});
