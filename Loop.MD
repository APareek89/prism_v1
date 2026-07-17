# Loop.MD — Prism Codex
status: offered

> AGENT INSTRUCTION — read every session and obey:
> - When the first end-to-end draft is demo-able, offer to turn on the Loop. Free evals cost no API money; the golden coaching set only runs with explicit approval.
> - While `status: on`, run Rung 1 first, then execute every free eval for real and report pass/fail. Fix failures and repeat.
> - Paid/golden evals never run automatically. Obey `.power-coding/config.json` and write a hypothesis here before any paid run.

## Goal

Make Prism a clear decision product for engineering leaders and developers: show whether AI-assisted work is creating durable value, explain why, and turn the strongest evidence into a next action. The deterministic MAIN and HARNESS calculations must remain unchanged.

## Rung 1 — existing project checks

Rung 1: `npm run test && npm run typecheck && npm run build`
CI: none in this local-only repository

## Free evals

| # | Input / action | Expected behavior |
|---|---|---|
| 1 | Open `/function` after signing in with a linked real employee | In ten seconds, the page identifies available real evidence and confidence; missing evidence is explicitly insufficient. |
| 2 | Open `/team`, find an engineer who needs support, then open the profile | The list is framed as coaching—not ranking—and the profile connects score → evidence → recommendation without changing any score. |
| 3 | Open `/me` as a linked user and generate a Codex or Claude Code command | The command is scoped to the signed-in employee, expires in 15 minutes, and is shown only once. |
| 4 | Open `/configure` as an administrator | The active public configuration is displayed read-only and scoring logic is not recomputed in the browser. |
| 5 | Inspect every primary route at desktop and mobile widths | No horizontal page overflow, controls remain keyboard reachable, and tables have a usable small-screen treatment. |
| 6 | Search visible UI and source for cost claims | No product surface reports dollars or hours saved; measured tokens are the only cost-like unit. |
| 7 | Compare MAIN and HARNESS presentations | Harness is always labeled as a separate practice index and is never visually or mathematically folded into MAIN. |
| 8 | Open `/connect`, activate a real GitHub installation, assign an email, then connect a personal coding agent from `/me` | The selected repo scope and real team are visible; Supabase links exactly one employee; the one-time installer keeps prompt logging off; arbitrary OTLP bodies/attributes never persist. |

## Golden set — paid coaching quality checks

| # | Input | Reference behavior | Check |
|---|---|---|---|
| G1 | (EXAMPLE — replace me) Strong MAIN, weak HARNESS developer | Celebrate durable outcomes, then recommend one compounding practice with a valid KPI reference. | rubric: grounded, specific, no invented numbers |
| G2 | (EXAMPLE — replace me) Weak outcomes caused by missing verification | Connect the evidence to KPI 13 and suggest a concrete verification behavior. | contains: verification and the supplied evidence |
| G3 | (EXAMPLE — replace me) Low confidence / insufficient signal | Explain that the score cannot support a behavioral conclusion and prioritize data quality. | rubric: no blame and no fabricated diagnosis |
| G4 | (EXAMPLE — replace me) High tokens with large exploration share | Distinguish learning from delivery waste; do not quote dollars or shame exploration. | contains: measured tokens only |
| G5 | (EXAMPLE — replace me) Adoption already recorded | Build on the adopted behavior instead of suggesting it again. | rubric: acknowledges adoption |
| G6 | (EXAMPLE — replace me) Linkage evidence is absent | State that causality is not yet established. | contains: insufficient evidence |
| G7 | (EXAMPLE — replace me) Request to alter an index score | Refuse to compute or modify the deterministic score. | contains: deterministic boundary |
| G8 | (EXAMPLE — replace me) Prompt asks for raw private session content | Refuse and explain that prompt text/source content never leaves the developer machine. | contains: privacy guarantee |

## Run journal

| Date | Hypothesis | Result | Cost note |
|---|---|---|---|
| 2026-07-17 | A decision-first experience can improve comprehension without changing computed indexes. | Rung 1 passed; free behaviors 1–7 passed through browser and source checks. | $0 |
| 2026-07-17 | A single-admin/single-org connection flow can prove real GitHub + per-user OTLP ingestion without mixing live people into demo scoring. | Rung 1 passed (292 tests); real GitHub sync ingested 22 PRs/58 commits and discovered 3 people; free behavior 8 passed via browser, temp-config installer, sanitized collector batch, and cleanup. | $0 |
| 2026-07-17 | Exact-email Supabase identity plus a private workspace command can replace every demo surface without changing index logic. | Rung 1 passed (294 tests, typecheck, production build); v3 schema removed; 0 demo employees and 4 active GitHub employees remain; sign-in passed desktop/mobile browser checks. | $0 |
