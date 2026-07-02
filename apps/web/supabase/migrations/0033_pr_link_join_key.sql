-- 0033_pr_link_join_key.sql
-- Additive (per docs/architecture/ownership-map.md: automation appends at 0030+).
--
-- Makes the AI→PR link actually fire. Two changes, both backward-compatible:
--
--  1. cc_sessions.pr_refs — the EXACT first-party session→PR join key. Claude Code
--     emits a `pr-link` event (sessionId + prRepository + prNumber) whenever it opens
--     or pushes a PR; the connector now captures these into a jsonb array of
--     {repo, number}. The old join keys were too weak to link anything (branch was
--     'HEAD', no merge sha on the session, local .jsonl carries no co-author trailer),
--     so pr_ai_link stayed empty. pr_refs is the reliable, repo-scoped, PR-unique key.
--
--  2. pr_ai_link.method — allow the new 'pr_link' method (confidence 0.99, the
--     strongest signal: an explicit session→(repo,number) assertion). The 0010 CHECK
--     only permitted branch|coauthor|sha.

-- 1. Session-level PR references (jsonb array of {repo:text, number:int}). Empty
--    default so existing rows and clients that emit no pr-link events are unaffected.
alter table public.cc_sessions
  add column if not exists pr_refs jsonb not null default '[]'::jsonb;

comment on column public.cc_sessions.pr_refs is
  'PRs this session opened/pushed, from Claude Code `pr-link` events: jsonb array of {repo:"owner/repo", number:int}. Exact first-party AI→PR join key (see lib/connectors/link/match-keys.ts).';

-- 2. Extend the pr_ai_link method vocabulary with 'pr_link' (strongest method).
alter table public.pr_ai_link drop constraint if exists pr_ai_link_method_chk;
alter table public.pr_ai_link add constraint pr_ai_link_method_chk
  check (method in ('pr_link', 'branch', 'coauthor', 'sha'));
