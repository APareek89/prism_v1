-- 0005_index_config.sql
-- Versioned, append-only scoring configuration (PRD §4 / §6).
-- Each computed score records the config_version it used (anti-gaming, §4.7),
-- so a config row is FROZEN once frozen_at is set: a change is a NEW version
-- appended, never an in-place edit (enforced by the trigger in 0020).
--
-- JSONB payloads:
--   weights_jsonb   → L2 weights {usage, efficiency, effectiveness, proficiency}
--   anchors_jsonb   → per-KPI {floor, target[, ceil], inverted} normalization anchors
--   sizing_jsonb    → size_score weights + S/M/L tertile thresholds
--   ignore_globs[]  → diff paths dropped before sizing (lockfiles/generated/…)
--   sensitive_globs[] → paths that set blast=1 (auth/billing/core/infra/db)

create table if not exists public.index_config (
  id              uuid primary key default gen_random_uuid(),
  function_id     uuid not null references public.functions (id) on delete cascade,
  version         integer not null,
  weights_jsonb   jsonb not null,
  anchors_jsonb   jsonb not null,
  sizing_jsonb    jsonb not null,
  ignore_globs    text[] not null default '{}',
  sensitive_globs text[] not null default '{}',
  frozen_at       timestamptz,                  -- non-null once frozen → immutable
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Version numbers are monotonic per function; downstream rows FK to this.
  constraint index_config_function_version_unique unique (function_id, version),
  constraint index_config_version_positive check (version > 0)
);

create index if not exists index_config_function_id_idx
  on public.index_config (function_id);
-- The config_version FK guard in 0020 resolves a version to its row; index it.
create index if not exists index_config_version_idx
  on public.index_config (version);
