// lib/connectors/github/diff.ts
//
// PURE diff parsing. Turns a PR's per-file list (GitHub REST "files" array, each with a
// filename + unified-diff `patch`) into the deterministic shapes sizing.ts consumes:
//   • files  — the changed-file paths (post ignore_globs cleaning happens in sizing.ts)
//   • hunks  — total contiguous diff blocks across all files (count of `@@ ... @@` headers)
//   • paths  — the per-file paths used to derive modules (top-level dirs) and blast.
//
// No I/O, no DB, no octokit — takes plain data so it is unit-testable and reusable by
// both the backfill (REST diff) and webhook paths. (PRD §6 gh_prs sizing inputs.)

/** One changed file as returned by GitHub's PR "files" endpoint (subset we use). */
export interface RawDiffFile {
  /** the (possibly renamed) path of the file in the head tree. */
  filename: string;
  /** previous_filename for renames (so a rename touches both module dirs). */
  previous_filename?: string | null;
  status?: string;
  additions?: number;
  deletions?: number;
  /** the unified-diff text for this file. Absent for binary files / very large diffs. */
  patch?: string | null;
}

/** The deterministic per-PR diff facts (pre-glob-cleaning). */
export interface ParsedDiff {
  /** distinct changed-file paths (head paths; renames contribute the new path). */
  paths: string[];
  /** all touched paths incl. previous_filename (for module attribution on renames). */
  allPaths: string[];
  /** total contiguous diff blocks across all files. */
  hunks: number;
  /** total additions across files (raw passthrough). */
  additions: number;
  /** total deletions across files. */
  deletions: number;
  /** number of changed files (raw, pre-cleaning). */
  changedFiles: number;
}

/**
 * Count contiguous diff blocks in a single file's unified-diff patch. Each block starts
 * with a `@@ -a,b +c,d @@` hunk header. A file with a patch but no header (rare) counts
 * as 1 changed block; a file with no patch (binary / too-large) also counts as 1, since
 * it is still one contiguous change region for sizing purposes.
 */
export function countHunks(patch: string | null | undefined): number {
  if (!patch) return 1;
  const matches = patch.match(/^@@ /gm);
  const n = matches ? matches.length : 0;
  return n > 0 ? n : 1;
}

/**
 * Parse a PR's raw file list into deterministic diff facts. Pure — `files` is the array
 * GitHub returns from `GET /repos/{o}/{r}/pulls/{n}/files` (paginated and concatenated
 * by the caller). De-dupes paths defensively.
 */
export function parseDiff(files: ReadonlyArray<RawDiffFile>): ParsedDiff {
  const paths = new Set<string>();
  const allPaths = new Set<string>();
  let hunks = 0;
  let additions = 0;
  let deletions = 0;

  for (const f of files) {
    if (!f || typeof f.filename !== 'string' || f.filename.length === 0) continue;
    paths.add(f.filename);
    allPaths.add(f.filename);
    if (f.previous_filename) allPaths.add(f.previous_filename);
    hunks += countHunks(f.patch);
    additions += f.additions ?? 0;
    deletions += f.deletions ?? 0;
  }

  return {
    paths: [...paths],
    allPaths: [...allPaths],
    hunks,
    additions,
    deletions,
    changedFiles: paths.size,
  };
}
