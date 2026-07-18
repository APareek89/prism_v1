export interface PrLinkEvidenceInput {
  sourceSessionId: string;
  repo: string;
  prNumber: number;
  sha: string | null;
  branch: string | null;
}
export type PrLinkParseResult =
  | { ok: true; value: PrLinkEvidenceInput }
  | { ok: false; error: string };

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_RE = /^[a-fA-F0-9]{7,64}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function boundedText(value: unknown, max: number): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  if (normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  return normalized;
}

/**
 * Parse only the metadata Prism persists. Extra payload fields are deliberately
 * ignored, so a hook can never forward prompt text, code, commands, or tool output
 * through this route even if a provider adds them to its lifecycle envelope.
 */
export function parsePrLinkEvidence(body: unknown): PrLinkParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const row = body as Record<string, unknown>;
  const sourceSessionId = boundedText(row.sessionId ?? row.session_id, 200);
  const repo = boundedText(row.repo, 200);
  const rawPr = row.prNumber ?? row.pr_number;
  const prNumber = typeof rawPr === 'number' ? rawPr : Number(text(rawPr));

  if (!sourceSessionId) return { ok: false, error: 'sessionId is required' };
  if (!repo || !REPO_RE.test(repo)) {
    return { ok: false, error: 'repo must be an owner/repo slug' };
  }
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
    return { ok: false, error: 'prNumber must be a positive integer' };
  }

  const rawSha = text(row.sha);
  if (rawSha && !SHA_RE.test(rawSha)) {
    return { ok: false, error: 'sha must be a 7-64 character hexadecimal id' };
  }
  const rawBranch = text(row.branch);
  const branch = boundedText(row.branch, 255);
  if (rawBranch && !branch) return { ok: false, error: 'branch is invalid or too long' };

  return {
    ok: true,
    value: {
      sourceSessionId,
      repo,
      prNumber,
      sha: rawSha || null,
      branch,
    },
  };
}
