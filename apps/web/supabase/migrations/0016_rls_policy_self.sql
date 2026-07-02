-- 0016_rls_policy_self.sql
-- SELF / DEVELOPER policies (PRD §12.5: "Developer → only their own My view rows
-- + function-level aggregates"). These grant a person read access to THEIR OWN
-- data. Function/team aggregate reads are added in 0017; manager/admin in 0018/0019.
--
-- All policies are SELECT-only for end users — writes go through the service_role
-- (which bypasses RLS), so no INSERT/UPDATE/DELETE policies are granted to
-- `authenticated` except where a user genuinely self-edits (none in the MVP:
-- acknowledging a rec is a server action running as service_role).
--
-- Naming convention: <table>_self_select.

-- ── functions: a member may read their own function (shell/period header) ────
create policy functions_self_select on public.functions
  for select to authenticated
  using ( public.in_function(id) );

-- ── employees: read self; reading peers is handled by aggregate/manager policy ─
create policy employees_self_select on public.employees
  for select to authenticated
  using ( id = public.employee_id() );

-- ── employee_roles: a person may read their own role grants ──────────────────
create policy employee_roles_self_select on public.employee_roles
  for select to authenticated
  using ( employee_id = public.employee_id() );

-- ── gh_prs: a developer sees ONLY their own PRs (private My view, §12.3) ──────
-- Crucially, peers do NOT get this — managers are explicitly denied reports' raw
-- PRs (§12.5), so there is no manager/aggregate SELECT policy on gh_prs at all.
create policy gh_prs_self_select on public.gh_prs
  for select to authenticated
  using ( employee_id = public.employee_id() );

-- ── gh_commits: own commits only ─────────────────────────────────────────────
create policy gh_commits_self_select on public.gh_commits
  for select to authenticated
  using ( employee_id = public.employee_id() );

-- ── cc_sessions: own Claude sessions only (raw, private) ──────────────────────
create policy cc_sessions_self_select on public.cc_sessions
  for select to authenticated
  using ( employee_id = public.employee_id() );

-- ── blame_snapshots: own attributed lines only ───────────────────────────────
create policy blame_snapshots_self_select on public.blame_snapshots
  for select to authenticated
  using ( employee_id = public.employee_id() );

-- ── pr_ai_link: links for one's own PRs only ─────────────────────────────────
create policy pr_ai_link_self_select on public.pr_ai_link
  for select to authenticated
  using (
    exists (
      select 1 from public.gh_prs p
      where p.id = pr_ai_link.pr_id and p.employee_id = public.employee_id()
    )
  );

-- ── kpi_daily: own employee-scoped KPI rows (function/team rows → 0017) ───────
create policy kpi_daily_self_select on public.kpi_daily
  for select to authenticated
  using ( scope = 'employee' and scope_id = public.employee_id() );

-- ── index_daily: own employee-scoped index rows ──────────────────────────────
create policy index_daily_self_select on public.index_daily
  for select to authenticated
  using ( scope = 'employee' and scope_id = public.employee_id() );

-- ── insights: own employee-scoped insights (incl. pr_level coaching) ──────────
create policy insights_self_select on public.insights
  for select to authenticated
  using ( scope = 'employee' and scope_id = public.employee_id() );

-- ── recommendations: own recs ────────────────────────────────────────────────
create policy recommendations_self_select on public.recommendations
  for select to authenticated
  using ( employee_id = public.employee_id() );

-- ── courses: own assigned courses ────────────────────────────────────────────
create policy courses_self_select on public.courses
  for select to authenticated
  using ( employee_id = public.employee_id() );

-- ── comms_log: own digest history ────────────────────────────────────────────
create policy comms_log_self_select on public.comms_log
  for select to authenticated
  using ( employee_id = public.employee_id() );
