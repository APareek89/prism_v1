import type { TelemetryProvider } from './types';

const PR_LINK_FORWARDER_SOURCE = String.raw`#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const provider = process.env.PRISM_PROVIDER === 'codex' ? 'codex' : 'claude_code';
const bridgeDir = process.env.PRISM_BRIDGE_DIR || path.join(os.homedir(), '.prism');
const configFile = path.join(bridgeDir, provider + '.json');
const prUrl = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d+)/;
const prCreateCommand = /\bgh\s+pr\s+create\b/i;

function debug(message) {
  if (process.env.PRISM_INGEST_DEBUG === '1') {
    process.stderr.write('[prism-pr-link] ' + message + '\n');
  }
}

function stdin() {
  return new Promise((resolve) => {
    let value = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { value += chunk; });
    process.stdin.on('end', () => resolve(value));
    process.stdin.on('error', () => resolve(value));
    setTimeout(() => resolve(value), 2_000);
  });
}

async function post(url, token, payload) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-prism-token': token },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok || response.status < 500) return response.status;
    } catch {
      // A lifecycle hook must never interrupt the coding session. Retry briefly,
      // then leave the later pipeline run to expose the missing association.
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  return 0;
}

async function main() {
  if (!fs.existsSync(configFile)) return;
  let config;
  try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return; }
  if (!config?.url || !config?.token) return;

  const raw = await stdin();
  if (!prCreateCommand.test(raw)) return;
  const match = prUrl.exec(raw);
  if (!match) return;
  let event = {};
  try { event = JSON.parse(raw); } catch { /* the URL scan still stays valid */ }
  const sessionId = event.session_id || event.sessionId || '';
  if (typeof sessionId !== 'string' || !sessionId.trim()) return;

  const payload = {
    sessionId: sessionId.trim(),
    repo: match[1],
    prNumber: Number(match[2]),
  };
  const status = await post(config.url, config.token, payload);
  debug((status || 'failed') + ' ' + payload.repo + '#' + payload.prNumber);
}

main().catch(() => undefined).finally(() => process.exit(0));
`;

function codexInstaller(token: string, origin: string): string {
  const endpoint = new URL('/api/connect/telemetry/otel/v1/logs', origin).toString();
  const prLinkEndpoint = new URL('/api/connect/telemetry/pr-link', origin).toString();
  const block = [
    '[otel]',
    'environment = "prism"',
    'log_user_prompt = false',
    `exporter = { otlp-http = { endpoint = ${JSON.stringify(endpoint)}, protocol = "json", headers = { "x-prism-token" = ${JSON.stringify(token)} } } }`,
  ].join('\n');

  return `#!/bin/sh
set -eu
command -v node >/dev/null 2>&1 || { echo "Prism setup needs Node.js." >&2; exit 1; }
CONFIG_DIR="\${PRISM_CODEX_CONFIG_DIR:-\${CODEX_HOME:-\$HOME/.codex}}"
CONFIG_FILE="\$CONFIG_DIR/config.toml"
BRIDGE_DIR="\${PRISM_BRIDGE_DIR:-\$HOME/.prism}"
mkdir -p "\$CONFIG_DIR" "\$BRIDGE_DIR"
if [ -f "\$CONFIG_FILE" ]; then cp "\$CONFIG_FILE" "\$CONFIG_FILE.prism-backup-\$(date +%Y%m%d%H%M%S)"; fi
node - "\$CONFIG_FILE" "\$CONFIG_DIR" "\$BRIDGE_DIR" <<'PRISM_NODE'
const fs = require('fs');
const path = require('path');
const [file, configDir, bridgeDir] = process.argv.slice(2);
const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const lines = current.split(/\\r?\\n/);
const kept = [];
let skipping = false;
for (const line of lines) {
  const header = line.match(/^\\s*\\[([^\\]]+)\\]\\s*$/);
  if (header) {
    const name = header[1].trim();
    skipping = name === 'otel' || name.startsWith('otel.');
    if (skipping) continue;
  }
  if (!skipping) kept.push(line);
}
const block = ${JSON.stringify(block)};
const prefix = kept.join('\\n').trimEnd();
fs.writeFileSync(file, (prefix ? prefix + '\\n\\n' : '') + block + '\\n', { mode: 0o600 });
fs.chmodSync(file, 0o600);

const forwarderFile = path.join(bridgeDir, 'prism-pr-link-forwarder.mjs');
fs.writeFileSync(forwarderFile, ${JSON.stringify(PR_LINK_FORWARDER_SOURCE)}, { mode: 0o700 });
fs.chmodSync(forwarderFile, 0o700);
const bridgeConfig = path.join(bridgeDir, 'codex.json');
fs.writeFileSync(bridgeConfig, JSON.stringify({ url: ${JSON.stringify(prLinkEndpoint)}, token: ${JSON.stringify(token)} }, null, 2) + '\\n', { mode: 0o600 });
fs.chmodSync(bridgeConfig, 0o600);

const hooksFile = path.join(configDir, 'hooks.json');
let hooks = {};
if (fs.existsSync(hooksFile) && fs.readFileSync(hooksFile, 'utf8').trim()) {
  fs.copyFileSync(hooksFile, hooksFile + '.prism-backup-' + Date.now());
  hooks = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
}
hooks.hooks = hooks.hooks && typeof hooks.hooks === 'object' ? hooks.hooks : {};
const groups = Array.isArray(hooks.hooks.PostToolUse) ? hooks.hooks.PostToolUse : [];
hooks.hooks.PostToolUse = groups.filter((group) => {
  const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
  return !handlers.some((handler) => String(handler?.command || '').includes('prism-pr-link-forwarder.mjs') && String(handler?.command || '').includes('PRISM_PROVIDER=codex'));
});
hooks.hooks.PostToolUse.push({
  matcher: 'Bash',
  hooks: [{
    type: 'command',
    command: 'env PRISM_PROVIDER=codex node ' + JSON.stringify(forwarderFile),
    timeout: 10,
    statusMessage: 'Linking created PR to Prism',
  }],
});
fs.writeFileSync(hooksFile, JSON.stringify(hooks, null, 2) + '\\n', { mode: 0o600 });
fs.chmodSync(hooksFile, 0o600);
PRISM_NODE
curl -fsS -X POST '${endpoint}' \\
  -H 'content-type: application/json' \\
  -H 'x-prism-token: ${token}' \\
  --data '{"prism_test":true}' >/dev/null
echo "Prism connected to Codex. OTEL remains the activity feed; a metadata-only PR hook was added."
echo "Start a new Codex session, open /hooks, and trust the Prism hook when prompted."
echo "Timestamped backups were kept for existing Codex config and hook files."
`;
}

function claudeInstaller(token: string, origin: string): string {
  const baseEndpoint = new URL('/api/connect/telemetry/otel', origin).toString();
  const logEndpoint = new URL('/api/connect/telemetry/otel/v1/logs', origin).toString();
  const prLinkEndpoint = new URL('/api/connect/telemetry/pr-link', origin).toString();
  const env = {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: baseEndpoint,
    OTEL_EXPORTER_OTLP_HEADERS: `x-prism-token=${token}`,
    OTEL_LOG_USER_PROMPTS: '0',
  };

  return `#!/bin/sh
set -eu
command -v node >/dev/null 2>&1 || { echo "Prism setup needs Node.js." >&2; exit 1; }
CONFIG_DIR="\${PRISM_CLAUDE_CONFIG_DIR:-\$HOME/.claude}"
CONFIG_FILE="\$CONFIG_DIR/settings.json"
BRIDGE_DIR="\${PRISM_BRIDGE_DIR:-\$HOME/.prism}"
mkdir -p "\$CONFIG_DIR" "\$BRIDGE_DIR"
if [ -f "\$CONFIG_FILE" ]; then cp "\$CONFIG_FILE" "\$CONFIG_FILE.prism-backup-\$(date +%Y%m%d%H%M%S)"; fi
node - "\$CONFIG_FILE" "\$BRIDGE_DIR" <<'PRISM_NODE'
const fs = require('fs');
const path = require('path');
const [file, bridgeDir] = process.argv.slice(2);
let settings = {};
if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim()) {
  settings = JSON.parse(fs.readFileSync(file, 'utf8'));
}
settings.env = { ...(settings.env || {}), ...${JSON.stringify(env)} };

const forwarderFile = path.join(bridgeDir, 'prism-pr-link-forwarder.mjs');
fs.writeFileSync(forwarderFile, ${JSON.stringify(PR_LINK_FORWARDER_SOURCE)}, { mode: 0o700 });
fs.chmodSync(forwarderFile, 0o700);
const bridgeConfig = path.join(bridgeDir, 'claude_code.json');
fs.writeFileSync(bridgeConfig, JSON.stringify({ url: ${JSON.stringify(prLinkEndpoint)}, token: ${JSON.stringify(token)} }, null, 2) + '\\n', { mode: 0o600 });
fs.chmodSync(bridgeConfig, 0o600);

settings.hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
const groups = Array.isArray(settings.hooks.PostToolUse) ? settings.hooks.PostToolUse : [];
settings.hooks.PostToolUse = groups.filter((group) => {
  const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
  return !handlers.some((handler) => String(handler?.command || '').includes('prism-pr-link-forwarder.mjs') && String(handler?.command || '').includes('PRISM_PROVIDER=claude_code'));
});
settings.hooks.PostToolUse.push({
  matcher: 'Bash',
  hooks: [{
    type: 'command',
    command: 'env PRISM_PROVIDER=claude_code node ' + JSON.stringify(forwarderFile),
    timeout: 10,
  }],
});
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\\n', { mode: 0o600 });
fs.chmodSync(file, 0o600);
PRISM_NODE
curl -fsS -X POST '${logEndpoint}' \\
  -H 'content-type: application/json' \\
  -H 'x-prism-token: ${token}' \\
  --data '{"prism_test":true}' >/dev/null
echo "Prism connected to Claude Code. OTEL remains the activity feed; a metadata-only PR hook was added."
echo "Start a new Claude Code session to send activity and exact PR-link metadata."
echo "A timestamped backup was kept if settings.json already existed."
`;
}

export function buildTelemetryInstaller(
  provider: TelemetryProvider,
  token: string,
  origin: string,
): string {
  return provider === 'codex'
    ? codexInstaller(token, origin)
    : claudeInstaller(token, origin);
}
