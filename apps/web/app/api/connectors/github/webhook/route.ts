// app/api/connectors/github/webhook/route.ts
//
// POST /api/connectors/github/webhook — GitHub App webhook receiver.
//
// NOT auth-gated (server-to-server). Security is the HMAC signature: the connector
// verifies the raw body against GITHUB_APP_WEBHOOK_SECRET inside handleGitHubWebhook,
// which reads the raw request body + x-hub-signature-256 itself. We hand it the Request
// untouched so the bytes used for verification are exactly the bytes GitHub signed.
//
// Responses:
//   • verified + handled/ignored → 200 with a detail.
//   • bad/missing signature      → 401 (handleGitHubWebhook returns ok:false).
//   • not configured             → 200 ok:false (degrade; GitHub retries are harmless).
// Never throws — a webhook handler must always answer.

import { handleGitHubWebhook } from '@/lib/connectors/github';
import { errMessage } from '../../_lib/route-helpers';

export const dynamic = 'force-dynamic';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

export async function POST(req: Request): Promise<Response> {
  try {
    const result = await handleGitHubWebhook(req);
    // ok:false from the connector means signature/config problem → 401 so GitHub flags it.
    const status = result.ok ? 200 : 401;
    return new Response(JSON.stringify(result), { status, headers: JSON_HEADERS });
  } catch (e) {
    // Defensive: the connector is non-throwing, but never let a webhook 500 the App.
    return new Response(
      JSON.stringify({ ok: false, handled: false, detail: errMessage(e) }),
      { status: 200, headers: JSON_HEADERS },
    );
  }
}
