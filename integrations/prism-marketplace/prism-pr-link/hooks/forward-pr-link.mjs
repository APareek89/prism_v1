#!/usr/bin/env node
// Claude Code PostToolUse(Bash) enrichment. The provider hook envelope is inspected
// locally, but only sessionId + owner/repo + PR number cross the network.

const PR_URL_RE = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d+)/;
const PR_CREATE_COMMAND_RE = /\bgh\s+pr\s+create\b/i;

function readStdin() {
  return new Promise((resolve) => {
    let value = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { value += chunk; });
    process.stdin.on('end', () => resolve(value));
    process.stdin.on('error', () => resolve(value));
    setTimeout(() => resolve(value), 2_000);
  });
}

async function main() {
  const endpoint = process.env.PRISM_INGEST_URL;
  const token = process.env.PRISM_INGEST_TOKEN;
  if (!endpoint || !token) return;

  const raw = await readStdin();
  if (!PR_CREATE_COMMAND_RE.test(raw)) return;
  const match = PR_URL_RE.exec(raw);
  if (!match) return;
  let event = {};
  try { event = JSON.parse(raw); } catch { /* URL extraction is still valid */ }
  const sessionId = event.session_id || event.sessionId || '';
  if (typeof sessionId !== 'string' || !sessionId.trim()) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-prism-token': token },
      body: JSON.stringify({
        sessionId: sessionId.trim(),
        repo: match[1],
        prNumber: Number(match[2]),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch {
    // Fire-and-forget evidence must never interrupt the Claude Code session.
  }
}

main().catch(() => undefined).finally(() => process.exit(0));
