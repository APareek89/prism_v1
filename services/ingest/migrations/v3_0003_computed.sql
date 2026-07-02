-- ─────────────────────────────────────────────────────────────────────────────
-- v3 COMPUTED TABLES — engine-owned (services/engine). Ingestion NEVER writes
-- these; the deterministic engine recomputes them from raw tables on every run
-- (daily batch or on-demand, e.g. after a Configure change).
-- ─────────────────────────────────────────────────────────────────────────────

-- AI→PR links, method + confidence per link (the connective tissue).
-- Ladder: pr_link 0.99 → sha 0.95 → branch 0.80 → coauthor 0.60; the v3 hardening
-- (suppress coauthor when pr_link already covers the PR) is recorded via `suppressed`.
create table v3.ai_pr_links (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references v3.sessions(id) on delete cascade,
  repo text not null,
  pr_number int not null,
  developer_id uuid not null references v3.developers(id),
  method text not null check (method in ('pr_link', 'sha', 'branch', 'coauthor')),
  confidence numeric not null,
  suppressed boolean not null default false,   -- weak link suppressed by the hardening rule
  computed_at timestamptz not null default now(),
  unique (session_id, repo, pr_number)
);

-- Per-KPI daily rows (28-day trailing window, stamped with the config version used).
create table v3.kpi_daily (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references v3.developers(id),
  date date not null,
  kpi_id text not null,
  index_kind text not null check (index_kind in ('main', 'harness', 'diagnostic')),
  raw_value numeric,                   -- null = honest no-signal (never 0-by-default)
  score numeric,                       -- 0–100 after anchor normalization; null = no denominator
  signal_count int not null default 0, -- denominator size (drives confidence + small-sample banner)
  tier text,                           -- KPI 9 evidence-ladder badge ('T1'..'T4')
  meta jsonb not null default '{}',    -- drill-down evidence (per-KPI shape)
  config_version int not null,
  computed_at timestamptz not null default now(),
  unique (developer_id, date, kpi_id, config_version)
);

-- The two indexes per developer per day (MAIN with band+gates · HARNESS bandless).
create table v3.index_daily (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references v3.developers(id),
  date date not null,
  index_kind text not null check (index_kind in ('main', 'harness')),
  score numeric,                       -- null when confidence below the publish floor
  band text,                           -- main only ('L0'..'L5'); harness has NO bands
  confidence numeric not null,
  gates jsonb not null default '{}',   -- {"l0_forced":bool,"l5_capped":bool,"multiplier_signal":int}
  dimensions jsonb not null default '{}', -- {"usage":n,"efficiency":n,"outcomes":n} (main only)
  config_version int not null,
  computed_at timestamptz not null default now(),
  unique (developer_id, date, index_kind, config_version)
);

-- Insights: only CONFIRMED hypotheses become insights (H0 "is the number real?" first).
-- Deterministic derivation; the template narration is keyless — no LLM computes a number.
create table v3.insights (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references v3.developers(id),
  date date not null,
  kpi_id text not null,
  hypothesis text not null,            -- 'H0'..'H4' or 'LINK' (linkage engine)
  title text not null,
  body text not null,
  magnitude jsonb not null default '{}',  -- e.g. {"value":14,"norm":5,"unit":"turns"}
  evidence jsonb not null default '{}',   -- refs into raw rows (PR numbers, session keys)
  channel text not null check (channel in ('fix', 'nudge', 'rec', 'team', 'org')),
  config_version int not null,
  created_at timestamptz not null default now(),
  unique (developer_id, date, kpi_id, hypothesis, config_version)
);

-- Recommendations: ranked by impact = (100 − score) × index weight of the KPI's
-- dimension; channel + owner routed per the lab's channel legend.
create table v3.recommendations (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references v3.developers(id),
  date date not null,
  ref text not null,                   -- stable rule id, e.g. 'review-gate', 'claude-md'
  title text not null,
  rationale text not null,
  channel text not null check (channel in ('fix', 'nudge', 'rec', 'team', 'org')),
  owner text not null,                 -- 'You' | 'Team lead' | 'Platform admin' | 'Prism (data)'
  targets text[] not null default '{}',-- KPI ids this action moves
  impact numeric not null,
  rank int not null,
  config_version int not null,
  created_at timestamptz not null default now(),
  unique (developer_id, date, ref, config_version)
);

create index v3_kpi_daily_dev on v3.kpi_daily (developer_id, date desc);
create index v3_index_daily_dev on v3.index_daily (developer_id, date desc);
create index v3_insights_dev on v3.insights (developer_id, date desc);
create index v3_recs_dev on v3.recommendations (developer_id, date desc, rank);
create index v3_links_pr on v3.ai_pr_links (repo, pr_number);
