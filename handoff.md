# Prism Codex — handoff

last-synced: f28022a18b65
branch: `codex/experience-rebuild`
workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Rebuild Prism’s UI/UX and end-to-end decision flow in an independent folder while preserving the deterministic v3 MAIN and HARNESS index calculations exactly.

## Current state

- ✅ Independent app lives here; `.env.local` links to `/Users/anandpareek/Documents/Prism v1/.env.local` and remains git-ignored.
- ✅ Rebuilt the shell and all primary v3 journeys around current impact → why → priority action → proof.
- ✅ Overview is the leader decision center; People is a support map (not a leaderboard); My workspace is private impact/coach/growth; Index model is an advanced, append-only editor.
- ✅ Light responsive system, accessible SVG icons, mobile navigation, contained tables, empty-state-compatible components, and a compact demo disclosure are in place.
- ✅ Browser-verified `/function`, `/team`, `/team/diego`, `/me`, growth adoption persistence, and `/configure` at desktop and 390px; zero console errors and no page overflow.
- ✅ `npm run test` (288 tests), `npm run typecheck`, and `npm run build` pass on Node 22.22.0.

## Product/architecture decisions

- 2026-07-17 — Keep the monorepo/data architecture unchanged; redesign the web experience only. No engine, scoring, migration, schema, dependency, or public-data changes were made.
- 2026-07-17 — Treat the Function view as the leader decision center, Team as a coaching/support view, My view as a private action workspace, and Configure as an advanced model-owner surface.
- 2026-07-17 — Keep MAIN and HARNESS visibly separate; presentation code may prioritize computed evidence but never recalculate it.
- 2026-07-17 — Invalid weight totals now block publish at exactly 100; this is an editor guard, not a scoring change.

## Hard boundaries

- `services/engine` owns every score. UI code may only sort, group, label, and prioritize already-computed rows.
- MAIN and HARNESS stay separate; no dollars/hours-saved claims; synthetic data stays in `v3.*` with visible demo disclosure.

## Gotchas / next

- Production build retains the pre-existing Supabase Edge-runtime warning; it completes successfully.
- The browser persistence check added one allowed adoption row for Tom in the isolated `v3` demo schema; active config remains v5.
- `Loop.MD` is offered but not enabled. Full FMEA and the paid coaching golden set require owner approval.
- This clone has no remote, so the branch can be committed locally but cannot open the dogfooding PR until a remote is added.

**Session efficiency:** 🎯 ~72% feature · 🔧 ~23% verification/docs · 🔁 ~5% rework (mobile overflow + invalid-total guard)
