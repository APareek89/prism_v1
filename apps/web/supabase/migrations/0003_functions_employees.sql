-- 0003_functions_employees.sql
-- The identity core: functions (the org/team unit) and employees (people).
-- org = me = team today, but the schema is N-ready: employees.user_id binds a
-- Supabase Auth user to an employee, and many employees can share a function.

-- ─────────────────────────────────────────────────────────────────────────────
-- functions — one engineering function/team. For the MVP demo there is exactly
-- one bootstrap row (seeded in 0021). repo_ids[] lists the GitHub repos in scope.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.functions (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  repo_ids    text[]      not null default '{}',          -- GitHub repos in scope
  window_days integer     not null default 28,            -- rolling compute window
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint functions_window_days_positive check (window_days > 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- employees — a person measured by Prism. user_id links to auth.users for RLS;
-- nullable because synthetic-backdrop / not-yet-invited roster rows exist before
-- a Supabase Auth account does. github_handle/email are citext (case-insensitive)
-- so connector identity resolution is robust.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.employees (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users (id) on delete set null,
  function_id          uuid not null references public.functions (id) on delete cascade,
  name                 text not null,
  designation          text,
  github_handle        citext,
  email                citext,
  claude_account_uuid  uuid,                                  -- maps cc_sessions.account_uuid
  attribution_mode     attribution_mode not null default 'unmatched',
  -- onboarding columns (PRD §7.2.1 / architecture §3):
  match_status         text not null default 'unmatched',     -- linked | byo | unmatched
  active               boolean not null default true,
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint employees_match_status_chk
    check (match_status in ('linked', 'byo', 'unmatched'))
);

-- One Auth user maps to at most one employee (per single-function MVP).
create unique index if not exists employees_user_id_key
  on public.employees (user_id) where user_id is not null;

-- Identity-resolution lookups (connectors join on these). Unique within scope.
create unique index if not exists employees_github_handle_key
  on public.employees (github_handle) where github_handle is not null;
create unique index if not exists employees_claude_account_uuid_key
  on public.employees (claude_account_uuid) where claude_account_uuid is not null;
create index if not exists employees_email_idx
  on public.employees (email) where email is not null;
create index if not exists employees_function_id_idx
  on public.employees (function_id);
