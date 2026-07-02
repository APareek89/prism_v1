// Function-level rollup — display aggregation across the 10 developers (median of
// published values). Pure display math; per-person numbers stay the engine's.

import type { Band, Channel } from '@prism/contract';
import { BAND_FLOORS } from '@prism/contract';
import { v3db } from './db';
import { teamRows, type ActivePin } from './read';

export interface TopRecommendation {
  ref: string;
  title: string;
  rationale: string;
  channel: Channel;
  owner: string;
  impact: number;
  devs: number;
}

export interface LinkageHighlight {
  dev: string;
  title: string;
  body: string;
}

export interface FunctionRollup {
  medianMain: number | null;
  band: Band | null;
  confidence: number;
  dims: { usage: number | null; efficiency: number | null; outcomes: number | null };
  medianHarness: number | null;
  tokensPerPrK: number | null;   // median KPI-6 raw — TOKENS ONLY, no dollars (v2.2)
  aiSharePct: number | null;     // median KPI-1 raw
  publishedCount: number;
  total: number;
  topRecommendations: TopRecommendation[];
  linkage: LinkageHighlight[];
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 10) / 10;
};

const bandFor = (score: number): Band => {
  for (const { min, band } of BAND_FLOORS) if (score >= min) return band;
  return 'L0';
};

export async function functionRollup(pin: ActivePin): Promise<FunctionRollup> {
  const rows = await teamRows(pin);
  const published = rows.filter((r) => r.main?.score !== null && r.main !== null);
  const mains = published.map((r) => r.main!.score!) as number[];
  const medianMain = median(mains);
  const dims = {
    usage: median(rows.map((r) => r.main?.dimensions?.usage).filter((v): v is number => v != null)),
    efficiency: median(rows.map((r) => r.main?.dimensions?.efficiency).filter((v): v is number => v != null)),
    outcomes: median(rows.map((r) => r.main?.dimensions?.outcomes).filter((v): v is number => v != null)),
  };
  const medianHarness = median(rows.map((r) => r.harness?.score).filter((v): v is number => v != null));
  const confidence = median(rows.map((r) => r.main?.confidence).filter((v): v is number => v != null)) ?? 0;
  const aiSharePct = median(rows.map((r) => r.aiSharePct).filter((v): v is number => v != null));

  const db = v3db();
  let tokensPerPrK: number | null = null;
  let topRecommendations: TopRecommendation[] = [];
  let linkage: LinkageHighlight[] = [];
  if (pin.date !== null) {
    const tok = await db.query(
      `select raw_value from v3.kpi_daily where config_version = $1 and date = $2 and kpi_id = 'tokens' and raw_value is not null`,
      [pin.version, pin.date],
    );
    tokensPerPrK = median(tok.rows.map((r) => Number(r.raw_value)));

    const recs = await db.query(
      `select ref, title, rationale, channel, owner, max(impact) as impact, count(distinct developer_id) as devs
       from v3.recommendations where config_version = $1 and date = $2
       group by ref, title, rationale, channel, owner
       order by max(impact) desc limit 5`,
      [pin.version, pin.date],
    );
    topRecommendations = recs.rows.map((r) => ({
      ref: r.ref, title: r.title, rationale: r.rationale, channel: r.channel,
      owner: r.owner, impact: Number(r.impact), devs: Number(r.devs),
    }));

    const link = await db.query(
      `select d.name as dev, i.title, i.body
       from v3.insights i join v3.developers d on d.id = i.developer_id
       where i.config_version = $1 and i.date = $2 and i.kpi_id = 'linkage'
       order by d.name limit 6`,
      [pin.version, pin.date],
    );
    linkage = link.rows as LinkageHighlight[];
  }

  return {
    medianMain,
    band: medianMain === null ? null : bandFor(medianMain),
    confidence,
    dims,
    medianHarness,
    tokensPerPrK,
    aiSharePct,
    publishedCount: published.length,
    total: rows.length,
    topRecommendations,
    linkage,
  };
}
