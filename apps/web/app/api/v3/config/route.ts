// POST /api/v3/config — save a NEW config version (never mutate old ones),
// activate it, and recompute every dashboard from it via the engine.
// The whole flow runs on ONE pool connection (a second pg.Client created
// inside a Next dev route hangs at teardown — lived).

import { NextResponse } from 'next/server';
import type { IndexConfig, KpiCatalogRow } from '@prism/contract';
import { indexWeightSum } from '@prism/engine';
import { recomputeWith } from '@prism/engine/run';
import { v3db } from '@/lib/v3/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  let body: { config?: IndexConfig; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const config = body.config;
  if (!config || typeof config !== 'object' || !config.weights || !Array.isArray(config.disabled)) {
    return NextResponse.json({ error: 'config must be { weights, disabled }' }, { status: 400 });
  }

  const client = await v3db().connect();
  try {
    const catalog = (await client.query('select * from v3.kpi_catalog order by num')).rows as KpiCatalogRow[];

    // Validation: each index's ENABLED weights must sum to 100 (±0.5 rounding).
    for (const index of ['main', 'harness'] as const) {
      const sum = indexWeightSum(catalog, config, index);
      if (Math.abs(sum - 100) > 0.51) {
        return NextResponse.json({ error: `${index} weights sum to ${sum.toFixed(1)} — must be 100` }, { status: 422 });
      }
    }

    await client.query('begin');
    let version: number;
    try {
      const { rows } = await client.query('select coalesce(max(version), 0) + 1 as v from v3.config_versions');
      version = rows[0].v as number;
      await client.query('update v3.config_versions set active = false where active');
      await client.query(
        'insert into v3.config_versions (version, created_at, active, config, note) values ($1, now(), true, $2, $3)',
        [version, JSON.stringify(config), body.note ?? 'Configure tab save'],
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    }

    // Recompute all computed tables from the new version, on this same connection.
    const summary = await recomputeWith(client, version);
    return NextResponse.json({ version, summary });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'save failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
