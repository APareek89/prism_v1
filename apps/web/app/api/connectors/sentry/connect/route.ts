// app/api/connectors/sentry/connect/route.ts
//
// POST /api/connectors/sentry/connect — connect + ingest Sentry (releases → deploys,
// issues → incidents).
//
// GRACEFUL DEGRADATION: SENTRY_* ship blank. When not configured, connect() records the
// connector row as 'not_configured', ingest writes nothing, and this route answers 200
// with status 'not_configured' instead of erroring — F3 (change-failure / MTTR) simply
// has no signal.
//
// Admin-gated. Never throws.

import { withAdmin } from '@/lib/auth/guards';
import { sentryConnector, ingestSentry } from '@/lib/connectors/sentry';
import { isConfigured } from '@/lib/config/env';
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
    // Persist/refresh the connectors row (records 'not_configured' when blank).
    await sentryConnector.connect(functionId);

    if (!isConfigured('sentry')) {
      return ok({
        ok: true,
        status: 'not_configured',
        detail: 'Sentry is not configured — change-failure & MTTR have no signal yet.',
        written: 0,
      });
    }

    // Configured: pull releases + issues and write deploys/incidents.
    const result = await ingestSentry(functionId);
    return ok({
      ok: result.errors.length === 0,
      status: result.errors.length === 0 ? 'connected' : 'error',
      written: result.written,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (e) {
    return serverError(errMessage(e));
  }
});
