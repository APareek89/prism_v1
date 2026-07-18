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
| 3 | Open `/me?tab=connection` as a linked user and generate a Codex or Claude Code command | Only admin-approved providers/methods appear; the command is scoped to the signed-in employee, expires in 15 minutes, and is shown only once. |
| 4 | Open `/configure` as an administrator | Five steps are gated in order; connection/data/access changes are audited; any weight change appends a config version and never recomputes in the browser. |
| 5 | Inspect every primary route at desktop and mobile widths | No horizontal page overflow, controls remain keyboard reachable, and tables have a usable small-screen treatment. |
| 6 | Search visible UI and source for cost claims | No product surface reports dollars or hours saved; measured tokens are the only cost-like unit. |
| 7 | Compare MAIN and HARNESS presentations | Harness is always labeled as a separate practice index and is never visually or mathematically folded into MAIN. |
| 8 | Open `/connect`, activate a real GitHub installation, assign an email, then connect a personal coding agent from `/me` | The selected repo scope and real team are visible; Supabase links exactly one employee; the one-time installer keeps prompt logging off; arbitrary OTLP bodies/attributes never persist. |
| 9 | Open `/admin` as an administrator, choose a person/date, and inspect a KPI through to its evidence | The page replays the unchanged scoring engine, shows raw → normalized → weighted contribution plus confidence/cohort/L0/L5 gates, and keeps stored agent narration visually separate from deterministic math. |
| 10 | Open `/my-actions`, record “I actioned this,” then inspect the recommendation | A human action event is persisted, the recommendation stays awaiting later evidence, and no adoption or impact is claimed. |
| 11 | Open `/org-actions` as a Manager/Management/Admin | Candidates come only from real connector gaps, assignments, or persisted insights; created actions have an owner/status and do not imply causality. |
| 12 | Compare navigation and guarded routes for Member, Manager, Management, and Admin | Member sees only My View/My Actions; Configuration/Admin are server-enforced Admin-only; management scopes are enforced beyond hidden navigation. |
| 13 | Type several characters into Configuration role/title/team fields | The same input remains focused and the full value is retained. |
| 14 | Open Index Details, then Manage live connection | Details opens the Admin calculation trace in a new tab; Connect has a visible path back to Configuration. |
| 15 | Inspect every L2 and operating metric on Overview/My View | Each L2 has a plain-language definition; every metric shows an honest prior comparison or an explicit unavailable/no-baseline state. |
| 16 | Send a sanitized Codex `response.completed` OTLP fixture with cached input | Model and token counters persist once, cache is not double-counted, and content/unknown attributes remain discarded. |
| 17 | Open Overview after a completed run without persisted function KPI rows | Going well/Needs improvement contain no employee identity or employee prose; at most six insights come from privacy-safe medians, coverage, and signal totals. |
| 18 | Select local, remote workstation, and enterprise-managed connection environments | Guidance says to install where the agent executes, covers persistence/egress/managed settings, and explains Claude Code on Vertex without claiming hosted Codex capture. |
| 19 | Open Admin → Agentic Flow, then select a person and artifact | The trace shows deterministic candidate ownership, stage ledger, validation, evidence snapshot, alternative explanation, action, expected signal, verification, and guardrail; score math remains separate. |

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
| 2026-07-18 | An admin-only read model can make every score contribution auditable without copying or changing scoring formulas. | Rung 1 passed (297 tests, typecheck, production build); authenticated desktop/mobile behavior 9 passed with zero overflow and zero console errors; all 3 diagrams validate. | $0 |
| 2026-07-18 | A gated organization setup plus separated view/action surfaces can make Prism demo-ready without weakening the deterministic or real-data boundaries. | Rung 1 passed (309 tests, typecheck, production build); migration 0037 applied with zero seed rows; measurement start and consent are enforced at assembly/analytics boundaries; complete KPI anchors and audited before/after state are visible; real repo/team/manager operating filters preserve honest token attribution; authenticated Configuration, Overview, My View, My Actions, Org Actions, and Admin passed desktop/mobile browser checks with zero final console errors. | $0 |
| 2026-07-18 | Honest comparisons, provider-contract normalization, scoped insight rollups, and bounded tab reads can harden the product without changing index formulas. | Rung 1 passed (310 tests), lint, diff check, and workspace build; Codex fixture, form focus, back/details, definitions, insight rollup, connection environments, and all four 390px routes passed authenticated browser/source checks with zero console errors. | $0 |
| 2026-07-18 | Stable identity-bound narrative batches and privacy-safe aggregate facts can produce deeper coaching while keeping real pipeline latency inside the deployment budget. | Rung 1 passed (317 tests), typecheck/build/diff check, Mermaid 7/7, full FMEA with all P0/P1 resolved, authenticated desktop/mobile flows, correct real PR refs, and live full-loop timing improved from 251.1s to 131.8s. Golden/paid evals were not run. | $0 |
