// app/api/connectors/employees/match/route.ts
//
// POST /api/connectors/employees/match — bind a Claude account / GitHub handle to an
// employee (the Admin roster "Match" action).
//
// Body (one of):
//   { employeeId, claudeAccountUuid?, githubHandle?, email?, attributionMode? }
//   { name, githubHandle?, email?, claudeAccountUuid?, attributionMode? }
//
// With employeeId we patch that exact row (direct bind) and recompute match_status from
// attributionMode. Without it we route through the idempotent provisioning service
// (resolve-or-create by identity), which derives attribution from the supplied identity.
//
// Admin-gated. Never throws.

import { withAdmin } from '@/lib/auth/guards';
import { provisionEmployee, deriveAttribution } from '@/lib/onboarding/provision';
import { updateEmployee } from '@/lib/db/onboarding';
import type { AttributionMode } from '@/lib/types/db';
import {
  ok,
  badRequest,
  serverError,
  resolveBootstrapFunctionId,
  readJson,
  errMessage,
} from '../../_lib/route-helpers';

export const dynamic = 'force-dynamic';

interface MatchBody {
  employeeId?: string;
  name?: string;
  githubHandle?: string | null;
  email?: string | null;
  claudeAccountUuid?: string | null;
  attributionMode?: AttributionMode;
}

function norm(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

export const POST = withAdmin(async (req: Request): Promise<Response> => {
  const body = await readJson<MatchBody>(req);
  if (!body) return badRequest('invalid JSON body');

  const functionId = await resolveBootstrapFunctionId();
  if (!functionId) return badRequest('no bootstrap function');

  const githubHandle = norm(body.githubHandle);
  const claudeAccountUuid = norm(body.claudeAccountUuid);
  const email = norm(body.email);

  try {
    // ── direct bind by employeeId ─────────────────────────────────────────────
    if (norm(body.employeeId)) {
      // Recompute attribution from the (override or) supplied identity so match_status
      // stays consistent with the binding.
      const { attribution_mode, match_status } = deriveAttribution(
        { githubHandle, claudeAccountUuid },
        body.attributionMode,
      );
      const updated = await updateEmployee(String(body.employeeId), {
        github_handle: githubHandle ?? undefined,
        email: email ?? undefined,
        claude_account_uuid: claudeAccountUuid ?? undefined,
        attribution_mode,
        match_status,
      });
      if (!updated) return serverError('employee update failed');
      return ok({ ok: true, employeeId: updated.id, match: updated.match_status, attribution: updated.attribution_mode });
    }

    // ── resolve-or-create by identity ─────────────────────────────────────────
    const name = norm(body.name);
    if (!name && !githubHandle && !email && !claudeAccountUuid) {
      return badRequest('provide employeeId, or a name/identity to match');
    }
    const outcome = await provisionEmployee({
      functionId,
      name: name ?? githubHandle ?? email ?? 'Unnamed',
      githubHandle,
      email,
      claudeAccountUuid,
      attributionMode: body.attributionMode,
    });
    if (!outcome.ok || !outcome.employee) {
      return serverError(outcome.error ?? 'provision failed');
    }
    return ok({
      ok: true,
      employeeId: outcome.employee.id,
      created: outcome.created,
      match: outcome.employee.match_status,
      attribution: outcome.employee.attribution_mode,
    });
  } catch (e) {
    return serverError(errMessage(e));
  }
});
