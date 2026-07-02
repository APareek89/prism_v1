// DB-backed runner: load raw v3.* rows → computeAll → persist computed tables.
// The ONLY impure module in the engine. apps/web imports { recompute } from
// '@prism/engine/run' (Configure saves, on-demand recompute); the CLI wraps it.

import pg from 'pg';
import type {
  CommitRow, ConfigVersionRow, DeployEventRow, DeveloperRow, KpiCatalogRow,
  PrRow, RepoRow, SessionRow, SkillRow,
} from '@prism/contract';
import { computeAll } from './compute';
import type { ComputeResult, RawData } from './types';

// bigint (int8) + numeric come back as JS numbers (values are far below 2^53).
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);
// timestamptz/timestamp/date come back as ISO strings (the engine compares ISO
// strings lexicographically; pg's default Date objects would break that).
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(1114, (v) => new Date(`${v}Z`).toISOString());
pg.types.setTypeParser(1082, (v) => v);

export interface RecomputeSummary {
  date: string;
  configVersion: number;
  developers: number;
  links: number;
  kpiRows: number;
  insights: number;
  recommendations: number;
}

export async function loadRaw(client: pg.ClientBase): Promise<RawData> {
  const q = async <T>(sql: string): Promise<T[]> => (await client.query(sql)).rows as T[];
  return {
    developers: await q<DeveloperRow>('select * from v3.developers order by handle'),
    repos: await q<RepoRow>('select * from v3.repos order by repo'),
    prs: await q<PrRow>('select * from v3.prs order by repo, number'),
    commits: await q<CommitRow>('select * from v3.commits order by sha'),
    sessions: await q<SessionRow>('select * from v3.sessions order by session_key'),
    skills: await q<SkillRow>('select * from v3.skills order by name'),
    deployEvents: await q<DeployEventRow>('select * from v3.deploy_events order by deploy_key'),
  };
}

export async function loadActiveConfig(client: pg.ClientBase): Promise<{ catalog: KpiCatalogRow[]; configVersion: ConfigVersionRow }> {
  const catalog = (await client.query('select * from v3.kpi_catalog order by num')).rows as KpiCatalogRow[];
  const { rows } = await client.query('select * from v3.config_versions where active limit 1');
  if (!rows[0]) throw new Error('no active row in v3.config_versions');
  return { catalog, configVersion: rows[0] as ConfigVersionRow };
}

/** Chunked multi-row insert — one round trip per ~200 rows, not per row. */
async function batchInsert(
  client: pg.ClientBase, table: string, cols: string[], rows: unknown[][], suffix = '',
): Promise<void> {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const tuples = chunk.map(
      (_, r) => `(${cols.map((_, c) => `$${r * cols.length + c + 1}`).join(', ')})`,
    );
    await client.query(
      `insert into v3.${table} (${cols.join(', ')}) values ${tuples.join(', ')} ${suffix}`,
      chunk.flat(),
    );
  }
}

export async function persist(client: pg.ClientBase, result: ComputeResult, configVersion: number): Promise<void> {
  // Links are config-independent: replace wholesale.
  await client.query('delete from v3.ai_pr_links');
  await batchInsert(client, 'ai_pr_links',
    ['session_id', 'repo', 'pr_number', 'developer_id', 'method', 'confidence', 'suppressed'],
    result.links.map((l) => [l.session_id, l.repo, l.pr_number, l.developer_id, l.method, l.confidence, l.suppressed]));

  // Computed rows are stamped per config version: replace that version's slice.
  for (const table of ['kpi_daily', 'index_daily', 'insights', 'recommendations']) {
    await client.query(`delete from v3.${table} where config_version = $1 and date = $2`, [configVersion, result.date]);
  }

  await batchInsert(client, 'kpi_daily',
    ['developer_id', 'date', 'kpi_id', 'index_kind', 'raw_value', 'score', 'signal_count', 'tier', 'meta', 'config_version'],
    result.perDeveloper.flatMap((dev) => dev.kpis.map((k) => [
      dev.developer_id, result.date, k.kpi_id, k.index_kind, k.raw_value, k.score,
      k.signal_count, k.tier, JSON.stringify(k.meta), configVersion,
    ])));

  await batchInsert(client, 'index_daily',
    ['developer_id', 'date', 'index_kind', 'score', 'band', 'confidence', 'gates', 'dimensions', 'config_version'],
    result.perDeveloper.flatMap((dev) => dev.indexes.map((ix) => [
      dev.developer_id, result.date, ix.index_kind, ix.score, ix.band, ix.confidence,
      JSON.stringify(ix.gates), JSON.stringify(ix.dimensions), configVersion,
    ])));

  await batchInsert(client, 'insights',
    ['developer_id', 'date', 'kpi_id', 'hypothesis', 'title', 'body', 'magnitude', 'evidence', 'channel', 'config_version'],
    result.perDeveloper.flatMap((dev) => dev.insights.map((ins) => [
      dev.developer_id, result.date, ins.kpi_id, ins.hypothesis, ins.title, ins.body,
      JSON.stringify(ins.magnitude), JSON.stringify(ins.evidence), ins.channel, configVersion,
    ])),
    'on conflict (developer_id, date, kpi_id, hypothesis, config_version) do nothing');

  await batchInsert(client, 'recommendations',
    ['developer_id', 'date', 'ref', 'title', 'rationale', 'channel', 'owner', 'targets', 'impact', 'rank', 'config_version'],
    result.perDeveloper.flatMap((dev) => dev.recommendations.map((rec) => [
      dev.developer_id, result.date, rec.ref, rec.title, rec.rationale, rec.channel,
      rec.owner, rec.targets, rec.impact, rec.rank, configVersion,
    ])));
}

/** Run the whole loop on an EXISTING client/pool connection (no new pg.Client —
 *  creating one inside a Next dev route hangs at teardown; the web app passes
 *  its pool client here). */
export async function recomputeWith(client: pg.ClientBase, version?: number): Promise<RecomputeSummary> {
  const catalog = (await client.query('select * from v3.kpi_catalog order by num')).rows as KpiCatalogRow[];
  const cvRes = version === undefined
    ? await client.query('select * from v3.config_versions where active limit 1')
    : await client.query('select * from v3.config_versions where version = $1', [version]);
  if (!cvRes.rows[0]) throw new Error('config version not found');
  const configVersion = cvRes.rows[0] as ConfigVersionRow;

  const raw = await loadRaw(client);
  const result = computeAll(raw, { catalog, configVersion });

  await client.query('begin');
  try {
    await persist(client, result, configVersion.version);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  }

  return {
    date: result.date,
    configVersion: configVersion.version,
    developers: result.perDeveloper.length,
    links: result.links.length,
    kpiRows: result.perDeveloper.reduce((a, d) => a + d.kpis.length, 0),
    insights: result.perDeveloper.reduce((a, d) => a + d.insights.length, 0),
    recommendations: result.perDeveloper.reduce((a, d) => a + d.recommendations.length, 0),
  };
}

/** CLI entry: connect, run, disconnect. (Web routes use recomputeWith + their pool.) */
export async function recompute(connectionString: string, version?: number): Promise<RecomputeSummary> {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await recomputeWith(client, version);
  } finally {
    await client.end().catch(() => {});
  }
}
