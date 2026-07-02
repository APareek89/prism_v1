import { describe, it, expect } from 'vitest';
import { parseSessionFile, resolveBranch } from './parser';

// Build one .jsonl line from an object.
const L = (o: unknown) => JSON.stringify(o);

// A minimal assistant turn carrying token usage so the session is non-empty.
function assistantTurn(sessionId: string, cwd: string, extra: Record<string, unknown> = {}) {
  return L({
    type: 'assistant',
    sessionId,
    cwd,
    gitBranch: 'HEAD',
    timestamp: '2026-07-01T08:00:00.000Z',
    message: { role: 'assistant', model: 'claude-opus-4', usage: { input_tokens: 10, output_tokens: 5 } },
    ...extra,
  });
}

// A pr-link control event (no cwd/gitBranch, as emitted by Claude Code).
function prLink(sessionId: string, repo: string, number: number) {
  return L({ type: 'pr-link', sessionId, prRepository: repo, prNumber: number, timestamp: '2026-07-01T08:00:01.000Z' });
}

describe('parseSessionFile — pr-link recovery (the AI→PR join key)', () => {
  it('captures pr-link events into prRefs on the session', () => {
    const text = [
      assistantTurn('s1', '/Users/a/Documents/prism'),
      prLink('s1', 'APareek89/prism', 8),
    ].join('\n');
    const out = parseSessionFile(text, { fallbackSessionId: 's1', fallbackRepo: '/x' });
    expect(out).toHaveLength(1);
    expect(out[0]!.prRefs).toEqual([{ repo: 'APareek89/prism', number: 8 }]);
  });

  it('dedupes repeated pr-link events for the same PR', () => {
    const text = [
      assistantTurn('s1', '/Users/a/Documents/prism'),
      prLink('s1', 'APareek89/prism', 2),
      prLink('s1', 'APareek89/prism', 2),
      prLink('s1', 'APareek89/prism', 2),
    ].join('\n');
    const out = parseSessionFile(text, { fallbackSessionId: 's1', fallbackRepo: '/x' });
    expect(out[0]!.prRefs).toEqual([{ repo: 'APareek89/prism', number: 2 }]);
  });

  it('attaches ALL of a session\'s pr-refs to each (sessionId, repo) group it spans', () => {
    // The real prism session opened PRs 1..8 while cd-ing across several dirs.
    const text = [
      assistantTurn('s1', '/Users/a/Documents'),
      assistantTurn('s1', '/Users/a/Documents/prism'),
      assistantTurn('s1', '/Users/a/Documents/prism/supabase/migrations'),
      ...Array.from({ length: 8 }, (_, i) => prLink('s1', 'APareek89/prism', i + 1)),
    ].join('\n');
    const out = parseSessionFile(text, { fallbackSessionId: 's1', fallbackRepo: '/x' });
    // three (sessionId, repo) groups, each carrying the full 1..8 ref set.
    expect(out).toHaveLength(3);
    for (const s of out) {
      expect(s.prRefs.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(s.prRefs.every((r) => r.repo === 'APareek89/prism')).toBe(true);
    }
  });

  it('ignores malformed pr-link events (missing repo or number)', () => {
    const text = [
      assistantTurn('s1', '/Users/a/Documents/prism'),
      L({ type: 'pr-link', sessionId: 's1', prNumber: 8 }), // no repo
      L({ type: 'pr-link', sessionId: 's1', prRepository: 'APareek89/prism' }), // no number
    ].join('\n');
    const out = parseSessionFile(text, { fallbackSessionId: 's1', fallbackRepo: '/x' });
    expect(out[0]!.prRefs).toEqual([]);
  });

  it('emits empty prRefs when the client wrote no pr-link events', () => {
    const text = assistantTurn('s1', '/Users/a/Documents/prism');
    const out = parseSessionFile(text, { fallbackSessionId: 's1', fallbackRepo: '/x' });
    expect(out[0]!.prRefs).toEqual([]);
  });
});

describe('parseSessionFile — branch recovery from git checkout -b', () => {
  it('recovers the created branch when top-level gitBranch is HEAD and exactly one was created', () => {
    const text = [
      assistantTurn('s1', '/Users/a/Documents/prism', {
        message: {
          role: 'assistant',
          model: 'claude-opus-4',
          usage: { input_tokens: 10, output_tokens: 5 },
          content: [
            { type: 'tool_use', name: 'Bash', input: { command: 'git checkout -q -b docs/testing-guide && echo hi' } },
          ],
        },
      }),
    ].join('\n');
    const out = parseSessionFile(text, { fallbackSessionId: 's1', fallbackRepo: '/x' });
    expect(out[0]!.branch).toBe('docs/testing-guide');
  });

  it('does NOT overwrite a real top-level branch', () => {
    const text = [
      assistantTurn('s1', '/Users/a/Documents/prism', {
        gitBranch: 'main',
        message: {
          role: 'assistant',
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git checkout -b feature/x' } }],
        },
      }),
    ].join('\n');
    const out = parseSessionFile(text, { fallbackSessionId: 's1', fallbackRepo: '/x' });
    expect(out[0]!.branch).toBe('main');
  });

  it('leaves branch as HEAD when the session created MULTIPLE branches (ambiguous)', () => {
    const text = [
      assistantTurn('s1', '/Users/a/Documents/prism', {
        message: {
          role: 'assistant',
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [
            { type: 'tool_use', name: 'Bash', input: { command: 'git checkout -b a' } },
            { type: 'tool_use', name: 'Bash', input: { command: 'git checkout -b b' } },
          ],
        },
      }),
    ].join('\n');
    const out = parseSessionFile(text, { fallbackSessionId: 's1', fallbackRepo: '/x' });
    expect(out[0]!.branch).toBe('HEAD'); // ambiguous — do not guess (no false branch match)
  });
});

describe('resolveBranch — guarded single-branch recovery', () => {
  it('keeps a real top-level branch', () => {
    expect(resolveBranch('feature/x', new Set(['other']))).toBe('feature/x');
  });
  it('recovers the sole created branch when top-level is useless', () => {
    expect(resolveBranch('HEAD', new Set(['docs/x']))).toBe('docs/x');
    expect(resolveBranch(null, new Set(['docs/x']))).toBe('docs/x');
  });
  it('does not guess when zero or multiple branches were created', () => {
    expect(resolveBranch('HEAD', new Set())).toBe('HEAD');
    expect(resolveBranch('HEAD', new Set(['a', 'b']))).toBe('HEAD');
    expect(resolveBranch(null, new Set(['a', 'b']))).toBeNull();
  });
});
