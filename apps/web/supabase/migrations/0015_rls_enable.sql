-- 0015_rls_enable.sql
-- Deny-by-default: enable RLS on EVERY app table. With RLS on and no policy yet,
-- the `authenticated`/`anon` roles can read/write NOTHING until 0016-0019 grant
-- narrow access. The service_role (used by the pipeline/webhook/onboarding via
-- lib/supabase/admin.ts) BYPASSES RLS entirely, so the daily pipeline writes
-- freely while end-user sessions are fully constrained.
--
-- FORCE ROW LEVEL SECURITY also subjects the *table owner* to policies, closing
-- the loophole where a definer-owned query could sidestep RLS.

alter table public.functions        enable row level security;
alter table public.functions        force  row level security;
alter table public.employees         enable row level security;
alter table public.employees         force  row level security;
alter table public.employee_roles    enable row level security;
alter table public.employee_roles    force  row level security;
alter table public.index_config      enable row level security;
alter table public.index_config      force  row level security;
alter table public.connectors        enable row level security;
alter table public.connectors        force  row level security;
alter table public.gh_prs            enable row level security;
alter table public.gh_prs            force  row level security;
alter table public.gh_commits        enable row level security;
alter table public.gh_commits        force  row level security;
alter table public.cc_sessions       enable row level security;
alter table public.cc_sessions       force  row level security;
alter table public.deploys           enable row level security;
alter table public.deploys           force  row level security;
alter table public.incidents         enable row level security;
alter table public.incidents         force  row level security;
alter table public.blame_snapshots   enable row level security;
alter table public.blame_snapshots   force  row level security;
alter table public.pr_ai_link        enable row level security;
alter table public.pr_ai_link        force  row level security;
alter table public.kpi_daily         enable row level security;
alter table public.kpi_daily         force  row level security;
alter table public.index_daily       enable row level security;
alter table public.index_daily       force  row level security;
alter table public.insights          enable row level security;
alter table public.insights          force  row level security;
alter table public.recommendations   enable row level security;
alter table public.recommendations   force  row level security;
alter table public.courses           enable row level security;
alter table public.courses           force  row level security;
alter table public.comms_log         enable row level security;
alter table public.comms_log         force  row level security;
