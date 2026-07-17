# Prism Codex — repository instructions

Prism is the AI-Native Engineering Index: a Next.js + Supabase product that measures and improves the ROI of AI-assisted engineering.

## Start every session

1. Read `handoff.md` first.
2. Read `Loop.MD` and obey its status machine.
3. Skim `docs/architecture/README.md` and `docs/ARCHITECTURE_FLOW.md`.
4. Check `Learning.MD` before debugging.

## Hard boundaries

- Never change index calculations unless the owner explicitly requests it. `services/engine` is the deterministic source of truth; agents narrate but never calculate scores.
- Never write synthetic rows to `public.*`. The owner-approved preview data lives only in `v3.*`, and every page must identify it as demo data.
- Validate database columns against migrations and the live database before adding or changing a query.
- Keep the MAIN and HARNESS indexes separate in both logic and presentation.
- Never show estimated dollar cost; the product reports measured tokens only.
- Preserve real user data and unrelated working-tree changes.

## Work and verification

- Work on a branch, update `handoff.md` before every checkpoint commit and at the end of each phase, and keep a `Co-authored-by: Codex <codex@openai.com>` trailer.
- Use Node 22 or newer. Run `npm run test`, `npm run typecheck`, and `npm run build` before handoff.
- Verify the primary UI flows in a real browser and inspect the rendered result.

## Power Coding (auto — do not remove without asking the user)

At session start read `handoff.md`, then run `git log --oneline <last-synced sha>..HEAD` and reconcile anything changed underneath it. Update `handoff.md` before every git checkpoint commit and at the end of every phase; keep it a current snapshot, not a journal, and re-stamp `last-synced`. Log flow changes and user-reported bugs in `Learning.MD` using the 5-whys format.

Read `Loop.MD` every session. When its status is `on`, run the existing test suite first and then every free eval after meaningful changes. Paid/golden evals only run with the consent recorded in `.power-coding/config.json`. Keep `docs/mermaid/*.mmd` and `docs/ARCHITECTURE_FLOW.md` current when the flow changes. Before commits, obey the configured secret/FMEA checks. Run the Sentinel sweep after major completion and record the Session Pulse in `handoff.md` at milestones.

Build the smallest version that proves a feature first. Any new service, external dependency, database change, or async flow requires a plain-language architecture delta and owner approval before implementation. Record decisions that shape architecture or behavior in `handoff.md`.
