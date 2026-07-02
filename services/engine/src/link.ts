// AI→PR link — the connective tissue every AI-denominated metric depends on.
// Strongest signal wins per (session, PR) pair:
//   pr_link 0.99 (first-party marker) → sha 0.95 → branch 0.80 → coauthor 0.60.
// v3 hardening applied here (spec §4 + handoff follow-up #1):
//   · a session only ever links to a PR by the SAME developer (attribution sanity)
//   · coauthor links are SUPPRESSED for a PR already covered by a pr_link match
//     (the repo-scoped coauthor fallback is what cartesian-over-linked v1).

import type { PrRow, SessionRow, CommitRow } from '@prism/contract';
import { LINK_CONFIDENCE, type LinkMethod } from '@prism/contract';
import type { ComputedLink } from './types';

export function computeLinks(prs: PrRow[], sessions: SessionRow[], commits: CommitRow[]): ComputedLink[] {
  const merged = prs.filter((p) => p.merged_at && !p.is_revert);
  const coauthoredPrs = new Set(
    commits.filter((c) => c.co_authored_by_claude && c.pr_number !== null).map((c) => `${c.repo}#${c.pr_number}`),
  );

  const links: ComputedLink[] = [];
  for (const pr of merged) {
    for (const s of sessions) {
      if (s.developer_id !== pr.developer_id) continue;   // same-developer scoping
      const method = matchMethod(pr, s, coauthoredPrs);
      if (method) {
        links.push({
          session_id: s.id, repo: pr.repo, pr_number: pr.number,
          developer_id: pr.developer_id, method, confidence: LINK_CONFIDENCE[method],
          suppressed: false,
        });
      }
    }
  }

  // Hardening: suppress weak coauthor links on PRs already covered by pr_link.
  const exactCovered = new Set(
    links.filter((l) => l.method === 'pr_link').map((l) => `${l.repo}#${l.pr_number}`),
  );
  for (const l of links) {
    if (l.method === 'coauthor' && exactCovered.has(`${l.repo}#${l.pr_number}`)) l.suppressed = true;
  }
  return links;
}

function matchMethod(pr: PrRow, s: SessionRow, coauthoredPrs: Set<string>): LinkMethod | null {
  // 1. First-party pr-link marker — exact.
  if (s.pr_refs.some((r) => r.repo === pr.repo && r.number === pr.number)) return 'pr_link';
  // 2. Merge-SHA prefix seen in the session.
  if (pr.merge_sha && s.sha_refs.some((ref) => pr.merge_sha!.startsWith(ref))) return 'sha';
  // 3. Branch equality (case-insensitive), same repo.
  if (s.repo === pr.repo && s.branch && s.branch.toLowerCase() === pr.head_ref.toLowerCase()) return 'branch';
  // 4. Repo-scoped coauthor fallback (weak — subject to suppression above).
  if (s.repo === pr.repo && coauthoredPrs.has(`${pr.repo}#${pr.number}`)) return 'coauthor';
  return null;
}

/** Active (unsuppressed) links per PR key. */
export function linksByPr(links: ComputedLink[]): Map<string, ComputedLink[]> {
  const map = new Map<string, ComputedLink[]>();
  for (const l of links) {
    if (l.suppressed) continue;
    const key = `${l.repo}#${l.pr_number}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(l);
  }
  return map;
}

export const prKey = (repo: string, number: number): string => `${repo}#${number}`;
