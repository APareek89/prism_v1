#!/usr/bin/env node
// v3 preview migration runner (portable — same pattern as apps/web/scripts/db-migrate.mjs).
//
//   npm run v3:migrate            (root)   — apply pending v3 migrations
//   node --env-file=../../.env.local scripts/migrate.mjs --check
//
// Applies migrations/v3_*.sql in filename order against SUPABASE_DB_URL, tracking
// applied files in v3._v3_migrations. SCOPE GUARD: this runner only ever creates
// the `v3` schema — it never touches public.* (owner-approved dummy-data exception
// is scoped to schema v3; see CLAUDE.md).

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const CHECK_ONLY = process.argv.includes('--check');

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('✗ SUPABASE_DB_URL is not set (run via npm run v3:migrate at the repo root).');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();

  // Tracking table lives inside v3 itself, so `drop schema v3 cascade` resets everything.
  await client.query('create schema if not exists v3');
  await client.query(
    `create table if not exists v3._v3_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const { rows: applied } = await client.query('select name from v3._v3_migrations');
  const appliedSet = new Set(applied.map((r) => r.name));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !appliedSet.has(f));
  console.log(`v3 migrations: ${files.length} total, ${appliedSet.size} applied, ${pending.length} pending.`);

  if (CHECK_ONLY) {
    if (pending.length) console.log('Pending:\n  ' + pending.join('\n  '));
    return;
  }

  for (const file of pending) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Scope guard: refuse any migration whose CODE references the public schema
    // (comments stripped first — they may legitimately mention public.*).
    const code = sql.replace(/--[^\n]*/g, '');
    if (/\bpublic\s*\./i.test(code)) {
      console.error(`✗ ${file} references public.* — v3 migrations must stay inside schema v3.`);
      process.exit(2);
    }
    process.stdout.write(`  → ${file} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into v3._v3_migrations(name) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      console.log('FAILED');
      console.error(`\n✗ ${file} failed:\n${err.message}\n`);
      process.exit(3);
    }
  }
  console.log(`✓ v3 schema up to date (${files.length} migrations).`);
}

main()
  .catch((err) => {
    console.error('✗ v3 migration runner error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
