// app/api/connectors/github/sync-members/route.ts
//
// POST /api/connectors/github/sync-members — onboard org/collaborator members.
//
// Discovers the people who can author PRs in the function's repos (org members, or
// per-repo collaborators on a personal install) and idempotently provisions them as
// employees via the onboarding service. This is the GitHub-side entry point
// `syncGithubOrgMembers(functionId)` (the functionId-only wrapper around the onboarding
// `syncOrgMembers(functionId, members)` mapper).
//
// Admin-gated. Keyless-safe: degrades to an empty result when the App isn't configured.

import { withAdmin } from '@/lib/auth/guards';
import { syncGithubOrgMembers } from '@/lib/connectors/github/org-sync';
import { isGithubConfigured } from '@/lib/connectors/github/client';
import {
  ok,
  badRequest,
  serverError,
  notConfigured,
  resolveBootstrapFunctionId,
  errMessage,
} from '../../_lib/route-helpers';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (): Promise<Response> => {
  if (!isGithubConfigured()) return notConfigured('GitHub App is not configured');

  const functionId = await resolveBootstrapFunctionId();
  if (!functionId) return badRequest('no bootstrap function');

  try {
    const result = await syncGithubOrgMembers(functionId);
    return ok({
      ok: true,
      provisioned: result.provisioned,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (e) {
    return serverError(errMessage(e));
  }
});
