// v3 read layer — plain SQL against v3.* (column truth: services/ingest/migrations).
// Everything is pinned to the ACTIVE config version and its latest compute date,
// so a Configure save + recompute flips every page atomically.

import type {
  AgentArtifactRow, Band, CoachingEventRow, ConfigVersionRow, DataPointRow, DeveloperRow,
  IndexDailyRow, InsightRow, KpiCatalogRow, KpiDailyRow, RecommendationRow,
  UserContextRow,
} from '@prism/contract';
import { v3db } from './db';

export interface ActivePin {
  version: number;
  note: string;
  date: string | null;   // latest compute date for this version (null = not computed yet)
}

export async function activePin(): Promise<ActivePin> {
  const db = v3db();
  const cv = await db.query('select version, note from v3.config_versions where active limit 1');
  if (!cv.rows[0]) throw new Error('no active config version — run npm run v3:migrate');
  const version = cv.rows[0].version as number;
  const d = await db.query('select max(date) as date from v3.index_daily where config_version = $1', [version]);
  return { version, note: cv.rows[0].note as string, date: (d.rows[0]?.date as string | null) ?? null };
}

export interface TeamRow {
  dev: DeveloperRow;
  main: IndexDailyRow | null;
  harness: IndexDailyRow | null;
  aiSharePct: number | null;
  insightCount: number;
  recCount: number;
}

export async function teamRows(pin: ActivePin): Promise<TeamRow[]> {
  const db = v3db();
  const devs = (await db.query('select * from v3.developers order by name')).rows as DeveloperRow[];
  if (pin.date === null) return devs.map((dev) => ({ dev, main: null, harness: null, aiSharePct: null, insightCount: 0, recCount: 0 }));
  const idx = (await db.query(
    'select * from v3.index_daily where config_version = $1 and date = $2', [pin.version, pin.date],
  )).rows as IndexDailyRow[];
  const kpi = (await db.query(
    `select developer_id, raw_value from v3.kpi_daily where config_version = $1 and date = $2 and kpi_id = 'ai_share'`,
    [pin.version, pin.date],
  )).rows as Array<{ developer_id: string; raw_value: number | null }>;
  const counts = (await db.query(
    `select developer_id,
       count(*) filter (where src = 'i') as insights,
       count(*) filter (where src = 'r') as recs
     from (
       select developer_id, 'i' as src from v3.insights where config_version = $1 and date = $2
       union all
       select developer_id, 'r' from v3.recommendations where config_version = $1 and date = $2
     ) x group by developer_id`,
    [pin.version, pin.date],
  )).rows as Array<{ developer_id: string; insights: number; recs: number }>;

  return devs.map((dev) => ({
    dev,
    main: idx.find((i) => i.developer_id === dev.id && i.index_kind === 'main') ?? null,
    harness: idx.find((i) => i.developer_id === dev.id && i.index_kind === 'harness') ?? null,
    aiSharePct: kpi.find((k) => k.developer_id === dev.id)?.raw_value ?? null,
    insightCount: Number(counts.find((c) => c.developer_id === dev.id)?.insights ?? 0),
    recCount: Number(counts.find((c) => c.developer_id === dev.id)?.recs ?? 0),
  }));
}

export interface DeveloperDetail {
  dev: DeveloperRow;
  main: IndexDailyRow | null;
  harness: IndexDailyRow | null;
  kpis: KpiDailyRow[];
  insights: InsightRow[];
  recommendations: RecommendationRow[];
}

export async function developerByHandle(handle: string): Promise<DeveloperRow | null> {
  const { rows } = await v3db().query('select * from v3.developers where handle = $1', [handle]);
  return (rows[0] as DeveloperRow) ?? null;
}

export async function developerDetail(devId: string, pin: ActivePin): Promise<DeveloperDetail | null> {
  const db = v3db();
  const dev = (await db.query('select * from v3.developers where id = $1', [devId])).rows[0] as DeveloperRow | undefined;
  if (!dev) return null;
  if (pin.date === null) return { dev, main: null, harness: null, kpis: [], insights: [], recommendations: [] };
  const [idx, kpis, insights, recs] = await Promise.all([
    db.query('select * from v3.index_daily where developer_id = $1 and config_version = $2 and date = $3', [devId, pin.version, pin.date]),
    db.query('select k.* from v3.kpi_daily k join v3.kpi_catalog c on c.kpi_id = k.kpi_id where k.developer_id = $1 and k.config_version = $2 and k.date = $3 order by c.num', [devId, pin.version, pin.date]),
    db.query('select * from v3.insights where developer_id = $1 and config_version = $2 and date = $3 order by kpi_id, hypothesis', [devId, pin.version, pin.date]),
    db.query('select * from v3.recommendations where developer_id = $1 and config_version = $2 and date = $3 order by rank', [devId, pin.version, pin.date]),
  ]);
  const idxRows = idx.rows as IndexDailyRow[];
  return {
    dev,
    main: idxRows.find((i) => i.index_kind === 'main') ?? null,
    harness: idxRows.find((i) => i.index_kind === 'harness') ?? null,
    kpis: kpis.rows as KpiDailyRow[],
    insights: insights.rows as InsightRow[],
    recommendations: recs.rows as RecommendationRow[],
  };
}

export async function coachingEventsFor(devId: string): Promise<CoachingEventRow[]> {
  const { rows } = await v3db().query(
    'select * from v3.coaching_events where developer_id = $1 order by ts', [devId]);
  return rows as CoachingEventRow[];
}

export async function userContextFor(devId: string): Promise<UserContextRow[]> {
  const { rows } = await v3db().query(
    'select * from v3.user_context where developer_id = $1 order by created_at desc', [devId]);
  return rows as UserContextRow[];
}

export async function kpiCatalog(): Promise<KpiCatalogRow[]> {
  const { rows } = await v3db().query('select * from v3.kpi_catalog order by num');
  return rows as KpiCatalogRow[];
}

export async function dataPoints(): Promise<DataPointRow[]> {
  const { rows } = await v3db().query('select * from v3.data_points order by id');
  return rows as DataPointRow[];
}

export async function activeConfigVersion(): Promise<ConfigVersionRow> {
  const { rows } = await v3db().query('select * from v3.config_versions where active limit 1');
  if (!rows[0]) throw new Error('no active config version');
  return rows[0] as ConfigVersionRow;
}

export async function agentArtifactsFor(devId: string, pin: ActivePin): Promise<AgentArtifactRow[]> {
  if (pin.date === null) return [];
  const { rows } = await v3db().query(
    `select * from v3.agent_artifacts
     where developer_id = $1 and date = $2 and config_version = $3
     order by kind, created_at`,
    [devId, pin.date, pin.version],
  );
  return rows as AgentArtifactRow[];
}

export async function allDevelopers(): Promise<DeveloperRow[]> {
  const { rows } = await v3db().query('select * from v3.developers order by name');
  return rows as DeveloperRow[];
}

export type { Band };
