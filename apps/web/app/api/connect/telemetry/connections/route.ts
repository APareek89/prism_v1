import { withAdmin } from '@/lib/auth/guards';
import { badRequest, ok, readJson, serverError } from '@/app/api/connectors/_lib/route-helpers';
import { revokeTelemetryConnection } from '@/lib/connectors/telemetry/store';
import { isTelemetryProvider } from '@/lib/connectors/telemetry/types';

export const dynamic = 'force-dynamic';

export const DELETE = withAdmin(async (req, user): Promise<Response> => {
  const body = await readJson<{ employeeId?: string; provider?: string }>(req);
  if (!body?.employeeId || !isTelemetryProvider(body.provider)) {
    return badRequest('employeeId and provider are required');
  }
  try {
    const revoked = await revokeTelemetryConnection({
      functionId: user.functionId,
      employeeId: body.employeeId,
      provider: body.provider,
    });
    return ok({ ok: true, revoked });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Could not revoke connection');
  }
});

