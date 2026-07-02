-- 0017_rls_policy_function.sql
-- FUNCTION / TEAM AGGREGATE policies (PRD §12.5: every member sees function-level
-- aggregates; function leads see Function + team aggregates). These add read
-- access to the {function, team}-SCOPED computed rows only — NOT employee-scoped
-- peer rows (those stay private per 0016) and NOT raw evidence (gh_prs/cc_sessions
-- have no aggregate SELECT policy, so peers' raw data is unreachable).
--
-- The scope_id of a function/team aggregate row is the function_id, so
-- public.in_function(scope_id) is the correct membership test.
--
-- Naming convention: <table>_function_select.

-- ── kpi_daily: function/team aggregate KPIs for one's own function ───────────
create policy kpi_daily_function_select on public.kpi_daily
  for select to authenticated
  using ( scope in ('function', 'team') and public.in_function(scope_id) );

-- ── index_daily: function/team L1/L2 + cost lens (the Function hero/spectrum) ─
create policy index_daily_function_select on public.index_daily
  for select to authenticated
  using ( scope in ('function', 'team') and public.in_function(scope_id) );

-- ── insights: function/team "top 5 to improve" + "what moved the index" ─────
create policy insights_function_select on public.insights
  for select to authenticated
  using ( scope in ('function', 'team') and public.in_function(scope_id) );

-- ── index_config: members may read the active config (read-only/versioned UI) ─
-- Editing is admin-only (0019). Reading lets the dashboard show weights/anchors.
create policy index_config_function_select on public.index_config
  for select to authenticated
  using ( public.in_function(function_id) );
