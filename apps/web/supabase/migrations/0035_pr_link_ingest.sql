-- 0035_pr_link_ingest.sql
--
-- Additive metadata-only evidence for the one association OTLP does not reliably
-- carry: which Codex/Claude Code session created which GitHub pull request.
--
-- Identity is inherited from the existing per-person telemetry connection. The raw
-- collector token is never stored here (or anywhere else); the route resolves its
-- SHA-256 hash to connection -> employee -> function -> provider before inserting.

create table if not exists public.pr_link_ingest (
  id                 uuid primary key default gen_random_uuid(),
  function_id        uuid not null references public.functions(id) on delete cascade,
  employee_id        uuid not null references public.employees(id) on delete cascade,
  connection_id      uuid not null references public.telemetry_connections(id) on delete cascade,
  provider           text not null check (provider in ('codex', 'claude_code')),
  source_session_id  text not null,
  repo               text not null,
  pr_number          integer not null check (pr_number > 0),
  sha                text,
  branch             text,
  source             text not null check (source in ('codex_hook', 'claude_code_hook')),
  github_verified_at timestamptz not null,
  received_at        timestamptz not null default now(),
  constraint pr_link_ingest_connection_session_repo_pr_unique
    unique (connection_id, source_session_id, repo, pr_number)
);

create index if not exists pr_link_ingest_function_received_idx
  on public.pr_link_ingest(function_id, received_at desc);

create index if not exists pr_link_ingest_connection_session_idx
  on public.pr_link_ingest(connection_id, source_session_id);

create index if not exists pr_link_ingest_repo_pr_idx
  on public.pr_link_ingest(repo, pr_number);

alter table public.pr_link_ingest enable row level security;
alter table public.pr_link_ingest force row level security;

comment on table public.pr_link_ingest is
  'Verified metadata-only Codex/Claude hook evidence linking a personal telemetry session to a GitHub PR. No prompt, response, code, command, or tool payload is stored.';

comment on column public.pr_link_ingest.source_session_id is
  'Provider session id from the trusted PostToolUse hook; matched only inside the same hashed telemetry connection.';
