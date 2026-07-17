import { sendWorkspaceMagicLink } from '@/lib/auth/magic-link';
import { badRequest, ok, readJson, serverError } from '@/app/api/connectors/_lib/route-helpers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const body = await readJson<{ email?: string }>(req);
  if (!body?.email) return badRequest('Enter your work email address.');

  try {
    const result = await sendWorkspaceMagicLink(body.email);
    // The response is intentionally identical for linked and unknown emails.
    return ok({
      ok: true,
      status: 'sent',
      detail: 'If that email is linked to Prism, its one-time sign-in link is on the way.',
      delivery: result.status === 'sent' ? result.delivery : null,
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Could not send the magic link.');
  }
}
