// lib/scoring/index.ts
//
// Public barrel for the deterministic scoring engine. Importers (the pipeline,
// agents-assemble, the DB layer) consume the engine through this surface only.
//
// The engine is pure: no I/O, no clock, LLM-free. The run date is always a
// parameter. config_version is stamped onto every computed row.

// Types & shared vocabulary
export * from './types';
export * from './constants';

// Numeric leaves
export * from './math';

// Config
export {
  parseScoringConfig,
  resolveScoringConfig,
  type RawIndexConfig,
} from './config';
export { DEFAULT_INDEX_CONFIG } from './defaults/index-config.default';

// Sizing
export {
  sizeScore,
  freezeThresholds,
  bucketForScore,
  bucketPr,
  needsTieBreak,
  type SizeSignals,
  type SizeThresholds,
} from './sizing';

// KPIs
export {
  computeMemberKpis,
  indexKpis,
  type PrBucketMap,
} from './kpis';

// Normalization
export {
  normalizeValue,
  normalizeKpi,
  normalizeKpis,
  winsorizeValues,
  indexNormalized,
} from './normalize';

// Index (L2/L1)
export { computeL2, computeAllL2, computeL1 } from './index-score';

// Banding & confidence
export { computeBand, type BandingInput } from './banding';
export {
  computeConfidence,
  bandForScore,
  insufficientConfidence,
} from './confidence';

// Cost lens
export { computeTokensPerPr } from './tokens-per-pr';

// Anti-gaming
export {
  applyAntiGaming,
  dropExcludedSessions,
  isLabelSpam,
  creditedSkills,
} from './anti-gaming';

// Windows
export {
  resolveWindow,
  addDays,
  isWithinWindow,
  type Period,
  type DateWindow,
  type ResolvedWindow,
  type TrendGranularity,
} from './window';

// Aggregation (FunctionAggregate is exported via `export * from './types'`)
export { aggregateFunction } from './aggregate';

// Orchestrator
export {
  computeDaily,
  type ComputeDailyArgs,
} from './compute-daily';
