import { describe, expect, it } from 'vitest';
import { parsePrLinkEvidence } from './parse';

describe('parsePrLinkEvidence', () => {
  it('normalizes the metadata-only camelCase payload', () => {
    expect(parsePrLinkEvidence({
      sessionId: ' session-1 ',
      repo: 'APareek89/prism-measurement-lab',
      prNumber: 12,
      sha: 'abcdef1234567',
      branch: 'codex/evidence',
    })).toEqual({
      ok: true,
      value: {
        sourceSessionId: 'session-1',
        repo: 'APareek89/prism-measurement-lab',
        prNumber: 12,
        sha: 'abcdef1234567',
        branch: 'codex/evidence',
      },
    });
  });

  it('accepts provider-style snake_case aliases', () => {
    const parsed = parsePrLinkEvidence({
      session_id: 'session-2', repo: 'owner/repo', pr_number: '3',
    });
    expect(parsed.ok && parsed.value.prNumber).toBe(3);
  });

  it('drops every non-whitelisted field', () => {
    const parsed = parsePrLinkEvidence({
      sessionId: 'session-3', repo: 'owner/repo', prNumber: 4,
      prompt: 'private', tool_output: 'source code', command: 'gh pr create',
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual({
      sourceSessionId: 'session-3', repo: 'owner/repo', prNumber: 4,
      sha: null, branch: null,
    });
  });

  it('rejects ambiguous repositories and malformed identifiers', () => {
    expect(parsePrLinkEvidence({ sessionId: 's', repo: 'repo', prNumber: 1 }).ok).toBe(false);
    expect(parsePrLinkEvidence({ sessionId: 's', repo: 'o/r', prNumber: 0 }).ok).toBe(false);
    expect(parsePrLinkEvidence({ sessionId: 's', repo: 'o/r', prNumber: 1, sha: 'not-a-sha' }).ok).toBe(false);
  });
});
