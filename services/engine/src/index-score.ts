// Index assembly — MAIN (weighted Core-6, gates, bands) + HARNESS (own 0–100,
// own confidence, NO bands, never mixes into the main number).

import type { IndexConfig, KpiCatalogRow } from '@prism/contract';
import type { IndexResult, KpiResult } from './types';
import { enabledKpis, weightOf } from './config';
import { applyGates } from './banding';
import { mainConfidence, harnessConfidence, publishable } from './confidence';
import { round1 } from './normalize';

export interface IndexSignals {
  mergedPrs: number;
  sessions: number;
  aiPrs: number;
  connectedSessions: number;
  multiplierSignal: number;
}

export function computeIndexes(
  kpis: KpiResult[], catalog: KpiCatalogRow[], config: IndexConfig, signals: IndexSignals,
): IndexResult[] {
  const byId = new Map(kpis.map((k) => [k.kpi_id, k]));

  // Weighted score over enabled KPIs with non-null scores, renormalized so a
  // null (no-signal) KPI never drags the index — it just doesn't vote.
  const weighted = (index: 'main' | 'harness'): number | null => {
    let sum = 0;
    let wsum = 0;
    for (const k of enabledKpis(catalog, config, index)) {
      const r = byId.get(k.kpi_id);
      if (!r || r.score === null) continue;
      const w = weightOf(config, k.kpi_id);
      sum += r.score * w;
      wsum += w;
    }
    return wsum > 0 ? round1(sum / wsum) : null;
  };

  // Per-dimension display scores (main): weighted mean of that dimension's
  // enabled, non-null KPIs.
  const dimensions: IndexResult['dimensions'] = {};
  for (const dim of ['usage', 'efficiency', 'outcomes'] as const) {
    let sum = 0;
    let wsum = 0;
    for (const k of enabledKpis(catalog, config, 'main').filter((k) => k.dimension === dim)) {
      const r = byId.get(k.kpi_id);
      if (!r || r.score === null) continue;
      const w = weightOf(config, k.kpi_id);
      sum += r.score * w;
      wsum += w;
    }
    dimensions[dim] = wsum > 0 ? round1(sum / wsum) : null;
  }

  const mainScore = weighted('main');
  const mainConf = mainConfidence(signals.mergedPrs, signals.sessions, signals.aiPrs);
  const aiShareRaw = byId.get('ai_share')?.raw_value ?? null;

  let main: IndexResult;
  if (mainScore === null || !publishable(mainConf)) {
    main = {
      index_kind: 'main', score: null, band: null, confidence: mainConf,
      gates: { l0_forced: false, l5_capped: false, multiplier_signal: signals.multiplierSignal },
      dimensions,
    };
  } else {
    const gate = applyGates({ score: mainScore, aiSharePct: aiShareRaw, multiplierSignal: signals.multiplierSignal });
    main = {
      index_kind: 'main', score: mainScore, band: gate.band, confidence: mainConf,
      gates: { l0_forced: gate.l0_forced, l5_capped: gate.l5_capped, multiplier_signal: signals.multiplierSignal },
      dimensions,
    };
  }

  const harnessScore = weighted('harness');
  const harnessConf = harnessConfidence(signals.aiPrs, signals.connectedSessions);
  const harness: IndexResult = {
    index_kind: 'harness',
    score: publishable(harnessConf) ? harnessScore : null,
    band: null,                                    // the harness index has NO bands
    confidence: harnessConf,
    gates: { l0_forced: false, l5_capped: false, multiplier_signal: signals.multiplierSignal },
    dimensions: {},
  };

  return [main, harness];
}
