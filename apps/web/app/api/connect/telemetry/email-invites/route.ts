import { withAdmin } from '@/lib/auth/guards';
import { badRequest, ok, readJson, serverError } from '@/app/api/connectors/_lib/route-helpers';
import { prepareWorkspaceInvite } from '@/lib/auth/workspace';
import { sendWorkspaceMagicLink } from '@/lib/auth/magic-link';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(async (req, user): Promise<Response> => {
  const body = await readJson<{ employeeId?: string; email?: string }>(req);
  if (!body?.employeeId || !body.email) {
    return badRequest('employeeId and email are required');
  }

  try {
    const employee = await prepareWorkspaceInvite({
      functionId: user.functionId,
      employeeId: body.employeeId,
      email: body.email,
    });
    const sent = await sendWorkspaceMagicLink(employee.email);
    if (sent.status !== 'sent') throw new Error('The workspace email could not be resolved.');

    return ok({
      ok: true,
      status: employee.existingUserId ? 'already_linked' : 'sent',
      email: employee.email,
      detail: 'Prism sent a one-time Supabase login link. The command will be waiting after sign-in.',
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Could not send workspace invitation');
  }
});
