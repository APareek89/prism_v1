// lib/connectors/link/ai-to-pr.ts
//
// The AI→PR link step (PRD §6, migration 0010 pr_ai_link). For every merged PR in the
// trailing ingest window, find candidate Codex/Claude Code sessions by verified PR
// beacon / branch / sha / coauthor, score the strongest signal, and persist:
//   • pr_ai_link(pr_id, cc_session_id, method, confidence, function_id)  — UPSERT on
//     the UNIQUE(pr_id, cc_session_id) constraint.
//   • gh_prs.ai_assisted = true  for every linked PR.
//   • cc_sessions.linked_pr = <pr id>  for every linked session.
//
// The linker does not calculate a score. It enriches gh_prs.ai_assisted, which the
// unchanged assembler and deterministic scoring engine may consume as existing input.
// Writes via the SERVICE-ROLE client. Never throws the pipeline out — collects errors.

import { createAdminClient } from '@/lib/supabase/admin';
import { ingestWindow } from '@/lib/connectors/window';
import { scoreMatch, type LinkMethod, type PrKeys, type PrRef, type SessionKeys } from './match-keys';

// ─────────────────────────────────────────────────────────────────────────────
// Loose query surface (the generated Database has empty Tables)
// ─────────────────────────────────────────────────────────────────────────────

interface LooseResult extends Promise<{ data: unknown; error: { message?: string } | null }> {
  eq: (col: string, val: unknown) => LooseResult;
  gte: (col: string, val: unknown) => LooseResult;
  not: (col: string, op: string, val: unknown) => LooseResult;
  in: (col: string, vals: unknown[]) => LooseResult;
  select: (cols?: string) => LooseResult;
}
interface LooseTable {
  select: (cols: string) => LooseResult;
  update: (patch: unknown) => LooseResult;
  upsert: (rows: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => LooseResult;
}
interface LooseAdmin {
  from: (table: string) => LooseTable;
}
function admin(): LooseAdmin {
  return createAdminClient() as unknown as LooseAdmin;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row shapes (only the columns we read)
// ─────────────────────────────────────────────────────────────────────────────

interface PrRow {
  id: string;
  repo: string;
  number: number;
  head_ref: string | null;
  merge_sha: string | null;
  merged_at: string | null;
}
interface SessionRow {
  id: string;
  connection_id: string | null;
  session_id: string | null;
  repo: string | null;
  branch: string | null;
  /** jsonb array of {repo, number} from Claude Code `pr-link` events (migration 0033). */
  pr_refs: Array<{ repo?: string; number?: number }> | null;
}
interface PrLinkEvidenceRow {
  id: string;
  connection_id: string;
  source_session_id: string;
  repo: string;
  pr_number: number;
  sha: string | null;
  branch: string | null;
}
interface CommitRow {
  pr_id: string | null;
  pr_number: number | null;
  repo: string;
  sha: string;
  coauthor_trailer: string | null;
}

/** Accounting for one link run. */
export interface LinkStats {
  prsConsidered: number;
  prLinkEvidenceRead: number;
  prLinkEvidenceMatched: number;
  linksWritten: number;
  prsMarked: number;
  sessionsMarked: number;
  errors: string[];
}

function emptyStats(): LinkStats {
  return {
    prsConsidered: 0,
    prLinkEvidenceRead: 0,
    prLinkEvidenceMatched: 0,
    linksWritten: 0,
    prsMarked: 0,
    sessionsMarked: 0,
    errors: [],
  };
}

/** A Claude co-author trailer marks AI authorship (case-insensitive contains). */
function isClaudeCoauthor(trailer: string | null): boolean {
  if (!trailer) return false;
  const t = trailer.toLowerCase();
  return t.includes('claude') || t.includes('anthropic');
}

// ─────────────────────────────────────────────────────────────────────────────
// linkAiToPr
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute + persist AI→PR links for one function over the trailing 28-day ingest
 * window. Idempotent (upsert on pr_id+cc_session_id). Never throws — errors are
 * collected into the returned stats so the pipeline continues.
 */
export async function linkAiToPr(functionId: string, now: Date = new Date()): Promise<LinkStats> {
  const stats = emptyStats();
  const db = admin();
  const win = ingestWindow(now);

  // 1. Merged PRs in the window.
  let prs: PrRow[] = [];
  try {
    const { data, error } = await db
      .from('gh_prs')
      .select('id, repo, number, head_ref, merge_sha, merged_at')
      .eq('function_id', functionId)
      .eq('is_merged', true)
      .gte('merged_at', win.since);
    if (error) {
      stats.errors.push(`gh_prs read: ${error.message ?? 'unknown'}`);
      return stats;
    }
    prs = Array.isArray(data) ? (data as PrRow[]) : [];
  } catch (e) {
    stats.errors.push(`gh_prs read: ${e instanceof Error ? e.message : 'unknown'}`);
    return stats;
  }
  stats.prsConsidered = prs.length;
  if (prs.length === 0) return stats;

  // 2. Candidate sessions for this function. A PR beacon is only allowed to enrich
  //    the exact (connection_id, provider session_id) pair that authenticated it.
  let sessions: SessionRow[] = [];
  try {
    const { data, error } = await db
      .from('cc_sessions')
      .select('id, connection_id, session_id, repo, branch, pr_refs')
      .eq('function_id', functionId);
    if (error) {
      stats.errors.push(`cc_sessions read: ${error.message ?? 'unknown'}`);
      return stats;
    }
    sessions = Array.isArray(data) ? (data as SessionRow[]) : [];
  } catch (e) {
    stats.errors.push(`cc_sessions read: ${e instanceof Error ? e.message : 'unknown'}`);
    return stats;
  }

  let prLinkEvidence: PrLinkEvidenceRow[] = [];
  try {
    const { data, error } = await db
      .from('pr_link_ingest')
      .select('id, connection_id, source_session_id, repo, pr_number, sha, branch')
      .eq('function_id', functionId);
    if (error) {
      stats.errors.push(`pr_link_ingest read: ${error.message ?? 'unknown'}`);
    } else {
      prLinkEvidence = Array.isArray(data) ? (data as PrLinkEvidenceRow[]) : [];
      stats.prLinkEvidenceRead = prLinkEvidence.length;
    }
  } catch (e) {
    stats.errors.push(`pr_link_ingest read: ${e instanceof Error ? e.message : 'unknown'}`);
  }
  if (sessions.length === 0) return stats;

  // 3. Co-author commits for these PRs (for the coauthor signal). Best-effort.
  const prIds = prs.map((p) => p.id);
  const coauthorShasByPr = new Map<string, string[]>();
  try {
    const { data, error } = await db
      .from('gh_commits')
      .select('pr_id, pr_number, repo, sha, coauthor_trailer')
      .eq('function_id', functionId)
      .in('pr_id', prIds);
    if (!error && Array.isArray(data)) {
      for (const c of data as CommitRow[]) {
        if (!c.pr_id || !isClaudeCoauthor(c.coauthor_trailer)) continue;
        const list = coauthorShasByPr.get(c.pr_id) ?? [];
        list.push(c.sha);
        coauthorShasByPr.set(c.pr_id, list);
      }
    }
  } catch {
    // Co-author signal is optional; branch/sha still work without it.
  }

  // Pre-derive, per session: its clean pr-link refs and the set of owner/repo slugs it
  // is KNOWN to belong to (from those refs). The session's own `repo` column is a local
  // FILESYSTEM PATH (e.g. /Users/.../prism), not an owner/repo slug, so it cannot be
  // compared to gh_prs.repo directly — the pr-link refs are the reliable repo evidence.
  interface SessionCand {
    row: SessionRow;
    prRefs: PrRef[];
    knownRepos: Set<string>; // lower-cased owner/repo slugs from prRefs
    shas: string[];
    branch: string | null;
  }
  const evidenceByConnectionSession = new Map<string, PrLinkEvidenceRow[]>();
  for (const evidence of prLinkEvidence) {
    const key = `${evidence.connection_id}\u0000${evidence.source_session_id}`;
    const list = evidenceByConnectionSession.get(key) ?? [];
    list.push(evidence);
    evidenceByConnectionSession.set(key, list);
  }
  const matchedEvidenceIds = new Set<string>();
  const cands: SessionCand[] = sessions.map((s) => {
    const prRefs: PrRef[] = [];
    const knownRepos = new Set<string>();
    const shas: string[] = [];
    for (const r of s.pr_refs ?? []) {
      if (typeof r?.repo === 'string' && typeof r?.number === 'number' && Number.isFinite(r.number)) {
        prRefs.push({ repo: r.repo, number: r.number });
        knownRepos.add(r.repo.trim().toLowerCase());
      }
    }
    const key = s.connection_id && s.session_id
      ? `${s.connection_id}\u0000${s.session_id}`
      : null;
    const matchedEvidence = key ? (evidenceByConnectionSession.get(key) ?? []) : [];
    for (const evidence of matchedEvidence) {
      prRefs.push({ repo: evidence.repo, number: evidence.pr_number });
      knownRepos.add(evidence.repo.trim().toLowerCase());
      if (evidence.sha) shas.push(evidence.sha);
      matchedEvidenceIds.add(evidence.id);
    }
    return {
      row: s,
      prRefs,
      knownRepos,
      shas,
      branch: s.branch ?? matchedEvidence.find((evidence) => evidence.branch)?.branch ?? null,
    };
  });
  stats.prLinkEvidenceMatched = matchedEvidenceIds.size;

  const linkRows: Array<{
    function_id: string;
    pr_id: string;
    cc_session_id: string;
    method: LinkMethod;
    confidence: number;
  }> = [];
  const linkedPrIds = new Set<string>();
  // sessionId → the pr_id to stamp on cc_sessions.linked_pr (first/highest link wins).
  const sessionLinkedPr = new Map<string, string>();

  // 4. Score every (PR, session) pair. Precision guard (HARD project rule): the
  //    pr_link signal is self-scoped (it names its own repo+number, so it can only bind
  //    to the right PR). The WEAKER branch/coauthor signals are NOT repo-aware on their
  //    own, so we only expose them for a session that is KNOWN (via its pr-link refs) to
  //    belong to THIS PR's repo. A session with no pr-link refs contributes pr_link=∅
  //    and, lacking repo evidence, is not eligible for a branch/coauthor link either —
  //    missing a link is acceptable; a wrong one is not.
  for (const pr of prs) {
    const prRepoNorm = (pr.repo ?? '').trim().toLowerCase();
    const prKeys: PrKeys = {
      ref: { repo: pr.repo, number: pr.number },
      headRef: pr.head_ref,
      mergeSha: pr.merge_sha,
      coauthorShas: coauthorShasByPr.get(pr.id) ?? [],
    };
    const prHasCoauthor = (coauthorShasByPr.get(pr.id)?.length ?? 0) > 0;
    for (const c of cands) {
      // Repo-scope the weak signals: only when this session is known to be in the PR's
      // repo. pr_link ignores this (it self-scopes inside scoreMatch).
      const repoScoped = prRepoNorm.length > 0 && c.knownRepos.has(prRepoNorm);
      const sessionKeys: SessionKeys = {
        prRefs: c.prRefs,
        branch: repoScoped ? c.branch : null,
        shas: c.shas,
        hasCoauthorTrailer: repoScoped && prHasCoauthor,
      };
      const match = scoreMatch(prKeys, sessionKeys);
      if (!match.method) continue;
      linkRows.push({
        function_id: functionId,
        pr_id: pr.id,
        cc_session_id: c.row.id,
        method: match.method,
        confidence: match.confidence,
      });
      linkedPrIds.add(pr.id);
      if (!sessionLinkedPr.has(c.row.id)) sessionLinkedPr.set(c.row.id, pr.id);
    }
  }

  if (linkRows.length === 0) return stats;

  // 5. Upsert pr_ai_link (idempotent on pr_id+cc_session_id).
  try {
    const { error } = await db
      .from('pr_ai_link')
      .upsert(linkRows, { onConflict: 'pr_id,cc_session_id' });
    if (error) {
      stats.errors.push(`pr_ai_link upsert: ${error.message ?? 'unknown'}`);
      return stats;
    }
    stats.linksWritten = linkRows.length;
  } catch (e) {
    stats.errors.push(`pr_ai_link upsert: ${e instanceof Error ? e.message : 'unknown'}`);
    return stats;
  }

  // 6. Flag linked PRs as ai_assisted.
  try {
    const { error } = await db
      .from('gh_prs')
      .update({ ai_assisted: true })
      .in('id', [...linkedPrIds]);
    if (error) stats.errors.push(`gh_prs ai_assisted: ${error.message ?? 'unknown'}`);
    else stats.prsMarked = linkedPrIds.size;
  } catch (e) {
    stats.errors.push(`gh_prs ai_assisted: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  // 7. Stamp cc_sessions.linked_pr for each linked session.
  let sessionsMarked = 0;
  for (const [sessionId, prId] of sessionLinkedPr) {
    try {
      const { error } = await db
        .from('cc_sessions')
        .update({ linked_pr: prId })
        .eq('id', sessionId);
      if (error) stats.errors.push(`cc_sessions linked_pr (${sessionId}): ${error.message ?? 'unknown'}`);
      else sessionsMarked += 1;
    } catch (e) {
      stats.errors.push(`cc_sessions linked_pr (${sessionId}): ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }
  stats.sessionsMarked = sessionsMarked;

  return stats;
}
