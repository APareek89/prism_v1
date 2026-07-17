import { withAdmin } from '@/lib/auth/guards';
import { readJson, badRequest, ok, serverError } from '@/app/api/connectors/_lib/route-helpers';
import { createTelemetryInvite } from '@/lib/connectors/telemetry/store';
import { isTelemetryProvider } from '@/lib/connectors/telemetry/types';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (req, user): Promise<Response> => {
  const body = await readJson<{ employeeId?: string; provider?: string }>(req);
  if (!body?.employeeId || !isTelemetryProvider(body.provider)) {
    return badRequest('employeeId and provider (codex or claude_code) are required');
  }

  try {
    const invite = await createTelemetryInvite({
      functionId: user.functionId,
      employeeId: body.employeeId,
      createdByEmployeeId: /^[0-9a-f-]{36}$/i.test(user.employeeId) ? user.employeeId : null,
      provider: body.provider,
      origin: new URL(req.url).origin,
    });
    return ok({ ok: true, ...invite });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Could not create invite');
  }
});

