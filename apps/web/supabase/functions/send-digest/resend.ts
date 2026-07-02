// supabase/functions/send-digest/resend.ts
//
// The ONLY holder of RESEND_API_KEY in the whole system (architecture §7 / A3). The
// Next.js app never constructs a Resend client — it merely queues comms_outbox rows.
// This Deno module reads the key from the Edge Function's own secret store and calls
// the Resend REST API directly (no SDK dependency, so the function has zero npm deps).
//
// KEYLESS-SAFE: isResendConfigured() gates every call. With no key the drainer no-ops
// (rows stay pending), exactly like the app's isConfigured('resend') === false path.

import type { ResendSendResult } from './types.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** True when RESEND_API_KEY is present in the Edge Function secret store. */
export function isResendConfigured(): boolean {
  const key = Deno.env.get('RESEND_API_KEY');
  return typeof key === 'string' && key.length > 0;
}

/** The From address, from DIGEST_FROM_EMAIL, with a safe default. */
function fromAddress(): string {
  const from = Deno.env.get('DIGEST_FROM_EMAIL');
  return from && from.length > 0 ? from : 'Prism <digest@prism.local>';
}

/**
 * Send one email via Resend. Never throws — returns { ok, id, error }. The caller uses
 * `id` (the Resend message id) as the natural key that the open/delivery webhook later
 * resolves back to the comms_log row.
 */
export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<ResendSendResult> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, id: null, error: 'RESEND_API_KEY not configured' };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [args.to],
        subject: args.subject,
        html: args.html,
      }),
    });

    if (!res.ok) {
      const text = await safeText(res);
      return { ok: false, id: null, error: `resend ${res.status}: ${text}` };
    }

    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id ?? null, error: null };
  } catch (e) {
    return { ok: false, id: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '<unreadable body>';
  }
}
