// lib/connectors/blame.ts
//
// blame_snapshots refresh (Effectiveness: AI-code retention + rework, PRD §6). Two jobs:
//   1. CAPTURE — for AI-assisted merged PRs, record the lines they introduced as blame
//      snapshots (repo, file, line_hash, author_handle, ai_assisted=true, first_seen).
//      A line is keyed by (repo, file, line_hash) so re-runs upsert, never duplicate.
//   2. RE-CHECK — for snapshots older than 30 days whose alive_at_30d is still null, set
//      alive_at_30d by checking whether the line still exists in the file's current
//      blame (GitHub GraphQL blame). Lines that survive 30d count toward retention.
//
// Keyless/empty-safe: if GitHub isn't configured, refreshBlame returns an empty result
// and writes nothing. All writes go through the service-role admin client.
//
// blame_snapshots columns (validated live): function_id, employee_id, repo, file,
// line_hash, author_handle, ai_assisted, first_seen, alive_at_30d, ingested_at.

import { createHash } from 'node:crypto';
import { adminDb } from './github/db';
import { resolveEmployeeByGithubHandle } from '@/lib/connectors/identity';
import { isGithubConfigured, getInstallationOctokit, type Octokit } from './github/client';
import { splitRepo } from './github/backfill';

const THIRTY_DAYS_MS = 30 * 86_400_000;

/** Result of a blame refresh. */
export interface BlameRefreshResult {
  captured: number;
  rechecked: number;
  alive: number;
  dead: number;
  errors: string[];
}

/** A stable hash for a source line (whitespace-normalized), used as line_hash. */
export function hashLine(file: string, line: string): string {
  const normalized = line.replace(/\s+/g, ' ').trim();
  return createHash('sha1').update(`${file}\x1f${normalized}`).digest('hex');
}

/** Read the github connector's installation id from config_jsonb. */
async function loadInstallationId(functionId: string): Promise<number | null> {
  try {
    const { data } = await adminDb()
      .from('connectors')
      .select('config_jsonb')
      .eq('function_id', functionId)
      .eq('type', 'github')
      .limit(1)
      .maybeSingle();
    const cfg = (data?.config_jsonb as Record<string, unknown> | null) ?? {};
    const id = cfg.installation_id;
    if (typeof id === 'number') return id;
    const parsed = Number.parseInt(String(id ?? ''), 10);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Capture blame snapshots for AI-assisted merged PRs that don't yet have snapshots.
 * For each such PR, fetch its added lines (from the per-file patch) and upsert one
 * snapshot per added line. The added-line set is the retention denominator's source.
 */
async function captureAiLines(
  octokit: Octokit,
  functionId: string,
): Promise<{ captured: number; errors: string[] }> {
  const db = adminDb();
  let captured = 0;
  const errors: string[] = [];

  // AI-assisted merged PRs (ai_assisted is set when a confirmed AI→PR link exists, OR an
  // AI co-author commit landed). We capture for those; commits.ai_assisted is the proxy.
  let prs: AiPrLite[] = [];
  try {
    const { data } = await db
      .from('gh_prs')
      .select('id, repo, number, author_handle, ai_assisted, is_merged')
      .eq('function_id', functionId)
      .eq('ai_assisted', true)
      .eq('is_merged', true)
      .limit(200);
    prs = (data as AiPrLite[] | null) ?? [];
  } catch (e) {
    errors.push(`load ai prs: ${errMsg(e)}`);
    return { captured, errors };
  }

  for (const pr of prs) {
    const split = splitRepo(pr.repo);
    if (!split) continue;
    const employeeId = pr.author_handle
      ? await resolveEmployeeByGithubHandle(functionId, pr.author_handle)
      : null;
    try {
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
        owner: split.owner,
        repo: split.repo,
        pull_number: pr.number,
        per_page: 100,
      });
      const rows: BlameSnapshotInsert[] = [];
      for (const f of files) {
        if (!f.patch || !f.filename) continue;
        for (const line of addedLines(f.patch)) {
          rows.push({
            function_id: functionId,
            employee_id: employeeId,
            repo: pr.repo,
            file: f.filename,
            line_hash: hashLine(f.filename, line),
            author_handle: pr.author_handle ?? null,
            ai_assisted: true,
            first_seen: new Date().toISOString(),
          });
        }
      }
      if (rows.length) {
        // Dedup within this PR (same line text twice in a diff → one snapshot).
        const unique = dedupByLineHash(rows);
        const { error } = await db
          .from('blame_snapshots')
          .upsert(unique, { onConflict: 'repo,file,line_hash', ignoreDuplicates: true });
        if (error) errors.push(`pr #${pr.number} blame upsert: ${(error as { message?: string }).message ?? 'failed'}`);
        else captured += unique.length;
      }
    } catch (e) {
      errors.push(`pr #${pr.number} files: ${errMsg(e)}`);
    }
  }
  return { captured, errors };
}

/**
 * Re-check snapshots older than 30 days whose alive_at_30d is null: set it true when the
 * line still appears in the file's current content, false otherwise. Uses the file's raw
 * content (a line still present → alive). Bounded per run.
 */
async function recheckAlive(
  octokit: Octokit,
  functionId: string,
): Promise<{ rechecked: number; alive: number; dead: number; errors: string[] }> {
  const db = adminDb();
  let rechecked = 0;
  let alive = 0;
  let dead = 0;
  const errors: string[] = [];

  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  let pending: PendingBlameLite[] = [];
  try {
    const { data } = await db
      .from('blame_snapshots')
      .select('id, repo, file, line_hash, first_seen')
      .eq('function_id', functionId)
      .is('alive_at_30d', null)
      .limit(300);
    pending = ((data as PendingBlameLite[] | null) ?? []).filter(
      (s) => s.first_seen !== null && s.first_seen <= cutoff,
    );
  } catch (e) {
    errors.push(`load pending: ${errMsg(e)}`);
    return { rechecked, alive, dead, errors };
  }

  // Group by repo+file so we fetch each file's current content once.
  const byFile = new Map<string, PendingBlameLite[]>();
  for (const s of pending) {
    const key = `${s.repo}\x1f${s.file}`;
    const arr = byFile.get(key) ?? [];
    arr.push(s);
    byFile.set(key, arr);
  }

  for (const [key, snaps] of byFile) {
    const [repoSlug, file] = key.split('\x1f');
    const split = splitRepo(repoSlug ?? '');
    if (!split || !file) continue;
    let presentHashes: Set<string> | null = null;
    try {
      presentHashes = await currentFileLineHashes(octokit, split.owner, split.repo, file);
    } catch (e) {
      errors.push(`fetch ${repoSlug}/${file}: ${errMsg(e)}`);
      // File may be deleted → all its tracked AI lines are dead.
      presentHashes = new Set();
    }
    for (const s of snaps) {
      const isAlive = presentHashes.has(s.line_hash);
      try {
        const { error } = await db
          .from('blame_snapshots')
          .update({ alive_at_30d: isAlive })
          .eq('id', s.id);
        if (error) {
          errors.push(`update ${s.id}: ${(error as { message?: string }).message ?? 'failed'}`);
        } else {
          rechecked++;
          if (isAlive) alive++;
          else dead++;
        }
      } catch (e) {
        errors.push(`update ${s.id}: ${errMsg(e)}`);
      }
    }
  }

  return { rechecked, alive, dead, errors };
}

/** Fetch a file's current content and return the set of its line hashes. */
async function currentFileLineHashes(
  octokit: Octokit,
  owner: string,
  repo: string,
  file: string,
): Promise<Set<string>> {
  const res = await octokit.rest.repos.getContent({ owner, repo, path: file });
  const data = res.data as { content?: string; encoding?: string };
  if (!data.content) return new Set();
  const text = Buffer.from(data.content, (data.encoding as BufferEncoding) ?? 'base64').toString('utf8');
  const set = new Set<string>();
  for (const line of text.split('\n')) set.add(hashLine(file, line));
  return set;
}

/**
 * Refresh blame for a function: capture AI lines from AI-assisted merged PRs, then
 * re-check 30-day survival on pending snapshots. Degrades to an empty result when GitHub
 * is not configured. Never throws — collects errors.
 */
export async function refreshBlame(functionId: string): Promise<BlameRefreshResult> {
  const result: BlameRefreshResult = { captured: 0, rechecked: 0, alive: 0, dead: 0, errors: [] };
  if (!isGithubConfigured()) return result;

  const installationId = await loadInstallationId(functionId);
  if (!installationId) {
    result.errors.push('no installation_id');
    return result;
  }

  let octokit: Octokit;
  try {
    octokit = await getInstallationOctokit(installationId);
  } catch (e) {
    result.errors.push(`installation auth: ${errMsg(e)}`);
    return result;
  }

  const cap = await captureAiLines(octokit, functionId);
  result.captured = cap.captured;
  result.errors.push(...cap.errors);

  const rec = await recheckAlive(octokit, functionId);
  result.rechecked = rec.rechecked;
  result.alive = rec.alive;
  result.dead = rec.dead;
  result.errors.push(...rec.errors);

  return result;
}

// ── pure helpers ─────────────────────────────────────────────────────────────

/** Extract the added (`+`) lines from a unified-diff patch (excludes `+++` headers). */
export function addedLines(patch: string): string[] {
  const out: string[] = [];
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      out.push(raw.slice(1));
    }
  }
  return out;
}

/** De-dup blame inserts by (repo,file,line_hash) within a batch. */
function dedupByLineHash(rows: BlameSnapshotInsert[]): BlameSnapshotInsert[] {
  const seen = new Set<string>();
  const out: BlameSnapshotInsert[] = [];
  for (const r of rows) {
    const k = `${r.repo}\x1f${r.file}\x1f${r.line_hash}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── row shapes ───────────────────────────────────────────────────────────────

interface AiPrLite {
  id: string;
  repo: string;
  number: number;
  author_handle: string | null;
  ai_assisted: boolean;
  is_merged: boolean;
}

interface PendingBlameLite {
  id: string;
  repo: string;
  file: string;
  line_hash: string;
  first_seen: string | null;
}

interface BlameSnapshotInsert {
  function_id: string;
  employee_id: string | null;
  repo: string;
  file: string;
  line_hash: string;
  author_handle: string | null;
  ai_assisted: boolean;
  first_seen: string;
}
