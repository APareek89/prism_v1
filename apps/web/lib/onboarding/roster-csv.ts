// lib/onboarding/roster-csv.ts
//
// Parse a roster CSV → provisionEmployee per row (architecture §9, PRD §7.2.1). The
// RosterUpload Admin action hands this raw CSV text; we parse with papaparse, validate
// each row, and idempotently provision every employee into the function. The whole
// roster shares one function (single-function MVP, multi-employee-ready).
//
// Expected header (case/space-insensitive):
//   name, designation, github_handle, email, claude_account_uuid
// Only `name` is required; the rest are optional. Unknown columns are ignored.

import Papa from 'papaparse';
import { provisionEmployee, type ProvisionOutcome } from './provision';

// ─────────────────────────────────────────────────────────────────────────────
// Parsed-row shape + result
// ─────────────────────────────────────────────────────────────────────────────

/** One normalized roster row (post header-mapping). */
export interface ParsedRosterRow {
  name: string;
  designation: string | null;
  githubHandle: string | null;
  email: string | null;
  claudeAccountUuid: string | null;
}

/** The outcome of importing a roster CSV. */
export interface RosterImportResult {
  /** rows successfully provisioned (created + updated). */
  provisioned: number;
  created: number;
  updated: number;
  /** rows skipped (no name / parse problem) with a reason. */
  skipped: Array<{ row: number; reason: string }>;
  /** the per-row provisioning outcomes (in input order), for detailed UI. */
  outcomes: ProvisionOutcome[];
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Header normalization
// ─────────────────────────────────────────────────────────────────────────────

/** Map a raw CSV header cell to our canonical key (snake/space/case-insensitive). */
function canonHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Pull a value for any of the accepted aliases from a raw row object. */
function pick(row: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim().length) return String(v).trim();
  }
  return null;
}

/** Normalize one raw parsed row to ParsedRosterRow (null name when absent). */
export function normalizeRow(raw: Record<string, string>): ParsedRosterRow {
  return {
    name: pick(raw, ['name', 'full_name', 'display_name']) ?? '',
    designation: pick(raw, ['designation', 'title', 'role']),
    githubHandle: pick(raw, ['github_handle', 'github', 'handle', 'gh']),
    email: pick(raw, ['email', 'email_address']),
    claudeAccountUuid: pick(raw, ['claude_account_uuid', 'account_uuid', 'claude_uuid']),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse + provision
// ─────────────────────────────────────────────────────────────────────────────

/** Parse CSV text into normalized rows (header-mapped). Never throws. */
export function parseRosterCsv(csv: string): ParsedRosterRow[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: canonHeader,
  });
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map(normalizeRow);
}

/**
 * Parse a roster CSV and idempotently provision every row into `functionId`. Rows with
 * no name are skipped (not fatal). Returns a per-row summary; never throws.
 */
export async function importRosterCsv(functionId: string, csv: string): Promise<RosterImportResult> {
  const result: RosterImportResult = {
    provisioned: 0,
    created: 0,
    updated: 0,
    skipped: [],
    outcomes: [],
    errors: [],
  };

  let parsed: ParsedRosterRow[];
  try {
    parsed = parseRosterCsv(csv);
  } catch (e) {
    result.errors.push(`CSV parse failed: ${e instanceof Error ? e.message : 'unknown'}`);
    return result;
  }

  if (parsed.length === 0) {
    result.errors.push('No rows found in roster CSV.');
    return result;
  }

  let i = 0;
  for (const row of parsed) {
    i += 1;
    if (!row.name) {
      result.skipped.push({ row: i, reason: 'missing name' });
      continue;
    }
    const outcome = await provisionEmployee({
      functionId,
      name: row.name,
      designation: row.designation,
      githubHandle: row.githubHandle,
      email: row.email,
      claudeAccountUuid: row.claudeAccountUuid,
    });
    result.outcomes.push(outcome);
    if (outcome.ok) {
      result.provisioned += 1;
      if (outcome.created) result.created += 1;
      else result.updated += 1;
    } else {
      result.errors.push(`row ${i} (${row.name}): ${outcome.error ?? 'provision failed'}`);
    }
  }

  return result;
}
