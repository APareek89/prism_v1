-- ─────────────────────────────────────────────────────────────────────────────
-- v3 CONFIG TABLES + config seed. This is CONFIG, not dummy data — mirrors
-- docs/scoring-model.md §5 (KPI reference) and §11 (data catalog) so the
-- Configure tab can render the whole model FROM the DB.
-- ─────────────────────────────────────────────────────────────────────────────

-- Data points (inputs) — the catalog the Configure tab lists per KPI.
create table v3.data_points (
  id text primary key,
  name text not null,
  source text not null,
  method text not null,
  fetch_tag text not null check (fetch_tag in ('now', 'setup', 'est', 'no')),
  phase text not null,                 -- P1..P5
  powers text not null
);

-- KPI catalog — one row per KPI; anchors and formula text match the model lab exactly.
create table v3.kpi_catalog (
  kpi_id text primary key,
  num int not null,
  name text not null,
  index_kind text not null check (index_kind in ('main', 'harness', 'diagnostic')),
  dimension text not null check (dimension in ('usage', 'efficiency', 'outcomes', 'harness')),
  question text not null,
  formula_text text not null,
  direction text not null check (direction in ('up', 'down')),
  unit text not null,
  anchor jsonb not null,               -- {"floor":n,"target":n} (up) | {"target":n,"ceil":n} (down)
  trust text not null,
  status text not null,
  data_point_ids text[] not null,
  enabled_default boolean not null default true
);

-- Config versions — every Configure save appends a NEW row; exactly one active.
-- config_jsonb: {"weights": {kpi_id: weight 0-100}, "disabled": [kpi_id]}.
-- Main and harness weight sets each sum to 100 over ENABLED KPIs.
create table v3.config_versions (
  version int primary key,
  created_at timestamptz not null,
  active boolean not null default false,
  config jsonb not null,
  note text not null
);
create unique index v3_config_one_active on v3.config_versions (active) where active;

-- ── Data-point catalog (docs/scoring-model.md §11) ──────────────────────────
insert into v3.data_points (id, name, source, method, fetch_tag, phase, powers) values
  ('prs_merged',          'Merged PRs + metadata',            'GitHub App',                    'REST backfill + webhooks',                          'now',   'P1', 'KPIs 1, 4, 6, 7, 10 · sizing · link fallback'),
  ('commits',             'Commits + Co-authored-by trailers','GitHub App',                    'Per-PR commit list',                                'now',   'P1', 'coauthor link fallback · KPI 7/10 ladders'),
  ('revert_events',       'Revert events (native linkage)',   'GitHub App',                    'Revert-button platform reference; inverse-diff fallback', 'est', 'P1', 'KPI 7 · linkage ruler'),
  ('sessions',            'Sessions (turns, repo, branch)',   'Claude Code logs',              'Local JSONL parse',                                 'now',   'P1', 'KPIs 1, 3, 4 · link'),
  ('session_tokens',      'Tokens in/out/cache per session',  'Claude Code logs',              'Per-message usage fold',                            'now',   'P1', 'KPI 6 (tokens only — no dollars) · C2 nudge'),
  ('ai_pr_link',          'AI→PR link (the join)',            'Derived',                       'pr_link 0.99 → sha 0.95 → branch 0.80 → coauthor 0.60', 'est', 'P1', 'Every AI-denominated metric'),
  ('working_days',        'Working days (denominator)',       'Derived',                       'Distinct UTC days with any activity (commit/PR/session)', 'est', 'P1', 'KPI 3 denominator'),
  ('size_buckets',        'PR size buckets (S/M/L)',          'Derived',                       'files + hunks + 2·modules + 3·blast; trailing tertiles', 'est', 'P1', 'KPI 4 fairness'),
  ('repo_scope_map',      'Repo scope map (in-scope only)',   'Derived',                       'session cwd ⋈ connected repo list',                 'est',   'P1', 'KPI 6 scope — exploration visible, never scored'),
  ('fix_classification',  'Fix/rework classification',        'Derived',                       'Ladder: bug issue link → fix: type → pattern, ANDed with same-hunk ≤14d', 'est', 'P1', 'KPI 10 · linkage ruler'),
  ('skills',              'Skill files authored',             'Claude Code config scan',       'Path scan',                                         'now',   'P1', 'KPI 12'),
  ('skill_invocations',   'Skill invocations w/ output',      'Claude Code logs',              'Tool-call blocks + execution evidence',             'now',   'P1', 'KPI 12 anti-gaming · linkage · C3'),
  ('verification_events', 'Tool calls → harness categories',  'Claude Code logs',              'Parser extension (V1–V4 + duration/exit) — data already on disk', 'now', 'P2', 'KPI 13 rate + breadth'),
  ('review_pass_events',  'Pre-PR review pass evidence',      'Claude Code logs',              'Parser extension (skill/subagent + diff-change-or-no-findings)', 'now', 'P2', 'KPI 14 (theater guard)'),
  ('context_read_events', 'Context-file reads at start',      'Claude Code logs',              'Parser extension',                                  'now',   'P2', 'KPI 15 warm starts'),
  ('applicability_map',   'Repo harness applicability map',   'Repo scan',                     'test/build/lint config presence',                   'setup', 'P2', 'KPI 13 breadth — repo gaps never penalize devs'),
  ('deploy_events',       'Deploy events + statuses',         'GitHub Deployments/Actions',    '"Deployments" permission + webhooks',               'setup', 'P3', 'KPI 9 Tier-1 (the scoring basis — no Sentry)'),
  ('rollback_detection',  'Rollback / hotfix detection',      'Derived',                       'Published rule: revert-deploy or fix-tagged ≤48h, same service', 'est', 'P3', 'KPI 9 Tier-1'),
  ('deploy_attribution',  'Deploy → PR → AI attribution',     'Derived',                       'SHA chain, confidence per hop; multi-PR deploys flagged', 'est', 'P3', 'KPI 9'),
  ('coaching_events',     'Coaching events (rule/outcome)',   'Prism plugin (Addendum B)',     'Async metadata export from hooks — prompt text never leaves the machine', 'setup', 'P4', 'Adoption loop · Live coaching tab');

-- ── KPI catalog (anchors match prism-model-lab simulator exactly) ───────────
insert into v3.kpi_catalog (kpi_id, num, name, index_kind, dimension, question, formula_text, direction, unit, anchor, trust, status, data_point_ids, enabled_default) values
  ('ai_share', 1, 'AI-assisted PR share', 'main', 'usage',
   'What share of shipped work did AI touch?',
   'AI-linked merged PRs ÷ merged PRs (revert PRs excluded from both sides)',
   'up', '%', '{"floor": 50, "target": 100}', 'high', 'live',
   array['prs_merged', 'sessions', 'ai_pr_link'], true),
  ('cadence', 3, 'Session cadence', 'main', 'usage',
   'Habit or occasional toy?',
   'days with ≥1 AI session ÷ working days (activity-derived)',
   'up', '%', '{"floor": 30, "target": 80}', 'high', 'live',
   array['sessions', 'working_days'], true),
  ('iterations', 4, 'AI iterations to merge', 'main', 'efficiency',
   'Back-and-forths to land a PR?',
   'mean session turns per merged PR within S/M/L size class, bucket means averaged — EXACT pr_link matches only',
   'down', 'turns', '{"target": 3, "ceil": 12}', 'medium', 'live (exact links only)',
   array['sessions', 'ai_pr_link', 'size_buckets'], true),
  ('tokens', 6, 'Tokens to shipped', 'main', 'efficiency',
   'AI spend per shipped PR?',
   'in-scope (connected-repo) session tokens ÷ merged PRs — TOKENS ONLY, no dollars; exploration shown separately, never scored',
   'down', 'k tokens/PR', '{"target": 30, "ceil": 90}', 'high', 'live (scope fix applied)',
   array['session_tokens', 'prs_merged', 'repo_scope_map'], true),
  ('revert', 7, 'Merged without revert', 'main', 'outcomes',
   'Did AI work stick?',
   '1 − (AI PRs reverted ≤14d ÷ AI merged PRs) — ALL post-merge reverts count, self-caught included; who-caught routes the ACTION',
   'up', '%', '{"floor": 80, "target": 98}', 'medium', 'live',
   array['prs_merged', 'revert_events', 'ai_pr_link'], true),
  ('rework', 10, 'Defect-rework rate', 'main', 'outcomes',
   'Ship it, then patch it?',
   'fix follow-ups on same code ≤14d ÷ merged PRs — evidence ladder (bug link → fix: → pattern) + wip-increment exclusion',
   'down', '%', '{"target": 5, "ceil": 30}', 'medium', 'live',
   array['prs_merged', 'commits', 'fix_classification'], true),
  ('reliability', 9, 'Change reliability', 'diagnostic', 'outcomes',
   'Did the change hold up in front of the end user?',
   'failed AI changes ÷ AI changes · failed = T1 rollback/hotfix ≤48h (always) OR T2 new-error regression (hygiene-gated) · tier badge on every number',
   'down', '%', '{"target": 5, "ceil": 30}', 'medium', 'diagnostic — joins Outcomes core after one clean Tier-1 month',
   array['deploy_events', 'rollback_detection', 'deploy_attribution'], true),
  ('skills_authored', 12, 'Distinct skills authored', 'harness', 'harness',
   'Know-how → reusable assets?',
   'distinct skills authored AND invoked ≥1× with real output (empty files never count)',
   'up', 'count', '{"floor": 0, "target": 3}', 'high', 'live',
   array['skills', 'skill_invocations'], true),
  ('verification', 13, 'Verification harness rate', 'harness', 'harness',
   'Does AI verify before handing over?',
   'RATE: verified AI PRs ÷ AI PRs · BREADTH: harness categories used ÷ categories applicable (repo gaps flag the REPO, not the person)',
   'up', '%', '{"floor": 30, "target": 80}', 'high', 'proposed — framework defined (V1 build · V2 tests · V3 lint · V4 runtime)',
   array['verification_events', 'ai_pr_link', 'applicability_map'], true),
  ('review_loop', 14, 'Review-loop rate', 'harness', 'harness',
   'Critique pass before human review?',
   'AI PRs with a REAL pre-PR review pass (diff change or explicit no-findings) ÷ AI PRs',
   'up', '%', '{"floor": 20, "target": 70}', 'medium', 'proposed — anchors to calibrate with real data',
   array['review_pass_events', 'ai_pr_link'], true),
  ('continuity', 15, 'Context continuity rate', 'harness', 'harness',
   'Sessions start warm or cold?',
   'warm-start sessions (CLAUDE.md / handoff / memory read at start) ÷ sessions in connected repos',
   'up', '%', '{"floor": 30, "target": 80}', 'medium', 'proposed — anchors to calibrate with real data',
   array['context_read_events', 'sessions'], true);

-- ── Config v1 — the v3.0 defaults ────────────────────────────────────────────
-- Main per-KPI weights are the dimension weights (Usage 15 · Efficiency 35 ·
-- Outcomes 50) split equally inside each dimension — arithmetically identical
-- to "dimension = mean of its KPIs, index = weighted dims" (spec §2), while
-- giving the Configure tab a per-KPI weight to edit. Harness: equal weights.
insert into v3.config_versions (version, created_at, active, config, note) values
  (1, '2026-07-02T00:00:00Z', true,
   '{
      "weights": {
        "ai_share": 7.5, "cadence": 7.5,
        "iterations": 17.5, "tokens": 17.5,
        "revert": 25, "rework": 25,
        "skills_authored": 25, "verification": 25, "review_loop": 25, "continuity": 25
      },
      "disabled": []
    }',
   'v3.0 defaults — MAIN 15/35/50 over Core-6 (equal split within dimension) · HARNESS equal weights');
