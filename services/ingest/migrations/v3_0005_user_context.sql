-- ─────────────────────────────────────────────────────────────────────────────
-- v3 USER-CONTEXT EVENTS — written by the web app (apps/web), the ONE table the
-- UI inserts into. Real rows from real clicks (Growth tab "Mark complete /
-- I adopted this") — the management-facing evidence of self-driven improvement.
-- ─────────────────────────────────────────────────────────────────────────────

create table v3.user_context (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references v3.developers(id),
  kind text not null check (kind in ('course_completed', 'adopted', 'confirmed')),
  ref text not null,                   -- course id / recommendation ref / insight key
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (developer_id, kind, ref)
);

create index v3_user_context_dev on v3.user_context (developer_id, created_at desc);
