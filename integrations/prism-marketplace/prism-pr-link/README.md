# Prism PR link for Claude Code

This optional marketplace plugin is the fleet-distribution form of the hook already
installed by Prism's personal workspace command. After a Bash tool creates a GitHub PR,
it sends only the provider session ID, `owner/repo`, and PR number to Prism. Prompt text,
source code, commands, and tool output are never included in the request body.

The Prism workspace command is preferred for an individual because it configures OTEL,
the hook, the authenticated endpoint, and the per-person token together. For a managed
rollout, install this plugin and provide these values to the hook environment:

```sh
PRISM_INGEST_URL=https://prism-v1.onrender.com/api/connect/telemetry/pr-link
PRISM_INGEST_TOKEN=<the employee's personal Prism collector token>
```

The token resolves to one hashed `telemetry_connections` row. The server then requires
the repo to be in that function's GitHub scope and verifies the PR through that GitHub
App installation before accepting the metadata.
