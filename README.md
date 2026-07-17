# Prism — AI-Native Engineering Index

Prism shows whether AI-assisted engineering is creating durable value, explains the strongest evidence, and turns it into a concrete next action. It is a Next.js + Supabase application with a deterministic scoring engine and grounded narrative coaching.

## Product surfaces

- **Overview** — the function-level outcome, confidence, limiting dimension, linkage evidence, and highest-leverage action.
- **People** — an alphabetical support map for coaching, never a productivity leaderboard.
- **My workspace** — a private, Supabase-authenticated developer view with a copy/paste Codex or Claude Code OTEL command plus real linked evidence.
- **Connect** — activate a GitHub App installation, discover the team, assign work emails, and send Supabase login invitations.
- **Index model** — a read-only view of the active deterministic configuration for administrators.

MAIN measures durable outcomes. HARNESS measures compounding engineering practices and always remains a separate index. Every score comes from `services/engine`; agents may narrate deterministic evidence but cannot compute or change a score.

Prism is real-data-only. GitHub-discovered people and ingested engineering evidence live in `public.*`; missing evidence renders an honest empty/insufficient state. The former `v3.*` demo preview and seed tooling have been removed.

## Stack

Next.js App Router · Supabase/Postgres · Inngest · LangGraph/LangChain · Resend · GitHub, local AI-session, and reliability connectors.

## Local start

```bash
nvm use
npm install
cp .env.example .env.local   # or link an existing Prism environment
npm run dev                  # http://localhost:3000
```

For the live-input MVP, an administrator opens `/connect`, activates the GitHub App installation, assigns each discovered developer a work email, and sends a login invitation. The developer signs in, lands on `/me`, chooses Codex or Claude Code, and copies the fresh 15-minute setup command into a terminal. The installer backs up user configuration, keeps prompt logging off, and sends metadata-only OTLP to Prism.

Supabase Auth creates and verifies login tokens. In a hosted environment Prism can deliver its own callback link through Resend using `AUTH_FROM_EMAIL`; the optional digest sender is separate. `DIGEST_FROM_EMAIL` is the visible From address for digest mail—not a credential and not the login sender.

See [`handoff.md`](handoff.md) for the current state and [`docs/architecture/README.md`](docs/architecture/README.md) for the architecture index.

## Scripts

| | |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | production build (must pass keyless) |
| `npm run test` / `test:scoring` | all tests / scoring engine only |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Supabase migrations |
| `npm run inngest:dev` | Inngest pipeline dev server |
