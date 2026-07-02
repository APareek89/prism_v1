-- 0031_comms_outbox.sql
-- Net-new, additive (per docs/architecture/ownership-map.md: "Automation appends
-- net-new at 0030+"). Adds the digest OUTBOX — the durable queue the send-digest
-- Edge Function drains.
--
-- Why a separate table from comms_log:
--   • comms_log (0012) is the DELIVERY LEDGER — one row per digest, with the rendered
--     payload_html and the sent_at / opened_at lifecycle timestamps the member-detail
--     "communications" panel reads. It is the record of what was (or will be) delivered.
--   • comms_outbox is the WORK QUEUE the Edge Function polls: it holds the recipient +
--     subject + a 1:1 link back to the comms_log row, plus queue state (pending →
--     sending → sent | failed | skipped) and the Resend message id captured on send.
--     Draining is idempotent — a `pending` row is claimed, sent, then marked, and a
--     UNIQUE(comms_log_id) keeps a digest from being queued twice.
--
-- The Edge Function (Deno, service_role) is the ONLY holder of RESEND_API_KEY; it
-- reads pending rows, renders nothing (payload_html is pre-rendered into comms_log),
-- calls Resend, and writes status + provider_message_id back here while stamping
-- comms_log.sent_at. If RESEND_API_KEY is absent the function no-ops (rows stay
-- pending) — nothing here assumes a key exists.

-- ─────────────────────────────────────────────────────────────────────────────
-- comms_outbox — durable send queue. One row per queued comms_log digest.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.comms_outbox (
  id                   uuid primary key default gen_random_uuid(),
  function_id          uuid not null references public.functions (id) on delete cascade,
  employee_id          uuid not null references public.employees (id) on delete cascade,
  comms_log_id         uuid not null references public.comms_log (id) on delete cascade,
  date                 date not null,
  channel              comms_channel not null default 'email',
  to_email             text not null,                       -- recipient (employees.email at queue time)
  subject              text not null,
  status               text not null default 'pending',     -- pending | sending | sent | failed | skipped
  attempts             integer not null default 0,
  provider_message_id  text,                                -- Resend id, captured on send
  last_error           text,
  scheduled_at         timestamptz not null default now(),  -- earliest time the drainer may send
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint comms_outbox_status_chk
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  constraint comms_outbox_attempts_nonneg check (attempts >= 0),
  -- A given digest (comms_log row) is queued exactly once.
  constraint comms_outbox_log_unique unique (comms_log_id)
);

create index if not exists comms_outbox_function_id_idx on public.comms_outbox (function_id);
create index if not exists comms_outbox_employee_id_idx on public.comms_outbox (employee_id);
-- The drainer's hot path: pending rows whose scheduled_at has passed, oldest first.
create index if not exists comms_outbox_pending_idx
  on public.comms_outbox (scheduled_at)
  where status = 'pending';

-- keep updated_at fresh on any change (mirrors 0020's set_updated_at trigger pattern).
create trigger comms_outbox_set_updated_at
  before update on public.comms_outbox
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — deny-by-default like every other table (0015). The Edge Function drains
-- as service_role, which BYPASSES RLS entirely (no policy needed for the queue to
-- work). We grant end-user roles only a narrow ADMIN SELECT so the Admin surface can
-- inspect the outbox state; no authenticated INSERT/UPDATE/DELETE — queueing and
-- draining are pipeline/service-role concerns, never an end-user write.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.comms_outbox enable row level security;
alter table public.comms_outbox force  row level security;

-- Admins may read the outbox for the function(s) they administer (wiring visibility,
-- not surveillance — there is no per-engineer content here beyond the recipient).
create policy comms_outbox_admin_select on public.comms_outbox
  for select to authenticated using ( public.is_admin(function_id) );
