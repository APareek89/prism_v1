# Learning.MD — Prism Codex

> Add an entry whenever the basic flow changes, the user reports a bug or gives corrective feedback, or a fix takes meaningful investigation. Check this file before debugging.

### 2026-07-17 — The interface explained the model before helping the user decide

**Symptom:** The owner found the UI/UX and complete flow unsatisfying even though the engine and data pipeline were working.
**Why 1:** Every page led with implementation vocabulary, dense tables, and model metadata.
**Why 2:** The original UI was built to prove v3 scoring fidelity, so its information architecture mirrored database and model structure.
**Why 3:** The product had no shared decision flow connecting an index change to evidence and then to one accountable action.
**Deepest why type:** `design`
**Action taken:** Rebuild the web experience around “current impact → why → priority action → proof,” while leaving the engine, schema, and API contracts unchanged.
**Preventive action:** Every primary page must pass the 10-second test: a user can state the current outcome, the most important cause, and the next action without opening a detail table.

### 2026-07-17 — In-app browser bootstrap failed in the desktop runtime

**Symptom:** The bundled in-app browser client could not initialize and raised `Cannot redefine property: process` in a fresh runtime.
**Why 1:** The client assigns a process shim to a runtime property that is non-configurable in this desktop session.
**Why 2:** Browser-client and runtime versions are incompatible in the current environment.
**Deepest why type:** `process`
**Action taken:** Keep visual verification as a required phase and use the supported standalone browser workflow if the in-app connection remains unavailable.
**Preventive action:** Attempt the bundled browser first, record the exact failure once, and avoid repeated blind retries.

### 2026-07-17 — Visually hidden table copy widened the mobile page

**Symptom:** The People route measured 537px wide in a 390px viewport even though its table had an internal scroll container.
**Why 1:** A visually hidden header used absolute positioning without a fixed viewport anchor.
**Why 2:** Its off-screen box still expanded the document overflow area.
**Deepest why type:** `css`
**Action taken:** Anchor `.sr-only` to a fixed one-pixel box and verify every primary route against `documentElement.scrollWidth` at 390px.
**Preventive action:** Mobile QA must measure document width in addition to inspecting screenshots.

### 2026-07-17 — A 100.5% index total still appeared publishable

**Symptom:** Editing a weight from 7.5 to 8.0 showed MAIN at 100.5/100 but left the publish control enabled.
**Why 1:** The UI treated any total within 0.51 of 100 as valid.
**Why 2:** That tolerance was wider than the editor's 0.5-point input step and contradicted the exact-total copy.
**Deepest why type:** `logic`
**Action taken:** Require an exact 100 total within floating-point epsilon before presenting publish as available; the deterministic scoring functions remain untouched.
**Preventive action:** Every editable invariant needs a UI-level negative-path test, not only a happy-path check.

### 2026-07-17 — Organization connection and developer consent are different scopes

**Symptom:** A single “Connect LLM” concept suggested Prism could pull every organization member’s local Codex or Claude Code data after the GitHub App was installed.
**Why 1:** GitHub Apps run server-to-server for selected repositories, while coding-agent telemetry originates on each developer’s machine.
**Why 2:** A browser cannot safely rewrite every developer’s user-level tool configuration.
**Why 3:** Identity, consent, and ingestion were being treated as one connection instead of three explicit steps.
**Deepest why type:** `design`
**Action taken:** Add a Connect flow that discovers the team from GitHub, issues a hashed one-time personal invitation, backs up and configures the selected local tool, and maps its collector token back to that exact employee.
**Preventive action:** Every new connector must document its authorization scope, identity key, privacy boundary, and the first observable proof that data is flowing.

### 2026-07-17 — A demo label was not the full demo-data boundary

**Symptom:** Removing the visible v3 preview still left legacy pipeline and local-Claude paths able to create an `is_demo` employee.
**Why 1:** Demo behavior existed in ingestion and roster bootstrapping as well as UI routes.
**Why 2:** The legacy single-user connector forced a placeholder employee so the scorer always had at least one member.
**Why 3:** The empty-roster case had been treated as a setup failure instead of an honest no-data state.
**Deepest why type:** `architecture`
**Action taken:** Remove the v3 routes/schema/seed tooling, delete demo-user auth fallbacks, stop automatic employee creation in every connector and pipeline path, and leave identity-less local sessions unbound.
**Preventive action:** A real-only audit must search all write paths for placeholder creation and verify the live database has zero demo employees—not merely inspect route copy.

### 2026-07-17 — Team login needs an exact identity bridge

**Symptom:** A Supabase login alone could not identify which GitHub-discovered employee should receive the coding-agent telemetry command.
**Why 1:** GitHub handles and Supabase user IDs belong to different identity systems.
**Why 2:** Automatically matching on display name would be ambiguous and unsafe.
**Why 3:** The product had invitation tokens but no durable auth-user-to-employee claim rule.
**Deepest why type:** `design`
**Action taken:** Administrators assign a work email to the discovered employee; callback claims only one active, unclaimed, exact normalized-email match and then applies developer/bootstrap-admin roles.
**Preventive action:** Every new sign-in method must define a unique claim key, conflict behavior, role bootstrap, and unmatched-user failure state before it can expose personal data.

### 2026-07-17 — A correct production callback was still redirected to localhost

**Symptom:** Render accepted the login request, but the Supabase magic link opened `localhost` instead of the hosted app.
**Why 1:** The requested `redirectTo` was not in the Supabase project's allowed redirect URLs.
**Why 2:** Supabase safely replaced an unapproved redirect with the configured Site URL.
**Why 3:** Deployment environment variables and Auth-provider URL configuration are separate control planes.
**Deepest why type:** `environment`
**Action taken:** Keep Supabase as token/session authority, but deliver a Resend email whose link points directly to Prism and exchanges Supabase's hashed one-time token at `/auth/callback`.
**Preventive action:** Every hosted passwordless flow must test the actual received link, not stop at “email request returned 200.”

### 2026-07-17 — The edge proxy's request origin was not the browser origin

**Symptom:** Prism successfully verified the hosted one-time token, then its own callback issued a 307 redirect to `localhost`.
**Why 1:** The callback built its destination from `request.url`.
**Why 2:** Render terminates the public request at a proxy and forwards an internal localhost origin to the Next.js service.
**Why 3:** Redirect construction assumed the application server could always infer the canonical external origin from an inbound request.
**Deepest why type:** `environment`
**Action taken:** Construct auth callback destinations and both stages of telemetry installer generation from the validated `NEXT_PUBLIC_APP_URL` deployment setting.
**Preventive action:** Hosted auth QA must follow the callback through its final redirect, then generate and inspect a setup command and its installer endpoint for the same public origin.

### 2026-07-17 — Authenticated browser QA hid a broken terminal installer

**Symptom:** Piping the generated Claude Code command to `sh` failed on `<!DOCTYPE html>` because the installer response was the sign-in page.
**Why 1:** Middleware redirected the installer request to Supabase sign-in before its one-time invite could be checked.
**Why 2:** The OTLP collector route had the same browser-session gate even though it authenticates with a bearer token.
**Why 3:** The hosted end-to-end check consumed the invite from an already authenticated browser, so it never exercised the developer terminal's logged-out path.
**Deepest why type:** `process`
**Action taken:** Publicly route only the installer and OTLP paths at middleware level, retain their invite/bearer authentication, keep management paths private, and add path-level regression tests.
**Preventive action:** Every machine-to-machine endpoint must be tested without browser cookies and assert status plus content type before its response is piped to a shell or SDK.

### 2026-07-18 — A top-line score was not enough to course-correct the model

**Symptom:** The owner could see Prism's index and recommendations but could not trace a new commit through its real evidence, KPI normalization, effective weighting, confidence, and publication gates.
**Why 1:** Product views were deliberately decision-first and hid most model internals.
**Why 2:** Existing evidence pages showed outcomes but did not replay the exact production input assembly and scoring output for one person/date.
**Why 3:** Deterministic calculations and agent narratives had no shared audit surface that kept their different responsibilities explicit.
**Deepest why type:** `design`
**Action taken:** Add an admin-only, read-only calculation lab that calls the existing assembler and scoring engine, expands their returned values into an evidence-to-contribution trace, and displays persisted narratives separately.
**Preventive action:** Any future score or gate must expose its source evidence, configured and effective weights, confidence effect, and deterministic-versus-narrative ownership in the Admin trace before release.

### 2026-07-18 — A wrong GitHub installation looked like a valid empty run

**Symptom:** The first post-reset pipeline run displayed “Complete · 0 PRs” even though the replacement repository contained merged PRs and the GitHub summary contained access errors.
**Why 1:** The persisted connector still pointed at another account's App installation while its repository scope pointed at the APareek89 lab.
**Why 2:** Connector failures are deliberately collected as non-fatal pipeline warnings so scoring can continue on available evidence.
**Why 3:** The temporary Admin control displayed only counts and ignored the returned `ok` and `warnings` fields.
**Deepest why type:** `integration`
**Action taken:** Pin the connector to APareek89 installation `143692925`, verify the installation can list the lab before rerunning, and surface failed steps or soft warnings in the Admin control instead of reporting an unqualified success.
**Preventive action:** Any destructive connector reset must verify `(installation, repository)` access together before deletion, and every operator-facing pipeline control must render structured warnings.

### 2026-07-18 — The GitHub setup callback expanded a deliberately narrow repo scope

**Symptom:** After the clean lab-only run passed, 22 historical `APareek89/prism` PRs reappeared and the connector listed both repositories.
**Why 1:** Saving the GitHub App's selected-repository configuration invoked its setup callback after the first reset.
**Why 2:** The callback intentionally treats every repository accessible to the installation as the new Prism scope.
**Why 3:** The installation still selected the original repo in addition to the new lab, while the clean-reset requirement existed only in Prism's database scope.
**Deepest why type:** `integration`
**Action taken:** Wait for the callback/backfill to finish, repeat the transactional evidence reset, pin connector plus function scopes to only the lab, rerun, and verify the sole persisted repo from the live database.
**Preventive action:** When the measurement scope must exclude a repository, remove it in GitHub App settings as well as Prism; after every setup callback, validate the authoritative repo list before accepting a backfill.
