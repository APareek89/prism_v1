#!/usr/bin/env node
// v3 preview reset — drops the ENTIRE v3 schema, re-migrates, re-seeds.
//
//   npm run v3:reset   (root)
//
// Because the dummy-data exception is scoped to schema v3, the whole preview
// world is removable with one statement. public.* is never touched. The seed is
// deterministic, so reset always reproduces the identical dataset.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('✗ SUPABASE_DB_URL is not set (run via npm run v3:reset at the repo root).');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('Dropping schema v3 (cascade) ...');
  await client.query('drop schema if exists v3 cascade');
  console.log('✓ schema v3 dropped. public.* untouched.');
} finally {
  await client.end().catch(() => {});
}

for (const script of ['migrate.mjs', 'seed.mjs']) {
  const res = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

console.log('\n✓ v3 reset complete. Run `npm run v3:recompute` to rebuild computed tables.');
