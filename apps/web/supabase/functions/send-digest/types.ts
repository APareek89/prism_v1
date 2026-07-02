// supabase/functions/send-digest/types.ts
//
// Shared types for the send-digest Edge Function (Deno). Kept dependency-free so the
// function body stays readable. Column names mirror the Prism schema:
//   • comms_outbox (migration 0031) — the durable work queue this function drains.
//   • comms_log    (migration 0012) — the delivery ledger it stamps sent_at on.

/** A pending outbox row joined with the ledger payload it must deliver. */
export interface OutboxRow {
  id: string;
  function_id: string;
  employee_id: string;
  comms_log_id: string;
  date: string;
  channel: string;
  to_email: string;
  subject: string;
  status: string;
  attempts: number;
}

/** The comms_log payload for an outbox row (the pre-rendered HTML). */
export interface CommsLogPayload {
  id: string;
  payload_html: string | null;
}

/** Outcome for one drained row. */
export interface DrainItemResult {
  outboxId: string;
  commsLogId: string;
  toEmail: string;
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string;
  detail?: string;
}

/** The function's response body. */
export interface DrainResult {
  ok: boolean;
  resendConfigured: boolean;
  drained: number;
  sent: number;
  failed: number;
  skipped: number;
  note?: string;
  items: DrainItemResult[];
}

/** Result of a single Resend send. */
export interface ResendSendResult {
  ok: boolean;
  id: string | null;
  error: string | null;
}
