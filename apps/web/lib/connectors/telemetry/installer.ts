import type { TelemetryProvider } from './types';

function codexInstaller(token: string, origin: string): string {
  const endpoint = new URL('/api/connect/telemetry/otel/v1/logs', origin).toString();
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
mkdir -p "\$CONFIG_DIR"
if [ -f "\$CONFIG_FILE" ]; then cp "\$CONFIG_FILE" "\$CONFIG_FILE.prism-backup-\$(date +%Y%m%d%H%M%S)"; fi
node - "\$CONFIG_FILE" <<'PRISM_NODE'
const fs = require('fs');
const file = process.argv[2];
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
PRISM_NODE
curl -fsS -X POST '${endpoint}' \\
  -H 'content-type: application/json' \\
  -H 'x-prism-token: ${token}' \\
  --data '{"prism_test":true}' >/dev/null
echo "Prism connected to Codex. Start a new Codex session to send metadata."
echo "A timestamped backup was kept if config.toml already existed."
`;
}

function claudeInstaller(token: string, origin: string): string {
  const baseEndpoint = new URL('/api/connect/telemetry/otel', origin).toString();
  const logEndpoint = new URL('/api/connect/telemetry/otel/v1/logs', origin).toString();
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
mkdir -p "\$CONFIG_DIR"
if [ -f "\$CONFIG_FILE" ]; then cp "\$CONFIG_FILE" "\$CONFIG_FILE.prism-backup-\$(date +%Y%m%d%H%M%S)"; fi
node - "\$CONFIG_FILE" <<'PRISM_NODE'
const fs = require('fs');
const file = process.argv[2];
let settings = {};
if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim()) {
  settings = JSON.parse(fs.readFileSync(file, 'utf8'));
}
settings.env = { ...(settings.env || {}), ...${JSON.stringify(env)} };
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\\n', { mode: 0o600 });
fs.chmodSync(file, 0o600);
PRISM_NODE
curl -fsS -X POST '${logEndpoint}' \\
  -H 'content-type: application/json' \\
  -H 'x-prism-token: ${token}' \\
  --data '{"prism_test":true}' >/dev/null
echo "Prism connected to Claude Code. Start a new Claude Code session to send metadata."
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
