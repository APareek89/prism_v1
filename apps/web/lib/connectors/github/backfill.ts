// lib/connectors/github/backfill.ts
//
// The GitHub ingestion core. For each repo in scope it:
//   1. loads the active index_config sizing policy (ignore/sensitive globs + weights),
//   2. paginates merged + open PRs (REST), newest first, bounded by a lookback window,
//   3. fetches each PR's per-file diff, runs diff.ts → sizing.ts (RAW size only),
//   4. resolves author_handle → employee_id via the identity chokepoint,
//   5. UPSERTS gh_prs (on repo,number) and gh_commits (on repo,sha) via the service-role
//      client, then runs revert detection and stamps gh_prs.reverted_at.
//
// Writes ONLY real ingested rows (no-dummy-data invariant). Keyless/empty-safe: if the
// App is not configured the caller short-circuits before reaching here. Per-repo errors
// are collected, not thrown, so one bad repo doesn't abort the function's backfill.
//
// Column source of truth (validated against the live DB, limit 0):
//   gh_prs:     repo, number, function_id, employee_id, author_handle, title, created_at,
//               merged_at, is_merged, additions, deletions, changed_files, files, hunks,
//               modules, blast, size_score, head_ref, merge_sha, reverted_at(set later).
//   gh_commits: repo, sha, function_id, employee_id, pr_id, pr_number, author_handle, ts,
//               ai_assisted, coauthor_trailer.

import type { Octokit } from './client';
import { adminDb } from './db';
import { resolveEmployeeByGithubHandle } from '@/lib/connectors/identity';
import { parseDiff, type RawDiffFile } from './diff';
import { computeSizing, DEFAULT_SIZE_WEIGHTS, type SizingPolicy } from './sizing';
import { parseCommit, type RawCommit } from './commits';
import { detectReverts, markReverted, type RevertCandidate } from './reverts';

/** How far back to ingest PRs (by updated/merged date) on a backfill. */
const DEFAULT_LOOKBACK_DAYS = 120;
/** Hard cap on PRs scanned per repo per run (safety valve for large repos). */
const MAX_PRS_PER_REPO = 500;

/** A per-repo ingest tally. */
export interface RepoBackfillResult {
  repo: string;
  prsUpserted: number;
  commitsUpserted: number;
  revertsMarked: number;
  errors: string[];
}

/** Load the active index_config sizing policy for a function (globs + weights). */
export async function loadSizingPolicy(functionId: string): Promise<SizingPolicy> {
  try {
    const { data } = await adminDb()
      .from('index_config')
      .select('ignore_globs, sensitive_globs, sizing_jsonb')
      .eq('function_id', functionId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const sizing = (data?.sizing_jsonb as { weights?: Partial<typeof DEFAULT_SIZE_WEIGHTS> } | null) ?? null;
    const w = sizing?.weights ?? {};
    return {
      ignoreGlobs: (data?.ignore_globs as string[] | undefined) ?? [],
      sensitiveGlobs: (data?.sensitive_globs as string[] | undefined) ?? [],
      weights: {
        files: w.files ?? DEFAULT_SIZE_WEIGHTS.files,
        hunks: w.hunks ?? DEFAULT_SIZE_WEIGHTS.hunks,
        modules: w.modules ?? DEFAULT_SIZE_WEIGHTS.modules,
        blast: w.blast ?? DEFAULT_SIZE_WEIGHTS.blast,
      },
    };
  } catch {
    return { ignoreGlobs: [], sensitiveGlobs: [], weights: { ...DEFAULT_SIZE_WEIGHTS } };
  }
}

/** Split an "owner/name" repo slug. Returns null when malformed. */
export function splitRepo(slug: string): { owner: string; repo: string } | null {
  const parts = slug.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

/** Fetch all changed files for a PR (paginated), as the raw diff shape. */
async function fetchPrFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<RawDiffFile[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });
  return files.map((f) => ({
    filename: f.filename,
    previous_filename: f.previous_filename ?? null,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? null,
  }));
}

/** Fetch a PR's commits (paginated) → parsed commit facts. */
async function fetchPrCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<ReturnType<typeof parseCommit>[]> {
  const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });
  return commits.map((c) => {
    const raw: RawCommit = {
      sha: c.sha,
      message: c.commit?.message ?? '',
      authorLogin: c.author?.login ?? null,
      committedAt: c.commit?.committer?.date ?? c.commit?.author?.date ?? null,
    };
    return parseCommit(raw);
  });
}

/** ISO cutoff for the lookback window. */
function lookbackCutoff(days: number, now: Date = new Date()): number {
  return now.getTime() - days * 86_400_000;
}

/**
 * Backfill one repo. Idempotent (upserts on the unique keys). Collects per-PR errors so
 * a single failing PR doesn't abort the repo.
 */
export async function backfillRepo(
  octokit: Octokit,
  functionId: string,
  repoSlug: string,
  policy: SizingPolicy,
  options: { lookbackDays?: number } = {},
): Promise<RepoBackfillResult> {
  const result: RepoBackfillResult = {
    repo: repoSlug,
    prsUpserted: 0,
    commitsUpserted: 0,
    revertsMarked: 0,
    errors: [],
  };

  const split = splitRepo(repoSlug);
  if (!split) {
    result.errors.push(`malformed repo slug "${repoSlug}" (expected owner/name)`);
    return result;
  }
  const { owner, repo } = split;
  const db = adminDb();
  const cutoff = lookbackCutoff(options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS);

  // Collect revert candidates across the run for post-pass detection.
  const revertCandidates: RevertCandidate[] = [];
  // Cache handle → employeeId within a repo run to avoid repeated lookups.
  const employeeCache = new Map<string, string | null>();

  async function resolveAuthor(handle: string | null): Promise<string | null> {
    if (!handle) return null;
    const key = handle.toLowerCase();
    if (employeeCache.has(key)) return employeeCache.get(key) ?? null;
    const id = await resolveEmployeeByGithubHandle(functionId, handle);
    employeeCache.set(key, id);
    return id;
  }

  let scanned = 0;
  try {
    // PRs newest-first; `state: 'all'` covers merged + open + closed-unmerged.
    const iterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    });

    outer: for await (const page of iterator) {
      for (const pr of page.data) {
        if (scanned >= MAX_PRS_PER_REPO) break outer;
        const updatedMs = pr.updated_at ? Date.parse(pr.updated_at) : 0;
        if (updatedMs && updatedMs < cutoff) break outer; // sorted desc → done
        scanned++;

        try {
          const number = pr.number;
          const authorHandle = pr.user?.login ?? null;
          const isMerged = Boolean(pr.merged_at);
          const employeeId = await resolveAuthor(authorHandle);

          // Diff → raw sizing.
          const files = await fetchPrFiles(octokit, owner, repo, number);
          const parsed = parseDiff(files);
          const sizing = computeSizing(parsed, policy);

          const prRow = {
            function_id: functionId,
            employee_id: employeeId,
            repo: repoSlug,
            number,
            author_handle: authorHandle,
            title: pr.title ?? null,
            created_at: pr.created_at ?? null,
            merged_at: pr.merged_at ?? null,
            is_merged: isMerged,
            additions: parsed.additions,
            deletions: parsed.deletions,
            changed_files: parsed.changedFiles,
            files: sizing.files,
            hunks: sizing.hunks,
            modules: sizing.modules,
            blast: sizing.blast,
            size_score: sizing.sizeScore,
            head_ref: pr.head?.ref ?? null,
            merge_sha: pr.merge_commit_sha ?? null,
          };

          const { data: upserted, error: prErr } = await db
            .from('gh_prs')
            .upsert(prRow, { onConflict: 'repo,number' })
            .select('id')
            .single();
          if (prErr || !upserted?.id) {
            result.errors.push(`PR #${number}: ${(prErr as { message?: string } | null)?.message ?? 'upsert failed'}`);
            continue;
          }
          result.prsUpserted++;
          const prId = upserted.id as string;

          revertCandidates.push({
            number,
            title: pr.title ?? null,
            body: pr.body ?? null,
            mergeSha: pr.merge_commit_sha ?? null,
            mergedAt: pr.merged_at ?? null,
          });

          // Commits for this PR.
          const commits = await fetchPrCommits(octokit, owner, repo, number);
          for (const c of commits) {
            const commitEmployeeId = await resolveAuthor(c.authorHandle);
            const commitRow = {
              function_id: functionId,
              employee_id: commitEmployeeId,
              pr_id: prId,
              repo: repoSlug,
              sha: c.sha,
              pr_number: number,
              author_handle: c.authorHandle,
              ts: c.ts,
              ai_assisted: c.aiAssisted,
              coauthor_trailer: c.coauthorTrailer,
            };
            const { error: cErr } = await db
              .from('gh_commits')
              .upsert(commitRow, { onConflict: 'repo,sha' });
            if (cErr) {
              result.errors.push(`commit ${c.sha.slice(0, 7)}: ${(cErr as { message?: string }).message ?? 'upsert failed'}`);
            } else {
              result.commitsUpserted++;
            }
          }
        } catch (e) {
          result.errors.push(`PR #${pr.number}: ${errMsg(e)}`);
        }
      }
    }
  } catch (e) {
    result.errors.push(`repo scan: ${errMsg(e)}`);
  }

  // Revert post-pass: detect reverts among the merged PRs we just saw, stamp originals.
  try {
    const reverts = detectReverts(revertCandidates);
    for (const r of reverts) {
      if (r.originalPrNumber === null) continue;
      const ok = await markReverted(repoSlug, r.originalPrNumber, r.revertedAt);
      if (ok) result.revertsMarked++;
    }
  } catch (e) {
    result.errors.push(`revert pass: ${errMsg(e)}`);
  }

  return result;
}

/** Backfill all repos in scope for a function. Aggregates per-repo results. */
export async function backfillFunction(
  octokit: Octokit,
  functionId: string,
  repos: ReadonlyArray<string>,
): Promise<RepoBackfillResult[]> {
  const policy = await loadSizingPolicy(functionId);
  const out: RepoBackfillResult[] = [];
  for (const repo of repos) {
    out.push(await backfillRepo(octokit, functionId, repo, policy));
  }
  return out;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
