-- ─────────────────────────────────────────────────────────────────────────────
-- v3 RAW EVIDENCE TABLES — the ingestion contract (backend teammate's domain).
--
-- These are the ONLY tables real connectors will write. The seed script fills
-- them with deterministic dummy rows; the engine computes everything else.
-- Every table header states: Source · Method · Phase (from the spec's data
-- catalog, docs/scoring-model.md §11) · natural key for idempotent upserts.
-- Rule: nulls stay nulls — a connector never writes a guessed value.
-- ─────────────────────────────────────────────────────────────────────────────

-- Developers (roster).
-- Source: SSO/roster identity map (P4) — dummy: seeded archetypes.
-- Natural key: handle. Cadence: on roster change.
create table v3.developers (
  id uuid primary key,
  handle text not null unique,
  name text not null,
  archetype text not null,             -- one of the 10 seeded archetypes (docs in seed.mjs)
  team text not null default 'Platform',
  seat_tier text not null default 'standard'
    check (seat_tier in ('standard', 'capped', 'none')),  -- powers KPI 1-H3 / 3-H3
  created_at timestamptz not null default now()
);

-- Repos: connected-scope map + harness applicability map.
-- Source: GitHub App install (connected) + repo scan (P2 applicability).
-- Powers: KPI 6 scope (in-scope tokens only) · KPI 13 applicability/breadth ·
--         13-H2 (verify rule in CLAUDE.md) · 4-H2 (context-file presence).
-- Natural key: repo. Cadence: on install/daily scan.
create table v3.repos (
  repo text primary key,               -- 'org/name'
  connected boolean not null,          -- in functions.repo_ids equivalent — scores only if true
  has_build boolean not null default true,   -- V1 applicable
  has_tests boolean not null default true,   -- V2 applicable
  has_lint boolean not null default true,    -- V3 applicable
  has_claude_md boolean not null default false,
  verify_rule_in_claude_md boolean not null default false
);

-- Merged/open PRs + metadata + native revert linkage.
-- Source: GitHub App · Method: REST backfill + webhooks · Phase: P1 · Tag: ✅ now
-- (native revert linkage: 📐 est — Revert-button PRs carry a platform reference).
-- Powers: KPIs 1, 4, 6, 7, 10 · sizing · link fallback · blast flags.
-- Natural key: (repo, number). Cadence: webhooks realtime + daily backfill.
create table v3.prs (
  id uuid primary key,
  developer_id uuid not null references v3.developers(id),
  repo text not null references v3.repos(repo),
  number int not null,
  title text not null,
  head_ref text not null,              -- branch-method link (0.80)
  merge_sha text,                      -- sha-method link (0.95); null until merged
  opened_at timestamptz not null,
  merged_at timestamptz,               -- null = still open
  files_changed int not null,
  hunks int not null,
  modules int not null,
  blast boolean not null default false,          -- touches sensitive globs (sizing +3)
  module_path text not null,           -- dominant path, e.g. 'src/legacy' (KPI 1-H2 selective use)
  is_revert boolean not null default false,
  revert_of int,                       -- NATIVE revert linkage: PR number this PR reverts (no regex)
  labels text[] not null default '{}', -- 'wip-increment' excludes staged shipping from KPI 10
  unique (repo, number)
);

-- Commits + trailers + KPI 10 raw evidence.
-- Source: GitHub App · Method: per-PR commit list + diff-hunk overlap · Phase: P1 · Tag: ✅ now
-- (hunk_overlap_pr is computed by ingestion from diffs — raw evidence, not a verdict;
--  the ENGINE applies the KPI 10 ladder: bug issue link → `fix:` type → fix-pattern message).
-- Powers: coauthor link fallback · KPI 7 ladder · KPI 10 same-hunk rule.
-- Natural key: sha. Cadence: webhooks + daily backfill.
create table v3.commits (
  id uuid primary key,
  developer_id uuid not null references v3.developers(id),
  repo text not null references v3.repos(repo),
  sha text not null unique,
  pr_number int,                       -- containing PR; null = direct push
  message text not null,
  authored_at timestamptz not null,
  co_authored_by_claude boolean not null default false,  -- Co-authored-by trailer
  hunk_overlap_pr int,                 -- earlier PR whose hunks this commit overlaps (≤14d window)
  linked_issue_kind text check (linked_issue_kind in ('bug', 'task'))  -- issue-link evidence (P5 hardening)
);

-- Claude Code sessions — P1 basics + P2 parser extensions (data already on disk).
-- Source: Claude Code session logs · Method: local JSONL parse · Phase: P1/P2 · Tag: ✅ now
-- PRIVACY: first_prompt_chars is a LENGTH FLAG only — prompt text is never ingested.
-- Powers: KPIs 1, 3, 4, 6 (tokens only) · 12 · 13 (verification_events) ·
--         14 (review_pass) · 15 (context_read_at_start) · the 0.99 pr-link join.
-- Natural key: session_key. Cadence: capture realtime · scoring daily batch.
create table v3.sessions (
  id uuid primary key,
  developer_id uuid not null references v3.developers(id),
  session_key text not null unique,
  repo text references v3.repos(repo), -- from cwd; null = work outside known repos
  branch text,                         -- from gitBranch
  started_at timestamptz not null,
  turns int not null,
  model text not null,
  tokens_in bigint not null,
  tokens_out bigint not null,
  cache_read_tokens bigint not null,
  cache_creation_tokens bigint not null,
  first_prompt_chars int not null,     -- 🔒 length only, never text (three-mechanism privacy design)
  context_read_at_start boolean not null default false,  -- KPI 15 warm start (CLAUDE.md/handoff read)
  pr_refs jsonb not null default '[]', -- pr-link markers [{"repo","number"}] → link @0.99
  sha_refs text[] not null default '{}',              -- merge-sha prefixes seen → link @0.95
  skill_invocations jsonb not null default '[]',       -- [{"name","had_output"}] (KPI 12 execution evidence)
  verification_events jsonb not null default '[]',     -- [{"category":"V1".."V4","cmd","duration_ms","exit_code"}]
  review_pass jsonb                    -- {"ran":bool,"diff_changed":bool,"findings":int} | null (KPI 14 theater guard)
);

-- Authored skills (KPI 12). Invocation evidence lives on sessions.skill_invocations.
-- Source: Claude Code config scan · Phase: P1 · Tag: ✅ now.
-- Natural key: (developer_id, name). Cadence: daily scan.
create table v3.skills (
  id uuid primary key,
  developer_id uuid not null references v3.developers(id),
  name text not null,
  authored_at timestamptz not null,
  path text not null,
  unique (developer_id, name)
);

-- Deploy events + statuses (KPI 9 Tier-1 — the scoring basis, no Sentry needed).
-- Source: GitHub Deployments/Actions (or Argo/Spinnaker) · Method: "Deployments"
-- permission + webhooks · Phase: P3 · Tag: 🔧 setup (events) / 📐 est (rollback rule).
-- The ENGINE applies the published rule: failed = rollback of this deploy, or a
-- fix-tagged deploy ≤48h on the same service.
-- Natural key: deploy_key. Cadence: deploy webhooks + daily batch scoring.
create table v3.deploy_events (
  id uuid primary key,
  repo text not null references v3.repos(repo),
  service text not null,
  deploy_key text not null unique,
  deployed_at timestamptz not null,
  status text not null check (status in ('success', 'failure')),
  kind text not null check (kind in ('deploy', 'rollback', 'hotfix')),
  rollback_of text,                    -- deploy_key this rolls back (platform-native reference)
  fix_tagged boolean not null default false,
  merge_shas text[] not null default '{}'  -- PR merge SHAs contained (attribution chain)
);

-- Coaching events (Addendum B plugin) — metadata ONLY: {rule, trigger, intervention,
-- outcome}. The prompt itself never leaves the developer's machine.
-- Source: Prism plugin hooks · Method: async metadata export · Phase: P4 · Tag: 🔧 setup.
-- Powers: adoption loop · the Live-coaching replay in My View · anonymized themes.
-- Natural key: (developer_id, ts, rule_id). Cadence: realtime capture, daily rollup.
create table v3.coaching_events (
  id uuid primary key,
  developer_id uuid not null references v3.developers(id),
  ts timestamptz not null,
  rule_id text not null check (rule_id in ('C1', 'C2', 'C3', 'C4', 'C5', 'C6')),
  gate text not null,                  -- which below-target KPI armed the rule (need-gating)
  trigger text not null,               -- signal metadata, e.g. 'prompt lacked file refs' (no text)
  intervention text not null check (intervention in ('enrich', 'coach', 'flag', 'block')),
  message text not null,               -- the coach line shown to the developer
  outcome text not null check (outcome in ('acted', 'ignored', 'dismissed')),
  unique (developer_id, ts, rule_id)
);

create index v3_prs_dev_merged on v3.prs (developer_id, merged_at);
create index v3_sessions_dev_started on v3.sessions (developer_id, started_at);
create index v3_sessions_repo on v3.sessions (repo);
create index v3_commits_overlap on v3.commits (hunk_overlap_pr) where hunk_overlap_pr is not null;
create index v3_coaching_dev_ts on v3.coaching_events (developer_id, ts);
