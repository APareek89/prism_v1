#!/usr/bin/env node
// Prism migration runner (portable — no Supabase CLI required).
//
//   node --env-file=.env.local scripts/db-migrate.mjs          # apply pending migrations
//   node --env-file=.env.local scripts/db-migrate.mjs --check  # inspect target only, apply nothing
//
// Applies supabase/migrations/*.sql in filename order against SUPABASE_DB_URL,
// tracking applied files in public._prism_migrations. Each file runs in its own
// transaction. Aborts if the target already has Prism app tables but no tracking
// row (i.e. schema applied by some other means) — never clobbers.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const CHECK_ONLY = process.argv.includes('--check');

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('✗ SUPABASE_DB_URL is not set. Run with: node --env-file=.env.local scripts/db-migrate.mjs');
  process.exit(1);
}

// A few app tables we expect ONLY Prism to own — used for the freshness guard.
const SENTINEL_TABLES = ['employees', 'functions', 'index_config', 'index_daily', 'kpi_daily'];

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();

  // 1. Inspect existing public tables.
  const { rows: existing } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  );
  const existingNames = existing.map((r) => r.table_name);
  console.log(`Target public schema: ${existingNames.length} table(s)` +
    (existingNames.length ? ` — ${existingNames.join(', ')}` : ' (empty)'));

  // 2. Ensure tracking table.
  await client.query(
    `create table if not exists public._prism_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const { rows: applied } = await client.query('select name from public._prism_migrations');
  const appliedSet = new Set(applied.map((r) => r.name));

  // 3. Freshness guard: app tables present but nothing tracked → stop, don't clobber.
  const sentinelHits = SENTINEL_TABLES.filter((t) => existingNames.includes(t));
  if (sentinelHits.length && appliedSet.size === 0) {
    console.error(
      `\n✗ Aborting: found Prism tables (${sentinelHits.join(', ')}) but no migration history.\n` +
      `  The schema looks like it was applied by another tool. Refusing to clobber.\n` +
      `  If this is intentional, clear the public schema or seed public._prism_migrations first.`,
    );
    process.exit(2);
  }

  // 4. Determine pending.
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !appliedSet.has(f));
  console.log(`Migrations: ${files.length} total, ${appliedSet.size} applied, ${pending.length} pending.`);

  if (CHECK_ONLY) {
    console.log('\n--check: inspection only, nothing applied.');
    if (pending.length) console.log('Pending:\n  ' + pending.join('\n  '));
    return;
  }
  if (!pending.length) {
    console.log('\n✓ Up to date — nothing to apply.');
    return;
  }

  // 5. Apply each pending migration in its own transaction.
  for (const file of pending) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  → ${file} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public._prism_migrations(name) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      console.log('FAILED');
      console.error(`\n✗ ${file} failed:\n${err.message}\n`);
      process.exit(3);
    }
  }

  // 6. Post-apply sanity: confirm the config-only seed landed, no stray data.
  const counts = {};
  for (const t of ['functions', 'index_config', 'employees', 'gh_prs', 'index_daily']) {
    try {
      const { rows } = await client.query(`select count(*)::int as n from public.${t}`);
      counts[t] = rows[0].n;
    } catch {
      counts[t] = 'n/a';
    }
  }
  console.log(`\n✓ Applied ${pending.length} migration(s).`);
  console.log(`Seed check → functions: ${counts.functions}, index_config: ${counts.index_config}, ` +
    `employees: ${counts.employees}, gh_prs: ${counts.gh_prs}, index_daily: ${counts.index_daily}`);
  console.log('(employees / gh_prs / index_daily should be 0 — no dummy data.)');
}

main()
  .catch((err) => {
    console.error('✗ Migration runner error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await client.end().catch(() => {});
  });
