// v3 read/write pool (apps/web). The web app READS v3.* for display and WRITES
// two tables: v3.user_context (Growth clicks) and v3.agent_artifacts (the
// coaching agent). All deterministic computed rows come from the engine.
// Keyless-boot invariant: nothing throws at import time; the pool is lazy.

import pg from 'pg';

// Engine-compatible parsers: int8/numeric → number, timestamps → ISO strings.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(1114, (v) => new Date(`${v}Z`).toISOString());
pg.types.setTypeParser(1082, (v) => v);

let pool: pg.Pool | null = null;

export function v3db(): pg.Pool {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL is not set — the v3 preview needs the database.');
  if (!pool) pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4 });
  return pool;
}
