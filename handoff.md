# Prism Codex — handoff

last-synced: 8a20e558e33c8bcc9fa9040c64322ebdf99f1cc2
branch: `codex/experience-rebuild`
workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Rebuild Prism’s UI/UX and end-to-end decision flow in an independent folder while preserving the deterministic v3 MAIN and HARNESS index calculations exactly.

## Current state

- ✅ Shipped before this branch: v3 schema/seed, deterministic engine, Function/Team/My view/Configure, versioned recompute, user-context adoption, and grounded agent coaching (see git history).
- ✅ Independent local clone created; `.env.local` links to `/Users/anandpareek/Documents/Prism v1/.env.local` and is ignored by git.
- ✅ Product audit complete. New experience principle: current impact → why → priority action → proof.
- ✅ Power-coding memory, eval ladder, architecture flow, security baseline, and diagram viewer configured.
- 🚧 UI rebuild not started. Existing APIs, v3 reads, database schema, and scoring service remain unchanged.

## Product/architecture decisions

- 2026-07-17 — Keep the monorepo/data architecture unchanged; redesign the web experience only, avoiding schema, service, dependency, and index-calculation changes.
- 2026-07-17 — Treat the Function view as the leader decision center, Team as a coaching/support view, My view as a private action workspace, and Configure as an advanced model-owner surface.
- 2026-07-17 — Use the existing project `handoff.md` naming convention instead of introducing a competing `Handoff.MD`.
- 2026-07-17 — Use diagram files plus the standalone local viewer; do not add a debug tab to the production app. ⚠️ unconfirmed default.

## Hard boundaries

- `services/engine` owns every score. UI code may only sort, group, label, and prioritize already-computed rows.
- MAIN and HARNESS stay separate; no dollars/hours-saved claims; synthetic data stays in `v3.*` with visible demo disclosure.
- Do not modify migrations or public-schema data for this rebuild.

## Verify

Use Node 22+. Run `npm run test`, `npm run typecheck`, and `npm run build`; then serve one dev server and browser-check `/function`, `/team`, a member profile, `/me?dev=tom`, and `/configure` at desktop and mobile widths.

## Next

1. Implement the new design system and shell.
2. Rebuild Function and Team/member flows.
3. Rebuild My view and Configure without changing their mutations.
4. Run the full checks and visual QA; update this snapshot before the completion checkpoint.

**Session efficiency:** 🎯 ~45% feature · 🔧 ~55% support (audit, workspace safety, and baseline setup) · 🔁 0% rework
