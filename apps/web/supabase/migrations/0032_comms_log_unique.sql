-- 0032_comms_log_unique.sql
-- Additive (automation appends at 0030+). Backstops per-day digest idempotency at the
-- DB level: one digest per (employee, date, channel). The daily Inngest function already
-- serializes (concurrency 1 + idempotency key), and the outbox does a read-then-write,
-- but this unique index prevents duplicate ledger rows under any concurrent insert.
create unique index if not exists comms_log_employee_date_channel_key
  on public.comms_log (employee_id, date, channel);
