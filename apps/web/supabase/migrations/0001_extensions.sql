-- 0001_extensions.sql
-- Required Postgres extensions for Prism.
--   pgcrypto → gen_random_uuid() for all primary keys.
--   citext   → case-insensitive github_handle / email so "Alice" == "alice".
-- Supabase convention: install extensions into the dedicated `extensions` schema.
-- Re-runnable: IF NOT EXISTS.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
