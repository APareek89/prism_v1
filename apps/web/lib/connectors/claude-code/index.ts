// lib/connectors/claude-code/index.ts
//
// ClaudeCodeConnector — the demo's make-or-break Usage/Efficiency source. It reads
// the user's LOCAL ~/.claude session .jsonl files (READ-ONLY), parses them with the
// pure parser, derives cost from the per-model rate card, and upserts cc_sessions.
//
// Public surface:
//   • status()                       — sync, env-only, never throws.
//   • scanLocalSessions(functionId)  — walk + parse + persist; returns a tally.
//   • ingestClaudeCode(functionId)   — alias entry point (matches the pipeline's
//                                      ingest* naming used by the other connectors).
//
// CONTRACTS (architecture §0.1/§0.4):
//   • Keyless-safe: CLAUDE_LOCAL_SESSIONS_DIR has a default (~/.claude); if the dir
//     is missing, status is 'not_configured', nothing is written, nothing throws.
//   • No dummy data: writes only real parsed sessions; an empty dir writes nothing.
//   • Single-person demo binds every session to the is_demo "self employee".
//   • OTEL path is a typed no-op (otel-stub.ts); OTEL_LOG_USER_PROMPTS stays off.

import { isConfigured } from '@/lib/config/env';
import type { ConnectorStatus } from '@/lib/types/db';
import type { IngestResult } from '@/lib/types/connectors';
import { setStatus, touchLastSync, upsertConfig } from '@/lib/connectors/status';
import { scanLocalSessions as scanLocalSessionFiles, sessionsDir } from './local-sessions';
import { persistSessions } from './session-map';
import { ingestOtel, isOtelConfigured } from './otel-stub';

const CONNECTOR_TYPE = 'claude_code' as const;

/** The connector's public API. */
export interface ClaudeCodeConnectorApi {
  /** Synchronous, env-only — never hits the FS or DB. */
  status(): ConnectorStatus;
  /** Walk local sessions, parse, persist, and report a tally. Never throws. */
  scanLocalSessions(functionId: string): Promise<IngestResult>;
}

class ClaudeCodeConnector implements ClaudeCodeConnectorApi {
  status(): ConnectorStatus {
    // 'connected' simply means the local-file path is available (the dir has a
    // default), not that any session exists. An empty scan is a clean empty state.
    return isConfigured('claudeCode') ? 'connected' : 'not_configured';
  }

  async scanLocalSessions(functionId: string): Promise<IngestResult> {
    const result: IngestResult = { type: CONNECTOR_TYPE, written: 0, skipped: 0, errors: [] };

    // OTEL path is a typed no-op in M2; record it stays off (no prompt logging).
    if (isOtelConfigured()) {
      await ingestOtel();
    }

    // Mark syncing (best-effort; never throws past the connector).
    await setStatus(functionId, CONNECTOR_TYPE, 'syncing');

    try {
      // 1) Walk + parse local .jsonl files (READ-ONLY).
      const scan = await scanLocalSessionFiles();

      // 2) Persist (binds to the self employee; classifies BYO coverage).
      const persisted = await persistSessions(functionId, scan.sessions);
      result.written = persisted.written;
      result.skipped = persisted.skipped;
      result.errors.push(...persisted.errors);

      // 3) Surface scan metadata + BYO coverage note in the connector config.
      await upsertConfig(
        functionId,
        CONNECTOR_TYPE,
        {
          sessions_dir: scan.dir,
          files_scanned: scan.filesScanned,
          sessions_found: scan.sessions.length,
          stream_coverage: Number(persisted.classification.coverage.toFixed(4)),
          coverage_note: persisted.classification.note,
          scan_note: scan.note,
        },
        persisted.errors.length > 0 ? 'error' : 'connected',
      );

      // 4) Health: error if any write failed, else stamp last_sync_at.
      if (persisted.errors.length > 0) {
        await setStatus(functionId, CONNECTOR_TYPE, 'error', persisted.errors.join('; '));
      } else {
        await touchLastSync(functionId, CONNECTOR_TYPE);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(message);
      // Surface as connector health; never throw past scan so the pipeline keeps going.
      await setStatus(functionId, CONNECTOR_TYPE, 'error', message);
    }

    return result;
  }
}

/** The single shared instance. */
export const claudeCodeConnector: ClaudeCodeConnectorApi = new ClaudeCodeConnector();

/**
 * ENTRY POINT. Walk the local ~/.claude session files, parse + persist them as
 * cc_sessions for `functionId`, and return an ingest tally. Keyless-safe and
 * non-throwing.
 */
export async function scanLocalSessions(functionId: string): Promise<IngestResult> {
  return claudeCodeConnector.scanLocalSessions(functionId);
}

/**
 * ENTRY POINT (pipeline alias). Same as `scanLocalSessions` — named to match the
 * `ingest*` convention of the GitHub/Sentry connectors so the pipeline can call a
 * uniform set of ingest functions.
 */
export async function ingestClaudeCode(functionId: string): Promise<IngestResult> {
  return claudeCodeConnector.scanLocalSessions(functionId);
}

/** Re-exports for the pipeline / tests. */
export { sessionsDir };
export type { RawSession } from './parser';
