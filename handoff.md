# Prism Codex — handoff

last-synced: f0309f9 · branch: `codex/public-telemetry-endpoints` · workspace: `/Users/anandpareek/Documents/Prism_codex`

## Objective

Deliver a clearer AI-Native Engineering Index plus a real-input MVP: GitHub defines delivery evidence/team membership, each developer opts into Codex or Claude Code metadata, and deterministic MAIN/HARNESS calculations remain unchanged.

## Current state

- ✅ Shipped: decision-first real-data UI, GitHub team/evidence sync, exact-email Supabase/Resend login, per-user Codex/Claude metadata-only OTEL, deterministic scoring boundary, no demo rows, private GitHub repo, and Render deployment (see git log and `Learning.MD`).
- 🔄 Fix ready for deployment: installer and OTLP collector routes accept their own invite/bearer credentials without a browser session; management routes remain Supabase-protected. Local unauthenticated checks return plain-text 410 / JSON 401 rather than HTML redirects; 249 web tests, typecheck, build, and diagrams pass.

## Product/architecture decisions

- 2026-07-17 — GitHub connection is function/account-level; Codex and Claude Code consent is per person because telemetry originates on each developer machine.
- 2026-07-17 — Tonight's collector accepts OTLP/HTTP JSON and maps its bearer token directly to function → employee → provider; only token hashes are stored.
- 2026-07-17 — All product views use real `public.*` rows. Missing evidence stays insufficient, never false; the deterministic index calculation remains unchanged.
- 2026-07-17 — Local installers back up user config and replace only the selected tool's OTel settings; prompt/content logging remains disabled.
- 2026-07-17 — Owner retired the v3 demo exception. Missing data is an honest insufficient/empty state; neither UI, pipeline, nor a connector may create a placeholder employee.
- 2026-07-17 — Workspace identity claim is exact normalized email only. A successful first real login receives developer plus bootstrap admin; later users receive developer unless explicitly promoted.
- 2026-07-17 — Supabase Auth owns login identity and one-time tokens. `DIGEST_FROM_EMAIL` remains only the visible sender for optional Resend digest mail.
- 2026-07-17 — Hosted auth separates authority from transport: Supabase owns identity/tokens/sessions; Resend delivers the login link using `AUTH_FROM_EMAIL`.
- 2026-07-17 — Machine-to-machine telemetry endpoints are public only at middleware level and authenticate with one-time invite or bearer tokens; management endpoints still require Supabase sessions.

## Hard boundaries

- `services/engine` owns every score; this feature added no score/index changes.
- MAIN/HARNESS stay separate; no dollars/hours-saved claims; no synthetic rows in `public.*`.
- Stored telemetry excludes prompts, responses, source code, commands, tool inputs/outputs, and unknown OTLP attributes.

## Gotchas / next

- Test user action: request the APareek89 work-email login at the Render URL, open `/me`, generate Codex or Claude Code setup, run the fresh command, start a new tool session, and refresh status.
- `DIGEST_FROM_EMAIL` is blank (the local Resend API key exists). This does not block hosted auth mail, which uses `AUTH_FROM_EMAIL` or Resend's owner-only default sender. Verify a Resend domain and set both sender variables before inviting the broader team; digest delivery stays off until its sender is configured.
- Inngest was upgraded to patched `^3.54.2`. `npm audit --omit=dev` still reports one transitive LangSmith high advisory whose offered fix requires the LangChain 0.x → 1.x major upgrade; the affected public-prompt/tracing surfaces are not exposed by Prism, so treat that upgrade as a separate compatibility project.
- Add the hosted `/auth/callback` to Supabase Auth redirect URLs as defense-in-depth/fallback, and add the hosted `/api/connectors/github/install` URL to the GitHub App setup/callback configuration.
- Exact AI-session → repo/branch/PR, verification, context-read, and review-loop evidence still needs the metadata-only Prism Bridge/production adapter.
- `Loop.MD` remains offered. Full FMEA and paid coaching golden evals require owner approval.

**Session efficiency:** 🎯 ~35% fix · 🔧 ~35% verification/deployment · 🔁 ~30% rework (authenticated E2E testing missed the unauthenticated shell path)
