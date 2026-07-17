# Prism — AI-Native Engineering Index

Prism shows whether AI-assisted engineering is creating durable value, explains the strongest evidence, and turns it into a concrete next action. It is a Next.js + Supabase application with a deterministic scoring engine and grounded narrative coaching.

## Product surfaces

- **Overview** — the function-level outcome, confidence, limiting dimension, linkage evidence, and highest-leverage action.
- **People** — an alphabetical support map for coaching, never a productivity leaderboard.
- **My workspace** — a private developer view for impact, live coaching, and tracked growth actions.
- **Connect** — activate a GitHub App installation, discover the team, and issue per-person Codex or Claude Code OTLP setup commands.
- **Index model** — an advanced, append-only configuration surface for MAIN and HARNESS weights.

MAIN measures durable outcomes. HARNESS measures compounding engineering practices and always remains a separate index. Every score comes from `services/engine`; agents may narrate deterministic evidence but cannot compute or change a score.

The `v3` preview uses deterministic demo rows isolated to the `v3.*` schema and labels every page accordingly. Production data remains in `public.*`; synthetic rows must never be written there.

## Stack

Next.js App Router · Supabase/Postgres · Inngest · LangGraph/LangChain · Resend · GitHub, local AI-session, and reliability connectors.

## Local start

```bash
nvm use
npm install
cp .env.example .env.local   # or link an existing Prism environment
npm run dev                  # http://localhost:3000
```

Use `npm run v3:reset` to rebuild only the isolated v3 preview world. It does not touch `public.*`.

For the live-input MVP, open `http://localhost:3000/connect`. Select an existing GitHub App installation, then click Connect beside your own Codex or Claude Code identity and run the one-time command. The installer backs up the user-level config, keeps prompt logging off, and sends a connection check; start a fresh tool session afterward to produce telemetry.

Live GitHub and OTLP rows currently land in `public.*` and are shown only in Connect. The decision views continue to use the isolated `v3.*` preview until the production ingestion adapter is promoted, so real employees are never mixed with demo scores.

See [`handoff.md`](handoff.md) for the current state and [`docs/architecture/README.md`](docs/architecture/README.md) for the architecture index.

## Scripts

| | |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | production build (must pass keyless) |
| `npm run test` / `test:scoring` | all tests / scoring engine only |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` / `db:reset` | Supabase migrations |
| `npm run v3:reset` | rebuild the isolated v3 demo schema |
| `npm run inngest:dev` | Inngest pipeline dev server |
