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
