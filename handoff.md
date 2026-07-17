# Prism Codex — handoff

last-synced: ae542c4de0f2 · branch: `codex/experience-rebuild` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Deliver a clearer AI-Native Engineering Index plus a real-input MVP: GitHub defines delivery evidence/team membership, each developer opts into Codex or Claude Code metadata, and deterministic MAIN/HARNESS calculations remain unchanged.

## Current state

- ✅ Independent redesign remains complete across Overview, People, member, My workspace, and Index model.
- ✅ New admin-only `/connect` flow detects GitHub App installations, activates/backfills one, shows selected repo/evidence/team readiness, and redirects install callbacks back to Connect.
- ✅ Real `APareek89` sync passed: 1 currently selected repo, 22 PRs, 58 commits, 3 active discovered people, no connector errors.
- ✅ Per-person Codex/Claude Code setup uses hashed 15-minute one-time invites, hashed collector tokens, config backup, OTLP/HTTP JSON, prompt logging off, connection checks, and revocation.
- ✅ Collector persists only allowlisted session/model/turn/token/cache/prompt-length/success metadata; bodies and unknown attributes are discarded and events are idempotent.
- ✅ Migration `0034_connect_mvp.sql` is applied to the live DB; no test invites/connections/events/sessions remain. Real public GitHub rows were preserved.
- ✅ Browser-verified `/connect` at 1440px/390px with zero errors/overflow; 292 tests, typecheck, build, and 2/2 Mermaid validation pass; scoring/engine files are untouched.

## Product/architecture decisions

- 2026-07-17 — GitHub connection is function/account-level; Codex and Claude Code consent is per person because telemetry originates on each developer machine.
- 2026-07-17 — Tonight's collector accepts OTLP/HTTP JSON and maps its bearer token directly to function → employee → provider; only token hashes are stored.
- 2026-07-17 — Live connector data remains in `public.*` and visible in Connect; v3 decision views remain demo-only until a production adapter is built. Missing evidence stays insufficient, never false.
- 2026-07-17 — Local installers back up user config and replace only the selected tool's OTel settings; prompt/content logging remains disabled.

## Hard boundaries

- `services/engine` owns every score; this feature added no score/index changes.
- MAIN/HARNESS stay separate; no dollars/hours-saved claims; no synthetic rows in `public.*`.
- Stored telemetry excludes prompts, responses, source code, commands, tool inputs/outputs, and unknown OTLP attributes.

## Gotchas / next

- Test user action: open `/connect` → APareek89 → Connect Codex/Claude Code → run the fresh one-time command → start a new tool session → refresh status.
- `RESEND_API_KEY` and `DIGEST_FROM_EMAIL` are blank, so teammate onboarding is copy-command only; add them before implementing email invitations.
- `NEXT_PUBLIC_APP_URL` is local HTTP. A hosted collector/GitHub callback needs a stable HTTPS URL; GitHub App permissions should be reduced before production.
- Exact AI-session → repo/branch/PR, verification, context-read, and review-loop evidence still needs the metadata-only Prism Bridge/production adapter.
- `Loop.MD` remains offered. Full FMEA and paid coaching golden evals require owner approval. This clone has no remote, so no PR can be opened yet.

**Session efficiency:** 🎯 ~66% feature · 🔧 ~27% verification/docs/environment · 🔁 ~7% rework (hydration-format fix + privacy allowlist tightening)
