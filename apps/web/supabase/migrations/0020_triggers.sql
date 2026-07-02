-- 0020_triggers.sql
-- Cross-cutting triggers:
--   1. set_updated_at         → stamp updated_at on every UPDATE.
--   2. freeze_index_config    → block edits to weights/anchors/sizing after
--                               frozen_at (a change MUST be a new version row).
--   3. guard_index_daily_cfg  → FK-style guard: index_daily.config_version must
--                               reference an existing index_config.version for
--                               the same function (a value FK, not a row FK).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. updated_at stamping
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger functions_set_updated_at
  before update on public.functions
  for each row execute function public.set_updated_at();

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

create trigger index_config_set_updated_at
  before update on public.index_config
  for each row execute function public.set_updated_at();

create trigger connectors_set_updated_at
  before update on public.connectors
  for each row execute function public.set_updated_at();

create trigger recommendations_set_updated_at
  before update on public.recommendations
  for each row execute function public.set_updated_at();

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Freeze index_config: once frozen_at is set, the scoring inputs are immutable
-- (anti-gaming §4.7 — every score records its config_version). Setting frozen_at
-- (NULL→non-NULL) is allowed; thereafter weights/anchors/sizing/version cannot
-- change. A new configuration is a NEW version row (admins INSERT, per 0019).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.freeze_index_config()
returns trigger
language plpgsql
as $$
begin
  -- Only guard rows that were already frozen before this UPDATE.
  if old.frozen_at is not null then
    if new.weights_jsonb   is distinct from old.weights_jsonb
       or new.anchors_jsonb is distinct from old.anchors_jsonb
       or new.sizing_jsonb  is distinct from old.sizing_jsonb
       or new.version       is distinct from old.version
       or new.frozen_at     is distinct from old.frozen_at
       or new.function_id   is distinct from old.function_id
    then
      raise exception
        'index_config v% is frozen (frozen_at=%); append a new version instead of editing weights/anchors/sizing',
        old.version, old.frozen_at
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger index_config_freeze
  before update on public.index_config
  for each row execute function public.freeze_index_config();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. index_daily.config_version must resolve to a real index_config row for the
-- same function. Postgres can't express an FK to a non-unique-by-itself column
-- combined with function_id without a composite FK, so we guard it in a trigger.
-- (index_config has UNIQUE(function_id, version), so the lookup is exact.)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.guard_index_daily_config_version()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.index_config c
    where c.function_id = new.function_id
      and c.version = new.config_version
  ) then
    raise exception
      'index_daily.config_version % has no matching index_config for function %',
      new.config_version, new.function_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger index_daily_config_version_guard
  before insert or update on public.index_daily
  for each row execute function public.guard_index_daily_config_version();
