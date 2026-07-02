#!/usr/bin/env node
// @prism/contract type generator — introspects the LIVE `v3` schema (column
// truth = migrations applied to SUPABASE_DB_URL) and rewrites src/db.generated.ts.
//
//   npm run generate --workspace packages/contract
//
// Run after changing services/ingest/migrations. Curated overrides below give
// jsonb columns and enum-ish text columns their real domain types.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'db.generated.ts');

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('✗ SUPABASE_DB_URL is not set.');
  process.exit(1);
}

// Domain-typed overrides: `${table}.${column}` → TS type (names from ./domain).
const OVERRIDES = {
  'developers.archetype': 'Archetype',
  'developers.seat_tier': "'standard' | 'capped' | 'none'",
  'prs.labels': 'string[]',
  'commits.linked_issue_kind': "'bug' | 'task' | null",
  'sessions.pr_refs': 'Array<{ repo: string; number: number }>',
  'sessions.skill_invocations': 'Array<{ name: string; had_output: boolean }>',
  'sessions.verification_events': 'Array<{ category: HarnessCategory; cmd: string; duration_ms: number; exit_code: number }>',
  'sessions.review_pass': '{ ran: boolean; diff_changed: boolean; findings: number | null } | null',
  'deploy_events.kind': "'deploy' | 'rollback' | 'hotfix'",
  'coaching_events.rule_id': 'CoachingRuleId',
  'coaching_events.intervention': 'Intervention',
  'coaching_events.outcome': 'CoachingOutcome',
  'ai_pr_links.method': 'LinkMethod',
  'kpi_daily.kpi_id': 'KpiId',
  'kpi_daily.index_kind': 'KpiIndexKind',
  'kpi_daily.tier': 'ReliabilityTier | null',
  'kpi_daily.meta': 'Record<string, unknown>',
  'index_daily.index_kind': 'IndexKind',
  'index_daily.band': 'Band | null',
  'index_daily.gates': '{ l0_forced: boolean; l5_capped: boolean; multiplier_signal: number }',
  'index_daily.dimensions': "Partial<Record<'usage' | 'efficiency' | 'outcomes', number | null>>",
  'insights.kpi_id': 'string',
  'insights.channel': 'Channel',
  'insights.magnitude': 'Record<string, unknown>',
  'insights.evidence': 'Record<string, unknown>',
  'recommendations.channel': 'Channel',
  'recommendations.targets': 'string[]',
  'kpi_catalog.kpi_id': 'KpiId',
  'kpi_catalog.index_kind': 'KpiIndexKind',
  'kpi_catalog.dimension': 'Dimension',
  'kpi_catalog.direction': "'up' | 'down'",
  'kpi_catalog.anchor': '{ floor?: number; target: number; ceil?: number }',
  'kpi_catalog.data_point_ids': 'string[]',
  'data_points.fetch_tag': 'FetchTag',
  'config_versions.config': 'IndexConfig',
  'user_context.kind': 'UserContextKind',
  'user_context.meta': 'Record<string, unknown>',
};

// pg base-type → TS. NOTE: consumers must register pg type parsers so bigint
// (oid 20) and numeric (1700) come back as JS numbers — see the header emitted
// into db.generated.ts.
const TYPE_MAP = {
  uuid: 'string', text: 'string', varchar: 'string',
  timestamptz: 'string', timestamp: 'string', date: 'string',
  bool: 'boolean',
  int2: 'number', int4: 'number', int8: 'number', numeric: 'number', float4: 'number', float8: 'number',
  jsonb: 'unknown', json: 'unknown',
};

const pascal = (snake) => snake.split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join('');
const rowName = (table) => {
  const singular = table.endsWith('s') && !table.endsWith('ss') ? table.slice(0, -1) : table;
  return `${pascal(singular)}Row`;
};

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query(`
  select table_name, column_name, udt_name, is_nullable, ordinal_position
  from information_schema.columns
  where table_schema = 'v3' and table_name not like '\\_%'
  order by table_name, ordinal_position
`);
await client.end();

const tables = new Map();
for (const r of rows) {
  if (!tables.has(r.table_name)) tables.set(r.table_name, []);
  tables.get(r.table_name).push(r);
}

let out = `// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run generate --workspace packages/contract
// Source of truth: the LIVE v3 schema (services/ingest/migrations applied to SUPABASE_DB_URL).
// Generated: from schema v3 (${tables.size} tables).
//
// NOTE for consumers using \`pg\`: register type parsers so bigint/numeric come
// back as JS numbers, e.g.
//   pg.types.setTypeParser(20, Number);    // int8
//   pg.types.setTypeParser(1700, Number);  // numeric

import type {
  Archetype, Band, Channel, CoachingOutcome, CoachingRuleId, Dimension, FetchTag,
  HarnessCategory, IndexConfig, IndexKind, Intervention, KpiId, KpiIndexKind,
  LinkMethod, ReliabilityTier, UserContextKind,
} from './domain';

`;

for (const [table, cols] of [...tables.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  out += `/** v3.${table} */\nexport interface ${rowName(table)} {\n`;
  for (const c of cols) {
    const key = `${table}.${c.column_name}`;
    let ts;
    if (OVERRIDES[key]) {
      ts = OVERRIDES[key];
      // Overrides that already encode null keep their own nullability.
      if (c.is_nullable === 'YES' && !ts.includes('null')) ts = `${ts} | null`;
    } else if (c.udt_name.startsWith('_')) {
      ts = `${TYPE_MAP[c.udt_name.slice(1)] ?? 'unknown'}[]`;
      if (c.is_nullable === 'YES') ts = `${ts} | null`;
    } else {
      ts = TYPE_MAP[c.udt_name] ?? 'unknown';
      if (c.is_nullable === 'YES') ts = `${ts} | null`;
    }
    out += `  ${c.column_name}: ${ts};\n`;
  }
  out += `}\n\n`;
}

await writeFile(OUT, out);
console.log(`✓ wrote ${OUT} (${tables.size} tables).`);
