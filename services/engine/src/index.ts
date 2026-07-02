// @prism/engine — public API. apps/web imports ONLY from here (or './run' for
// the DB-backed recompute). Everything numeric is pure, deterministic, LLM-free.

export { computeAll } from './compute';
export { normalize, pct, mean, clamp, round1 } from './normalize';
export { bandForScore, applyGates } from './banding';
export { mainConfidence, harnessConfidence, publishable } from './confidence';
export { computeLinks, linksByPr, prKey } from './link';
export { deriveWindow, activityDays, rawSize, sizeCutoffs, bucketOf, WINDOW_DAYS } from './window';
export { disableKpi, enableKpi, enabledKpis, indexWeightSum, weightOf } from './config';
export { computeIndexes } from './index-score';
export { runLinkage } from './linkage';
export { deriveInsights, recognitionInsight } from './insights';
export { deriveRecommendations } from './recommendations';
export { COURSE_CATALOG, coursesForKpis } from './courses';
export type { Course } from './courses';
export type {
  ComputeResult, ComputedLink, DeveloperComputation, EngineConfig, IndexResult,
  InsightResult, KpiResult, RawData, RecommendationResult,
} from './types';
export type { LinkageFinding } from './linkage';
export type { TeamStats } from './insights';
