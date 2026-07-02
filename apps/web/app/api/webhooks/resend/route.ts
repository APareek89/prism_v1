// app/api/webhooks/resend/route.ts
//
// POST /api/webhooks/resend — Resend (Svix) webhook receiver for digest delivery/open.
//
// NOT auth-gated (server-to-server). Security is the Svix HMAC signature: we read the
// RAW body + the svix-* headers and verify against RESEND_WEBHOOK_SECRET before touching
// the DB (see lib/email/resend-webhook.ts). The raw bytes are what Resend signed, so we
// read req.text() untouched.
//
// On a verified `email.opened` we stamp comms_log.opened_at; on `email.delivered` we
// stamp comms_log.sent_at (belt-and-suspenders — the Edge Function already stamps it on
// send). Everything is keyed by the Resend message id ↔ comms_outbox.provider_message_id.
//
// Responses:
//   • verified + patched/ignored → 200 with a detail.
//   • bad/missing signature      → 401.
//   • not configured             → 200 ok:false (degrade; Resend retries are harmless).
// Never throws — a webhook must always answer.

import { verifyResendWebhook, readResendHeaders } from '@/lib/email/resend-webhook';
import { markOpenedByProviderMessageId, markDeliveredByProviderMessageId } from '@/lib/email/outbox';

export const dynamic = 'force-dynamic';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

export async function POST(req: Request): Promise<Response> {
  try {
    const rawBody = await req.text();
    const verified = verifyResendWebhook(rawBody, readResendHeaders(req));

    if (!verified.ok) {
      // "not configured" degrades to 200 (harmless retry); a real signature failure is 401.
      const notConfigured = verified.detail.includes('not configured');
      const status = notConfigured ? 200 : 401;
      return json({ ok: false, handled: false, detail: verified.detail }, status);
    }

    const handled = await handleEvent(verified.type, verified.messageId, verified.timestamp);
    return json({ ok: true, ...handled }, 200);
  } catch (e) {
    // Defensive: never let a webhook 500. Answer 200 so Resend does not hammer retries.
    return json({ ok: false, handled: false, detail: errMsg(e) }, 200);
  }
}

async function handleEvent(
  type: string | null,
  messageId: string | null,
  timestamp: string | null,
): Promise<{ handled: boolean; detail: string }> {
  if (!messageId) return { handled: false, detail: 'no message id on event' };
  const when = normalizeTs(timestamp);

  switch (type) {
    case 'email.opened': {
      const ok = await markOpenedByProviderMessageId(messageId, when);
      return { handled: ok, detail: ok ? 'opened_at stamped' : 'no matching digest' };
    }
    case 'email.delivered': {
      const ok = await markDeliveredByProviderMessageId(messageId, when);
      return { handled: ok, detail: ok ? 'sent_at confirmed' : 'no matching digest' };
    }
    default:
      // Bounces/complaints/clicks are acknowledged but not acted on in the MVP.
      return { handled: false, detail: `ignored event type: ${type ?? 'unknown'}` };
  }
}

/** Coerce the event timestamp to an ISO string; fall back to now on anything unusable. */
function normalizeTs(ts: string | null): string {
  if (!ts) return new Date().toISOString();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
