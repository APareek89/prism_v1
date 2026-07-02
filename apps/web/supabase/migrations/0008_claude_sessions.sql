-- 0008_claude_sessions.sql
-- Append-only Claude Code session evidence (PRD §6 / §7.2).
-- Landmine #1 (architecture §0.6): real ~/.claude is per-session .jsonl with
-- usage on message.usage, model on message.model, cwd+gitBranch for repo/branch,
-- and NO top-level account_uuid → account_uuid is nullable (OTEL path may set it;
-- the local-file path binds via the Admin BYO mapping to employee_id instead).
--
-- function_id denormalized for RLS; employee_id is the bound person (nullable for
-- unmatched/BYO streams, which are excluded from AI rates and drop confidence).

create table if not exists public.cc_sessions (
  id                    uuid primary key default gen_random_uuid(),
  function_id           uuid not null references public.functions (id) on delete cascade,
  employee_id           uuid references public.employees (id) on delete set null,
  account_uuid          uuid,                       -- nullable (no top-level uuid in .jsonl)
  session_id            text,                       -- .jsonl sessionId (dedup key w/ cwd)
  repo                  text,                       -- derived from cwd
  branch                text,                       -- derived from gitBranch
  ts                    timestamptz,
  turns                 integer not null default 0,
  tokens_in             bigint  not null default 0,
  tokens_out            bigint  not null default 0,
  cache_read            bigint  not null default 0, -- cached-input tokens (cost lens)
  cache_creation        bigint  not null default 0,
  cost_usd              numeric(12, 4),             -- often absent → derived in pricing.ts
  model                 text,
  suggestions_offered   integer not null default 0,
  suggestions_accepted  integer not null default 0,
  skills_used           text[]  not null default '{}',  -- skill.name list
  prompt_len_avg        numeric(10, 2),
  linked_pr             uuid references public.gh_prs (id) on delete set null,
  ingested_at           timestamptz not null default now(),
  -- Sessions are keyed by sessionId + repo(cwd) (architecture §0.6).
  constraint cc_sessions_session_repo_unique unique (session_id, repo)
);

create index if not exists cc_sessions_function_id_idx  on public.cc_sessions (function_id);
create index if not exists cc_sessions_employee_id_idx  on public.cc_sessions (employee_id);
create index if not exists cc_sessions_account_uuid_idx on public.cc_sessions (account_uuid);
create index if not exists cc_sessions_ts_idx           on public.cc_sessions (ts);
create index if not exists cc_sessions_linked_pr_idx    on public.cc_sessions (linked_pr);
