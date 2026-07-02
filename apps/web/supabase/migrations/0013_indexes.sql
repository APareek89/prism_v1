-- 0013_indexes.sql
-- Performance indexes for the hot query patterns in lib/db. Single-column FK/lookup
-- indexes live next to their tables (0003-0012); this migration adds the COMPOSITE
-- indexes that the trailing-window reads and scope+date dashboard queries rely on.
-- All IF NOT EXISTS → re-runnable.

-- Trailing-28d / 90d window scans over raw evidence, per function and per author.
create index if not exists gh_prs_function_merged_idx
  on public.gh_prs (function_id, merged_at desc);
create index if not exists gh_prs_employee_merged_idx
  on public.gh_prs (employee_id, merged_at desc);
-- Sizing recalibration scans merged PRs per repo over the trailing 90d.
create index if not exists gh_prs_repo_merged_idx
  on public.gh_prs (repo, merged_at desc) where is_merged;

create index if not exists cc_sessions_function_ts_idx
  on public.cc_sessions (function_id, ts desc);
create index if not exists cc_sessions_employee_ts_idx
  on public.cc_sessions (employee_id, ts desc);

create index if not exists deploys_function_ts_idx
  on public.deploys (function_id, ts desc);

-- Latest-row + trend reads on the computed tables (dashboards pull "latest per
-- scope" and "last N days per scope").
create index if not exists kpi_daily_scope_date_idx
  on public.kpi_daily (scope, scope_id, date desc);
create index if not exists kpi_daily_function_date_idx
  on public.kpi_daily (function_id, date desc);

create index if not exists index_daily_scope_date_idx
  on public.index_daily (scope, scope_id, date desc);
create index if not exists index_daily_function_date_idx
  on public.index_daily (function_id, date desc);

-- Insights/recs/courses/comms are read per scope/member, newest first.
create index if not exists insights_scope_date_idx
  on public.insights (scope, scope_id, date desc);
create index if not exists recommendations_employee_status_idx
  on public.recommendations (employee_id, status);
create index if not exists courses_employee_status_idx
  on public.courses (employee_id, status);
create index if not exists comms_log_employee_date_idx
  on public.comms_log (employee_id, date desc);

-- Roster reads: active members of a function.
create index if not exists employees_function_active_idx
  on public.employees (function_id, active);
