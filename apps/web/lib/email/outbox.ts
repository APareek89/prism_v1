// lib/email/outbox.ts
//
// The WRITE side of the digest: it renders each employee's digest and enqueues it for
// delivery. Two tables, one purpose (mirrors lib/pipeline/persist.ts's service-role
// write style):
//   • comms_log   (0012) — the delivery ledger. One row per digest carrying the
//                  rendered payload_html. "queued" = the row exists with payload_html
//                  but sent_at/opened_at null (the member.ts read derives its label
//                  from those timestamps; there is no status column).
//   • comms_outbox(0031) — the durable work queue the send-digest Edge Function drains.
//                  Carries recipient + subject + queue state + the Resend message id.
//
// SERVER-ONLY, service-role (RLS-bypassing). This is the pipeline write path; the
// lib/db read modules never write. No email is SENT here — sending is the Edge
// Function's job (the only holder of RESEND_API_KEY). We only queue.
//
// No-dummy-data: renderDigest returns null when there is no real signal, so an empty
// digest is never queued. Idempotent per (employee, date): a second queue call for the
// same day updates the existing rows rather than duplicating them.

import { createAdminClient } from '@/lib/supabase/admin';
import { renderDigest, type RenderedDigest } from './render';

// ─────────────────────────────────────────────────────────────────────────────
// Loose service-role surface (generated Database type is an empty placeholder).
// ─────────────────────────────────────────────────────────────────────────────

interface LooseResult extends Promise<{ data: unknown; error: { message?: string } | null }> {
  eq: (col: string, val: unknown) => LooseResult;
  order: (col: string, opts?: unknown) => LooseResult;
  limit: (n: number) => LooseResult;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
  select: (cols?: string) => LooseResult;
}
interface LooseTable {
  select: (cols: string) => LooseResult;
  insert: (rows: unknown) => LooseResult;
  update: (patch: unknown) => LooseResult;
}
interface LooseDb {
  from: (table: string) => LooseTable;
}
function adminDb(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public results
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueOneResult {
  employeeId: string;
  status: 'queued' | 'requeued' | 'skipped_no_signal' | 'skipped_no_email' | 'error';
  commsLogId?: string;
  outboxId?: string;
  detail?: string;
}

export interface QueueDigestsResult {
  functionId: string;
  date: string;
  attempted: number;
  queued: number;
  requeued: number;
  skipped: number;
  errors: number;
  results: QueueOneResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// queueDigests — render + enqueue every active employee's digest for `date`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render and enqueue the daily digest for every active employee in a function. Does NOT
 * send — it writes the comms_log ledger row (queued) + the comms_outbox work row that
 * the send-digest Edge Function drains. Idempotent for a given (employee, date). Never
 * throws — per-employee failures are collected in the result.
 */
export async function queueDigests(functionId: string, date: string): Promise<QueueDigestsResult> {
  const employees = await activeEmployeeIds(functionId);
  const results: QueueOneResult[] = [];

  for (const employeeId of employees) {
    try {
      results.push(await queueOne(functionId, employeeId, date));
    } catch (e) {
      results.push({ employeeId, status: 'error', detail: errMsg(e) });
    }
  }

  return {
    functionId,
    date,
    attempted: employees.length,
    queued: results.filter((r) => r.status === 'queued').length,
    requeued: results.filter((r) => r.status === 'requeued').length,
    skipped: results.filter((r) => r.status.startsWith('skipped')).length,
    errors: results.filter((r) => r.status === 'error').length,
    results,
  };
}

/** Render + enqueue one employee's digest. Exposed for targeted re-queues / tests. */
export async function queueOne(
  functionId: string,
  employeeId: string,
  date: string,
): Promise<QueueOneResult> {
  const rendered = await renderDigest(employeeId, date);
  if (!rendered) return { employeeId, status: 'skipped_no_signal' };

  // Upsert the comms_log ledger row (queued = payload present, not yet sent).
  const existingLog = await findCommsLog(employeeId, date);
  const isRequeue = existingLog !== null;

  const commsLogId = isRequeue
    ? await updateCommsLogPayload(existingLog!, rendered)
    : await insertCommsLog(functionId, employeeId, date, rendered);
  if (!commsLogId) return { employeeId, status: 'error', detail: 'comms_log write failed' };

  // No recipient → we still keep the ledger row (so the digest is renderable), but there
  // is nothing to queue for delivery. Mark and move on (never fabricate an address).
  if (!rendered.toEmail) {
    return { employeeId, status: 'skipped_no_email', commsLogId };
  }

  const outboxId = await upsertOutbox(functionId, employeeId, date, commsLogId, rendered);
  if (!outboxId) return { employeeId, status: 'error', commsLogId, detail: 'comms_outbox write failed' };

  return {
    employeeId,
    status: isRequeue ? 'requeued' : 'queued',
    commsLogId,
    outboxId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// comms_log writes (ledger)
// ─────────────────────────────────────────────────────────────────────────────

async function findCommsLog(employeeId: string, date: string): Promise<string | null> {
  const { data } = await adminDb()
    .from('comms_log')
    .select('id, employee_id, date, channel')
    .eq('employee_id', employeeId)
    .eq('date', date)
    .eq('channel', 'email')
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function insertCommsLog(
  functionId: string,
  employeeId: string,
  date: string,
  rendered: RenderedDigest,
): Promise<string | null> {
  const { data, error } = await adminDb()
    .from('comms_log')
    .insert({
      function_id: functionId,
      employee_id: employeeId,
      date,
      channel: 'email',
      payload_html: rendered.html,
      // sent_at / opened_at stay null → "queued" until the Edge Function delivers.
    })
    .select('id')
    .maybeSingle();
  if (error) return null;
  return (data?.id as string | undefined) ?? null;
}

async function updateCommsLogPayload(commsLogId: string, rendered: RenderedDigest): Promise<string | null> {
  const { error } = await adminDb()
    .from('comms_log')
    .update({ payload_html: rendered.html })
    .eq('id', commsLogId);
  return error ? null : commsLogId;
}

// ─────────────────────────────────────────────────────────────────────────────
// comms_outbox writes (work queue) — one row per comms_log digest (unique).
// ─────────────────────────────────────────────────────────────────────────────

async function upsertOutbox(
  functionId: string,
  employeeId: string,
  date: string,
  commsLogId: string,
  rendered: RenderedDigest,
): Promise<string | null> {
  const existing = await adminDb()
    .from('comms_outbox')
    .select('id, comms_log_id')
    .eq('comms_log_id', commsLogId)
    .maybeSingle();
  const existingId = (existing.data?.id as string | undefined) ?? null;

  if (existingId) {
    // Re-queue: reset to pending with the freshest subject/recipient so the drainer
    // re-sends the updated digest. (Only touch rows not already sent.)
    const { error } = await adminDb()
      .from('comms_outbox')
      .update({
        to_email: rendered.toEmail,
        subject: rendered.subject,
        status: 'pending',
        last_error: null,
      })
      .eq('id', existingId);
    return error ? null : existingId;
  }

  const { data, error } = await adminDb()
    .from('comms_outbox')
    .insert({
      function_id: functionId,
      employee_id: employeeId,
      comms_log_id: commsLogId,
      date,
      channel: 'email',
      to_email: rendered.toEmail,
      subject: rendered.subject,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();
  if (error) return null;
  return (data?.id as string | undefined) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delivery patches — called by the send path / webhook to move the lifecycle
// forward. sent → stamps comms_log.sent_at + comms_outbox.sent_at/status.
// opened → stamps comms_log.opened_at. Numbers/timestamps only, no LLM.
// ─────────────────────────────────────────────────────────────────────────────

/** Mark a queued digest as sent: stamp comms_log.sent_at + close the outbox row. */
export async function markSent(
  commsLogId: string,
  providerMessageId: string | null,
  when: string = new Date().toISOString(),
): Promise<void> {
  await adminDb().from('comms_log').update({ sent_at: when }).eq('id', commsLogId);
  await adminDb()
    .from('comms_outbox')
    .update({ status: 'sent', sent_at: when, provider_message_id: providerMessageId })
    .eq('comms_log_id', commsLogId);
}

/** Mark a send attempt as failed (drainer retry bookkeeping). */
export async function markFailed(commsLogId: string, detail: string): Promise<void> {
  await adminDb()
    .from('comms_outbox')
    .update({ status: 'failed', last_error: detail.slice(0, 500) })
    .eq('comms_log_id', commsLogId);
}

/** Record that a delivered digest was opened (webhook). Idempotent — only sets once. */
export async function markOpenedByCommsLog(
  commsLogId: string,
  when: string = new Date().toISOString(),
): Promise<boolean> {
  const { error } = await adminDb().from('comms_log').update({ opened_at: when }).eq('id', commsLogId);
  return !error;
}

/**
 * Record an open keyed by the Resend provider message id (the webhook's natural key).
 * Resolves the comms_outbox row → its comms_log row, then stamps opened_at. Returns
 * true when a matching digest was found and patched.
 */
export async function markOpenedByProviderMessageId(
  providerMessageId: string,
  when: string = new Date().toISOString(),
): Promise<boolean> {
  const { data } = await adminDb()
    .from('comms_outbox')
    .select('id, comms_log_id, provider_message_id')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  const commsLogId = data?.comms_log_id as string | undefined;
  if (!commsLogId) return false;
  return markOpenedByCommsLog(commsLogId, when);
}

/** Record a delivery confirmation keyed by provider message id (stamps sent_at if unset). */
export async function markDeliveredByProviderMessageId(
  providerMessageId: string,
  when: string = new Date().toISOString(),
): Promise<boolean> {
  const { data } = await adminDb()
    .from('comms_outbox')
    .select('id, comms_log_id, provider_message_id')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  const commsLogId = data?.comms_log_id as string | undefined;
  if (!commsLogId) return false;
  const { error } = await adminDb()
    .from('comms_log')
    .update({ sent_at: when })
    .eq('id', commsLogId);
  return !error;
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

async function activeEmployeeIds(functionId: string): Promise<string[]> {
  const { data, error } = await adminDb()
    .from('employees')
    .select('id, function_id, active')
    .eq('function_id', functionId)
    .eq('active', true);
  if (error || !Array.isArray(data)) return [];
  return (data as Array<{ id?: string }>).map((r) => r.id).filter((v): v is string => typeof v === 'string');
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
