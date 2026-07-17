import { withAdmin } from '@/lib/auth/guards';
import { badRequest, ok, readJson, serverError } from '@/app/api/connectors/_lib/route-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  linkInvitedWorkspaceUser,
  prepareWorkspaceInvite,
} from '@/lib/auth/workspace';

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
    if (employee.existingUserId) {
      return ok({
        ok: true,
        status: 'already_linked',
        email: employee.email,
        detail: 'This person already has workspace access. They can sign in for a fresh magic link.',
      });
    }

    const redirectTo = `${new URL(req.url).origin}/auth/callback`;
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(employee.email, {
      redirectTo,
      data: {
        prism_employee_id: employee.employeeId,
        prism_employee_name: employee.employeeName,
      },
    });
    if (error) throw error;
    if (!data.user?.id) throw new Error('Supabase did not return the invited user.');

    await linkInvitedWorkspaceUser({
      functionId: user.functionId,
      employeeId: employee.employeeId,
      userId: data.user.id,
    });

    return ok({
      ok: true,
      status: 'sent',
      email: employee.email,
      detail: 'Supabase sent the workspace invitation. The command will be waiting after sign-in.',
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Could not send workspace invitation');
  }
});
