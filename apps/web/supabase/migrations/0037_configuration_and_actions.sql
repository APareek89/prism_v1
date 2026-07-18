-- 0037_configuration_and_actions.sql
--
-- Organization configuration and auditable action workflows. These tables store
-- owner-approved settings and human workflow state only; they never contain
-- synthetic measurement evidence and never compute an index value.

create table if not exists public.workspace_configuration (
  function_id                uuid primary key references public.functions(id) on delete cascade,
  allowed_ai_providers       text[] not null default array['codex','claude_code']::text[],
  connection_methods         text[] not null default array['email','terminal']::text[],
  measurement_start_date     date not null default current_date,
  connection_confirmed_at    timestamptz,
  data_confirmed_at          timestamptz,
  index_confirmed_at         timestamptz,
  organization_confirmed_at  timestamptz,
  access_confirmed_at        timestamptz,
  data_consent_version       integer not null default 1,
  updated_by_employee_id     uuid references public.employees(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint workspace_configuration_provider_chk
    check (allowed_ai_providers <@ array['codex','claude_code']::text[]),
  constraint workspace_configuration_method_chk
    check (connection_methods <@ array['email','terminal']::text[]),
  constraint workspace_configuration_consent_version_chk check (data_consent_version > 0)
);

create table if not exists public.data_processing_preferences (
  function_id            uuid not null references public.functions(id) on delete cascade,
  data_key                text not null,
  source                  text not null check (source in ('github','codex','claude_code','sentry')),
  enabled                 boolean not null,
  consent_version         integer not null default 1,
  effective_at            timestamptz not null default now(),
  updated_by_employee_id  uuid references public.employees(id) on delete set null,
  updated_at              timestamptz not null default now(),
  primary key (function_id, data_key),
  constraint data_processing_preferences_consent_version_chk check (consent_version > 0)
);

create table if not exists public.teams (
  id                   uuid primary key default gen_random_uuid(),
  function_id          uuid not null references public.functions(id) on delete cascade,
  name                 text not null,
  manager_employee_id  uuid references public.employees(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint teams_function_name_unique unique(function_id, name)
);

create table if not exists public.team_memberships (
  team_id       uuid not null references public.teams(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  role_title    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (team_id, employee_id)
);

create table if not exists public.configuration_audit (
  id                 bigint generated always as identity primary key,
  function_id        uuid not null references public.functions(id) on delete cascade,
  actor_employee_id  uuid references public.employees(id) on delete set null,
  section            text not null check (section in ('connection','data','index','organization','access')),
  action             text not null,
  before_jsonb       jsonb not null default '{}'::jsonb,
  after_jsonb        jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists configuration_audit_function_created_idx
  on public.configuration_audit(function_id, created_at desc);

create table if not exists public.recommendation_action_events (
  id                 bigint generated always as identity primary key,
  recommendation_id  uuid not null references public.recommendations(id) on delete cascade,
  function_id        uuid not null references public.functions(id) on delete cascade,
  employee_id        uuid not null references public.employees(id) on delete cascade,
  event_type         text not null check (event_type in ('acknowledged','started','actioned','dismissed')),
  note               text,
  created_at         timestamptz not null default now()
);

create index if not exists recommendation_action_events_rec_idx
  on public.recommendation_action_events(recommendation_id, created_at desc);

create table if not exists public.org_actions (
  id                    uuid primary key default gen_random_uuid(),
  function_id           uuid not null references public.functions(id) on delete cascade,
  team_id               uuid references public.teams(id) on delete set null,
  kind                  text not null check (kind in ('connector','course','intervention')),
  title                 text not null,
  rationale             text not null,
  evidence_jsonb        jsonb not null default '{}'::jsonb,
  owner_employee_id     uuid references public.employees(id) on delete set null,
  created_by_employee_id uuid references public.employees(id) on delete set null,
  status                text not null default 'planned'
    check (status in ('planned','in_progress','actioned','verified','dismissed')),
  due_at                timestamptz,
  actioned_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists org_actions_function_status_idx
  on public.org_actions(function_id, status, created_at desc);

-- All writes flow through guarded server routes after capability checks. Keeping
-- these control tables server-owned avoids exposing the service role or relying on
-- client-side visibility as authorization.
alter table public.workspace_configuration enable row level security;
alter table public.workspace_configuration force row level security;
alter table public.data_processing_preferences enable row level security;
alter table public.data_processing_preferences force row level security;
alter table public.teams enable row level security;
alter table public.teams force row level security;
alter table public.team_memberships enable row level security;
alter table public.team_memberships force row level security;
alter table public.configuration_audit enable row level security;
alter table public.configuration_audit force row level security;
alter table public.recommendation_action_events enable row level security;
alter table public.recommendation_action_events force row level security;
alter table public.org_actions enable row level security;
alter table public.org_actions force row level security;

comment on table public.workspace_configuration is
  'Audited organization configuration state; never measurement evidence.';
comment on table public.recommendation_action_events is
  'Human acknowledgements of deterministic recommendations; actioned does not imply measured impact.';
