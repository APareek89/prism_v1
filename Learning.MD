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
