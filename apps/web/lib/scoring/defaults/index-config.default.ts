// lib/scoring/defaults/index-config.default.ts
//
// The canonical default ScoringConfig — the cold-start fallback used before the
// per-cohort anchors are calibrated and frozen (PRD §4.4). This object is the
// single source of truth seeded as index_config v1 (architecture §0.4, §3 mig 0021).
//
// Anchors: where PRD §4.4 pins a value we use it verbatim; the rest are sensible
// DEFAULTS we chose and FLAG inline (and in the build report). All anchors are
// admin-editable config, so flagged defaults are easy to recalibrate.

import type { KpiAnchor, KpiId, ScoringConfig } from '../types';
import {
  COLD_START_SIZING,
  DEFAULT_MIN_SIGNALS,
  SIZE_BLAST_WEIGHT,
  SIZE_MODULES_WEIGHT,
  SIZE_TIE_BREAK_BAND,
  WINSOR,
} from '../constants';

// PRD §4.4 pinned cold-start anchors (verbatim):
//   - AI-assisted share        floor .5  / target 1.0
//   - iterations-to-merge      target 3  / ceil 12        (inverted)
//   - skill-leverage           floor 0   / target +0.2
//   - retention @30d           floor .2  / target .7
//   - tokens/PR                target 30000 / ceil 90000  (inverted; surfaced as the cost lens)
//
// FLAGGED DEFAULTS (not pinned by the PRD — chosen here, all admin-editable):
//   - agentic_depth_share        floor .3  / target .8   [FLAG] proxy of AI-share shape
//   - tool_session_cadence       floor .3  / target .8   [FLAG] active-coding-days ratio
//   - suggestion_acceptance_rate floor .4  / target .8   [FLAG] accept rate is rarely >.85
//   - merged_without_revert_rate floor .8  / target .98  [FLAG] reverts are rare; tight band
//   - change_failure_rate        target .05 / ceil .30   [FLAG][inverted] DORA elite ~0–.15
//   - defect_rework_rate         target .05 / ceil .30   [FLAG][inverted] rework on same hunks
//   - distinct_skills_authored   floor 0   / target 3    [FLAG] 3 authored skills = strong
//   - multiplier_signal          floor 0   / target 1    [FLAG] >=1 reused skill saturates

const DEFAULT_ANCHORS: Record<KpiId, KpiAnchor> = {
  // Usage / AI-depth
  ai_assisted_pr_share: { floor: 0.5, target: 1.0 }, // PRD §4.4
  agentic_depth_share: { floor: 0.3, target: 0.8 }, // [FLAG] default
  tool_session_cadence: { floor: 0.3, target: 0.8 }, // [FLAG] default

  // Efficiency
  ai_iterations_to_merge: { target: 3, ceil: 12 }, // PRD §4.4 (inverted)
  suggestion_acceptance_rate: { floor: 0.4, target: 0.8 }, // [FLAG] default
  tokens_to_shipped: { target: 30000, ceil: 90000 }, // PRD §4.4 (inverted, cost lens)

  // Effectiveness
  merged_without_revert_rate: { floor: 0.8, target: 0.98 }, // [FLAG] default
  ai_code_retention_30d: { floor: 0.2, target: 0.7 }, // PRD §4.4
  change_failure_rate: { target: 0.05, ceil: 0.3 }, // [FLAG] default (inverted)
  defect_rework_rate: { target: 0.05, ceil: 0.3 }, // [FLAG] default (inverted)

  // Proficiency
  effective_skill_leverage: { floor: 0, target: 0.2 }, // PRD §4.4 (+0.2 target)
  distinct_skills_authored: { floor: 0, target: 3 }, // [FLAG] default
  multiplier_signal: { floor: 0, target: 1 }, // [FLAG] default
};

/** Canonical default scoring config (config_version "v1"). */
export const DEFAULT_INDEX_CONFIG: ScoringConfig = {
  configVersion: 'v1',
  // PRD §4.1 — Usage .10 / Efficiency .25 / Effectiveness .40 / Proficiency .25.
  weights: {
    usage: 0.1,
    efficiency: 0.25,
    effectiveness: 0.4,
    proficiency: 0.25,
  },
  anchors: DEFAULT_ANCHORS,
  sizing: {
    modulesWeight: SIZE_MODULES_WEIGHT,
    blastWeight: SIZE_BLAST_WEIGHT,
    coldStart: { sMax: COLD_START_SIZING.sMax, lMin: COLD_START_SIZING.lMin },
    tieBreakBand: SIZE_TIE_BREAK_BAND,
  },
  minSignals: { ...DEFAULT_MIN_SIGNALS },
  winsor: { lower: WINSOR.lower, upper: WINSOR.upper },
};
