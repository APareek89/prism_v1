// lib/connectors/index.ts
//
// The connectors BARREL — the single import surface the pipeline + Admin actions use
// to drive every data source. It re-exports the high-level entry points each connector
// module owns (architecture §5, ownership-map):
//
//   GitHub        (./github)            → ingestGitHub, backfillRepo, handleGitHubWebhook
//   Claude Code   (./claude-code)       → ingestClaudeCode, scanLocalSessions
//   Sentry        (./sentry)            → ingestSentry  (degrades gracefully when blank)
//   AI→PR link    (./link/ai-to-pr)     → linkAiToPr    (correlational; never a score)
//   Onboarding    (../onboarding/...)   → syncOrgMembers (GitHub org → employees)
//
// Plus the shared connector contract (types/status/window) so callers import one place.
//
// SERVER-ONLY: every re-exported module touches the service-role client / next env;
// never pull this barrel into a client bundle.

// ── Shared contract ──────────────────────────────────────────────────────────
export type { Connector, ConnectorStatus, ConnectorType, IngestStats, SyncResult } from './types';
export { emptyIngestStats, notConfiguredResult } from './types';
export {
  getConnectorStatus,
  getConnectorRecord,
  setStatus,
  upsertConfig,
  touchLastSync,
  type ConnectorRecord,
  type WriteResult,
} from './status';
export {
  ingestWindow,
  sizingWindow,
  trailingWindow,
  inWindow,
  WINDOW_DAYS,
  SIZING_WINDOW_DAYS,
  type IngestWindow,
} from './window';

// ── GitHub connector entry points (./github) ─────────────────────────────────
// CONTRACT: the GitHub connector module owns these free-function entry points. They are
// re-exported here so the pipeline imports everything from the barrel. The class
// `GitHubConnector` backs the Admin connect/status surface.
export {
  ingestGitHub,
  backfillRepo,
  handleGitHubWebhook,
  GitHubConnector,
  type GithubBackfillSummary,
} from './github';
// GitHub-side org-member discovery → onboarding provisioning (functionId-only entry).
export { syncGithubOrgMembers } from './github/org-sync';

// ── Blame refresh (./blame): AI-line capture + 30d retention re-check ─────────
export { refreshBlame, type BlameRefreshResult } from './blame';

// ── Connector identity chokepoint (./identity) ───────────────────────────────
export {
  resolveEmployeeByGithubHandle,
  resolveEmployeeByClaudeUuid,
  resolveEmployeeByEmail,
  resolveEmployee,
} from './identity';

// ── Claude Code connector entry points (./claude-code) ───────────────────────
export { ingestClaudeCode, scanLocalSessions } from './claude-code';

// ── Sentry connector entry point (./sentry) ──────────────────────────────────
export { ingestSentry } from './sentry';

// ── AI→PR link (./link/ai-to-pr) — correlational only, never a score input ───
export { linkAiToPr, type LinkStats } from './link/ai-to-pr';

// ── Onboarding: GitHub org member → employees (../onboarding/org-sync) ────────
export { syncOrgMembers, syncOrgMember, type GitHubOrgMember, type OrgSyncResult } from '@/lib/onboarding/org-sync';
