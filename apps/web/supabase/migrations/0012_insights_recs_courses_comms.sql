-- 0012_insights_recs_courses_comms.sql
-- The narrative + automation output tables (PRD §6 / §9 / §10).
--   insights         → agent narrative (numbers come from scoring; agents narrate).
--   recommendations  → deterministic skill/process/course recs + adoption status.
--   courses          → assigned micro-courses; completion only via knowledge check.
--   comms_log        → daily-digest delivery/open log.

-- ─────────────────────────────────────────────────────────────────────────────
-- insights — one ranked insight. kind: improvement | change | pr_level.
-- Idempotent generation keys on (date, scope, scope_id, kind, rank) so a re-run
-- replaces the slot rather than duplicating it.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.insights (
  id             uuid primary key default gen_random_uuid(),
  function_id    uuid not null references public.functions (id) on delete cascade,
  date           date not null,
  scope          scope_kind not null,
  scope_id       uuid not null,
  kind           text not null,                         -- improvement | change | pr_level
  rank           integer not null default 0,
  title          text,
  body           text,
  dimension      text,                                  -- usage|efficiency|effectiveness|proficiency
  est_impact     numeric,                               -- modeled L1/L2 lift (computed in code)
  pr_id          uuid references public.gh_prs (id) on delete set null,  -- pr_level only
  evidence_jsonb jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint insights_kind_chk check (kind in ('improvement', 'change', 'pr_level')),
  constraint insights_slot_unique unique (date, scope, scope_id, kind, rank)
);

create index if not exists insights_function_id_idx on public.insights (function_id);
create index if not exists insights_scope_idx       on public.insights (scope, scope_id);
create index if not exists insights_date_idx        on public.insights (date);

-- ─────────────────────────────────────────────────────────────────────────────
-- recommendations — deterministic recs. One open rec per (employee, kind, ref)
-- is enforced by the partial unique index below (open = not adopted/dismissed).
-- detected_via records the rule/source that produced it.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.recommendations (
  id           uuid primary key default gen_random_uuid(),
  function_id  uuid not null references public.functions (id) on delete cascade,
  employee_id  uuid not null references public.employees (id) on delete cascade,
  date         date not null,
  kind         rec_kind not null,
  ref          text not null,                           -- skill name / process id / course id
  rationale    text,
  status       rec_status not null default 'suggested',
  detected_via text,
  evidence_jsonb jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists recommendations_function_id_idx on public.recommendations (function_id);
create index if not exists recommendations_employee_id_idx on public.recommendations (employee_id);
-- "One OPEN rec per (member, kind, ref)" — closed recs (adopted/dismissed) don't block a new one.
create unique index if not exists recommendations_open_unique
  on public.recommendations (employee_id, kind, ref)
  where status not in ('adopted', 'dismissed');

-- ─────────────────────────────────────────────────────────────────────────────
-- courses — assigned micro-course. Completion is Prism-owned (landmine #2):
-- knowledge_check_passed_at is set only when all lessons pass.
-- als_user_ref persists the ALS-user↔employee link captured at assignment.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.courses (
  id                       uuid primary key default gen_random_uuid(),
  function_id              uuid not null references public.functions (id) on delete cascade,
  employee_id              uuid not null references public.employees (id) on delete cascade,
  dimension                text,
  course_id                text not null,               -- studio slug
  title                    text,
  url                      text,
  als_user_ref             text,                         -- ALS-user id, linked at assignment
  due_at                   timestamptz,
  progress_pct             integer not null default 0,
  status                   course_status not null default 'assigned',
  knowledge_check_passed_at timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint courses_progress_range check (progress_pct >= 0 and progress_pct <= 100),
  -- A given course is assigned to a given employee once.
  constraint courses_employee_course_unique unique (employee_id, course_id)
);

create index if not exists courses_function_id_idx on public.courses (function_id);
create index if not exists courses_employee_id_idx on public.courses (employee_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- comms_log — one delivered digest. channel = email (MVP). opened_at from webhook.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.comms_log (
  id           uuid primary key default gen_random_uuid(),
  function_id  uuid not null references public.functions (id) on delete cascade,
  employee_id  uuid not null references public.employees (id) on delete cascade,
  date         date not null,
  channel      comms_channel not null default 'email',
  payload_html text,
  sent_at      timestamptz,
  opened_at    timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists comms_log_function_id_idx on public.comms_log (function_id);
create index if not exists comms_log_employee_id_idx on public.comms_log (employee_id);
create index if not exists comms_log_date_idx        on public.comms_log (date);
