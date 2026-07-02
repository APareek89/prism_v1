// lib/connectors/claude-code/local-sessions.ts
//
// Filesystem walk over CLAUDE_LOCAL_SESSIONS_DIR (default ~/.claude). Reads every
// **/*.jsonl session file READ-ONLY, parses each with the pure parser, and merges
// the results across files into a single RawSession per (sessionId, repo) — a
// session can theoretically appear in more than one file, and a single file can
// span multiple repos. Server-only (node:fs). Keyless-safe: if the dir is missing
// or unreadable, returns an empty list and a note instead of throwing.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseSessionFile, type RawSession, type PrRef } from './parser';
import { deriveCostUsd } from './pricing';
import { makeSessionKey } from './byo';
import { serverEnv } from '@/lib/config/env';

/** Result of a local scan: the merged sessions + a human-readable note + counters. */
export interface LocalScanResult {
  sessions: RawSession[];
  filesScanned: number;
  dir: string;
  /** non-fatal note (e.g. dir missing) — surfaced to the connector status. */
  note: string | null;
}

/** Expand a leading `~` / `~/` to the user's home dir. */
export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** The configured sessions dir (env or ~/.claude), home-expanded + absolute. */
export function sessionsDir(): string {
  const raw = serverEnv.CLAUDE_LOCAL_SESSIONS_DIR || '~/.claude';
  return path.resolve(expandHome(raw));
}

/** Recursively collect absolute paths of all *.jsonl files under `root`. Never throws. */
async function globJsonl(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable subtree — skip silently.
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

/**
 * Decode a ~/.claude project dir name back into a cwd-ish repo string. The real
 * encoding replaces path separators with '-' and is lossy, so we cannot perfectly
 * reverse it — but the per-line `cwd` is authoritative and almost always present,
 * making this only a fallback for cwd-less lines. We return the encoded name
 * un-mangled (leading '-' → '/') as a best effort.
 */
export function decodeProjectDir(encoded: string): string {
  if (encoded.startsWith('-')) return '/' + encoded.slice(1).replace(/-/g, '/');
  return encoded;
}

/** True when a branch value names a real feature branch (not null/'HEAD'/detached). */
function isRealBranch(b: string | null): boolean {
  if (b === null) return false;
  const v = b.trim().toLowerCase();
  return v !== '' && v !== 'head' && v !== 'detached';
}

/** Mutable accumulator mirroring RawSession for cross-file merge. */
interface Merged {
  sessionId: string;
  repo: string;
  branch: string | null;
  ts: string | null;
  turns: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreation: number;
  model: string | null;
  suggestionsOffered: number;
  suggestionsAccepted: number;
  skills: Set<string>;
  promptLenSum: number;
  promptCount: number;
  /** union of pr-link refs across files, deduped by "repo#number". */
  prRefs: Map<string, PrRef>;
}

/** Fold one parsed RawSession into the cross-file merge map. */
function mergeInto(map: Map<string, Merged>, s: RawSession): void {
  const key = makeSessionKey(s.sessionId, s.repo);
  let m = map.get(key);
  if (!m) {
    m = {
      sessionId: s.sessionId,
      repo: s.repo,
      branch: s.branch,
      ts: s.ts,
      turns: 0,
      tokensIn: 0,
      tokensOut: 0,
      cacheRead: 0,
      cacheCreation: 0,
      model: null,
      suggestionsOffered: 0,
      suggestionsAccepted: 0,
      skills: new Set<string>(),
      promptLenSum: 0,
      promptCount: 0,
      prRefs: new Map<string, PrRef>(),
    };
    map.set(key, m);
  }
  // earliest ts
  if (s.ts && (!m.ts || s.ts < m.ts)) m.ts = s.ts;
  // Prefer a real branch over a useless 'HEAD'/detached/null carried by another file.
  if (isRealBranch(s.branch) && !isRealBranch(m.branch)) m.branch = s.branch;
  else if (m.branch == null && s.branch != null) m.branch = s.branch;
  for (const ref of s.prRefs) m.prRefs.set(`${ref.repo}#${ref.number}`, ref);
  m.turns += s.turns;
  m.tokensIn += s.tokensIn;
  m.tokensOut += s.tokensOut;
  m.cacheRead += s.cacheRead;
  m.cacheCreation += s.cacheCreation;
  m.suggestionsOffered += s.suggestionsOffered;
  m.suggestionsAccepted += s.suggestionsAccepted;
  if (s.model) m.model = s.model;
  for (const sk of s.skillsUsed) m.skills.add(sk);
  // RawSession exposes only the per-file prompt AVG (not the raw count), so an exact
  // token-weighted merge isn't recoverable here. A (sessionId, repo) appearing in
  // multiple files is rare — in practice a session lives in exactly one file — so we
  // approximate the merged avg as the unweighted mean of the per-file averages. For
  // the dominant single-file case this is exact.
  if (s.promptLenAvg !== null) {
    m.promptLenSum += s.promptLenAvg;
    m.promptCount += 1;
  }
}

/** Finalize a merged accumulator into a RawSession (re-derive cost from merged tokens). */
function finalize(m: Merged): RawSession {
  return {
    sessionId: m.sessionId,
    repo: m.repo,
    branch: m.branch,
    ts: m.ts,
    turns: m.turns,
    tokensIn: m.tokensIn,
    tokensOut: m.tokensOut,
    cacheRead: m.cacheRead,
    cacheCreation: m.cacheCreation,
    costUsd: deriveCostUsd(m.model, {
      tokensIn: m.tokensIn,
      tokensOut: m.tokensOut,
      cacheRead: m.cacheRead,
      cacheCreation: m.cacheCreation,
    }),
    model: m.model,
    suggestionsOffered: m.suggestionsOffered,
    suggestionsAccepted: m.suggestionsAccepted,
    skillsUsed: Array.from(m.skills).sort(),
    promptLenAvg:
      m.promptCount > 0 ? Math.round((m.promptLenSum / m.promptCount) * 100) / 100 : null,
    prRefs: Array.from(m.prRefs.values()).sort((a, b) =>
      a.repo === b.repo ? a.number - b.number : a.repo.localeCompare(b.repo),
    ),
  };
}

/**
 * Walk the local sessions dir and return merged RawSessions. READ-ONLY. Never
 * throws — a missing/empty dir yields an empty list and an explanatory note so the
 * connector can report 'not_configured' / a clean empty state.
 */
export async function scanLocalSessions(): Promise<LocalScanResult> {
  const dir = sessionsDir();

  let exists = true;
  try {
    const st = await fs.stat(dir);
    exists = st.isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) {
    return { sessions: [], filesScanned: 0, dir, note: `sessions dir not found: ${dir}` };
  }

  const files = await globJsonl(dir);
  const map = new Map<string, Merged>();
  let scanned = 0;

  for (const file of files) {
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      continue; // unreadable file — skip.
    }
    scanned += 1;
    const stem = path.basename(file, '.jsonl');
    const fallbackRepo = decodeProjectDir(path.basename(path.dirname(file)));
    const parsed = parseSessionFile(text, {
      fallbackSessionId: stem,
      fallbackRepo,
    });
    for (const s of parsed) mergeInto(map, s);
  }

  const sessions = Array.from(map.values())
    .map(finalize)
    // newest-first for stable, demo-friendly ordering.
    .sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''));

  return {
    sessions,
    filesScanned: scanned,
    dir,
    note: scanned === 0 ? `no .jsonl session files under ${dir}` : null,
  };
}
