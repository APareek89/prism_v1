// lib/connectors/types.ts
//
// The shared Connector CONTRACT (M2). Every data source (github / claude_code /
// sentry / otel) implements this thin interface so the pipeline + Admin chrome can
// drive them uniformly. Kept deliberately light — connectors WRITE raw evidence +
// their own status row only; they never compute scores or narrative
// (architecture §5, ownership-map).
//
// Keyless-safe contract (architecture §0): a not-configured connector returns
// status() === 'not_configured', its ingest() writes NOTHING and never throws, and
// importing this module has zero side effects.

import type { ConnectorStatus, ConnectorType } from '@/lib/types/db';

export type { ConnectorStatus, ConnectorType };

// ─────────────────────────────────────────────────────────────────────────────
// Ingest result / stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-connector ingest accounting, returned by `ingest()` and surfaced in the
 * pipeline log. `written`/`skipped` count raw rows; `errors` is human-readable and
 * never throws the caller out of the pipeline (keyless / partial-failure safe).
 */
export interface IngestStats {
  /** rows actually upserted into the raw tables. */
  written: number;
  /** rows seen but not written (already current / out of window / filtered). */
  skipped: number;
  /** non-fatal, human-readable problems. A configured-but-degraded sync still returns. */
  errors: string[];
}

/** A fresh zeroed `IngestStats`. Used by no-op (not_configured) connectors. */
export function emptyIngestStats(): IngestStats {
  return { written: 0, skipped: 0, errors: [] };
}

/**
 * The result of one high-level connector run (a full `ingest()` cycle). Carries the
 * connector type + the resulting status that should be written back to the
 * `connectors` row, so the pipeline can persist health in one place.
 */
export interface SyncResult {
  type: ConnectorType;
  /** terminal status to persist on the connectors row after this run. */
  status: ConnectorStatus;
  stats: IngestStats;
  /** set when `status === 'error'`; mirrored into connectors.last_error. */
  error?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Connector interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The uniform contract every connector implements. Each method is scoped to a
 * single function (the bootstrap function today; multi-function-ready).
 *
 *   • status()  → current health WITHOUT side effects (reads env + connectors row).
 *   • connect() → persist config + flip status to 'connected' (or 'error'). Idempotent.
 *   • ingest()  → pull raw evidence into the raw tables for the trailing window.
 *
 * A not-configured connector: status() === 'not_configured', connect() is a no-op
 * returning 'not_configured', ingest() writes nothing and never throws.
 */
export interface Connector {
  /** the connector kind (matches the connectors.type enum). */
  readonly type: ConnectorType;
  /** Current health for this function. Never throws; reads env + connectors row. */
  status(functionId: string): Promise<ConnectorStatus>;
  /** Persist non-secret config + flip status. Idempotent; safe to call repeatedly. */
  connect(functionId: string, config?: Record<string, unknown>): Promise<ConnectorStatus>;
  /** Pull raw evidence for the trailing window. Returns accounting; never throws. */
  ingest(functionId: string): Promise<SyncResult>;
}

/** Convenience: a SyncResult for a connector that is not configured (wrote nothing). */
export function notConfiguredResult(type: ConnectorType): SyncResult {
  return { type, status: 'not_configured', stats: emptyIngestStats(), error: null };
}
