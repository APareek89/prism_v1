// app/api/comms/test/route.ts
//
// POST /api/comms/test — render + queue (and best-effort trigger delivery of) THIS user's
// daily digest, so the email path is testable end-to-end without waiting for the cron.
//
// What it does, in order:
//   1. Resolve the current employee (getAuthUser) and the run date (body.date | today).
//   2. renderDigest(employeeId, date) — returns null under empty-state suppression (no real
//      signal). We report that verbatim; we never fabricate a digest to have something to send.
//   3. queueOne(...) — write the comms_log ledger row + comms_outbox work row (idempotent per
//      (employee, date)). This is the SAME write path queueDigests uses.
//   4. Best-effort emit the 'comms.send' Inngest event for the queued comms_log row, so a
//      running Inngest Dev Server / Cloud can drain it now. The ACTUAL Resend call is owned by
//      the send-digest Edge Function (the sole RESEND_API_KEY holder) — this route never
//      constructs a Resend client.
//
// KEYLESS-SAFE: with RESEND_API_KEY blank the digest still QUEUES; the send simply no-ops
// downstream (rows stay pending) and we say so. With Inngest unconfigured the event emit is
// skipped without error. Nothing here throws on a missing key.
//
// Auth: any authenticated user may test their OWN digest (no admin needed — it only touches
// the caller's employee). In DEMO_MODE the caller resolves to the is_demo self employee.

import { getAuthUser } from '@/lib/auth/session';
import { renderDigest } from '@/lib/email/render';
import { queueOne } from '@/lib/email/outbox';
import { isConfigured } from '@/lib/config/env';
import { inngest } from '@/inngest/client';
import { EVENTS } from '@/inngest/events';
import { ok, badRequest, serverError, readJson, errMessage } from '../../connectors/_lib/route-helpers';

export const dynamic = 'force-dynamic';

/** Today's date as 'YYYY-MM-DD' (UTC). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request): Promise<Response> {
  const user = await getAuthUser();
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = (await readJson<{ date?: string }>(req)) ?? {};
  const date =
    typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today();

  const { employeeId, functionId } = user;
  if (!functionId || !employeeId) {
    return badRequest('current user has no resolved function/employee to test against');
  }

  try {
    // 2. Render — null ⇒ empty-state suppression (report, don't fabricate).
    const rendered = await renderDigest(employeeId, date);
    if (!rendered) {
      return ok({
        ok: true,
        status: 'suppressed_no_signal',
        detail: 'No real signal for this employee/date yet — nothing to queue (empty-state suppression).',
        employeeId,
        date,
      });
    }

    // 3. Queue (idempotent per (employee, date)) — the same write path as queueDigests.
    const queued = await queueOne(functionId, employeeId, date);

    // 4. Best-effort delivery trigger. Only when we actually enqueued a deliverable row
    //    (status queued/requeued ⇒ a comms_log id exists and an outbox row was written).
    let deliveryTriggered = false;
    let deliveryNote: string;
    const deliverable = (queued.status === 'queued' || queued.status === 'requeued') && Boolean(queued.commsLogId);

    if (!deliverable) {
      deliveryNote =
        queued.status === 'skipped_no_email'
          ? 'queued to ledger but no recipient email on file — nothing to deliver.'
          : `not deliverable (status=${queued.status}).`;
    } else if (!isConfigured('resend')) {
      // Resend absent: the queued row will stay pending; the Edge Function no-ops until a key
      // exists. Surface that clearly rather than pretending a send happened.
      deliveryNote =
        'RESEND_API_KEY is not configured — digest is QUEUED but will not be delivered until the send-digest Edge Function has a key.';
    } else {
      // Resend configured: signal the drain via Inngest if it's available; otherwise the
      // scheduled Edge Function sweep will pick it up.
      if (isConfigured('inngest')) {
        try {
          await inngest.send({
            name: EVENTS.COMMS_SEND,
            data: { commsLogId: queued.commsLogId!, functionId, employeeId },
          });
          deliveryTriggered = true;
          deliveryNote = 'queued and comms.send event emitted; send-digest Edge Function will deliver via Resend.';
        } catch (e) {
          deliveryNote = `queued; comms.send emit failed (${errMessage(e)}). The Edge Function sweep will still deliver it.`;
        }
      } else {
        deliveryNote =
          'queued; Inngest not configured so no immediate trigger — the send-digest Edge Function sweep will deliver it via Resend.';
      }
    }

    return ok({
      ok: true,
      status: queued.status,
      employeeId,
      functionId,
      date,
      toEmail: rendered.toEmail,
      subject: rendered.subject,
      commsLogId: queued.commsLogId ?? null,
      outboxId: queued.outboxId ?? null,
      resendConfigured: isConfigured('resend'),
      deliveryTriggered,
      deliveryNote,
    });
  } catch (e) {
    return serverError(errMessage(e));
  }
}
