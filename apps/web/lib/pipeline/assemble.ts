// lib/pipeline/assemble.ts
//
// THE ingest→score bridge. For a functionId + run date it reads the raw evidence
// tables (gh_prs / gh_commits / cc_sessions / blame_snapshots / deploys / incidents /
// pr_ai_link) and assembles the EXACT `MemberRawRows` shape the scoring engine
// (lib/scoring/types.ts) consumes — one per active employee — plus the trailing-90-day
// sizing PRs and the active index_config translated into a scoring `config` arg.
//
// CONTRACT (architecture §0.4 / no-dummy-data): every value is mapped from a real row
// or left at a HONEST no-signal default (0 / false / []). The scoring engine treats
// those as "no signal" (null KPI, Insufficient confidence) — it never fabricates a
// number. Columns referenced here are validated against the live DB (limit 0).
//
// SERVER-ONLY: reads via the service-role admin client (RLS-bypassing, pipeline path).

import { createAdminClient } from '@/lib/supabase/admin';
import { WINDOW_DAYS, SIZING_WINDOW_DAYS } from '@/lib/config/constants';
import type {
  DeployRow,
  MemberRawRows,
  PrRow,
  SessionRow,
  SkillAuthorshipRow,
} from '@/lib/scoring/types';
import type { RawIndexConfig } from '@/lib/scoring/config';
import {
  derivePrSignals,
  type BlameSignalInput,
  type CommitSignalInput,
  type DerivedPrSignals,
  type PrSignalInput,
} from './pr-signals';
import { reconcileStoredConfig } from './config-reconcile';
import { getProcessingPolicy } from '@/lib/configuration/policy';

const DAY_MS = 86_400_000;
const REVERT_WINDOW_MS = 14 * DAY_MS;
const RETENTION_AGE_MS = 30 * DAY_MS;

// ─────────────────────────────────────────────────────────────────────────────
// Loose admin query surface (the github/db AdminFilter lacks .gte/.lt/.in we need).
// Same cast pattern the sentry connector + lib/db read layer use while the generated
// Database type stays a placeholder.
// ─────────────────────────────────────────────────────────────────────────────
type DbResult = Promise<{ data: unknown; error: { message?: string } | null }>;
interface LooseChain extends DbResult {
  eq: (col: string, val: unknown) => LooseChain;
  in: (col: string, vals: readonly unknown[]) => LooseChain;
  gte: (col: string, val: unknown) => LooseChain;
  lte: (col: string, val: unknown) => LooseChain;
  lt: (col: string, val: unknown) => LooseChain;
  is: (col: string, val: unknown) => LooseChain;
  order: (col: string, opts?: unknown) => LooseChain;
  select: (cols: string) => LooseChain;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
}
interface LooseDb {
  from: (table: string) => LooseChain;
}
function looseDb(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}

/** Narrow a loose `{data,error}` to plain rows; empty on error (empty-DB safe). */
function rows(result: { data: unknown; error: unknown }): Record<string, unknown>[] {
  if (result.error || !Array.isArray(result.data)) return [];
  return result.data as Record<string, unknown>[];
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function bool(v: unknown): boolean {
  return v === true;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function ms(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}
/** ISO day-key (YYYY-MM-DD, UTC) for a timestamp, or null. */
function dayKey(v: unknown): string | null {
  const t = ms(v);
  return t === null ? null : new Date(t).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Window math (anchored on the passed run date — NO hidden clock)
// ─────────────────────────────────────────────────────────────────────────────

interface Bounds {
  /** run date at 00:00:00 UTC. */
  runMs: number;
  /** inclusive ISO lower bound for the 28d compute window. */
  computeSince: string;
  /** inclusive ISO lower bound for the 90d sizing window. */
  sizingSince: string;
  /** ISO upper bound (end of the run day, UTC). */
  until: string;
}

/** Build trailing windows ending at the END of the passed run date (UTC). */
function boundsFor(date: string, measurementStartDate: string | null = null): Bounds {
  const runMs = Date.parse(`${date}T00:00:00.000Z`);
  const endOfDay = runMs + DAY_MS - 1;
  const measurementStartMs = measurementStartDate
    ? Date.parse(`${measurementStartDate}T00:00:00.000Z`)
    : Number.NEGATIVE_INFINITY;
  return {
    runMs,
    computeSince: new Date(Math.max(endOfDay - WINDOW_DAYS * DAY_MS, measurementStartMs)).toISOString(),
    sizingSince: new Date(Math.max(endOfDay - SIZING_WINDOW_DAYS * DAY_MS, measurementStartMs)).toISOString(),
    until: new Date(endOfDay).toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Active employees (only rows provisioned from real identity sources)
// ─────────────────────────────────────────────────────────────────────────────

interface ActiveEmployee {
  id: string;
  github_handle: string | null;
  name: string;
}

/**
 * List active employees for a function. An empty roster is an honest no-data state;
 * the pipeline never creates a placeholder member to force a score.
 */
export async function listActiveEmployees(functionId: string): Promise<ActiveEmployee[]> {
  const db = looseDb();
  const raw = rows(
    await db
      .from('employees')
      .select('id, github_handle, name, active, function_id')
      .eq('function_id', functionId)
      .eq('active', true),
  );
  return raw.map((r) => ({
    id: String(r.id),
    github_handle: str(r.github_handle),
    name: typeof r.name === 'string' ? r.name : '',
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw-row readers (scoped to the function + window; partitioned by employee_id)
// ─────────────────────────────────────────────────────────────────────────────

interface PrDbRow {
  id: string;
  employee_id: string | null;
  repo: unknown;
  author_handle: unknown;
  additions: unknown;
  merge_sha: unknown;
  files: unknown;
  hunks: unknown;
  modules: unknown;
  blast: unknown;
  is_merged: unknown;
  ai_assisted: unknown;
  merged_at: unknown;
  created_at: unknown;
  reverted_at: unknown;
  feature_label: unknown;
}

/** The gh_prs columns every reader selects (kept in one place so the per-PR signal
 *  join and sizing read the same shape). Validated live (limit 0). */
const PR_COLS =
  'id, employee_id, repo, author_handle, additions, merge_sha, files, hunks, modules, blast, is_merged, ai_assisted, merged_at, created_at, reverted_at, feature_label';

/** Merged-or-created-in-window PRs for the function. (28d compute window.) */
async function loadWindowPrs(functionId: string, b: Bounds): Promise<PrDbRow[]> {
  const db = looseDb();
  // We want PRs whose merge OR creation lands in the window. Two passes (the loose
  // surface has no OR), de-duped by id, since a PR could match on either column.
  const byMerged = rows(
    await db
      .from('gh_prs')
      .select(PR_COLS)
      .eq('function_id', functionId)
      .gte('merged_at', b.computeSince)
      .lte('merged_at', b.until),
  );
  const byCreated = rows(
    await db
      .from('gh_prs')
      .select(PR_COLS)
      .eq('function_id', functionId)
      .gte('created_at', b.computeSince)
      .lte('created_at', b.until),
  );
  const byId = new Map<string, PrDbRow>();
  for (const r of [...byMerged, ...byCreated]) byId.set(String(r.id), r as unknown as PrDbRow);
  return [...byId.values()];
}

/** Trailing-90-day MERGED PRs (function-wide) for the frozen S/M/L sizing tertiles. */
async function loadSizingPrs(functionId: string, b: Bounds): Promise<PrDbRow[]> {
  const db = looseDb();
  return rows(
    await db
      .from('gh_prs')
      .select(PR_COLS)
      .eq('function_id', functionId)
      .eq('is_merged', true)
      .gte('merged_at', b.sizingSince)
      .lte('merged_at', b.until),
  ) as unknown as PrDbRow[];
}

interface SessionDbRow {
  id: string;
  employee_id: string | null;
  session_id: unknown;
  ts: unknown;
  turns: unknown;
  tokens_in: unknown;
  tokens_out: unknown;
  cache_read: unknown;
  cache_creation: unknown;
  suggestions_offered: unknown;
  suggestions_accepted: unknown;
  skills_used: unknown;
  linked_pr: unknown;
  provider: unknown;
}

/** CC sessions whose `ts` lands in the 28d compute window. */
async function loadWindowSessions(functionId: string, b: Bounds): Promise<SessionDbRow[]> {
  const db = looseDb();
  return rows(
    await db
      .from('cc_sessions')
      .select(
        'id, employee_id, session_id, ts, turns, tokens_in, tokens_out, cache_read, cache_creation, suggestions_offered, suggestions_accepted, skills_used, linked_pr, provider',
      )
      .eq('function_id', functionId)
      .gte('ts', b.computeSince)
      .lte('ts', b.until),
  ) as unknown as SessionDbRow[];
}

interface DeployDbRow {
  id: string;
  sha: unknown;
  ai_assisted: unknown;
  change_failed: unknown;
  ts: unknown;
}

/** Deploys (function-scoped — there is no employee_id on deploys) in the window. */
async function loadWindowDeploys(functionId: string, b: Bounds): Promise<DeployDbRow[]> {
  const db = looseDb();
  return rows(
    await db
      .from('deploys')
      .select('id, sha, ai_assisted, change_failed, ts, function_id')
      .eq('function_id', functionId)
      .gte('ts', b.computeSince)
      .lte('ts', b.until),
  ) as unknown as DeployDbRow[];
}

interface BlameDbRow {
  employee_id: string | null;
  author_handle: string | null;
  repo: unknown;
  ai_assisted: unknown;
  alive_at_30d: unknown;
  first_seen: unknown;
}

/** AI-attributed blame lines first seen in the window (retention/rework signal).
 *  Read across the 90d sizing window so 30d-retention has room; the per-PR
 *  attribution (pr-signals) restricts to the author's merged PRs. */
async function loadWindowBlame(functionId: string, b: Bounds): Promise<BlameDbRow[]> {
  const db = looseDb();
  return rows(
    await db
      .from('blame_snapshots')
      .select('employee_id, author_handle, repo, ai_assisted, alive_at_30d, first_seen, function_id')
      .eq('function_id', functionId)
      .eq('ai_assisted', true)
      .gte('first_seen', b.sizingSince)
      .lte('first_seen', b.until),
  ) as unknown as BlameDbRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// gh_commits + pr_ai_link readers (per-PR signal joins — validated live)
// ─────────────────────────────────────────────────────────────────────────────

interface CommitDbRow {
  pr_id: string | null;
  repo: unknown;
  author_handle: string | null;
  ts: unknown;
  ai_assisted: unknown;
}

/** Commits whose ts lands in the 28d compute window (agentic-majority + rework +
 *  self-revert detectors). Function-scoped. */
async function loadWindowCommits(functionId: string, b: Bounds): Promise<CommitDbRow[]> {
  const db = looseDb();
  return rows(
    await db
      .from('gh_commits')
      .select('pr_id, repo, author_handle, ts, ai_assisted, function_id')
      .eq('function_id', functionId)
      .gte('ts', b.computeSince)
      .lte('ts', b.until),
  ) as unknown as CommitDbRow[];
}

interface PrAiLinkDbRow {
  pr_id: string | null;
  cc_session_id: string | null;
}

/** All pr_ai_link rows for the function → the set of PR ids with a confirmed AI link
 *  (drives `aiLinked`, OR'd with gh_prs.ai_assisted). Function-scoped; no window
 *  filter (a link is a stable association, cheap to read whole for one function). */
async function loadPrAiLinks(functionId: string): Promise<PrAiLinkDbRow[]> {
  const db = looseDb();
  return rows(
    await db
      .from('pr_ai_link')
      .select('pr_id, cc_session_id, function_id')
      .eq('function_id', functionId),
  ) as unknown as PrAiLinkDbRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Row mappers (DB columns → scoring input types — EXACT shapes from lib/scoring/types)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map one gh_prs row → the scoring `PrRow`. The connector stores files/hunks/modules
 * (RAW; sizing re-derives S/M/L), blast (>0 ⇒ 1), is_merged, ai_assisted, reverted_at,
 * feature_label. The per-PR Effectiveness/agentic signals that have no single column
 * (aiLinesMerged/aiLinesAliveAt30d, agenticMajority, defectReworkWithin14d,
 * isSelfRevert, and the confirmed aiLinked) are derived in pr-signals.ts from the
 * joined gh_commits / pr_ai_link / blame_snapshots rows and passed in via `derived`.
 *
 * `aiLinked` is the OR of the confirmed pr_ai_link (derived.aiLinked) and the
 * connector's own gh_prs.ai_assisted flag — either evidence path lights the signal.
 * When `derived` is absent (e.g. the 90d sizing PRs, where per-PR signals are unused —
 * sizing only reads files/hunks/modules/blast) every derived signal is the honest
 * no-signal default, exactly as before.
 */
function mapPr(r: PrDbRow, derived?: DerivedPrSignals): PrRow {
  const isMerged = bool(r.is_merged);
  const mergedMs = ms(r.merged_at);
  const revertedMs = ms(r.reverted_at);
  // Fallback revert flag when no derived map is supplied (sizing PRs).
  const revertedWithin14dFallback =
    revertedMs !== null &&
    mergedMs !== null &&
    revertedMs >= mergedMs &&
    revertedMs - mergedMs <= REVERT_WINDOW_MS;

  return {
    prId: String(r.id),
    files: num(r.files),
    hunks: num(r.hunks),
    modules: num(r.modules),
    blast: num(r.blast) > 0 ? 1 : 0,
    isMerged,
    aiLinked: (derived?.aiLinked ?? false) || bool(r.ai_assisted),
    revertedWithin14d: derived?.revertedWithin14d ?? revertedWithin14dFallback,
    aiLinesMerged: derived?.aiLinesMerged ?? 0,
    aiLinesAliveAt30d: derived?.aiLinesAliveAt30d ?? 0,
    agenticMajority: derived?.agenticMajority ?? false,
    defectReworkWithin14d: derived?.defectReworkWithin14d ?? false,
    isSelfRevert: derived?.isSelfRevert ?? false,
    hasFeatureLabel: str(r.feature_label) !== null,
  };
}

/** Build the `PrSignalInput` view pr-signals.ts consumes from a gh_prs db row. */
function toPrSignalInput(r: PrDbRow): PrSignalInput {
  return {
    prId: String(r.id),
    employeeId: str(r.employee_id),
    authorHandle: str(r.author_handle),
    repo: str(r.repo),
    additions: num(r.additions),
    isMerged: bool(r.is_merged),
    mergedMs: ms(r.merged_at),
    revertedMs: ms(r.reverted_at),
  };
}

/** Map one cc_sessions row → the scoring `SessionRow`. */
function mapSession(r: SessionDbRow, includeTokens: boolean, includePrLink: boolean): SessionRow {
  const skills = Array.isArray(r.skills_used)
    ? (r.skills_used as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  return {
    sessionId: typeof r.session_id === 'string' ? r.session_id : String(r.id),
    linkedPrId: includePrLink ? str(r.linked_pr) : null,
    day: dayKey(r.ts) ?? '',
    turns: num(r.turns),
    tokensIn: includeTokens ? num(r.tokens_in) : 0,
    tokensOut: includeTokens ? num(r.tokens_out) : 0,
    cacheRead: includeTokens ? num(r.cache_read) : 0,
    cacheCreation: includeTokens ? num(r.cache_creation) : 0,
    suggestionsOffered: num(r.suggestions_offered),
    suggestionsAccepted: num(r.suggestions_accepted),
    skillsUsed: skills,
    // producedOutput: a session that touched a skill or linked to a PR produced output.
    producedOutput: skills.length > 0 || (includePrLink && str(r.linked_pr) !== null),
    // excludedFromAiRates: an unbound (employee_id null) stream is BYO/unmatched.
    excludedFromAiRates: str(r.employee_id) === null,
  };
}

/** Map one deploys row → the scoring `DeployRow`. */
function mapDeploy(r: DeployDbRow): DeployRow {
  return {
    deployId: String(r.id),
    aiAssisted: bool(r.ai_assisted),
    changeFailed: bool(r.change_failed),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// workingDays — the cadence denominator (deterministic, never fabricated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Distinct UTC days in the 28d window on which this member showed ANY activity
 * (a PR created/merged or a session). Capped to WINDOW_DAYS. This is the honest
 * denominator for tool_session_cadence: active-days ÷ days-the-person-was-active.
 * A member with no rows yields 0 (and the cadence KPI is then null, not fabricated).
 */
function workingDaysFor(prs: PrDbRow[], sessions: SessionDbRow[]): number {
  const days = new Set<string>();
  for (const p of prs) {
    const d1 = dayKey(p.created_at);
    if (d1) days.add(d1);
    const d2 = dayKey(p.merged_at);
    if (d2) days.add(d2);
  }
  for (const s of sessions) {
    const d = dayKey(s.ts);
    if (d) days.add(d);
  }
  return Math.min(days.size, WINDOW_DAYS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Active index_config → scoring config arg
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the active (highest-version) index_config for the function and translate it
 * into the scoring `RawIndexConfig` arg via `reconcileStoredConfig`.
 *
 * The stored jsonb does NOT match the scoring shapes 1:1 (verified against migration
 * 0021 + the live row): `weights_jsonb` matches, but `anchors_jsonb` uses non-canonical
 * KPI keys (e.g. `iterations_to_merge`, `suggestion_acceptance`, `skill_file_leverage`)
 * plus an `inverted` field the strict scoring anchorSchema rejects, and `sizing_jsonb`
 * is DB-shaped (`{weights,thresholds,tie_break_pct}`). The reconciler maps the anchor
 * keys, drops `inverted`, and translates the sizing shape — so the STORED weights,
 * anchors, and sizing are honored, with per-field fallback to the canonical defaults
 * for anything absent/invalid. resolveScoringConfig then re-validates the assembled
 * RawIndexConfig with zod. When no config row exists we return undefined → cold-start
 * default. NEVER throws.
 */
export async function loadScoringConfig(functionId: string): Promise<RawIndexConfig | undefined> {
  const db = looseDb();
  const row = (
    await db
      .from('index_config')
      .select('version, weights_jsonb, anchors_jsonb, sizing_jsonb, function_id')
      .eq('function_id', functionId)
      .order('version', { ascending: false })
      .maybeSingle()
  ).data as {
    version?: unknown;
    weights_jsonb?: unknown;
    anchors_jsonb?: unknown;
    sizing_jsonb?: unknown;
  } | null;

  if (!row) return undefined;

  return reconcileStoredConfig(row);
}

// ─────────────────────────────────────────────────────────────────────────────
// assembleMembers — the public entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface AssembledInputs {
  members: MemberRawRows[];
  sizingPrs: PrRow[];
  config: RawIndexConfig | undefined;
  /** simple counts for the pipeline log. */
  counts: {
    employees: number;
    windowPrs: number;
    sessions: number;
    deploys: number;
    blameLines: number;
    sizingPrs: number;
  };
}

/**
 * Attribute each deploy to an employee. deploys carries NO employee_id, so we join
 * deploys.sha → gh_prs.merge_sha (the PR's merge commit) → gh_prs.employee_id. Falls
 * back to the single self/first member for any deploy whose sha doesn't resolve, so the
 * single-person demo keeps its change-failure signal. Returns employeeId → DeployRow[].
 */
function attributeDeploys(
  deployDbRows: DeployDbRow[],
  prDbRows: PrDbRow[],
  fallbackEmployeeId: string | null,
): Map<string, DeployRow[]> {
  // merge_sha → employee_id (only PRs that have both a merge_sha and a resolved author).
  const empBySha = new Map<string, string>();
  for (const p of prDbRows) {
    const sha = str(p.merge_sha);
    const emp = str(p.employee_id);
    if (sha && emp) empBySha.set(sha.toLowerCase(), emp);
  }

  const out = new Map<string, DeployRow[]>();
  const push = (empId: string, dep: DeployRow) => {
    const arr = out.get(empId) ?? [];
    arr.push(dep);
    out.set(empId, arr);
  };

  for (const d of deployDbRows) {
    const sha = str(d.sha);
    const resolved = sha ? empBySha.get(sha.toLowerCase()) ?? null : null;
    const empId = resolved ?? fallbackEmployeeId;
    if (empId === null) continue; // no member to attribute to (no self yet) → drop
    push(empId, mapDeploy(d));
  }
  return out;
}

/**
 * Assemble the full `computeDaily` inputs for a function on a run date. Lists active
 * employees (self ensured first), reads the windowed raw evidence, partitions it by
 * employee_id, and maps each partition into `MemberRawRows`. Per-PR Effectiveness +
 * agentic signals are derived (pr-signals.ts) from the joined gh_commits / pr_ai_link /
 * blame_snapshots rows and merged into each PrRow. Deploys (no employee_id) are
 * attributed by sha→PR author, falling back to the self/first member.
 */
export async function assembleMembers(functionId: string, date: string): Promise<AssembledInputs> {
  const [employees, processingPolicy] = await Promise.all([
    listActiveEmployees(functionId),
    getProcessingPolicy(functionId),
  ]);
  const b = boundsFor(date, processingPolicy.measurementStartDate);

  const [prDbRows, sessionDbRows, deployDbRows, sizingDbRows, commitDbRows, linkDbRows] =
    await Promise.all([
      loadWindowPrs(functionId, b),
      loadWindowSessions(functionId, b),
      loadWindowDeploys(functionId, b),
      loadSizingPrs(functionId, b),
      loadWindowCommits(functionId, b),
      loadPrAiLinks(functionId),
    ]);
  const blameDbRows = await loadWindowBlame(functionId, b);
  const effectivePrRows = processingPolicy.enabled('github.reverts')
    ? prDbRows
    : prDbRows.map((row) => ({ ...row, reverted_at: null }));
  const effectiveSessions = sessionDbRows.filter((row) => {
    const provider = str(row.provider) === 'codex' ? 'codex' : 'claude';
    return processingPolicy.enabled(`${provider === 'codex' ? 'llm' : 'claude'}.session_metadata`)
      || processingPolicy.enabled(`${provider === 'codex' ? 'llm' : 'claude'}.token_usage`);
  });
  const allowedLinkedSessionIds = new Set(effectiveSessions.filter((row) => {
    const codex = str(row.provider) === 'codex';
    return processingPolicy.enabled(codex ? 'llm.pr_link' : 'claude.pr_link');
  }).map((row) => String(row.id)));
  const effectiveLinkRows = linkDbRows.filter((row) => row.cc_session_id && allowedLinkedSessionIds.has(String(row.cc_session_id)));
  const effectiveDeploys = processingPolicy.enabled('sentry.incidents') ? deployDbRows : [];

  // ── Derive per-PR signals (pure) from the joined evidence ──────────────────
  const commits: CommitSignalInput[] = commitDbRows.map((c) => ({
    prId: str(c.pr_id),
    repo: str(c.repo),
    authorHandle: str(c.author_handle),
    tsMs: ms(c.ts),
    aiAssisted: bool(c.ai_assisted),
  }));
  const blame: BlameSignalInput[] = blameDbRows.map((bl) => ({
    repo: str(bl.repo),
    authorHandle: str(bl.author_handle),
    aiAssisted: bool(bl.ai_assisted),
    aliveAt30d: bl.alive_at_30d === null ? null : bool(bl.alive_at_30d),
  }));
  const linkedPrIds = new Set<string>();
  for (const l of effectiveLinkRows) {
    const id = str(l.pr_id);
    if (id) linkedPrIds.add(id);
  }
  const derived = derivePrSignals({
    prs: effectivePrRows.map(toPrSignalInput),
    commits,
    blame,
    linkedPrIds,
  });

  // Partition PRs / sessions by employee_id.
  const prsByEmp = groupBy(effectivePrRows, (r) => str(r.employee_id));
  const sessByEmp = groupBy(effectiveSessions, (r) => str(r.employee_id));

  // Deploys: sha→PR-author attribution, fall back to the self/first member.
  const selfId = employees[0]?.id ?? null;
  const deploysByEmp = attributeDeploys(effectiveDeploys, effectivePrRows, selfId);

  // skills authored: NOT yet a raw table (M3 authorship capture). Empty for every
  // member today → Proficiency authorship KPIs report no signal, never fabricated.
  const skillsByEmp = (_empId: string): SkillAuthorshipRow[] => [];

  const members: MemberRawRows[] = employees.map((emp) => {
    const empPrs = prsByEmp.get(emp.id) ?? [];
    const empSessions = sessByEmp.get(emp.id) ?? [];
    return {
      meta: {
        memberId: emp.id,
        workingDays: workingDaysFor(empPrs, empSessions),
      },
      prs: empPrs.map((r) => mapPr(r, derived.get(String(r.id)))),
      sessions: empSessions.map((row) => {
        const codex = str(row.provider) === 'codex';
        return mapSession(
          row,
          processingPolicy.enabled(codex ? 'llm.token_usage' : 'claude.token_usage'),
          processingPolicy.enabled(codex ? 'llm.pr_link' : 'claude.pr_link'),
        );
      }),
      deploys: deploysByEmp.get(emp.id) ?? [],
      skills: skillsByEmp(emp.id),
    };
  });

  // sizingPrs only feed S/M/L tertiles (files/hunks/modules/blast) — no per-PR signal
  // needed, so mapPr is called without a derived map (honest defaults there).
  const sizingPrs: PrRow[] = sizingDbRows.map((r) => mapPr(r));
  const config = await loadScoringConfig(functionId);

  return {
    members,
    sizingPrs,
    config,
    counts: {
      employees: employees.length,
      windowPrs: effectivePrRows.length,
      sessions: effectiveSessions.length,
      deploys: effectiveDeploys.length,
      blameLines: blameDbRows.length,
      sizingPrs: sizingDbRows.length,
    },
  };
}

/** Group rows by a string key (null keys are dropped — unbound rows aren't a member). */
function groupBy<T>(items: T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    if (k === null) continue;
    const arr = out.get(k) ?? [];
    arr.push(it);
    out.set(k, arr);
  }
  return out;
}
