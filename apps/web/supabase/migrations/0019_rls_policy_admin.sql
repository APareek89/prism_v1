-- 0019_rls_policy_admin.sql
-- ADMIN policies (PRD §12.5: "Admin → connectors, roster, config"). Admins are
-- the only end-user role that WRITES through an RLS session (the pipeline writes
-- as service_role, which bypasses RLS). Admin write surface = the admin-owned
-- configuration tables: connectors, the roster (employees), role grants
-- (employee_roles), the function itself, and index_config (append a new version).
--
-- Admins do NOT get a raw-PR / per-engineer ranking export — there is no admin
-- policy on gh_prs/cc_sessions/etc., so the §12.5 "no manager-facing per-engineer
-- ranking export" rule holds for admins too. Admins manage wiring, not surveillance.
--
-- index_config is APPEND-ONLY for admins: INSERT (new version) is allowed; the
-- freeze trigger in 0020 blocks UPDATE of weights/anchors after frozen_at.
--
-- Naming convention: <table>_admin_<cmd>.

-- ── functions: admins read + edit their function(s) ─────────────────────────
create policy functions_admin_select on public.functions
  for select to authenticated using ( public.is_admin(id) );
create policy functions_admin_update on public.functions
  for update to authenticated using ( public.is_admin(id) ) with check ( public.is_admin(id) );
create policy functions_admin_insert on public.functions
  for insert to authenticated with check ( public.is_admin() );

-- ── employees (roster): admins full CRUD within functions they admin ────────
create policy employees_admin_select on public.employees
  for select to authenticated using ( public.is_admin(function_id) );
create policy employees_admin_insert on public.employees
  for insert to authenticated with check ( public.is_admin(function_id) );
create policy employees_admin_update on public.employees
  for update to authenticated using ( public.is_admin(function_id) ) with check ( public.is_admin(function_id) );
create policy employees_admin_delete on public.employees
  for delete to authenticated using ( public.is_admin(function_id) );

-- ── employee_roles: admins grant/revoke roles ───────────────────────────────
create policy employee_roles_admin_select on public.employee_roles
  for select to authenticated using ( public.is_admin(function_id) );
create policy employee_roles_admin_insert on public.employee_roles
  for insert to authenticated with check ( public.is_admin(function_id) );
create policy employee_roles_admin_update on public.employee_roles
  for update to authenticated using ( public.is_admin(function_id) ) with check ( public.is_admin(function_id) );
create policy employee_roles_admin_delete on public.employee_roles
  for delete to authenticated using ( public.is_admin(function_id) );

-- ── connectors: admins wire data sources ────────────────────────────────────
create policy connectors_admin_select on public.connectors
  for select to authenticated using ( public.is_admin(function_id) );
create policy connectors_admin_insert on public.connectors
  for insert to authenticated with check ( public.is_admin(function_id) );
create policy connectors_admin_update on public.connectors
  for update to authenticated using ( public.is_admin(function_id) ) with check ( public.is_admin(function_id) );
create policy connectors_admin_delete on public.connectors
  for delete to authenticated using ( public.is_admin(function_id) );

-- ── index_config: admins read all + APPEND a new version (no in-place edit of
-- frozen weights/anchors — enforced by the 0020 freeze trigger) ──────────────
create policy index_config_admin_select on public.index_config
  for select to authenticated using ( public.is_admin(function_id) );
create policy index_config_admin_insert on public.index_config
  for insert to authenticated with check ( public.is_admin(function_id) );
-- UPDATE is permitted by RLS only to allow setting frozen_at / non-frozen edits;
-- the freeze trigger rejects changes to weights/anchors after frozen_at is set.
create policy index_config_admin_update on public.index_config
  for update to authenticated using ( public.is_admin(function_id) ) with check ( public.is_admin(function_id) );
