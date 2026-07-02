// lib/connectors/github/sizing.ts
//
// PURE raw sizing. Given a parsed diff + the active index_config globs/weights, derive
// the RAW size signals the connector persists onto gh_prs:
//   files       = changed files AFTER ignore_globs cleaning
//   hunks       = contiguous diff blocks over the *kept* files
//   modules     = distinct top-level dirs/packages among kept paths
//   blast       = 1 if any kept path matches sensitive_globs, else 0
//   size_score  = files + hunks + 2·modules + 3·blast   (weights from sizing config)
//
// IMPORTANT: this computes the RAW size_score only. The S/M/L *bucket* belongs to
// scoring (lib/scoring/sizing.ts) and is NEVER assigned here (PRD §4.3, gh_prs comment).
//
// No I/O — globs/weights are passed in (the connector loads them from the active
// index_config). A minimal glob matcher supports the `**`, `*`, and `?` patterns the
// seed globs use (migration 0021).

import type { ParsedDiff } from './diff';

/** The sizing inputs read off the active index_config (migration 0005/0021). */
export interface SizingPolicy {
  /** paths dropped before sizing (lockfiles/generated/vendored/snapshots/migrations). */
  ignoreGlobs: string[];
  /** paths that set blast=1 (auth/billing/core/infra/db). */
  sensitiveGlobs: string[];
  /** size_score weights; defaults mirror the seed (files 1, hunks 1, modules 2, blast 3). */
  weights: { files: number; hunks: number; modules: number; blast: number };
}

/** The RAW size facts persisted onto gh_prs (no bucket). */
export interface RawSizing {
  files: number;
  hunks: number;
  modules: number;
  /** 0 | 1 — kept narrow so it maps onto the scoring engine's `blast: 0 | 1`. */
  blast: 0 | 1;
  sizeScore: number;
  /** the cleaned file paths (kept after ignore_globs) — surfaced for diagnostics. */
  keptPaths: string[];
}

export const DEFAULT_SIZE_WEIGHTS = { files: 1, hunks: 1, modules: 2, blast: 3 } as const;

/**
 * Translate one glob (subset: `**`, `*`, `?`, literal `.`/`/`) into a RegExp.
 *   **  → matches across path separators (`.*`)
 *   *   → matches within a path segment (`[^/]*`)
 *   ?   → a single non-separator char (`[^/]`)
 * Anchored at both ends so `**​/auth/**` matches `lib/auth/x.ts` but not `xauth`.
 */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          // `**/` → zero-or-more WHOLE leading path segments. `(?:.*/)?` keeps the
          // following literal anchored to a segment boundary, so `**/auth/**` matches
          // `lib/auth/x` but NOT `lib/xauth/x` (the bug a naive `.*` introduced).
          re += '(?:.*/)?';
          i++; // consume the slash
        } else {
          // `**` not followed by a separator (e.g. `**.ext`, or a trailing `/**`) →
          // match across separators greedily.
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(ch as string)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`);
}

/** True when `path` matches any glob in the list. Empty list → false. */
export function matchesAnyGlob(path: string, globs: ReadonlyArray<string>): boolean {
  for (const g of globs) {
    if (!g) continue;
    if (globToRegExp(g).test(path)) return true;
  }
  return false;
}

/** The top-level dir of a path (`lib/auth/x.ts` → `lib`; a root file → `.`). */
export function topLevelDir(path: string): string {
  const idx = path.indexOf('/');
  return idx === -1 ? '.' : path.slice(0, idx);
}

/**
 * Compute the RAW sizing for a parsed diff under the active policy. Pure.
 * Drops ignore_globs paths first; `modules` and `blast` are derived from the survivors
 * only (a PR that only touches lockfiles → files=0, modules=0, blast=0, size_score=0).
 */
export function computeSizing(diff: ParsedDiff, policy: SizingPolicy): RawSizing {
  const w = policy.weights ?? DEFAULT_SIZE_WEIGHTS;

  // 1. clean: drop ignore_globs paths.
  const keptPaths = diff.paths.filter((p) => !matchesAnyGlob(p, policy.ignoreGlobs));

  // 2. modules: distinct top-level dirs among kept paths.
  const modules = new Set(keptPaths.map(topLevelDir)).size;

  // 3. blast: any kept path in a sensitive area.
  const blast: 0 | 1 = keptPaths.some((p) => matchesAnyGlob(p, policy.sensitiveGlobs)) ? 1 : 0;

  // 4. hunks: keep only hunks belonging to surviving files. We can't re-attribute the
  //    flat hunk count to individual files without the per-file map, so when files were
  //    dropped we scale the hunk count by the kept-file fraction (deterministic, and
  //    exactly equals diff.hunks when nothing is dropped). Never below the kept count.
  const totalFiles = diff.changedFiles;
  const files = keptPaths.length;
  let hunks: number;
  if (totalFiles === 0) {
    hunks = 0;
  } else if (files === totalFiles) {
    hunks = diff.hunks;
  } else if (files === 0) {
    hunks = 0;
  } else {
    hunks = Math.max(files, Math.round((diff.hunks * files) / totalFiles));
  }

  const sizeScore =
    w.files * files + w.hunks * hunks + w.modules * modules + w.blast * blast;

  return { files, hunks, modules, blast, sizeScore, keptPaths };
}
