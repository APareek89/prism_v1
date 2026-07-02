-- ─────────────────────────────────────────────────────────────────────────────
-- v3 PREVIEW SCHEMA (feat/v3-preview) — isolated namespace for the v3.0 model.
--
-- OWNER-APPROVED DUMMY-DATA EXCEPTION: synthetic data is allowed ONLY inside
-- this `v3` schema. Nothing here may read from or write to public.* — the v1
-- app and its no-dummy-data invariant stay untouched.
--
-- Dropping the whole preview is one statement (see scripts/reset.mjs):
--   drop schema v3 cascade;
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists v3;
