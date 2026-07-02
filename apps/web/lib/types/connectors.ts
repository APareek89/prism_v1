// lib/types/connectors.ts
//
// Connector CONTRACTS (status, identity resolution, ingest results). Connectors
// write raw evidence + status only — no scores, no narrative (architecture §5).
// These are the cross-cutting types the Admin chrome and pipeline import.

import type { AttributionMode, ConnectorStatus, ConnectorType } from './db';

export type { ConnectorStatus, ConnectorType };

/** Health summary surfaced in Admin "awaiting signal" chrome. */
export interface ConnectorHealth {
  type: ConnectorType;
  status: ConnectorStatus;
  configured: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** human label for the card. */
  label: string;
}

/** The single identity-resolution result (github_handle / account_uuid / email →
 *  employee). Connectors resolve identity through this one chokepoint. */
export interface IdentityResolution {
  employeeId: string | null;
  attributionMode: AttributionMode;
  /** how the match was made (for Admin transparency). */
  matchedBy: 'github_handle' | 'account_uuid' | 'email' | null;
}

/** A connector ingest summary (rows written / skipped), for the pipeline log. */
export interface IngestResult {
  type: ConnectorType;
  written: number;
  skipped: number;
  errors: string[];
}
