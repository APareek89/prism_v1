-- 0009_deploys_incidents.sql
-- Append-only deploy + incident evidence (PRD §6 / §7.3), from Sentry releases
-- and (fallback) default-branch merges. Powers Effectiveness F3 (change-failure)
-- and MTTR. Both tables carry function_id for RLS.

-- ─────────────────────────────────────────────────────────────────────────────
-- deploys — a shipped release. change_failed = an incident/rollback within the
-- release window (PRD §4.2 F3). env defaults to production.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.deploys (
  id            uuid primary key default gen_random_uuid(),
  function_id   uuid not null references public.functions (id) on delete cascade,
  repo          text not null,
  sha           text not null,
  env           text not null default 'production',
  ts            timestamptz,
  status        text,                                 -- e.g. finalized | rolled_back
  change_failed boolean not null default false,
  ai_assisted   boolean not null default false,       -- deploy of an AI-assisted change
  ingested_at   timestamptz not null default now(),
  constraint deploys_repo_sha_env_unique unique (repo, sha, env)
);

create index if not exists deploys_function_id_idx on public.deploys (function_id);
create index if not exists deploys_ts_idx          on public.deploys (ts);

-- ─────────────────────────────────────────────────────────────────────────────
-- incidents — a Sentry issue/incident tied to a deploy. MTTR = resolved - started.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.incidents (
  id          uuid primary key default gen_random_uuid(),
  function_id uuid not null references public.functions (id) on delete cascade,
  deploy_id   uuid references public.deploys (id) on delete set null,
  started_at  timestamptz,
  resolved_at timestamptz,
  severity    text,
  ingested_at timestamptz not null default now()
);

create index if not exists incidents_function_id_idx on public.incidents (function_id);
create index if not exists incidents_deploy_id_idx   on public.incidents (deploy_id);
