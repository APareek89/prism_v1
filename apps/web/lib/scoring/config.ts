// lib/scoring/config.ts
//
// Parse + validate a raw index_config (weights / anchors / sizing jsonb, plus an
// optional version + minSignals + winsor) into a typed, frozen ScoringConfig that
// stamps config_version onto every computed row (PRD §4.7). Validation uses zod.
//
// Pure: no I/O. The caller reads index_config from the DB and hands the jsonb here;
// when no config is provided we fall back to the canonical default (cold-start).

import { z } from 'zod';
import type { KpiId, ScoringConfig } from './types';
import { DIMENSION_KPIS, isInverted } from './constants';
import { DEFAULT_INDEX_CONFIG } from './defaults/index-config.default';

const ALL_KPI_IDS: KpiId[] = [
  ...DIMENSION_KPIS.usage,
  ...DIMENSION_KPIS.efficiency,
  ...DIMENSION_KPIS.effectiveness,
  ...DIMENSION_KPIS.proficiency,
];

const anchorSchema = z
  .object({
    floor: z.number().optional(),
    target: z.number(),
    ceil: z.number().optional(),
  })
  .strict();

const weightsSchema = z
  .object({
    usage: z.number().min(0),
    efficiency: z.number().min(0),
    effectiveness: z.number().min(0),
    proficiency: z.number().min(0),
  })
  .strict();

const sizingSchema = z
  .object({
    modulesWeight: z.number().min(0),
    blastWeight: z.number().min(0),
    coldStart: z
      .object({ sMax: z.number(), lMin: z.number() })
      .strict()
      .refine((c) => c.sMax < c.lMin, 'coldStart.sMax must be < coldStart.lMin'),
    tieBreakBand: z.number().min(0).max(1),
  })
  .strict();

const minSignalsSchema = z
  .object({
    usage: z.number().int().min(0),
    efficiency: z.number().int().min(0),
    effectiveness: z.number().int().min(0),
    proficiency: z.number().int().min(0),
  })
  .strict();

const winsorSchema = z
  .object({ lower: z.number().min(0).max(1), upper: z.number().min(0).max(1) })
  .strict()
  .refine((w) => w.lower < w.upper, 'winsor.lower must be < winsor.upper');

/** The raw jsonb shape accepted from index_config. Anchors/minSignals/winsor are
 *  optional and merged over the defaults so a partial config is valid. */
const rawConfigSchema = z
  .object({
    configVersion: z.string().min(1).optional(),
    version: z.union([z.string(), z.number()]).optional(),
    weights: weightsSchema,
    anchors: z.record(z.string(), anchorSchema).optional(),
    sizing: sizingSchema,
    minSignals: minSignalsSchema.optional(),
    winsor: winsorSchema.optional(),
  })
  .strip();

export type RawIndexConfig = z.input<typeof rawConfigSchema>;

const WEIGHT_SUM_TOLERANCE = 1e-6;

/** Validate that dimension weights sum to 1.0 (PRD §4.1). */
function assertWeightsSumToOne(w: ScoringConfig['weights']): void {
  const total = w.usage + w.efficiency + w.effectiveness + w.proficiency;
  if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(
      `index_config.weights must sum to 1.0 (got ${total.toFixed(4)})`,
    );
  }
}

/** Validate every KPI anchor matches its direction: inverted KPIs need target<ceil,
 *  higher-is-better KPIs need floor<target. */
function assertAnchorDirections(anchors: ScoringConfig['anchors']): void {
  for (const kpiId of ALL_KPI_IDS) {
    const a = anchors[kpiId];
    if (!a) throw new Error(`Missing anchor for KPI "${kpiId}"`);
    if (isInverted(kpiId)) {
      if (a.ceil === undefined) {
        throw new Error(`Inverted KPI "${kpiId}" requires anchor.ceil`);
      }
      if (!(a.target < a.ceil)) {
        throw new Error(
          `Inverted KPI "${kpiId}" requires target < ceil (got target=${a.target}, ceil=${a.ceil})`,
        );
      }
    } else {
      if (a.floor === undefined) {
        throw new Error(`Higher-is-better KPI "${kpiId}" requires anchor.floor`);
      }
      if (!(a.floor < a.target)) {
        throw new Error(
          `Higher-is-better KPI "${kpiId}" requires floor < target (got floor=${a.floor}, target=${a.target})`,
        );
      }
    }
  }
}

/** Resolve a config_version string from either the explicit field or the numeric
 *  index_config.version column. */
function resolveVersion(raw: z.infer<typeof rawConfigSchema>): string {
  if (raw.configVersion) return raw.configVersion;
  if (raw.version !== undefined) return `v${raw.version}`;
  return DEFAULT_INDEX_CONFIG.configVersion;
}

/**
 * Parse + validate a raw index_config jsonb into a typed, frozen ScoringConfig.
 * Anchors / minSignals / winsor are merged over the canonical defaults so a partial
 * config is accepted; weights + sizing are required. Throws on any invariant break.
 */
export function parseScoringConfig(raw: unknown): ScoringConfig {
  const parsed = rawConfigSchema.parse(raw);

  const anchors = { ...DEFAULT_INDEX_CONFIG.anchors };
  if (parsed.anchors) {
    for (const [k, v] of Object.entries(parsed.anchors)) {
      if (!(k in anchors)) {
        throw new Error(`Unknown KPI id in index_config.anchors: "${k}"`);
      }
      anchors[k as KpiId] = v;
    }
  }

  const config: ScoringConfig = {
    configVersion: resolveVersion(parsed),
    weights: parsed.weights,
    anchors,
    sizing: parsed.sizing,
    minSignals: parsed.minSignals ?? { ...DEFAULT_INDEX_CONFIG.minSignals },
    winsor: parsed.winsor ?? { ...DEFAULT_INDEX_CONFIG.winsor },
  };

  assertWeightsSumToOne(config.weights);
  assertAnchorDirections(config.anchors);

  return Object.freeze(config);
}

/**
 * Resolve the config to use: parse the provided raw config, or fall back to the
 * canonical default (cold-start) when none is supplied. This is the one entry point
 * compute-daily uses so a keyless / un-seeded boot still scores deterministically.
 */
export function resolveScoringConfig(raw?: unknown): ScoringConfig {
  if (raw === undefined || raw === null) {
    return DEFAULT_INDEX_CONFIG;
  }
  return parseScoringConfig(raw);
}
