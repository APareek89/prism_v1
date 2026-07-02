-- 0021_seed_index_config.sql
-- THE ONLY SEED. Inserts exactly two rows so the system computes on day one:
--   1. ONE bootstrap `functions` row  (org = me = team for the MVP).
--   2. ONE `index_config` v1 row tied to it (weights + cold-start anchors +
--      sizing rule + ignore/sensitive globs), FROZEN at now().
--
-- NO employees. NO PRs. NO scores. NO synthetic data of any kind (no-dummy-data
-- invariant, architecture §0.4 / ownership-map). Real people, PRs, and scores
-- only ever arrive through connectors + the pipeline.
--
-- Idempotent: ON CONFLICT DO NOTHING so `supabase db reset` re-applies cleanly.

-- ── 1. Bootstrap function ────────────────────────────────────────────────────
insert into public.functions (id, name, window_days)
values (
  '00000000-0000-0000-0000-0000000000f1',   -- stable bootstrap id
  'My Engineering',
  28                                          -- 28-day rolling compute window (PRD §4.6)
)
on conflict (id) do nothing;

-- ── 2. index_config v1 (PRD §4.1/§4.3/§4.4) ─────────────────────────────────
-- weights:  Usage .10 / Efficiency .25 / Effectiveness .40 / Proficiency .25
-- anchors:  cold-start floor/target(/ceil) per §4.4 with inversion flags
-- sizing:   size_score = files + hunks + 2·modules + 3·blast; cold-start tertiles
--           S ≤ 6 · M 7-18 · L > 18 (frozen until 90d calibration)
-- globs:    ignore = lockfiles/generated/vendored/snapshots/migrations
--           sensitive = auth/billing/core/infra/db (sets blast=1)
insert into public.index_config (
  id, function_id, version,
  weights_jsonb, anchors_jsonb, sizing_jsonb,
  ignore_globs, sensitive_globs, frozen_at
)
values (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000f1',
  1,
  -- weights ----------------------------------------------------------------
  '{
     "usage": 0.10,
     "efficiency": 0.25,
     "effectiveness": 0.40,
     "proficiency": 0.25
   }'::jsonb,
  -- anchors (cold-start; floor/target, or target/ceil for inverted KPIs) ----
  '{
     "ai_assisted_pr_share":     { "floor": 0.5, "target": 1.0, "inverted": false },
     "agentic_depth_share":      { "floor": 0.3, "target": 0.8, "inverted": false },
     "tool_session_cadence":     { "floor": 0.3, "target": 0.8, "inverted": false },
     "iterations_to_merge":      { "target": 3,  "ceil": 12,    "inverted": true  },
     "suggestion_acceptance":    { "floor": 0.4, "target": 0.8, "inverted": false },
     "tokens_to_shipped":        { "target": 30000, "ceil": 90000, "inverted": true },
     "merged_without_revert":    { "floor": 0.7, "target": 0.98, "inverted": false },
     "ai_retention_30d":         { "floor": 0.2, "target": 0.7, "inverted": false },
     "change_failure_rate":      { "target": 0.05, "ceil": 0.30, "inverted": true },
     "defect_rework_rate":       { "target": 0.05, "ceil": 0.30, "inverted": true },
     "skill_file_leverage":      { "floor": 0.0, "target": 0.2, "inverted": false },
     "distinct_skills_authored": { "floor": 0,   "target": 3,   "inverted": false },
     "multiplier_signal":        { "floor": 0,   "target": 1,   "inverted": false }
   }'::jsonb,
  -- sizing rule (size_score weights + cold-start tertile thresholds) --------
  '{
     "weights": { "files": 1, "hunks": 1, "modules": 2, "blast": 3 },
     "thresholds": { "s_max": 6, "m_max": 18 },
     "tie_break_pct": 0.10,
     "calibrated": false
   }'::jsonb,
  -- ignore_globs: lockfiles, generated, vendored, snapshots, migrations -----
  array[
    '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml', '**/poetry.lock',
    '**/Gemfile.lock', '**/go.sum', '**/Cargo.lock', '**/composer.lock',
    '**/*.generated.*', '**/generated/**', '**/__generated__/**',
    '**/vendor/**', '**/node_modules/**', '**/dist/**', '**/build/**',
    '**/__snapshots__/**', '**/*.snap',
    '**/migrations/**', '**/*.min.js', '**/*.min.css'
  ]::text[],
  -- sensitive_globs: auth, billing, core, infra/IaC, db schema (blast=1) ----
  array[
    '**/auth/**', '**/billing/**', '**/payment*/**', '**/core/**',
    '**/infra/**', '**/infrastructure/**', '**/terraform/**', '**/*.tf',
    '**/k8s/**', '**/helm/**', '**/db/**', '**/database/**',
    '**/schema/**', '**/migrations/**'
  ]::text[],
  now()                                       -- frozen on seed (immutable v1)
)
on conflict (function_id, version) do nothing;
