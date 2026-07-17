# Prism Codex — handoff

last-synced: e02b546 · branch: `codex/render-origin-fix` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Deliver a clearer AI-Native Engineering Index plus a real-input MVP: GitHub defines delivery evidence/team membership, each developer opts into Codex or Claude Code metadata, and deterministic MAIN/HARNESS calculations remain unchanged.

## Current state

- ✅ Independent redesign remains complete across Overview, People, member, My workspace, and Index model.
- ✅ New admin-only `/connect` flow detects GitHub App installations, activates/backfills one, shows selected repo/evidence/team readiness, and redirects install callbacks back to Connect.
- ✅ Real `APareek89` sync passed: 1 currently selected repo, 22 PRs, 58 commits, 3 active discovered people, no connector errors.
- ✅ Per-person Codex/Claude Code setup uses hashed 15-minute one-time invites, hashed collector tokens, config backup, OTLP/HTTP JSON, prompt logging off, connection checks, and revocation.
- ✅ Collector persists only allowlisted session/model/turn/token/cache/prompt-length/success metadata; bodies and unknown attributes are discarded and events are idempotent.
- ✅ Migration `0034_connect_mvp.sql` is applied to the live DB; no test invites/connections/events/sessions remain. Real public GitHub rows were preserved.
- ✅ Supabase passwordless sign-in links one auth user to exactly one active GitHub-discovered employee by normalized email; no demo-user/session fallback remains.
- ✅ `/me` now leads with a personal Codex/Claude Code command, one-time status, refresh, disconnect, and privacy explanation. Admin `/connect` can assign an email and send the Supabase invitation.
- ✅ All product pages read real `public.*` rows through RLS. The v3 demo UI/API/seed service and live `v3` schema were removed; the live DB has 0 demo employees and 4 active GitHub-discovered employees.
- ✅ Browser-verified sign-in at 1440px/390px with zero errors/overflow; 294 tests, typecheck, and production build pass; scoring/engine files are untouched.
- ✅ New private GitHub repo `APareek89/prism_v1`; PR #1 merged to `main`. Render service is live at `https://prism-v1.onrender.com`; health reports production, demo false, DB ok.
- ✅ Hosted login no longer depends on Supabase redirect allowlisting: Supabase generates/verifies the one-time token and Resend delivers the Prism callback. Unknown emails receive the same public response.
- ✅ Auth redirects and every generated/consumed telemetry installer use `NEXT_PUBLIC_APP_URL`, not Render's proxy-internal request origin, so neither login nor agent setup can fall through to localhost.

## Product/architecture decisions

- 2026-07-17 — GitHub connection is function/account-level; Codex and Claude Code consent is per person because telemetry originates on each developer machine.
- 2026-07-17 — Tonight's collector accepts OTLP/HTTP JSON and maps its bearer token directly to function → employee → provider; only token hashes are stored.
- 2026-07-17 — All product views use real `public.*` rows. Missing evidence stays insufficient, never false; the deterministic index calculation remains unchanged.
- 2026-07-17 — Local installers back up user config and replace only the selected tool's OTel settings; prompt/content logging remains disabled.
- 2026-07-17 — Owner retired the v3 demo exception. Missing data is an honest insufficient/empty state; neither UI, pipeline, nor a connector may create a placeholder employee.
- 2026-07-17 — Workspace identity claim is exact normalized email only. A successful first real login receives developer plus bootstrap admin; later users receive developer unless explicitly promoted.
- 2026-07-17 — Supabase Auth owns login identity and one-time tokens. `DIGEST_FROM_EMAIL` remains only the visible sender for optional Resend digest mail.
- 2026-07-17 — Hosted auth separates authority from transport: Supabase owns identity/tokens/sessions; Resend delivers the login link using `AUTH_FROM_EMAIL`.

## Hard boundaries

- `services/engine` owns every score; this feature added no score/index changes.
- MAIN/HARNESS stay separate; no dollars/hours-saved claims; no synthetic rows in `public.*`.
- Stored telemetry excludes prompts, responses, source code, commands, tool inputs/outputs, and unknown OTLP attributes.

## Gotchas / next

- Test user action: request the APareek89 work-email login at the Render URL, open `/me`, generate Codex or Claude Code setup, run the fresh command, start a new tool session, and refresh status.
- `DIGEST_FROM_EMAIL` is blank (the local Resend API key exists). This does not block Supabase Auth mail; configure Supabase custom SMTP for non-project-team recipients. Digest delivery remains off until a verified digest sender is configured.
- Inngest was upgraded to patched `^3.54.2`. `npm audit --omit=dev` still reports one transitive LangSmith high advisory whose offered fix requires the LangChain 0.x → 1.x major upgrade; the affected public-prompt/tracing surfaces are not exposed by Prism, so treat that upgrade as a separate compatibility project.
- Add the hosted `/auth/callback` to Supabase Auth redirect URLs as defense-in-depth/fallback, and add the hosted `/api/connectors/github/install` URL to the GitHub App setup/callback configuration.
- Exact AI-session → repo/branch/PR, verification, context-read, and review-loop evidence still needs the metadata-only Prism Bridge/production adapter.
- `Loop.MD` remains offered. Full FMEA and paid coaching golden evals require owner approval.

**Session efficiency:** 🎯 ~62% feature · 🔧 ~31% verification/docs/deployment · 🔁 ~7% rework (legacy demo-write audit + lockfile cleanup)
