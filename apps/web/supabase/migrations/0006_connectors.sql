-- 0006_connectors.sql
-- Connector registry + health (PRD §6 / §7). One row per wired data source.
-- config_jsonb holds non-secret connector config (org/repo slugs, sessions dir,
-- OTEL store ref, etc.); real secrets live in env / the Edge Function, NOT here.
-- Scoped to a function so a multi-function future can hold per-function wiring.

create table if not exists public.connectors (
  id           uuid primary key default gen_random_uuid(),
  function_id  uuid not null references public.functions (id) on delete cascade,
  type         connector_type not null,
  status       text not null default 'not_configured',  -- not_configured|connected|error|syncing
  config_jsonb jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One connector of each type per function.
  constraint connectors_function_type_unique unique (function_id, type),
  constraint connectors_status_chk
    check (status in ('not_configured', 'connected', 'error', 'syncing'))
);

create index if not exists connectors_function_id_idx
  on public.connectors (function_id);
