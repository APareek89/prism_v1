-- 0007_github_raw.sql
-- Append-only raw GitHub evidence (PRD §6 / §7.1). Connectors write here only;
-- sizing/scoring columns computed on ingest are stored, but the S/M/L bucketing
-- decision still belongs to scoring config.
--
-- function_id is denormalized onto every raw table so multi-employee RLS can
-- gate by function without a join chain (architecture: "add function_id to
-- raw/computed tables where needed"). employee_id is the resolved author.

-- ─────────────────────────────────────────────────────────────────────────────
-- gh_prs — one merged/open PR.
--   size_score = files + hunks + 2·modules + 3·blast (raw; computed by connector)
--   size_bucket = S/M/L (frozen tertiles; nullable until scoring assigns it)
--   reverted_at = set if the merge was reverted ≤14d (effectiveness signal)
--   feature_label = distinct feature tag (many commits, no label → flagged §4.7)
--   ai_assisted = a confirmed AI→PR link exists (set by the link step)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.gh_prs (
  id            uuid primary key default gen_random_uuid(),
  function_id   uuid not null references public.functions (id) on delete cascade,
  employee_id   uuid references public.employees (id) on delete set null,
  repo          text not null,
  number        integer not null,
  author_handle citext,
  title         text,
  created_at    timestamptz,
  merged_at     timestamptz,
  is_merged     boolean not null default false,
  additions     integer not null default 0,
  deletions     integer not null default 0,
  changed_files integer not null default 0,
  files         integer not null default 0,   -- cleaned changed-file count (post ignore_globs)
  hunks         integer not null default 0,    -- contiguous diff blocks
  modules       integer not null default 0,    -- distinct top-level dirs/packages
  blast         integer not null default 0,    -- 1 if any path matches sensitive_globs
  size_score    integer,
  size_bucket   size_bucket,
  head_ref      text,                          -- branch → AI link join key
  merge_sha     text,                          -- merge commit sha → AI link join key
  feature_label text,
  reverted_at   timestamptz,
  ai_assisted   boolean not null default false,
  ingested_at   timestamptz not null default now(),
  -- A repo+PR-number is unique; re-ingest upserts on this.
  constraint gh_prs_repo_number_unique unique (repo, number)
);

create index if not exists gh_prs_function_id_idx on public.gh_prs (function_id);
create index if not exists gh_prs_employee_id_idx on public.gh_prs (employee_id);
create index if not exists gh_prs_merged_at_idx   on public.gh_prs (merged_at);
create index if not exists gh_prs_head_ref_idx    on public.gh_prs (head_ref);

-- ─────────────────────────────────────────────────────────────────────────────
-- gh_commits — one commit. ai_assisted + coauthor_trailer drive the AI→PR link
-- and the Claude co-author detection.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.gh_commits (
  id              uuid primary key default gen_random_uuid(),
  function_id     uuid not null references public.functions (id) on delete cascade,
  employee_id     uuid references public.employees (id) on delete set null,
  pr_id           uuid references public.gh_prs (id) on delete set null,
  repo            text not null,
  sha             text not null,
  pr_number       integer,
  author_handle   citext,
  ts              timestamptz,
  ai_assisted     boolean not null default false,
  coauthor_trailer text,
  ingested_at     timestamptz not null default now(),
  constraint gh_commits_repo_sha_unique unique (repo, sha)
);

create index if not exists gh_commits_function_id_idx on public.gh_commits (function_id);
create index if not exists gh_commits_employee_id_idx on public.gh_commits (employee_id);
create index if not exists gh_commits_pr_id_idx       on public.gh_commits (pr_id);
