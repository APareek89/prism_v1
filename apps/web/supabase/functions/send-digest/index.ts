// supabase/functions/send-digest/index.ts
//
// The send-digest Edge Function (Deno). The daily loop invokes it after queueDigests()
// has written the comms_outbox work queue; it DRAINS pending rows and delivers them via
// Resend — the only component that holds RESEND_API_KEY.
//
// Contract:
//   • Reads pending comms_outbox rows (scheduled_at ≤ now), joins each to its comms_log
//     payload_html, sends via Resend, then patches:
//       success → comms_outbox {status:'sent', sent_at, provider_message_id, attempts+1}
//                 + comms_log  {sent_at}
//       failure → comms_outbox {status:'failed', last_error, attempts+1}
//       no HTML → comms_outbox {status:'skipped'}  (nothing to send; never fabricate)
//   • KEYLESS-SAFE: if RESEND_API_KEY is absent it returns 200 with resendConfigured:false
//     and drains nothing — rows stay pending for a later run. Mirrors the app's
//     isConfigured('resend') === false degrade path; no throw, no partial send.
//   • Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected into every Edge
//     Function) via the service-role client, which BYPASSES RLS — the queue has no
//     end-user policy, so this is the only actor that drains it.
//
// verify_jwt=false (config.toml): the function is invoked server-to-server by the daily
// loop. It performs no destructive action beyond sending already-rendered, already-
// queued digests, and does nothing at all without the Resend key.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isResendConfigured, sendEmail } from './resend.ts';
import type {
  CommsLogPayload,
  DrainItemResult,
  DrainResult,
  OutboxRow,
} from './types.ts';

const JSON_HEADERS = { 'content-type': 'application/json' } as const;
const DEFAULT_BATCH = 50;

function admin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in Edge runtime');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Keyless-safe short-circuit: no Resend key ⇒ no-op (rows stay pending).
  if (!isResendConfigured()) {
    const body: DrainResult = {
      ok: true,
      resendConfigured: false,
      drained: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      note: 'RESEND_API_KEY not configured — digests remain queued (no-op).',
      items: [],
    };
    console.log('[send-digest] RESEND_API_KEY absent; no-op drain.');
    return json(body, 200);
  }

  const limit = await readLimit(req);

  try {
    const items = await drain(limit);
    const body: DrainResult = {
      ok: true,
      resendConfigured: true,
      drained: items.length,
      sent: items.filter((i) => i.status === 'sent').length,
      failed: items.filter((i) => i.status === 'failed').length,
      skipped: items.filter((i) => i.status === 'skipped').length,
      items,
    };
    console.log(`[send-digest] drained=${body.drained} sent=${body.sent} failed=${body.failed} skipped=${body.skipped}`);
    return json(body, 200);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[send-digest] error:', detail);
    return json(
      { ok: false, resendConfigured: true, drained: 0, sent: 0, failed: 0, skipped: 0, note: detail, items: [] } as DrainResult,
      500,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// drain — claim pending rows and deliver them.
// ─────────────────────────────────────────────────────────────────────────────

async function drain(limit: number): Promise<DrainItemResult[]> {
  const db = admin();
  const nowIso = new Date().toISOString();

  const { data: pending, error } = await db
    .from('comms_outbox')
    .select('id, function_id, employee_id, comms_log_id, date, channel, to_email, subject, status, attempts')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`comms_outbox read failed: ${error.message}`);
  const rows = (pending ?? []) as OutboxRow[];
  if (rows.length === 0) return [];

  const results: DrainItemResult[] = [];
  for (const row of rows) {
    results.push(await deliverOne(db, row));
  }
  return results;
}

async function deliverOne(
  db: ReturnType<typeof admin>,
  row: OutboxRow,
): Promise<DrainItemResult> {
  const base = { outboxId: row.id, commsLogId: row.comms_log_id, toEmail: row.to_email };

  // Claim the row (pending → sending) so a concurrent invocation won't re-send it.
  const claimed = await claim(db, row.id);
  if (!claimed) {
    return { ...base, status: 'skipped', detail: 'row already claimed by a concurrent drain' };
  }

  // Fetch the pre-rendered payload from the ledger.
  const { data: logData, error: logErr } = await db
    .from('comms_log')
    .select('id, payload_html')
    .eq('id', row.comms_log_id)
    .maybeSingle();

  const payload = logData as CommsLogPayload | null;
  if (logErr || !payload || !payload.payload_html) {
    await db
      .from('comms_outbox')
      .update({ status: 'skipped', last_error: 'no payload_html on comms_log', attempts: row.attempts + 1 })
      .eq('id', row.id);
    return { ...base, status: 'skipped', detail: 'no payload_html' };
  }

  const send = await sendEmail({ to: row.to_email, subject: row.subject, html: payload.payload_html });
  const when = new Date().toISOString();

  if (!send.ok) {
    await db
      .from('comms_outbox')
      .update({ status: 'failed', last_error: (send.error ?? 'unknown').slice(0, 500), attempts: row.attempts + 1 })
      .eq('id', row.id);
    return { ...base, status: 'failed', detail: send.error ?? 'unknown' };
  }

  // Success: stamp both tables.
  await db
    .from('comms_outbox')
    .update({ status: 'sent', sent_at: when, provider_message_id: send.id, attempts: row.attempts + 1 })
    .eq('id', row.id);
  await db.from('comms_log').update({ sent_at: when }).eq('id', row.comms_log_id);

  return { ...base, status: 'sent', providerMessageId: send.id ?? undefined };
}

/**
 * Atomically claim a pending row (status pending → sending). Guards against a double
 * send when two invocations overlap: the .eq('status','pending') filter means only one
 * update touches a row. Returns true when THIS caller won the claim.
 */
async function claim(db: ReturnType<typeof admin>, outboxId: string): Promise<boolean> {
  const { data, error } = await db
    .from('comms_outbox')
    .update({ status: 'sending' })
    .eq('id', outboxId)
    .eq('status', 'pending')
    .select('id');
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

async function readLimit(req: Request): Promise<number> {
  try {
    if (req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as { limit?: number } | null;
      if (body && typeof body.limit === 'number' && body.limit > 0) {
        return Math.min(Math.floor(body.limit), 500);
      }
    }
    const url = new URL(req.url);
    const q = url.searchParams.get('limit');
    if (q) {
      const n = Number(q);
      if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 500);
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_BATCH;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
