// lib/connectors/github/commits.ts
//
// PURE commit parsing → the fields persisted onto gh_commits (migration 0007):
//   sha, author_handle, ts, ai_assisted, coauthor_trailer, pr_number.
//
// The AI signal is the `Co-authored-by:` trailer. Claude Code stamps commits with a
// Claude co-author line; any such trailer naming Claude/an AI agent sets ai_assisted
// and is captured verbatim into coauthor_trailer (one column → we keep the AI-relevant
// trailer, or the first trailer when none is AI). No DB, no octokit — takes the plain
// commit shape the REST/GraphQL caller already has.

/** The minimal commit shape we parse (subset of GitHub's REST commit object). */
export interface RawCommit {
  sha: string;
  /** the full commit message (subject + body, including trailers). */
  message: string;
  /** the GitHub login of the author, when GitHub resolved one. */
  authorLogin?: string | null;
  /** committedDate / author date — ISO string. */
  committedAt?: string | null;
}

/** One parsed `Co-authored-by` trailer. */
export interface CoAuthor {
  name: string;
  email: string;
  /** raw trailer line, e.g. "Co-authored-by: Claude <noreply@anthropic.com>". */
  raw: string;
  /** true when the trailer names Claude / an Anthropic AI agent / a generic AI bot. */
  isAi: boolean;
}

/** The fields a parsed commit contributes to a gh_commits row. */
export interface ParsedCommit {
  sha: string;
  authorHandle: string | null;
  ts: string | null;
  aiAssisted: boolean;
  /** the AI co-author trailer if present, else the first trailer, else null. */
  coauthorTrailer: string | null;
  coauthors: CoAuthor[];
}

/** Patterns that mark a co-author as an AI agent. Case-insensitive. */
const AI_COAUTHOR_PATTERNS = [
  /claude/i,
  /anthropic/i,
  /\bcursor\b/i,
  /copilot/i,
  /\bgpt\b/i,
  /\bai\b.*\bbot\b/i,
];

/** True when a co-author name/email looks like an AI coding agent. */
export function isAiCoAuthor(name: string, email: string): boolean {
  const hay = `${name} ${email}`;
  return AI_COAUTHOR_PATTERNS.some((re) => re.test(hay));
}

/**
 * Extract all `Co-authored-by:` trailers from a commit message. Trailers live in the
 * commit body, one per line: `Co-authored-by: Name <email>`. Case-insensitive on the
 * key; tolerant of extra whitespace.
 */
export function extractCoAuthors(message: string): CoAuthor[] {
  if (!message) return [];
  const out: CoAuthor[] = [];
  const re = /^\s*Co-authored-by:\s*(.+?)\s*<([^>]*)>\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    const name = (m[1] ?? '').trim();
    const email = (m[2] ?? '').trim();
    out.push({
      name,
      email,
      raw: m[0].trim(),
      isAi: isAiCoAuthor(name, email),
    });
  }
  return out;
}

/**
 * Parse a raw commit into the gh_commits-bound fields. `ai_assisted` is true when ANY
 * co-author trailer names an AI agent. `coauthor_trailer` stores the AI trailer when
 * present (the load-bearing signal), otherwise the first trailer, otherwise null.
 */
export function parseCommit(commit: RawCommit): ParsedCommit {
  const coauthors = extractCoAuthors(commit.message ?? '');
  const aiTrailer = coauthors.find((c) => c.isAi) ?? null;
  const aiAssisted = aiTrailer !== null;
  const coauthorTrailer = aiTrailer?.raw ?? coauthors[0]?.raw ?? null;

  return {
    sha: commit.sha,
    authorHandle: commit.authorLogin ?? null,
    ts: commit.committedAt ?? null,
    aiAssisted,
    coauthorTrailer,
    coauthors,
  };
}
