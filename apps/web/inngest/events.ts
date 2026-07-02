// inngest/events.ts
//
// The typed Inngest event catalogue for Prism (M4). Each key is an event NAME; its `data`
// is the payload the sender must supply and the receiver receives (type-checked by the
// EventSchemas().fromRecord<PrismEvents> binding on the client).
//
// Two events today:
//
//   • pipeline.daily.requested — fire the full daily automation loop for a function on a
//       given run date. The daily-pipeline function is bound to BOTH the '0 6 * * *' cron
//       AND this event, so a run can be triggered on demand (e.g. from the Admin route or a
//       backfill) with the same idempotent per-(date,function_id) semantics as the cron.
//       `functionId` optional: when omitted the function resolves the single bootstrap
//       function itself. `date` optional: defaults to today (UTC) inside the function.
//
//   • comms.send — request delivery of one already-queued digest (a comms_log/comms_outbox
//       row) out of band. The actual Resend call is owned by the send-digest Edge Function
//       (the sole RESEND_API_KEY holder); this event is the app-side signal that a specific
//       digest should be drained now rather than waiting for the next scheduled sweep. It is
//       keyed by commsLogId so the drain target is unambiguous and idempotent.
//
// These names are also exported as string constants (EVENTS) so senders don't stringly-type
// the event name at call sites.

/** Event name → payload shape. Consumed by EventSchemas().fromRecord in client.ts. */
export type PrismEvents = {
  'pipeline.daily.requested': {
    data: {
      /** Target function; omitted ⇒ the function resolves the bootstrap function id. */
      functionId?: string;
      /** Run date 'YYYY-MM-DD'; omitted ⇒ today (UTC), resolved inside the function. */
      date?: string;
      /** Optional free-form note for observability (who/why triggered this run). */
      reason?: string;
    };
  };
  'comms.send': {
    data: {
      /** The comms_log row whose queued digest should be delivered. */
      commsLogId: string;
      /** Owning function (for scoping / logs). */
      functionId?: string;
      /** The employee the digest belongs to (for logs). */
      employeeId?: string;
    };
  };
};

/** String constants for the event names so senders never hand-type them. */
export const EVENTS = {
  PIPELINE_DAILY_REQUESTED: 'pipeline.daily.requested',
  COMMS_SEND: 'comms.send',
} as const;

export type PrismEventName = keyof PrismEvents;
