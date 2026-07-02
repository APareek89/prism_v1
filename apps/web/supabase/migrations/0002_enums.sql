-- 0002_enums.sql
-- All app-wide enum types, defined once. Every table below references these.
-- The scope vocabulary is unified to {function, team, employee} everywhere
-- (architecture §0.2); a PR is a prLevel *input*, never a scope.
-- Re-runnable via DO/IF NOT EXISTS guards (CREATE TYPE has no IF NOT EXISTS).

do $$ begin
  -- Roles a person can hold within a function (M2M via employee_roles).
  create type app_role as enum ('developer', 'manager', 'function_lead', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  -- How a person's signals count toward AI rates (PRD §7.2.1).
  --   matched   → roster row linked to a telemetry stream; counts normally.
  --   unmatched → stream/roster mismatch; excluded from AI rates, drops confidence.
  --   byo       → personal subscription; flagged for reimbursement, included.
  --   ignored   → explicitly excluded by an admin.
  create type attribution_mode as enum ('matched', 'unmatched', 'byo', 'ignored');
exception when duplicate_object then null; end $$;

do $$ begin
  create type connector_type as enum ('github', 'claude_code', 'sentry', 'otel');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Deterministic PR sizing bucket (PRD §4.3). Used to group like-with-like.
  create type size_bucket as enum ('S', 'M', 'L');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Confidence band on a computed L1/L2 (PRD §4.6).
  create type confidence_band as enum ('high', 'medium', 'low', 'insufficient');
exception when duplicate_object then null; end $$;

do $$ begin
  -- AI-Native Index level (PRD §4.5).
  create type index_band as enum ('L0', 'L1', 'L2', 'L3', 'L4', 'L5');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Recommendation kind (PRD §10.2-10.3).
  create type rec_kind as enum ('skill', 'process', 'course');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Recommendation lifecycle (PRD §10.4).
  create type rec_status as enum (
    'suggested', 'acknowledged', 'in_progress', 'adopted', 'dismissed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Micro-course lifecycle (PRD §10.3). Completion only via knowledge check.
  create type course_status as enum ('assigned', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Daily-comms channel. MVP is email only; slack is reserved (PRD §10.1).
  create type comms_channel as enum ('email', 'slack');
exception when duplicate_object then null; end $$;

do $$ begin
  -- The unified scope vocabulary for all computed/aggregate rows.
  create type scope_kind as enum ('function', 'team', 'employee');
exception when duplicate_object then null; end $$;
