-- 0010_blame_pr_link.sql
-- blame_snapshots (raw, append-only) + pr_ai_link (computed). PRD §6.
--   blame_snapshots → AI-attributed lines and whether they survive to 30d
--                     (retention + rework signals for Effectiveness).
--   pr_ai_link      → the confirmed AI→PR association (branch/coauthor/sha) with
--                     a method + confidence. CORRELATIONAL — never in the score.

-- ─────────────────────────────────────────────────────────────────────────────
-- blame_snapshots
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.blame_snapshots (
  id            uuid primary key default gen_random_uuid(),
  function_id   uuid not null references public.functions (id) on delete cascade,
  employee_id   uuid references public.employees (id) on delete set null,
  repo          text not null,
  file          text not null,
  line_hash     text not null,
  author_handle citext,
  ai_assisted   boolean not null default false,
  first_seen    timestamptz,
  alive_at_30d  boolean,                              -- null until the 30d re-check runs
  ingested_at   timestamptz not null default now(),
  -- A given line-hash in a file/repo is tracked once; re-check updates alive_at_30d.
  constraint blame_snapshots_repo_file_line_unique unique (repo, file, line_hash)
);

create index if not exists blame_snapshots_function_id_idx on public.blame_snapshots (function_id);
create index if not exists blame_snapshots_employee_id_idx on public.blame_snapshots (employee_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- pr_ai_link — computed association. function_id denormalized for RLS parity.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.pr_ai_link (
  id            uuid primary key default gen_random_uuid(),
  function_id   uuid not null references public.functions (id) on delete cascade,
  pr_id         uuid not null references public.gh_prs (id) on delete cascade,
  cc_session_id uuid not null references public.cc_sessions (id) on delete cascade,
  method        text not null,                        -- branch | coauthor | sha
  confidence    numeric(4, 3) not null default 0,     -- 0.000 - 1.000
  created_at    timestamptz not null default now(),
  constraint pr_ai_link_pr_session_unique unique (pr_id, cc_session_id),
  constraint pr_ai_link_method_chk check (method in ('branch', 'coauthor', 'sha')),
  constraint pr_ai_link_confidence_range check (confidence >= 0 and confidence <= 1)
);

create index if not exists pr_ai_link_function_id_idx on public.pr_ai_link (function_id);
create index if not exists pr_ai_link_pr_id_idx       on public.pr_ai_link (pr_id);
create index if not exists pr_ai_link_session_id_idx  on public.pr_ai_link (cc_session_id);
