import { withAuth } from '@/lib/auth/guards';
import { badRequest, ok, readJson, serverError } from '@/app/api/connectors/_lib/route-helpers';
import { createTelemetryInvite, revokeTelemetryConnection } from '@/lib/connectors/telemetry/store';
import { isTelemetryProvider } from '@/lib/connectors/telemetry/types';
import { publicEnv } from '@/lib/config/env';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req, user): Promise<Response> => {
  const body = await readJson<{ provider?: string }>(req);
  if (!isTelemetryProvider(body?.provider)) {
    return badRequest('provider must be codex or claude_code');
  }

  try {
    const invite = await createTelemetryInvite({
      functionId: user.functionId,
      employeeId: user.employeeId,
      createdByEmployeeId: /^[0-9a-f-]{36}$/i.test(user.employeeId) ? user.employeeId : null,
      provider: body.provider,
      origin: new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin,
    });
    return ok({ ok: true, ...invite });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Could not create setup command');
  }
});

export const DELETE = withAuth(async (req, user): Promise<Response> => {
  const body = await readJson<{ provider?: string }>(req);
  if (!isTelemetryProvider(body?.provider)) {
    return badRequest('provider must be codex or claude_code');
  }

  try {
    const revoked = await revokeTelemetryConnection({
      functionId: user.functionId,
      employeeId: user.employeeId,
      provider: body.provider,
    });
    return ok({ ok: true, revoked });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Could not disconnect');
  }
});
