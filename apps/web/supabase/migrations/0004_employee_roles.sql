-- 0004_employee_roles.sql
-- M2M role grants. A person can be (e.g.) a developer in their own function AND
-- a manager scoped to a specific team. Roles are DATA, not constants, so RLS
-- holds for many concurrent users (architecture §9).
--
-- scope_team_id narrows manager/function_lead grants to a sub-scope. NULL means
-- the grant covers the whole function_id. (Today function == team, so it is
-- typically NULL; the column exists so the access model generalizes.)

create table if not exists public.employee_roles (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees (id) on delete cascade,
  function_id   uuid not null references public.functions (id) on delete cascade,
  role          app_role not null,
  scope_team_id uuid references public.functions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  -- A given person holds a given role within a given (function, sub-scope) once.
  constraint employee_roles_unique
    unique (employee_id, function_id, role, scope_team_id)
);

create index if not exists employee_roles_employee_id_idx
  on public.employee_roles (employee_id);
create index if not exists employee_roles_function_id_idx
  on public.employee_roles (function_id);
create index if not exists employee_roles_role_idx
  on public.employee_roles (role);
