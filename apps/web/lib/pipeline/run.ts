// lib/pipeline/run.ts
//
// THE on-demand pipeline: ingest → link → blame → assemble → computeDaily → persist.
// One call scores a function for a passed run date and lights up the views.
//
//   1. INGEST   github (if connected) · sentry (if connected). Codex/Claude Code
//               telemetry arrives through each user's authenticated OTEL connection.
//   2. LINK     linkAiToPr — correlational AI→PR association (sets gh_prs.ai_assisted)
//   3. BLAME    refreshBlame — AI-line capture + 30d retention re-check
//   4. ASSEMBLE build MemberRawRows + sizingPrs + config from the raw tables
//   5. SCORE    computeDaily (pure engine — NEVER reimplemented here)
//   6. PERSIST  upsert kpi_daily + index_daily (idempotent composite-PK writes)
//
// Every step is wrapped so a not-configured / failing connector is SKIPPED, not fatal
// (keyless-safe). The run date is always passed (no hidden clock in scoring).
//
// SERVER-ONLY: drives the service-role connectors + pipeline writers.

import {
  ingestGitHub,
  ingestSentry,
  linkAiToPr,
  refreshBlame,
} from '@/lib/connectors';
import { isConfigured } from '@/lib/config/env';
import { computeDaily } from '@/lib/scoring/compute-daily';
import { assembleMembers } from './assemble';
import { persistComputeDaily } from './persist';

// ─────────────────────────────────────────────────────────────────────────────
// Summary shape
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineStepLog {
  step: string;
  ok: boolean;
  detail: string;
}

export interface PipelineSummary {
  ok: boolean;
  functionId: string;
  date: string;
  /** members the engine produced a result for (may be 0 before GitHub discovery). */
  membersScored: number;
  /** the function-scope L1 (null when suppressed / no signal). */
  functionL1: number | null;
  /** the function-scope confidence band. */
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  /** the function-scope band (L0..L5). */
  band: string | null;
  /** row + ingest counts for the log. */
  counts: {
    employees: number;
    windowPrs: number;
    sessions: number;
    deploys: number;
    blameLines: number;
    sizingPrs: number;
    kpiRowsWritten: number;
    indexRowsWritten: number;
  };
  /** per-step log; a skipped/failed connector shows here, never aborts the run. */
  steps: PipelineStepLog[];
  errors: string[];
}

export interface RunPipelineArgs {
  functionId: string;
  /** run date 'YYYY-MM-DD' — supplied by the route; never read from a clock here. */
  date: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Run one connector ingest step under a guard so failure is logged, not fatal. */
async function step(
  steps: PipelineStepLog[],
  name: string,
  enabled: boolean,
  fn: () => Promise<string>,
): Promise<void> {
  if (!enabled) {
    steps.push({ step: name, ok: true, detail: 'skipped (not configured)' });
    return;
  }
  try {
    const detail = await fn();
    steps.push({ step: name, ok: true, detail });
  } catch (e) {
    steps.push({ step: name, ok: false, detail: errMsg(e) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// runPipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full on-demand pipeline for a function + run date. Returns a summary; never
 * throws (each step is guarded). GitHub/Sentry are skipped when unconfigured, and the
 * engine scores whatever real evidence exists (empty → Insufficient, never fabricated).
 */
export async function runPipeline(args: RunPipelineArgs): Promise<PipelineSummary> {
  const { functionId, date } = args;
  const steps: PipelineStepLog[] = [];
  const errors: string[] = [];

  // 1. INGEST — each connector guarded; not-configured ones are skipped.
  await step(steps, 'ingest:github', isConfigured('github'), async () => {
    const r = await ingestGitHub(functionId);
    if (r.errors?.length) errors.push(...r.errors.map((e) => `github: ${e}`));
    return `prs=${r.prsUpserted} commits=${r.commitsUpserted} reverts=${r.revertsMarked}`;
  });

  await step(steps, 'ingest:sentry', isConfigured('sentry'), async () => {
    const r = await ingestSentry(functionId);
    if (r.errors?.length) errors.push(...r.errors.map((e) => `sentry: ${e}`));
    return `written=${r.written} skipped=${r.skipped}`;
  });

  // 2. LINK — AI→PR association (sets gh_prs.ai_assisted). Needs GitHub raw rows; only
  //    meaningful when GitHub is configured, but it's keyless-safe to call regardless.
  await step(steps, 'link:ai_to_pr', isConfigured('github'), async () => {
    const r = await linkAiToPr(functionId);
    if (r.errors?.length) errors.push(...r.errors.map((e) => `link: ${e}`));
    return `links=${r.linksWritten} prsMarked=${r.prsMarked} sessionsMarked=${r.sessionsMarked}`;
  });

  // 3. BLAME — AI-line capture + 30d retention re-check (no-op when GitHub absent).
  await step(steps, 'blame:refresh', isConfigured('github'), async () => {
    const r = await refreshBlame(functionId);
    if (r.errors?.length) errors.push(...r.errors.map((e) => `blame: ${e}`));
    return `captured=${r.captured} rechecked=${r.rechecked} alive=${r.alive} dead=${r.dead}`;
  });

  // 4. ASSEMBLE — build scoring inputs from real raw rows and the discovered roster.
  let assembled;
  try {
    assembled = await assembleMembers(functionId, date);
    steps.push({
      step: 'assemble',
      ok: true,
      detail: `members=${assembled.members.length} windowPrs=${assembled.counts.windowPrs} sessions=${assembled.counts.sessions}`,
    });
  } catch (e) {
    // Assemble failing is fatal to scoring — surface a degraded summary, don't throw.
    steps.push({ step: 'assemble', ok: false, detail: errMsg(e) });
    return {
      ok: false,
      functionId,
      date,
      membersScored: 0,
      functionL1: null,
      confidence: 'insufficient',
      band: null,
      counts: {
        employees: 0,
        windowPrs: 0,
        sessions: 0,
        deploys: 0,
        blameLines: 0,
        sizingPrs: 0,
        kpiRowsWritten: 0,
        indexRowsWritten: 0,
      },
      steps,
      errors: [...errors, `assemble: ${errMsg(e)}`],
    };
  }

  // 5. SCORE — the pure engine. NEVER reimplemented; we only assemble + persist.
  let result;
  try {
    result = computeDaily({
      date,
      functionId,
      members: assembled.members,
      sizingPrs: assembled.sizingPrs,
      config: assembled.config,
    });
    steps.push({
      step: 'computeDaily',
      ok: true,
      detail: `kpiRows=${result.kpiDaily.length} indexRows=${result.indexDaily.length} l1=${result.function.l1 ?? 'null'}`,
    });
  } catch (e) {
    steps.push({ step: 'computeDaily', ok: false, detail: errMsg(e) });
    return {
      ok: false,
      functionId,
      date,
      membersScored: assembled.members.length,
      functionL1: null,
      confidence: 'insufficient',
      band: null,
      counts: {
        employees: assembled.counts.employees,
        windowPrs: assembled.counts.windowPrs,
        sessions: assembled.counts.sessions,
        deploys: assembled.counts.deploys,
        blameLines: assembled.counts.blameLines,
        sizingPrs: assembled.counts.sizingPrs,
        kpiRowsWritten: 0,
        indexRowsWritten: 0,
      },
      steps,
      errors: [...errors, `computeDaily: ${errMsg(e)}`],
    };
  }

  // 6. PERSIST — idempotent upserts.
  const persisted = await persistComputeDaily(result, functionId).catch((e) => ({
    kpiRows: 0,
    indexRows: 0,
    errors: [errMsg(e)],
  }));
  if (persisted.errors.length) errors.push(...persisted.errors.map((e) => `persist: ${e}`));
  steps.push({
    step: 'persist',
    ok: persisted.errors.length === 0,
    detail: `kpiRows=${persisted.kpiRows} indexRows=${persisted.indexRows}`,
  });

  return {
    // "ok" = every step ran without throwing. Optional-connector soft warnings
    // (e.g. GitHub not installed yet, Sentry not configured) are collected in
    // `errors` as non-fatal notes and do NOT mark the run failed.
    ok: steps.every((s) => s.ok),
    functionId,
    date,
    membersScored: result.members.length,
    functionL1: result.function.l1,
    confidence: result.function.confidence.band,
    band: result.function.band,
    counts: {
      employees: assembled.counts.employees,
      windowPrs: assembled.counts.windowPrs,
      sessions: assembled.counts.sessions,
      deploys: assembled.counts.deploys,
      blameLines: assembled.counts.blameLines,
      sizingPrs: assembled.counts.sizingPrs,
      kpiRowsWritten: persisted.kpiRows,
      indexRowsWritten: persisted.indexRows,
    },
    steps,
    errors,
  };
}
