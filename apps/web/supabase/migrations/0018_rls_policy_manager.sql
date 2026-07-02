-- 0018_rls_policy_manager.sql
-- MANAGER COACHING policies (PRD §12.5: "Manager → Team view aggregates +
-- per-member coaching insights, NOT raw per-PR data of reports").
--
-- A manager (public.manages_employee(emp) = true) may read, for each report:
--   • the member's employee row (roster table + drill-in header)
--   • employee-scoped index_daily / kpi_daily / insights (coaching, §12.2)
--   • recommendations + courses + comms_log (the "communications & actions" log)
--
-- A manager may NOT read a report's RAW evidence. There is deliberately NO
-- manager policy on gh_prs / gh_commits / cc_sessions / blame_snapshots /
-- pr_ai_link — so a report's per-PR list stays in their private My view, exactly
-- as §12.5 and §12.2 require. No per-engineer ranking export exists either.
--
-- Naming convention: <table>_manager_select.

-- ── employees: managers see the roster rows of members they manage ───────────
create policy employees_manager_select on public.employees
  for select to authenticated
  using ( public.manages_employee(id) );

-- ── employee_roles: managers may read role grants of their reports ───────────
create policy employee_roles_manager_select on public.employee_roles
  for select to authenticated
  using ( public.manages_employee(employee_id) );

-- ── index_daily: per-member L1/L2 for managed reports (drill-in vs squad) ────
create policy index_daily_manager_select on public.index_daily
  for select to authenticated
  using ( scope = 'employee' and public.manages_employee(scope_id) );

-- ── kpi_daily: per-member KPI detail for managed reports ─────────────────────
create policy kpi_daily_manager_select on public.kpi_daily
  for select to authenticated
  using ( scope = 'employee' and public.manages_employee(scope_id) );

-- ── insights: per-member coaching insights (improvement areas, §9.1) ─────────
-- NOTE: pr_level insights are coaching narrative (no raw diff), so a manager may
-- read them; the underlying gh_prs row remains private (no gh_prs manager policy).
create policy insights_manager_select on public.insights
  for select to authenticated
  using ( scope = 'employee' and public.manages_employee(scope_id) );

-- ── recommendations: the rec log + adoption status for managed reports ───────
create policy recommendations_manager_select on public.recommendations
  for select to authenticated
  using ( public.manages_employee(employee_id) );

-- ── courses: course progress for managed reports (drill-in) ──────────────────
create policy courses_manager_select on public.courses
  for select to authenticated
  using ( public.manages_employee(employee_id) );

-- ── comms_log: nudges delivered to managed reports (the actions log) ─────────
create policy comms_log_manager_select on public.comms_log
  for select to authenticated
  using ( public.manages_employee(employee_id) );
