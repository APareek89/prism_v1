-- 0011_kpi_index_daily.sql
-- The computed daily tables. Composite PKs make the daily recompute an UPSERT,
-- never a duplicate (PRD §4.6, architecture §3 "composite PKs → idempotent").
--
-- scope ∈ {function, team, employee} (scope_kind). scope_id is the function_id
-- or employee_id the row describes. function_id is carried for RLS gating even
-- on employee-scoped rows (so policies can reason about function membership).

-- ─────────────────────────────────────────────────────────────────────────────
-- kpi_daily — one normalized KPI value per (date, scope, scope_id, kpi_id).
--   PK (date, scope, scope_id, kpi_id) → recompute upserts the same key.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kpi_daily (
  date        date            not null,
  scope       scope_kind      not null,
  scope_id    uuid            not null,
  kpi_id      text            not null,
  function_id uuid            not null references public.functions (id) on delete cascade,
  raw_value   numeric,
  norm_score  numeric,                                  -- 0-100, anchor-normalized
  confidence  confidence_band not null default 'insufficient',
  signal_count integer        not null default 0,       -- qualifying observations
  config_version integer,
  computed_at timestamptz     not null default now(),
  constraint kpi_daily_pkey primary key (date, scope, scope_id, kpi_id)
);

create index if not exists kpi_daily_scope_idx       on public.kpi_daily (scope, scope_id);
create index if not exists kpi_daily_function_id_idx on public.kpi_daily (function_id);
create index if not exists kpi_daily_date_idx        on public.kpi_daily (date);

-- ─────────────────────────────────────────────────────────────────────────────
-- index_daily — one L1/L2 row per (date, scope, scope_id).
--   PK (date, scope, scope_id) → idempotent recompute.
--   config_version FK to index_config is enforced by trigger in 0020 (the value
--   is index_config.version, not its id, so a plain column FK won't express it).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.index_daily (
  date            date            not null,
  scope           scope_kind      not null,
  scope_id        uuid            not null,
  function_id     uuid            not null references public.functions (id) on delete cascade,
  l1              numeric,
  l2_usage        numeric,
  l2_eff          numeric,                              -- efficiency
  l2_effness      numeric,                              -- effectiveness
  l2_prof         numeric,                              -- proficiency
  band            index_band,
  confidence      confidence_band not null default 'insufficient',
  tokens_per_pr   numeric,                              -- cost lens (function view)
  config_version  integer not null,
  computed_at     timestamptz     not null default now(),
  constraint index_daily_pkey primary key (date, scope, scope_id)
);

create index if not exists index_daily_scope_idx       on public.index_daily (scope, scope_id);
create index if not exists index_daily_function_id_idx on public.index_daily (function_id);
create index if not exists index_daily_date_idx        on public.index_daily (date);
