-- 0034_connect_mvp.sql
--
-- Real connector-control data for the Connect MVP. These tables contain no demo
-- rows and no provider secrets. Raw invite/collector tokens are shown once and only
-- SHA-256 hashes are persisted.

create table if not exists public.telemetry_invites (
  id                     uuid primary key default gen_random_uuid(),
  function_id            uuid not null references public.functions(id) on delete cascade,
  employee_id            uuid not null references public.employees(id) on delete cascade,
  provider               text not null check (provider in ('codex', 'claude_code')),
  code_hash               text not null unique,
  expires_at              timestamptz not null,
  used_at                 timestamptz,
  created_by_employee_id  uuid references public.employees(id) on delete set null,
  created_at              timestamptz not null default now()
);

create index if not exists telemetry_invites_employee_idx
  on public.telemetry_invites(employee_id, provider, created_at desc);

create table if not exists public.telemetry_connections (
  id            uuid primary key default gen_random_uuid(),
  function_id   uuid not null references public.functions(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  provider      text not null check (provider in ('codex', 'claude_code')),
  token_hash    text not null unique,
  token_prefix  text not null,
  status        text not null default 'pending'
    check (status in ('pending', 'connected', 'error', 'revoked')),
  connected_at  timestamptz,
  last_seen_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint telemetry_connections_employee_provider_unique
    unique(employee_id, provider)
);

create index if not exists telemetry_connections_function_idx
  on public.telemetry_connections(function_id, status);

-- Sanitized event ledger for idempotency and diagnostics. Prompt/response text,
-- command strings, source code, and tool input/output are never stored here.
create table if not exists public.telemetry_events (
  id                 bigint generated always as identity primary key,
  connection_id      uuid not null references public.telemetry_connections(id) on delete cascade,
  event_key           text not null unique,
  provider            text not null check (provider in ('codex', 'claude_code')),
  source_session_id   text,
  event_name          text not null,
  event_time          timestamptz not null,
  model               text,
  tokens_in           bigint not null default 0 check (tokens_in >= 0),
  tokens_out          bigint not null default 0 check (tokens_out >= 0),
  cache_read          bigint not null default 0 check (cache_read >= 0),
  cache_creation      bigint not null default 0 check (cache_creation >= 0),
  prompt_chars        integer check (prompt_chars is null or prompt_chars >= 0),
  success             boolean,
  created_at          timestamptz not null default now()
);

create index if not exists telemetry_events_connection_time_idx
  on public.telemetry_events(connection_id, event_time desc);

-- Extend the existing raw session contract without changing any score formula.
-- `source` exists in some live databases from the early local connector; declaring it
-- here reconciles migration history with column truth.
alter table public.cc_sessions add column if not exists source text not null default 'claude_code';
alter table public.cc_sessions add column if not exists provider text not null default 'claude_code';
alter table public.cc_sessions add column if not exists connection_id uuid
  references public.telemetry_connections(id) on delete set null;
alter table public.cc_sessions add column if not exists source_event_count integer not null default 0;
alter table public.cc_sessions add column if not exists prompt_event_count integer not null default 0;
alter table public.cc_sessions add column if not exists last_event_at timestamptz;

create unique index if not exists cc_sessions_connection_session_key
  on public.cc_sessions(connection_id, session_id)
  where connection_id is not null and session_id is not null;

create index if not exists cc_sessions_provider_idx
  on public.cc_sessions(function_id, provider, last_event_at desc);

-- These are server-owned control/ingest tables. End-user access goes through guarded
-- routes; the service role and direct connector connection retain their normal bypass.
alter table public.telemetry_invites enable row level security;
alter table public.telemetry_invites force row level security;
alter table public.telemetry_connections enable row level security;
alter table public.telemetry_connections force row level security;
alter table public.telemetry_events enable row level security;
alter table public.telemetry_events force row level security;

comment on table public.telemetry_connections is
  'Per-person Codex/Claude Code OTLP connections. Raw collector tokens are never persisted.';
comment on table public.telemetry_events is
  'Sanitized OTLP metadata ledger; deliberately excludes prompts, responses, code, commands, and tool payloads.';
