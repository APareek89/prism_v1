#!/usr/bin/env node
// Reset the demo to a clean slate for a fresh live test.
//
//   node --env-file=.env.local scripts/reset-demo.mjs            # clear ingested + derived data
//   node --env-file=.env.local scripts/reset-demo.mjs --hard     # also delete the self employee
//
// Keeps the seed (functions + index_config) so migrations don't need re-running, and by
// default keeps the is_demo "self" employee (your identity). Clears every connector +
// ingested/derived table so you can connect Claude/GitHub live and watch it populate.
// No dummy data is ever written — this only DELETES.

import pg from 'pg';

const HARD = process.argv.includes('--hard');
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('✗ SUPABASE_DB_URL not set. Run: node --env-file=.env.local scripts/reset-demo.mjs');
  process.exit(1);
}

// Order matters only loosely (FKs are ON DELETE CASCADE/SET NULL); listed leaf→root.
const TABLES = [
  'comms_outbox', 'comms_log', 'courses', 'recommendations', 'insights',
  'index_daily', 'kpi_daily', 'pr_ai_link', 'blame_snapshots', 'incidents',
  'deploys', 'cc_sessions', 'gh_commits', 'gh_prs', 'connectors',
];

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  for (const t of TABLES) {
    const r = await client.query(`delete from public.${t}`);
    console.log(`cleared ${t}: ${r.rowCount}`);
  }
  if (HARD) {
    const r = await client.query('delete from public.employees where is_demo = true');
    console.log(`cleared self employee: ${r.rowCount} (--hard)`);
  }
  const { rows } = await client.query(
    'select (select count(*) from functions) functions, ' +
      '(select count(*) from index_config) index_config, ' +
      '(select count(*) from employees) employees',
  );
  console.log('\nKept:', rows[0]);
  console.log('✓ Clean slate. Connect Claude/GitHub in Admin and Run pipeline to repopulate.');
}

main()
  .catch((err) => {
    console.error('✗ reset error:', err.message);
    process.exit(1);
  })
  .finally(() => client.end().catch(() => {}));
