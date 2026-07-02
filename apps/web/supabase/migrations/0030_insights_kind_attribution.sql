-- 0030_insights_kind_attribution.sql
-- Additive (per docs/architecture/ownership-map.md: automation appends at 0030+).
-- Adds the 'attribution' insight kind — the "what's going well — and why" surface
-- (PRD §9.2.1, improvement-attribution / waste-reduced). The original constraint
-- in 0012 allowed only improvement|change|pr_level; the agent layer also emits
-- attribution insights consumed by the member-detail / My-view "going well" panel.

alter table public.insights drop constraint if exists insights_kind_chk;
alter table public.insights add constraint insights_kind_chk
  check (kind in ('improvement', 'change', 'pr_level', 'attribution'));
