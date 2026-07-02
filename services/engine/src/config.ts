// Config semantics for the two indexes + the Configure tab's weight rules.
//
// config.weights holds a 0–100 weight per KPI within its index; the ENABLED
// weights of each index must sum to 100 (main and harness independently).
// Deleting (disabling) a KPI without touching weights redistributes its weight
// proportionally across the remaining enabled KPIs of the SAME index.

import type { IndexConfig, KpiCatalogRow, KpiId } from '@prism/contract';

export function enabledKpis(catalog: KpiCatalogRow[], config: IndexConfig, index: 'main' | 'harness'): KpiCatalogRow[] {
  return catalog.filter(
    (k) => k.index_kind === index && !config.disabled.includes(k.kpi_id));
}

export function weightOf(config: IndexConfig, kpiId: KpiId): number {
  return config.weights[kpiId] ?? 0;
}

/** Sum of enabled weights for one index (should be 100; renormalized defensively). */
export function indexWeightSum(catalog: KpiCatalogRow[], config: IndexConfig, index: 'main' | 'harness'): number {
  return enabledKpis(catalog, config, index).reduce((a, k) => a + weightOf(config, k.kpi_id), 0);
}

/**
 * Disable a KPI and redistribute its weight proportionally across the remaining
 * ENABLED KPIs of the same index, keeping the index sum at 100.
 * Returns a NEW config (pure).
 */
export function disableKpi(catalog: KpiCatalogRow[], config: IndexConfig, kpiId: KpiId): IndexConfig {
  const row = catalog.find((k) => k.kpi_id === kpiId);
  if (!row || row.index_kind === 'diagnostic') return config;      // diagnostics carry no weight
  if (config.disabled.includes(kpiId)) return config;
  const index = row.index_kind;
  const remaining = catalog.filter(
    (k) => k.index_kind === index && k.kpi_id !== kpiId && !config.disabled.includes(k.kpi_id));
  const freed = config.weights[kpiId] ?? 0;
  const remainingSum = remaining.reduce((a, k) => a + (config.weights[k.kpi_id] ?? 0), 0);
  const weights = { ...config.weights };
  delete weights[kpiId];
  if (remaining.length && remainingSum > 0) {
    for (const k of remaining) {
      weights[k.kpi_id] = roundW(((config.weights[k.kpi_id] ?? 0) / remainingSum) * (remainingSum + freed));
    }
    // Fix rounding drift so the index sums to exactly 100.
    const sum = remaining.reduce((a, k) => a + (weights[k.kpi_id] ?? 0), 0);
    const drift = roundW(100 - sum);
    if (drift !== 0 && remaining[0]) {
      weights[remaining[0].kpi_id] = roundW((weights[remaining[0].kpi_id] ?? 0) + drift);
    }
  }
  return { weights, disabled: [...config.disabled, kpiId] };
}

/** Re-enable a KPI: give it back its default share by scaling everything to 100. */
export function enableKpi(catalog: KpiCatalogRow[], config: IndexConfig, kpiId: KpiId, defaultWeight: number): IndexConfig {
  if (!config.disabled.includes(kpiId)) return config;
  const row = catalog.find((k) => k.kpi_id === kpiId);
  if (!row) return config;
  const disabled = config.disabled.filter((d) => d !== kpiId);
  const weights = { ...config.weights, [kpiId]: defaultWeight };
  const peers = catalog.filter((k) => k.index_kind === row.index_kind && !disabled.includes(k.kpi_id));
  const sum = peers.reduce((a, k) => a + (weights[k.kpi_id] ?? 0), 0);
  if (sum > 0) for (const k of peers) weights[k.kpi_id] = roundW(((weights[k.kpi_id] ?? 0) / sum) * 100);
  return { weights, disabled };
}

const roundW = (n: number) => Math.round(n * 10) / 10;
