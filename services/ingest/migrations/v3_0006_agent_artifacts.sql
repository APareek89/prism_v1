-- ─────────────────────────────────────────────────────────────────────────────
-- v3 AGENT ARTIFACTS — output of the LLM coaching agent (apps/web/lib/v3/agents).
--
-- Boundary (owner decision, 2026-07-02): INDEX MATH STAYS DETERMINISTIC (the
-- engine); once the indexes exist, the agent reads the developer's OWN inputs
-- (KPIs + evidence meta, engine findings, coaching outcomes, prior adoptions in
-- user_context, org skills, course catalog) and writes these artifacts:
--   good        — what is going well (and why, grounded in the numbers)
--   bad         — what needs attention
--   course      — picks from the dummy course catalog, with a personal reason
--   suggestion  — concrete practice tips ("use skill X", "run tests before PR",
--                 "front-load file + goal in the first prompt", …)
-- Every number the model quotes is validated by the grounding gate; refs are
-- validated in code (course ids ∈ catalog, KPI ids ∈ catalog). Ungroundable
-- items are repaired once, then dropped — never persisted.
-- Artifacts are pinned to (date, config_version) like every computed row.
-- ─────────────────────────────────────────────────────────────────────────────

create table v3.agent_artifacts (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references v3.developers(id),
  date date not null,
  config_version int not null,
  kind text not null check (kind in ('good', 'bad', 'course', 'suggestion')),
  ref text,                                  -- course id · skill name · kpi id (validated in code)
  title text not null,
  body text not null,
  category text check (category in ('skill', 'verification', 'prompt', 'context', 'process')),
  targets text[] not null default '{}',      -- KPI ids this item speaks to
  model text not null,                       -- model id, or 'mock' (keyless fallback)
  grounded boolean not null default true,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (developer_id, date, config_version, kind, title)
);

create index v3_agent_artifacts_dev on v3.agent_artifacts (developer_id, date desc, config_version);
