# Prism scoring model — canonical reference (v3.0)

> The aligned source of truth for **what** Prism measures, **how** the indexes are computed, and
> **how each KPI is diagnosed and coached**. Non-technical first; formulas and anchors match the
> model lab (`prism-model-lab/public/content.js`) exactly. Keep this doc current whenever the
> model changes — weights, anchors, KPI set, or diagnostic trees.
> Last aligned with the product owner: **2026-07-02** (model lab, v3.0).

---

## ⚠️ Spec vs implementation — read this first

**This document is the MODEL SPEC v3.0.** The running app still implements the **v1 model**:
13 weighted KPIs in 4 dimensions with weights **10/25/40/25** (`lib/scoring/constants.ts`,
`index_config` v1). **Implementing v3.0 in code is a pending project.** The gap:

| Area | App today (v1) | This spec (v3.0) |
|---|---|---|
| Index structure | One index, 4 dimensions | **Two indexes**: MAIN (3 dimensions) + HARNESS (separate) |
| Dimension weights | Usage 10 · Efficiency 25 · Effectiveness 40 · Proficiency 25 | MAIN: Usage 15 · Efficiency 35 · Outcomes 50 |
| Weighted KPI set | 13 KPIs (incl. 2, 5, 8, 11, multiplier) | **Core-6** (1, 3, 4, 6, 7, 10) + Harness-4 (12–15) |
| KPI 2 agentic depth | weighted KPI | 📎 diagnostic signal only |
| KPI 5 acceptance/survival | weighted KPI (dormant) | 📎 diagnostic signal only |
| KPI 8 retention @30d | weighted KPI (pending) | **removed** |
| KPI 9 change failure | single Sentry-gated rate | rebuilt as tiered **Change reliability** (Tier-1 needs no Sentry) |
| KPI 11 skill leverage | weighted KPI | 🔗 **linkage engine** — insights only, never scored |
| Multiplier | weighted KPI + L5 gate | recognition + L5 gate only (no weight) |
| Harness KPIs 13–15 | not computed | scored in the HARNESS index (parser extensions needed) |
| Cost in USD | rate-card estimate exists | **dropped everywhere** — tokens only |
| Coaching plugin (Addendum B) | not built | C1–C6 in-flow rules, local eval, ≤3 nudges/day |
| Linkage engine | not built | within-person harness→outcome tests |

Until that project lands, treat app numbers as v1 outputs and this doc as the target model.

## 1. The model in one paragraph

Prism watches the systems a team already uses — GitHub (delivery), Claude Code (AI usage), and
optionally the deploy pipeline / Sentry (reliability) — and distills a trailing **28-day** window
of real activity into **two 0–100 indexes**. The **MAIN index** answers *"is AI making the work
better?"* from six KPIs across Usage, Efficiency, and Outcomes. The **HARNESS index** answers
*"are the compounding practices installed?"* from four practice KPIs, scored separately. A
**linkage engine** connects them: it continuously tests, within-person, whether harness gaps
explain outcome problems. Every number is deterministic, computed from real ingested data — no
surveys, no estimates, no fabricated values. An LLM writes the plain-English commentary but is
**forbidden from computing or altering any number** (the determinism boundary). **Scoring is
always a daily batch** (deterministic, auditable, re-runnable); **coaching triggers are realtime
in-flow** via plugin hooks using a KPI profile cached at session start.

## 2. The two-index structure — the headline v3.0 decision

### MAIN index — Usage 15% · Efficiency 35% · Outcomes 50%

| Dimension | The question | Where it's observed | Weight | Core KPIs |
|---|---|---|---|---|
| **Usage** | Do you use AI? | Footprint — how often/deep AI shows up in the work | 15% | 1 AI-assisted PR share · 3 Session cadence |
| **Efficiency** | What did output *cost*? | **During the work, before merge** — cycles, waste, tokens | 35% | 4 Iterations to merge · 6 Tokens to shipped |
| **Outcomes** (Effectiveness) | Did what shipped *hold up*? | **After merge, in the real world** — reverts, rework | 50% | 7 Merged without revert · 10 Defect-rework rate |

The **Core-6** — two KPIs per dimension — is the whole main index: explainable in one breath.
KPI 9 (Change reliability) joins the Outcomes core **after one clean Tier-1 month** (§5).

### HARNESS index — KPIs 12–15, equal weights, scored SEPARATELY

| KPI | Practice |
|---|---|
| 12 | Distinct skills authored |
| 13 | Verification harness rate |
| 14 | Review-loop rate |
| 15 | Context continuity rate |

The Harness index is its own 0–100 with its **own confidence gate** — no bands, and it **never
mixes into the main number**.

### Why proficiency left the main index

Proficiency is a **DRIVER** of efficiency and effectiveness, not a sibling outcome. Keeping it
inside the main index **double-counts**: a missing harness drags the proficiency score AND causes
the revert that drags Outcomes — same root cause, counted twice. So the main index measures
usage, cost, and outcomes; the harness index measures the practices that produce them; and the
linkage engine (§3) proves — rather than asserts — that one drives the other. Multiplier /
AI Leaders stays recognition-only, outside **both** indexes.

### Gates, bands, confidence (unchanged mechanics, new home)

- **L0 gate (main):** AI-assisted share **< 15%** forces **L0 Dormant**, whatever the number.
- **L5 gate (main):** the top band requires multiplier signal ≥ 1 (someone else uses your
  skill), else caps at L4.
- **Bands (main only):** L0 Dormant → L1 Basic (1–34) → L2 Productive (35–54) → L3 Workflow
  (55–69) → L4 Power (70–84) → L5 Multiplier (85–100). The Harness index has **no bands**.
- **Confidence:** too little signal → suppressed as *Insufficient* (publish floor 0.40); small
  cohorts (N < 8) drop one band. Each index carries its own confidence.
- **Normalization (per KPI, unchanged):** at/below floor → 0, at/above target → 100,
  proportional between; **no bonus beyond target**; lower-is-better KPIs invert. No denominator
  → `null` (honest no-signal, never 0-by-default).

**Worked example (from the lab's flow tab — a labeled hypothetical, not real data):** Dev X
scores Usage L2 = mean(0, 30) = 15 · Efficiency L2 = mean(0, 83) = 41.5 · Outcomes L2 =
mean(0, 20) = 10 → MAIN = 0.15·15 + 0.35·41.5 + 0.50·10 = **21.8 → L1 Basic** (L0 gate passes
at 17% share — barely). HARNESS = mean(0, 0, 0, 0) = **0** — "no harness installed", which the
linkage engine flags as the prime suspect for the revert that zeroed KPI 7. Both published with
visible low-confidence chips (2-PR revert base).

## 3. The linkage engine (ex-KPI 11) — connecting the two indexes

**Never scored — insights only.** The engine continuously tests whether adopting a harness
practice moves the outcome it protects, measured **WITHIN-PERSON over time** (same person,
before vs after adopting the practice) or within-repo with the practice as the only change.

**The selection-bias guard is the design:** skill/harness users may simply be better engineers;
cross-person contrasts read that correlation as causation. Within-person before/after is exactly
how "not using a verification harness causes PR reverts" stops being a hunch and becomes a
measured, personal, actionable insight.

**The linkage map** — each row is a standing hypothesis the engine tests continuously; a
confirmed link becomes the insight AND the coaching priority:

| Harness gap | Predicts (main-index damage) | Evidence (within-person) |
|---|---|---|
| **13 Verification gap** | Reverts (KPI 7) + rework (KPI 10) — unverified work ships broken | Revert/rework rate on PRs WITH in-session verification vs WITHOUT |
| **14 Review-loop gap** | Reverts (KPI 7) + human review burden (comments, rounds) | Review burden + revert rate with vs without a pre-PR critique pass |
| **15 Continuity gap** | High iterations (KPI 4) + token waste (KPI 6) | Turns + cache-read share on warm-start vs cold-start sessions |
| **12 Skills gap** | Repeated long sessions on the same problem class (KPI 4) | Turns on skill-backed vs ad-hoc sessions for the same task type |

Ruler note: v2.2 switched the leverage ruler from retention (removed) to **revert+rework rate
after adoption − before**; illustrative anchor 0 → +20-pt edge (recalibrate with real data).
When a group is empty (no before/after periods yet) the engine reports *insufficient* honestly —
never 0. Cadence: daily batch; powers the C3 nudge in realtime.

## 4. Data sources — what we capture and how

| Source | Role | Input data captured | How integrated | Cadence |
|---|---|---|---|---|
| **GitHub App** | The backbone | Repos · PRs · commits incl. `Co-authored-by:` trailers · diffs · **native revert linkage** · deploy events* · reviews* · CI checks* · labels* (* = add-later permission) | Install on selected repos → short-lived tokens → backfill + webhooks. Install-time read-only: Contents, Metadata, Pull requests, Commit statuses. Phase 3/5 adds: Deployments, PR reviews, Checks, Issues/Labels | Webhooks realtime + daily batch scoring |
| **Claude Code** | AI usage | Sessions (turns, tokens in/out/cache, model) · tool calls → harness categories · skills · `pr-link` markers · context-file reads · prompt-length **flags** | Today: local session logs. Org-wide: OTLP telemetry (collector + org token, MDM-pushed settings, SSO/roster identity map). Coaching: Prism plugin via UserPromptSubmit/PreToolUse hooks — evaluates locally in ≤500ms, exports only rule/outcome metadata | Capture realtime · scoring daily batch · nudges realtime |
| **Sentry** | **OPTIONAL enrichment — no longer a prerequisite (v3.0)** | Releases → deploys · NEW error groups (first-seen) · affected-user counts | Org API token → scheduled pulls. KPI 9 scores on GitHub deploy events (Tier-1); Sentry only enriches (Tier-2) and corroborates (Tier-3). Tier-2 activates only at release-SHA hygiene ≥90% | Hourly/daily pull · scoring daily batch |

**Privacy default:** metrics and metadata only — **never prompt text or source code content**
(the full three-mechanism design is in §8).

### The AI→PR link — the connective tissue

Matching *"the Claude session that did the work"* to *"the merged PR"* is what makes a PR count
as AI-assisted — the join every AI-denominated metric depends on. Strongest match wins:

| Method | How it matches | Confidence |
|---|---|---|
| **pr_link** | Claude Code's own first-party event: session's `prRepository`+`prNumber` equals the PR (exact) | 0.99 |
| **sha** | PR merge-SHA prefix appears in the session | 0.95 |
| **branch** | Case-insensitive equality: session branch = PR head ref | 0.80 |
| **coauthor** | Repo-scoped: session has Claude trailer AND PR has co-authored commits | 0.60 |

Method + confidence stored on every link; per-PR drill-down lists its sessions. A wrong link
corrupts Efficiency/Outcomes, so precision beats recall — **KPI 4 scores on exact `pr_link`
matches only**, and the proposed hardening (suppress coauthor when `pr_link` already covers a
PR; de-dupe cwd-split sessions) is queued in `handoff.md`.

## 5. KPI reference

Legend: **↑** higher is better · **↓** lower is better (inverted) · trust = how defensible the
number is when a skeptical engineer drills in · status as of 2026-07-02 · cadence = scoring is
always daily batch; the realtime part is the coaching hook.

### Core-6 — the MAIN index

| # | KPI | Plain question | Formula (words) | 0 pts | 100 pts | Dir | Trust | Status | Cadence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | AI-assisted PR share | What share of shipped work did AI touch? | AI-linked merged PRs ÷ merged PRs | ≤50% | 100% | ↑ | high | live | webhooks + daily batch |
| 3 | Session cadence | Habit or occasional toy? | days with ≥1 AI session ÷ working days | ≤30% | ≥80% | ↑ | high | live | daily batch |
| 4 | AI iterations to merge | Back-and-forths to land a PR? | mean session turns per merged PR within S/M/L size class, bucket means averaged — **exact links only** | ≥12 | ≤3 | ↓ | medium | live (exact links only) | daily batch · C1 nudge realtime |
| 6 | Tokens to shipped | AI spend per shipped PR? | **in-scope** (connected-repo) session tokens ÷ merged PRs — **tokens only, no dollars** | ≥90k | ≤30k | ↓ | high | live (scope fix required) | daily batch · C2 nudge realtime |
| 7 | Merged without revert | Did AI work stick? | 1 − (AI PRs reverted ≤14d ÷ AI merged PRs) — **all post-merge reverts count, incl. self-caught** | ≤80% | ≥98% | ↑ | medium | live | webhooks + daily batch · C4 nudge realtime |
| 10 | Defect-rework rate | Ship it, then patch it? | fix follow-ups on same code ≤14d ÷ merged PRs (evidence ladder + wip-increment exclusion) | ≥30% | ≤5% | ↓ | medium | live | daily batch · C4 nudge realtime |

Backend setup notes (per KPI):

- **1** — GitHub App + webhook endpoint; link job (exists): pr_link > sha > branch > coauthor
  with stored confidence; H3 needs vendor admin API token (seat/license inventory).
- **3** — sessions scan (exists); activity-day derivation job: union(commits, PRs, reviews,
  sessions) per day; H0 needs telemetry enrollment inventory. Trust mitigation: the day-list
  drill-down shows which days counted and why (vacations auto-excluded; weekend work counts —
  stated openly).
- **4** — exact-link restriction flag in the link job; size-bucket calc (exists; cutoffs
  published); parser prompt-metadata fields (length, file-ref flag — **local flags only**);
  plugin rule C1. The size-class rule is anti-gaming: big PRs are judged against big PRs, so
  you can't win by shipping only tiny PRs.
- **6** — repo-scope map (session cwd ⋈ connected repo list — score in-scope only); token
  rollup (exists); plugin rule C2. **v2.2 decisions that raised trust from medium to high:**
  dollars dropped (tokens are measured, dollars would be estimated, and an estimated currency
  figure erodes trust faster than it informs — rate-card conversion survives only in admin
  docs) and scope fixed (exploration tokens shown separately, never scored).
- **7** — revert detector (exists) + audit-sample export; H1 needs "Pull request reviews"
  permission; H2 needs "Checks" permission; plugin rule C4. **Decisions (v2.2):**
  - **ALL post-merge reverts count, including self-caught** — once a PR is merged, a revert is
    a failure regardless of who caught it (the developer should have caught it in local/dev
    before raising the PR).
  - **Who caught it routes the ACTION, not the score:** self-caught → verification-harness
    coaching (KPI 13); other-caught → review-gate process fix. The self/other split is stored
    as a diagnostic only.
  - **Detection ladder prefers GitHub-NATIVE revert linkage** — Revert-button PRs carry a
    platform-recorded reference to the original PR (no regex, no guessing); the
    revert-message + inverse-diff fallback fires only when no native link exists. Every counted
    revert is published in a drill-down with its evidence tier; min-signal gating + a
    small-sample banner guard tiny denominators (1 revert in 2 PRs = 50% swings violently).
- **10** — fix-classifier (exists) + wip-increment label support; H2 needs reviews permission;
  monthly audit-sample export. **Evidence ladder (v2.2), strongest first:** (1) follow-up
  linked to a **bug-type issue** · (2) conventional-commit **`fix:` type** · (3) fix-pattern
  message — each ANDed with **same-hunk overlap ≤14d**. The **wip-increment tag excludes
  deliberate staged shipping** (TODO-increments must not read as defects). Matched pairs + their
  evidence tier are published monthly; orgs using conventional commits + issue links get high
  precision automatically.

### Harness-4 — the HARNESS index (equal weights)

| # | KPI | Plain question | Formula (words) | 0 pts | 100 pts | Dir | Trust | Status | Cadence |
|---|---|---|---|---|---|---|---|---|---|
| 12 | Distinct skills authored | Know-how → reusable assets? | distinct skills authored AND invoked ≥1× with real output | 0 | 3 | ↑ | high | live | daily batch · save-as-skill nudge realtime |
| 13 | Verification harness rate | Does AI verify before handing over? | RATE: verified AI PRs ÷ AI PRs · BREADTH: harness categories used ÷ categories applicable | ≤30% | ≥80% | ↑ | high | proposed — framework defined | daily batch · pre-PR reminder realtime |
| 14 | Review-loop rate | Critique pass before human review? | AI PRs with a REAL pre-PR review pass (followed by a diff change or explicit "no findings") ÷ AI PRs | ≤20% | ≥70% (proposed) | ↑ | medium | proposed | daily batch · default-in-PR-skill live |
| 15 | Context continuity rate | Sessions start warm or cold? | warm-start sessions (CLAUDE.md / handoff / memory read at start) ÷ sessions in connected repos | ≤30% | ≥80% (proposed) | ↑ | medium | proposed | daily batch · context nudges realtime |

Backend setup notes (per KPI):

- **12** — skill file scan paths config (+ org shared repo); unknown-skill invocation detector
  (H0); local repeated-pattern detector for the save-as-skill nudge. Anti-gaming: empty skill
  files don't count — execution evidence required; "many skills, zero use" is itself a flag.
- **13** — parser extension: classify Bash tool calls into harness categories + capture
  execution evidence (duration, exit code) — **the data is already on disk**; event ordering
  (verification ts < pr-link ts); CI corroboration via Checks permission; repo applicability
  map. Rate says "did you check at all"; breadth says "how completely" (proposed 70/30 blend
  after calibration).

  **Harness category framework — what counts as verification.** A category is APPLICABLE only
  if the repo supports it, so a repo with no tests never penalizes its devs — it flags the
  REPO instead (H1):

  | Cat | What counts | Evidence required |
  |---|---|---|
  | V1 · Build/compile | build/compile ran and passed | Bash call matching build patterns + exit 0 |
  | V2 · Tests | test command ran (pass or fail — running counts; result feeds coaching) | test-runner call + duration > 0 + captured exit |
  | V3 · Lint/typecheck | static checks ran | lint/typecheck call + exit |
  | V4 · Runtime check | app/script actually executed (dev server, script run, curl of endpoint) | run/serve/curl call with output |
  | V5 · Review pass | pre-PR critique pass (counted in KPI 14; shown here for completeness) | review skill/subagent + diff-change-or-no-findings |

- **14** — review-pass detector (skill name/subagent type — partial today); post-pass
  diff-change checker; reviews permission for the H2 burden comparison; org `/review` skill
  shipped in the plugin. Theater guard: a pass counts only with a diff change or a recorded
  "no findings". Detector maturity gates *publication* (via the index's confidence), not
  membership.
- **15** — parser extension: context-file read events at session start; first-prompt length
  metadata (exists — local flags only); repo context-file presence scan; session-end Stop-hook
  nudge (off by default). Proxy-based today — the H0 manual-paste check runs before anyone
  scores low; telemetry read-events replace the proxies later.

**Anti-gaming rule for all harness KPIs (unchanged from v1.1):** practice-adoption metrics
invite box-ticking, so credit requires **real execution** — captured duration/exit status, a
diff change or recorded finding, a context read at session start (not an incidental file open).
Narrate harness alongside outcomes: "harness up, outcomes flat" is itself a diagnostic.

## 6. KPI 9 rebuilt — Change reliability (was: change-failure rate)

**Why rebuilt:** the old design chained estimates on top of a Sentry-hygiene prerequisite most
orgs fail. The v2.2 rebuild scores on an **evidence ladder** — the deterministic DORA signal
scores; everything else enriches or corroborates. **Tier-1 is buildable without Sentry** and
without release SHAs. Direction ↓ · anchors: 100 pts at ≤5%, 0 pts at ≥30% (DORA-informed) ·
trust medium · cadence: deploy webhooks + daily batch scoring.

| Tier | What "failed for the end user" means | Evidence | Role |
|---|---|---|---|
| **T1 · Rollback / hotfix ≤48h** | The deploy was reverted, or a fix-tagged deploy shipped on top within 48h — the DORA change-failure definition companies already accept | Deploy-system native events (GitHub Deployments/Actions, Argo). Zero estimation. No Sentry needed. | **SCORES** |
| **T2 · New-error regression ≤72h** | NEW error groups first-seen in the change's code paths right after release (not pre-existing noise) | Sentry + release SHAs; active only when hygiene ≥90% | **ENRICHES** |
| **T3 · User-impact corroboration** | Pages/alerts fired, support-ticket influx on the touched area, affected-user counts — separates user pain from internal noise | PagerDuty / helpdesk / Sentry user counts, severity-weighted | **DIAGNOSTIC** |
| **T4 · Value signal** | Feature-flag rollout completed without halt AND the feature shows real usage — shipped, working, AND wanted | Flags platform + product analytics; needs flag discipline | **PARKED** (the true end-user test) |

Formula: failed AI changes ÷ AI changes, where failed = T1 (always counts) OR T2 (only when
hygiene ≥90%). Example: 1 rollback in 12 AI deploys → 8.3% → 87 pts · badge T1.

Rules that make it trustworthy:

- **The tier badge is displayed on every number** — trust through transparency; the score uses
  the strongest tier available.
- **The AI-vs-human failure-rate control is always shown** (fairness): AI-majority vs
  human-majority deploy failure rates side by side.
- Multi-PR deploys are flagged low-confidence (batch blur — collective blame is not
  attribution).
- **Promotion rule: KPI 9 joins the main-index Outcomes core after one clean month of Tier-1
  data.** Until then it is diagnostic.

Setup: GitHub "Deployments"/Checks read (or Argo/Spinnaker webhook); rollback/hotfix detector
(revert-deploy or fix-tagged deploy ≤48h on the same service — the rule is published); optional
Sentry token + hygiene checker (gates Tier-2 at ≥90% SHA coverage); attribution job with per-hop
confidence.

## 7. Removed / demoted ledger — so nothing silently returns

| Item | v1 role | v3.0 verdict | Where it lives now |
|---|---|---|---|
| **KPI 2 · Agentic depth share** | weighted Usage KPI | **removed as a KPI (v2.2)** | 📎 diagnostic signal — feeds recommendations + coaching only (shallow-delegation rec, rework-H3 slop check, depth context on coaching cards). Needs telemetry edit-events; honestly null until then. Triggers: depth <10% in `src/` with healthy outcomes → "delegate deeper" rec · AI-majority + no tests at merge → C4 nudge. |
| **KPI 5 · Suggestion acceptance / edit survival** | weighted Efficiency KPI (dormant) | **demoted (v2.2)** | 📎 diagnostic signal — hypothesis evidence for iterations + depth; the convention-gap insight (style discards → "encode conventions in CLAUDE.md" rec); local scope nudge (written:kept >3× in-session). Never scored. Verdict on accept/reject events: dropped — do not wait for events that will never exist. |
| **KPI 8 · AI-code retention @30d** | weighted Effectiveness KPI (pending) | **REMOVED (v2.2)** | Nowhere. Recorded: it may only ever return **with a human-baseline control built first** (retention of human lines in the same files) — without the control, "AI code retains 60%" means nothing. The AI-vs-human control idea lives on in KPI 9-H2. |
| **KPI 11 · Effective skill leverage** | weighted Proficiency KPI | **converted (v3.0)** | The 🔗 linkage engine (§3) — insights only, never scored; within-person to kill selection bias. |
| **Multiplier signal** | weighted Proficiency KPI + L5 gate | **out of all weighted scoring (v1.1, reaffirmed v3.0)** | **"AI Leaders" recognition** (leaderboard / award / profile badge) + still the **L5 band gate**. Rationale: a multiplier is a distinction, not a gradient — most engineers legitimately sit at 0; averaging it in punishes the majority for not being exceptional. Needs telemetry for cross-person skill identity. |
| **Cost in USD** | KPI 6 companion estimate | **DROPPED everywhere (v2.2, reaffirmed v3.0)** | Tokens only, everywhere in the product. Conversion math survives in admin docs only, for offline use. |

## 8. Coaching channel — Addendum B (over-the-shoulder coaching)

Prism's last mile is **preventing inefficiency at the moment of work**, not reporting it later.
Delivered by a Prism plugin inside Claude Code using hooks. **Private to the developer; managers
only ever see anonymized themes.**

**Intervention ladder** (default at the top; escalate only with cause):

1. **Enrich (default)** — silently inject the missing context (file refs, conventions, the
   relevant skill) so the turn succeeds. The developer sees the assist, not a scolding. Enrich
   beats nag.
2. **Coach** — one-line, specific tip attached to the turn ("front-load the file + goal; your
   last 3 turns were exploratory").
3. **Flag** — log-only; no interruption; appears later in the private Coaching tab.
4. **Block** — org-agreed safety rules only; OFF by default; never used for style.

**Rules C1–C6** (need-gated: a rule fires only if the person's own KPI is below target):

| Rule | Gate | Trigger signal | Intervention |
|---|---|---|---|
| C1 | KPI 4 iterations below target | Prompt lacks file refs/acceptance criteria; ≥3 exploratory turns | Enrich repo context + "front-load file + goal" coach line |
| C2 | KPI 6 tokens high + low cache-read | Session re-sending large un-compacted context | Coach: compact/pin context; point to context-discipline skill (also serves KPI 15) |
| C3 | Harness index low (12–15) / 🔗 linkage shows an unused relevant skill | Prompt matches a domain where a squad skill exists | Coach: "use api-client.skill.md — squad users merge ~2× faster" |
| C4 | KPI 7/10 weak (reverts/rework) | Diff touches code with no test changes in session | Coach: tests skill / coverage-gate reminder (also serves KPI 13) |
| C5 | — (harness correctness, everyone) | Edit/Write on a file never Read this session | Enrich: instruct the agent to read first — corrects the agent, not the human |
| C6 | — (safety, org-configured) | Change on sensitive paths without review skill/tests | Flag (+ optional Block if org enables) |

**Guardrails (anti-Clippy):** ≤3 nudges/day per developer · per-rule cooldowns · a dismissed
rule stays quiet N days · `/prism status` shows exactly which rules are active · latency budget
≤ ~500ms via a local fast path — Prism's backend is never on the blocking path.

**Prompt privacy — the three-mechanism design** (answers *"if we can't see prompts, how do we
give meaningful insights?"*):

1. **Local metadata extraction** — the parser/plugin computes flags ON the developer's machine
   (prompt length, has-file-refs, has-acceptance-criteria, exploratory-vs-directive shape) and
   exports ONLY those booleans/numbers. We never see "the prompt"; we see "prompt lacked file
   refs: true". Enough to test every prompting hypothesis.
2. **Local in-flow evaluation** — the judgment happens where the content is. A local hook DOES
   see the prompt — on the developer's own machine — makes the enrich/coach decision locally in
   ≤500ms, and exports only `{rule_id, trigger, intervention, outcome}`. Coaching precision
   costs zero privacy because the prompt never leaves the laptop.
3. **Outcome-side fingerprints** — iterations shape, edit survival, cache patterns,
   verification presence: behavior signals that need no prompt text at all. Most confirmed
   hypotheses rest on these.

Net: org-level insight = metadata aggregates + outcomes; person-level needs = detected locally,
coached locally, only the outcome reported. **This is a product guarantee, not a limitation.**

## 9. Diagnostic trees — KPI → hypotheses → insight → action

The diagnostic layer is the difference between a scoreboard ("Efficiency is 40") and a product
("Efficiency is 40 *because* you re-feed context every session — here's the fix").

**Design principle — every tree starts with H0: "Is the number even real?"** Three of the four
issues found in Prism's own dogfooding were measurement artifacts, not behavior (a linking bug
showed 0% AI-share while 100% of PRs were AI-built; scope skew showed 9.2M tokens/PR; a
maturity bug showed retention 0). A corrected number IS the insight — no coaching until the
data is right.

Each hypothesis row now carries (v2.x lab format): the test/data, the **if-true insight**, the
**channel**, an **example action**, and its **cadence** (batch vs live).

**Channel legend:** `fix` = fix data first (H0 outcome — repair capture/linking before any
coaching) · `nudge` = in-flow nudge (Addendum B plugin: realtime, private, need-gated,
rate-capped) · `rec` = recommendation card in My View, adoption re-verified from data in 14
days — never self-reported · `team` = team/process change owned by the lead · `org` =
platform/admin (seats, permissions, pipelines, model routing).

### Usage

**1 · AI-assisted PR share** — low = AI touches little of what ships

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Link failure, not low usage *(lived: 0% shown while 100% AI-built)* | Unlinked merged PRs vs same-repo sessions; link-method coverage per PR | "Your AI share was under-counted: N PRs had sessions but no link. Corrected X%→Y%." | fix · batch | Backfill pr_link keys; re-run pipeline. The corrected number IS the insight. |
| H1 | Adoption gap — some people rarely use AI | Per-person session count vs per-person merged PRs | "Team AI share is carried by 2 people; 3 engineers ship ≥80% of PRs with zero AI." | team · batch | Pair one AI-fluent dev with one non-user on a real ticket this sprint; measure the non-user's next-week share. |
| H2 | Selective use — AI on greenfield, not legacy | AI vs non-AI PRs by path/module/size | "AI used only in /new-service; zero AI PRs on legacy modules." | rec · batch | Rec card: pilot AI on the next legacy ticket + add CLAUDE.md to the legacy repo first. |
| H3 | Access friction — no seat, policy blocks | Seat/license inventory vs roster; repo policy list *(needs vendor admin API)* | "3 engineers have no seat / work in AI-blocked repos — administrative, not behavioral." | org · batch | Assign seats; whitelist the repo; re-check share in 14 days. |

**3 · Session cadence** — low = AI isn't a habit

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Capture gap — other machines/IDEs invisible | Telemetry enrollment vs roster | "Cadence under-counted: sessions on a second machine are invisible." | fix · batch | Enroll the second device; recompute before any coaching. |
| H1 | Habit not formed — bursts then gaps | Streak/gap pattern, day-of-week shape | "AI use spikes in feature weeks, disappears in maintenance weeks." | nudge · batch + live | Need-gated nudge on a maintenance ticket: "try AI for the investigation step." |
| H2 | Wrong denominator — non-coding days counted | Activity-derived working days | "Cadence corrected 45%→60% after removing non-coding days — measurement, not behavior." | fix · batch | Recompute denominator from activity; publish the day list. |
| H3 | Quota/limit hit | Usage-limit events, seat tier *(vendor admin API)* | "Usage stops mid-week when the seat cap hits — appetite exceeds quota." | org · batch | Raise seat tier / set cap alerts. |

### Efficiency

**4 · AI iterations to merge** — high = many back-and-forths per PR

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Over-linking inflates turns *(lived: coauthor fallback cartesian-linked)* | Per-PR links with method + confidence | "Iterations corrected 14→7 after dropping weak links — half the problem was measurement." | fix · batch | Restrict KPI to exact links; suppress weak fallbacks when pr_link covers a PR. |
| H1 | Vague first prompts | First-prompt length + file-ref flag vs turns *(local eval — flags only, prompt never leaves the machine)* | "Sessions starting without file refs average 3× the turns of front-loaded ones." | nudge · live | C1 fires in-flow: enrich repo context + coach "front-load the file + goal" — decided locally ≤500ms. |
| H2 | Missing context — no CLAUDE.md/skills | Turns by context-file presence + skill usage | "14 turns here vs 5 in context-rich repos — the repo has no memory." | rec · batch | Author CLAUDE.md (build/run/test + conventions); capture the 2 most repeated instructions as skills. |
| H3 | Genuinely complex work (rule *in*, don't assume) | Residual turns by module after size normalization | "Iteration concentrates in one module regardless of who works there — a code-health smell." | team · batch | Flag the module for refactor backlog; exclude from person-level coaching. |
| H4 | Model mismatch | Turns by model per size bucket | "Small-model sessions on L-bucket tasks take 2× the turns." | org · batch | Default model routing: big model for L-bucket work. |

**6 · Tokens to shipped** — high = expensive per unit of delivery

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Scope skew — unconnected-repo usage counted *(lived: 9.2M/PR)* | Tokens by repo, connected vs not | "Tokens/PR corrected 92k→41k once out-of-scope repos were excluded." | fix · batch | Apply the scope map before scoring; show the split. |
| H1 | Exploration vs delivery (learning is fine — must be visible, not punished) | Tokens: linked vs never-linked sessions | "58% of tokens are exploration — reframe as R&D spend, excluded from cost-per-PR." | rec · batch | Show the dev their own split; no penalty. Thrash surfaces separately as H4. |
| H2 | Context waste — re-feeding instead of caching | Cache-read share; cache-creation ÷ input | "Cache-read 8% vs 34% norm — context re-sent from scratch every session." | nudge · live | C2 in-flow: compact/pin context; point to the context-discipline skill. |
| H3 | Model choice — premium model for routine tasks | Token cost by model × task size | "S-bucket tasks consume premium-model tokens 80% of the time." | org · batch | Default routing: small model for S-bucket; visible savings estimate attached. |
| H4 | Dead-end loops | High-token sessions ⋈ outcomes | "3 sessions burned 40% of the month's tokens and produced nothing shippable." | rec · batch | Adopt the handoff-file pattern: resume instead of restart (ties to KPI 15). |

### Outcomes

**7 · Merged without revert** — low = AI work gets undone

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Revert detection wrong | Sample audit: commit, author, reason | "2 of 5 'reverts' were revert-of-revert — rate corrected before coaching." | fix · batch | Tighten matcher (exclude revert-of-revert); publish the audited list. |
| H1 | Rubber-stamp reviews on AI PRs | Review depth reverted vs surviving *(needs reviews permission)* | "Reverted AI PRs average 4-minute approvals with zero comments — the gate failed, not the AI." | team · batch | Review gate: ≥1 substantive comment or checklist pass on AI-majority PRs before merge. |
| H2 | Missing tests | Test presence + coverage delta *(needs Checks permission)* | "All reverted PRs shipped with no test changes." | nudge · live | C4 fires at diff-time: "src/ changed, no tests in session" → tests-skill reminder. |
| H3 | Risk clustering in fragile modules | Revert rate by module + blast flag | "Reverts cluster in /payments — a module problem wearing an AI costume." | org · batch | Add /payments to sensitive_globs → C6 flags future unreviewed changes there. |
| H4 | Pressure pattern — Friday/release-week merges | Merge timestamp vs revert incidence | "3 of 4 reverts were Friday-evening merges." | team · batch | Process rule: prod-bound Friday merges need a second reviewer. |

**9 · Change reliability** — high = AI changes fail in front of users

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Failure events invisible — deploy system records no rollbacks | Deploy-system event audit (statuses, revert-deploys, fix-tagged deploys) | "The deploy tool never records rollbacks — Tier-1 cannot fire; reliability is unmeasurable until connected." | fix · batch | Wire GitHub Deployments statuses (or Argo events); publish the hotfix rule. |
| H1 | Pre-prod gap — failures tests should have caught | Failure vs CI status/coverage of the changed area | "Every failure landed in an uncovered area — a coverage gap wearing an AI costume." | team · batch | Coverage gate on the touched area for prod-bound changes. |
| H2 | AI blind spots — AI failures genuinely exceed the human baseline *(the fairness control — always shown)* | Failure rate split by AI share of the deploy | "AI failures cluster in error-handling paths; the human baseline is flat — a real, specific blind spot." | rec · batch | Add an "edge-case pass" step to the review-loop skill for error-handling code. |
| H3 | Batch blur — one failed deploy, many PRs blamed | Release contents; low-confidence flag on multi-PR deploys | "Every 'AI failure' sat in a 10+ PR batch — attribution is noise at this batch size." | org · batch | Smaller release batches, or per-PR deploy tagging. |
| H4 | User-invisible failure — internal noise, nobody affected | Sentry affected-user counts, pages fired, ticket influx (Tier-3) | "Half the 'failures' reached zero users — severity weighting separates noise from real user pain." | fix · batch | Weight Tier-2 events by affected users; headline shows user-reaching failures only. |

**10 · Defect-rework rate** — high = ship it, then patch it

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Fix detection noisy | Manual audit of matched pairs | "A third of 'rework' was typo fixes touching adjacent lines — rate corrected first." | fix · batch | Tighten hunk-overlap rule; publish audited pairs. |
| H1 | Knowingly partial ships (TODO increments) | TODO density; author + timing of follow-up | "2 of 3 reworked PRs were deliberate staged increments — not defects." | team · batch | Adopt a wip-increment tag; the KPI excludes tagged PRs cleanly. |
| H2 | Late review — rework follows post-merge comments | Comments/issues before rework commit *(needs reviews permission)* | "Rework consistently follows post-merge review comments — review is happening too late." | team · batch | Move review earlier: require the pre-PR review loop (KPI 14) so findings land before merge. |
| H3 | AI slop — rework concentrates on AI-majority PRs | Rework by AI-share *(needs depth capture)* | "Large AI-majority PRs without tests drive 80% of true rework." | nudge · live | C4 at merge-time: AI-majority + no tests + size L → coverage reminder before the PR opens. |

### Harness index + linkage

**🔗 Linkage engine (ex-KPI 11)** — no edge = the harness isn't paying off

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Not computable — a group is empty | Group sizes (before/after periods) | "Leverage unmeasurable yet — honest 'insufficient', never 0." | fix · batch | Wait for both groups; show progress toward measurability. |
| H1 | Trivial skills — exist but encode nothing | Per-skill outcome edge | "80% of invocations are a changelog formatter — the measure is diluted by trivia." | rec · batch | Author one judgment-encoding skill (the team review checklist); measure its PRs specifically. |
| H2 | Wrong skill for the task | Skill × task-type outcome matrix | "The api-client skill exists but is unused in exactly the sessions that need it." | nudge · live | C3 in-flow: "squad skill api-client covers this — users merge ~2× faster." |
| H3 | Stale skills | Skill file history vs recent edge | "Skills older than a quarter show zero edge — the codebase moved on." | team · batch | Quarterly skill-refresh rotation; deprecate the unused. |

**12 · Distinct skills authored** — low = know-how never becomes an asset

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Skills exist outside captured paths | Unknown-skill invocation events | "Two authored skills live in dotfiles we do not scan — count corrected." | fix · batch | Widen capture paths; prefer the org shared repo as home. |
| H1 | Repeat problems solved ad-hoc | Recurring session patterns *(metadata clustering — prompt text never leaves the machine)* | "The same migration-fix pattern appears in 6 sessions — one skill collapses them to single turns." | nudge · live | After the 3rd similar session, local nudge: "save this as a skill?" — one-click capture. |
| H2 | No incentive to codify *(🚫 not fetchable — qualitative; ask in retro)* | Team norms | "Nobody authors skills because nobody sees them — no recognition loop." | team · batch | AI-Leaders recognition + a demo slot in retro for new skills. |
| H3 | Feature unknown | Usage+authorship split | "A third of the team has never invoked ANY skill — awareness, not resistance." | rec · batch | 20-minute skills walkthrough for the zero-usage cohort. |

**13 · Verification harness rate** — low = AI hands over unverified work

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Verification ran but not captured (CI-only or manual) | CI first-push vs session events per PR *(needs Checks)* | "Half the 'unverified' PRs verify in CI — capture definition widened, rate corrected." | fix · batch | Count CI-first-pass as V-evidence (weaker weight); keep in-session as the gold standard. |
| H1 | Nothing to run — repo lacks harness | Applicability map | "The repo has no test infrastructure — a repo gap, not a person gap; nobody gets penalized." | org · batch | Eng-lead action: bootstrap the test harness; KPI marks categories inapplicable meanwhile. |
| H2 | Habit gap — AI never instructed to verify | CLAUDE.md instruction flags vs per-repo rate | "22% here vs 71% in repos whose CLAUDE.md says 'test before PR' — the habit follows the instruction." | rec · batch | Add the verify-before-PR rule to every active repo's CLAUDE.md; re-measure in 14 days. |
| H3 | Speed pressure | Rate vs size/late hours/release-week clustering | "Verification collapses in release weeks — exactly when it matters most." | nudge · live | Pre-PR reminder intensifies (still rate-capped) during release windows; team checklist item. |

**14 · Review-loop rate** — low = first human contact is the raw AI draft

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Review happens invisibly | Session pattern metadata before PR-open | "Manual diff re-reads happen but are invisible to the detector — detector, not behavior." | fix · batch | Extend the detector to diff-re-read patterns; recount. |
| H1 | No review tooling | Skill registry + invocations | "No org review skill exists — the practice has no handle." | org · batch | Ship /review in the Prism plugin, seeded with the team checklist. |
| H2 | Perceived redundant ("humans will catch it") | Human burden with vs without loop *(needs reviews permission)* | "Looped PRs: 1.2 human comments avg; unlooped: 4.8 — the loop cuts human review 4×." | rec · batch | Show the dev their own 4× number; make the loop default in the PR skill. |
| H3 | Review theater | Pass→change rate per person | "Review passes run but have never once changed a diff — the ritual is empty." | team · batch | Require finding-or-none record; audit monthly; drop credit for evidence-free passes. |

**15 · Context continuity rate** — low = every session starts cold, knowledge evaporates

| H | Hypothesis | Test / data | If true → insight | Ch · cadence | Example action |
|---|---|---|---|---|---|
| H0 | Continuity is manual (context pasted by hand) | First-prompt length distribution; start cache share *(length flag only — prompt never leaves the machine)* | "First prompts average 1,800 chars — devs hand-carry context every session." | nudge · live | Local nudge when first prompt >1,500 chars: "save this intro as CLAUDE.md?" — one-click. |
| H1 | No durable context files exist | Repo presence scan | "No handoff convention exists anywhere in the org." | rec · batch | Adopt handoff.md (status, decisions, next) — the practice keeping this very project oriented. |
| H2 | Files exist but stale/unread | Read events + file mtime vs sessions | "CLAUDE.md exists but predates the big refactor — read and then contradicted." | rec · batch | Session-end nudge (opt-in Stop hook): "update handoff.md" when the diff was large. |
| H3 | One endless session instead of resumable chunks | Length distribution; cache-creation ÷ input (compaction thrash) | "Marathon sessions thrash compaction — context bloat instead of file-based handoff." | nudge · live | C2-family nudge when compaction ratio spikes: "checkpoint to the handoff file and continue fresh." |

## 10. Estimations appendix — every derived value, exactly

Every number that isn't a raw fact carries `📐 estimated`; this is the exact derivation logic,
run frequency, known failure modes, and how a skeptic audits it.

| Derived value | Used by | Logic | Frequency | Failure modes | Audit |
|---|---|---|---|---|---|
| **AI→PR link** | KPIs 1, 4, 6, 7 + 🔗 linkage (every AI-denominated metric) | Strongest signal wins per (session, PR) pair: **pr_link 0.99** (first-party event: session's prRepository+prNumber equals the PR — exact) → **sha 0.95** (merge-SHA prefix in session) → **branch 0.80** (case-insensitive session.branch = pr.head_ref) → **coauthor 0.60** (repo-scoped: Claude trailer both sides). Method + confidence stored per link. Proposed hardening: suppress coauthor when pr_link covers the PR; de-dupe cwd-split sessions. | Every pipeline run (daily batch + on-demand) | Weak methods over-link (lived: cartesian coauthor links); browser-opened PRs lack the marker and fall to weak methods | `pr_ai_link` table exposes method+confidence; per-PR drill-down lists its sessions |
| **Cost in USD — DROPPED** | Nothing in the product anymore (KPI 6 is tokens-only) | Was: tokens × versioned rate card. Dropped by decision: tokens are MEASURED, dollars would be ESTIMATED, and an estimated currency figure erodes trust faster than it informs. Rate-card arithmetic survives only in admin docs for offline conversion. | — | — | Decision recorded here so it does not silently return |
| **Working days** | KPI 3 denominator | Distinct UTC days with ANY activity (commit, PR, review, session) in the window. No calendar integration by design — vacations auto-excluded because no activity occurs. | Daily batch | Weekend work counts as a working day (accepted, stated) | Day-list drill-down: which days counted and which signal made them count |
| **PR size buckets (S/M/L)** | KPI 4 fairness, PR coaching | Raw size = files + hunks + 2·modules + 3·blast (blast = touches sensitive globs; ignore-globs dropped first; hunks scaled when files dropped). Tertile cutoffs frozen over trailing-90d merged PRs; published cold-start cutoffs until enough history. | Recomputed each run; thresholds frozen per run | Sparse history → jumpy tertiles (cold-start defaults protect) | Per-PR sizing breakdown (files/hunks/modules/blast + cutoffs used) |
| **Revert detection** | KPI 7 (+ linkage ruler) | Ladder, strongest first: (1) **GitHub-NATIVE revert linkage** — Revert-button PRs carry a platform-recorded reference to the original PR (no regex, no guessing); (2) fallback: revert-pattern message AND inverse-diff overlap ≤14d, only when no native link exists. **Self-caught reverts INCLUDED** in the rate; the self/other split stored for action routing only (self → verification coaching, other → review-gate fix). | Daily batch | Fallback tier only: revert-of-revert, unrelated reverts touching the same files (the native tier is immune) | Every counted revert in a drill-down with its evidence tier; monthly audited sample |
| **Fix/rework classification** | KPI 10 (+ linkage ruler) | Ladder, strongest first: (1) follow-up linked to a **bug-type issue** · (2) conventional-commit **`fix:` type** · (3) fix-pattern message — each ANDed with **same-hunk overlap ≤14d**. wip-increment tag excludes deliberate staged shipping. Evidence tier stored per match. | Daily batch | Tier-3-only orgs (no commit/issue conventions) → more noise; those matches carry a lower-confidence flag | Matched pairs + evidence tier published monthly |
| **Deploy → PR → AI attribution** | KPI 9 | Chain: release/deploy SHA → merge SHA → PR → AI link, confidence per hop; multi-PR releases flagged low-confidence. The Sentry-release leg (Tier-2) is gated on release-hygiene ≥90%; Tier-1 needs only deploy-system events. | Hourly/daily pull; scoring daily | Missing SHAs (hygiene); batch deploys blur blame | Per-incident chain displayed with per-hop confidence |
| **AI-majority share** | 📎 depth signal (ex-KPI 2) + rework H3 slop check | FUTURE (needs telemetry): AI-written lines surviving at commit ÷ total changed lines; ≥50% = AI-majority. Until capture exists the value is **null everywhere**. | Daily batch once telemetry streams | Rebases/reformats churn line identity | Per-PR line ledger (written / survived / total) |
| **Prompt-quality flags** | KPIs 4, 12, 15 + coaching rules C1/C2 | Computed ON the developer's machine: prompt length, has-file-refs, has-acceptance-criteria, exploratory-vs-directive shape. ONLY the flags (booleans/numbers) are exported — text never leaves the machine. | Realtime local (hooks); aggregated daily | Crude proxies for "clarity" (accepted — used for coaching, not scoring) | Flag definitions versioned in the plugin; `/prism status` shows active rules |

## 11. Backend build order + data catalog

### Build order P1–P5

| Phase | Build items | Unlocks |
|---|---|---|
| **P1 · Main index MVP (Core-6)** | GitHub App (PRs, commits, diffs, native revert linkage) · local session scan · AI→PR link (pr_link first) · daily pipeline · weights 15/35/50 | The MAIN index publishes end-to-end. Everything else builds on this. |
| **P2 · Harness index (12–15)** | Parser extensions over session logs **already on disk**: tool-call → harness-category classifier (V1–V4 + execution evidence), review-pass detector, context-file read events. No new integrations needed. | The HARNESS index + the 🔗 linkage engine (harness gaps explaining outcome problems). |
| **P3 · Change reliability Tier-1** | GitHub "Deployments" permission + deploy webhooks · rollback/hotfix rule (revert-deploy or fix-tagged ≤48h, same service) · attribution job w/ confidence | KPI 9 scoring basis — no Sentry required. |
| **P4 · Org rollout** | OTLP collector + org token · managed-settings fleet push (MDM) · SSO/roster identity map · Prism coaching plugin (C1–C6, rate caps, `/prism status`) | Team coverage · depth/survival signals go live · AI Leaders · in-flow coaching. |
| **P5 · Enrichment (all optional)** | Sentry token + hygiene checker (Tier-2) · PagerDuty/helpdesk (Tier-3 severity) · "PR reviews" + "Checks" + "Labels" permissions | Reliability enrichment · review-burden proof (14-H2) · rework exclusions. |

### Data catalog — what powers what (summary)

Fetchability tags: ✅ now · 🔧 needs setup · 📐 estimated (see §10) · 🚫 not available (with a
workaround or drop verdict — never silent).

| Data group | Tag · phase | Powers |
|---|---|---|
| Merged PRs + metadata; commits + trailers; diffs (files/hunks/lines) | ✅ P1 | KPIs 1, 4, 6, 7, 10 · sizing · link fallback · same-hunk rule · blast flags |
| Native revert linkage (+ inverse-diff fallback) | 📐 P1 | KPI 7 · linkage ruler (self-caught included; audited drill-down) |
| Sessions (turns, timestamps, repo, branch); tokens in/out/cache; model; skills used; **pr-link marker** | ✅ P1 | KPIs 1, 3, 4 · KPI 6 (tokens only) · KPI 12 · 🔗 linkage · C2/C3 nudges · the 0.99 join everything AI-denominated depends on |
| Working days · size buckets · fix/rework classification · session→PR fallback link | 📐 P1 | KPI 3 denominator · KPI 4 fairness · KPI 10 · link fallback (confidence stored) |
| Tool calls → harness categories (V1–V5) + execution evidence; context-file read events; prompt-length/structure flags | ✅ P2 (parser extensions — data already on disk) | KPI 13 rate+breadth · KPI 14 detector · KPI 15 · 4-H1 · 12-H1 · 15-H0 · C1 |
| Deploy events + statuses; rollback/hotfix detection | 🔧/📐 P3 | KPI 9 Tier-1 (the scoring basis — platform-native, no Sentry) |
| Coaching events (rule, intervention, outcome); edit-level events (AI lines written); cross-person skill usage; other-machine sessions; seats/licenses/caps | 🔧 P4 | Adoption loop · Coaching tab · 📎 depth+survival signals · AI Leaders (outside both indexes) · 3-H0 coverage · 1-H3/3-H3 |
| Review depth; CI first-push status; PR labels/linked issues | 🔧 P5 | 7-H1 · 14-H2 review-burden proof · 13 corroboration · 9-H1 · KPI 10 ladder + wip-increment |
| Sentry releases + NEW error groups; affected users/pages/tickets; release→SHA hygiene | 🔧 P5 | KPI 9 Tier-2 enrichment · Tier-3 severity weighting · the ≥90% hygiene gate |
| **Prompt/response text · source code content** | 🚫 policy | Never ingested. Three-mechanism privacy design (§8) serves KPIs 4/12/15 without ever exporting text; diffs + line hashes suffice — no code mirroring. Nothing dropped. |
| **True time spent (hours, focus)** | 🚫 verdict | Stays unavailable; proxies stated as proxies; Prism never claims "hours saved". No KPI depends on it. |
| **Accept/reject events (agentic tools)** | 🚫 verdict | Dropped → edit-survival 📎 signal (never scored). Don't wait for events that will never exist. |
| **Copilot per-user suggestion streams** | 🚫 | Multi-tool future: org/team aggregates only; per-person depth stays null for Copilot users. |
| **Human-line outcome baseline (control group)** | 🚫 recorded | KPI 8 removed, so the baseline is no longer needed — recorded as the precondition if retention ever returns. The AI-vs-human control lives on in KPI 9-H2. |
| **Incident root cause (ground truth)** | 🚫 workaround | Confidence-scored SHA-chain attribution, confidence always displayed; KPI 9 tier badges instead of false certainty. |
| **Cost in USD** | 🚫 dropped | Tokens only, everywhere. Conversion math lives in admin docs only. |

## 12. Open decisions (alignment backlog, refreshed for v3.0)

| # | Decision | Status |
|---|---|---|
| 1 | **Implement v3.0 in code** — weights 15/35/50, Core-6 KPI set, separate HARNESS index (12–15, equal weights, own confidence), 🔗 linkage engine, removed/demoted ledger honored (§7). The headline pending project; see the gap table at the top. | decided in the model lab — not yet coded |
| 2 | **Calibrate KPI 14/15 anchors** — 20/70 and 30/80 are proposed defaults; review with real data before socializing harness scores | open |
| 3 | **Adopt the KPI 9 Tier-1 rule** — Deployments permission + rollback/hotfix ≤48h detector (P3); promote KPI 9 into the Outcomes core after one clean Tier-1 month | decided — build pending |
| 4 | Possible **merge of 13+14** into one "pre-handoff harness rate" if they prove redundant | open — decide after first real data |
| 5 | **Telemetry rollout** (P4): OTLP collector, managed settings via MDM, SSO/roster identity map — unlocks depth/survival signals, AI Leaders, fleet coverage | open |
| 6 | **Coaching plugin build** (Addendum B): C1–C6, intervention ladder, rate caps, local ≤500ms eval, `/prism status` | designed — not built |
| 7 | KPI 13 breadth blending (proposed 70/30 rate/breadth) after calibration | open |
| 8 | Suppress coauthor fallback when `pr_link` covers a PR; de-dupe cwd-split sessions | queued (handoff) |
| 9 | Review remaining flagged anchors with the team before scores are socialized (a wrong target quietly makes everyone look better or worse than reality) | open |

## 13. Changelog

| Version | Date | What changed |
|---|---|---|
| **v1** | 2026-07-02 | Initial alignment: one index, 4 dimensions (10/25/40/25), 13 weighted KPIs, MECE sorting rule (file KPIs by where the number is observed, never by what skill causes it), H0-first diagnostic trees. This is the model the app implements today. |
| **v1.1** | 2026-07-02 | Multiplier moved **out of the weighted index** → "AI Leaders" recognition + L5 gate. Agent-harness KPI family (13–15) proposed into Proficiency. |
| **v2.x** | 2026-07-02 | Model-lab feedback rounds — **trust-first, pruning, hardening**: per-KPI trust level/risk/mitigation added everywhere; KPI 2 removed and KPI 5 demoted to 📎 diagnostic signals; KPI 8 retention removed (human-baseline precondition recorded); KPI 6 made tokens-only + scope-fixed (**Cost USD dropped**); KPI 7 hardened — all post-merge reverts count (self-caught included, who-caught routes the action), native revert linkage preferred over regex; KPI 10 hardened — evidence ladder + wip-increment exclusion; **KPI 9 rebuilt as tiered Change reliability** (Tier-1 without Sentry); Addendum B coaching designed (ladder, C1–C6, guardrails, 3-mechanism privacy); estimations made explicit per derived value; realtime-vs-batch cadence stated everywhere. |
| **v3.0** | 2026-07-02 | **Two-index restructure**: MAIN index = Usage 15 · Efficiency 35 · Outcomes 50 over the Core-6 (1, 3, 4, 6, 7, 10); **HARNESS index** = KPIs 12–15, equal weights, scored separately with its own confidence. Rationale: proficiency is a driver, not a sibling — inside the main index it double-counts. Ex-KPI 11 → the 🔗 **linkage engine** (within-person harness→outcome tests, never scored). Sentry demoted to optional enrichment. |
