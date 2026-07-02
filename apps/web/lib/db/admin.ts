// lib/db/admin.ts
//
// Admin-view reads: connector cards, the roster match table (matched/BYO/unmatched),
// the versioned index-config display, and the sizing rule. The `connectors` table is
// per-function (one row each for github / claude_code / sentry once configured);
// missing rows render as "Not configured". index_config is seeded (the only seed), so
// getIndexConfig / getSizingRule light up immediately from config v1.

import type {
  ConnectorCardDTO,
  RosterMatchDTO,
  IndexConfigRowDTO,
  SizingRuleDTO,
  Dimension,
} from '@/lib/ui/view-models';
import { DIMENSION_TAG } from '@/lib/ui/view-models';
import {
  db,
  selectRows,
  selectOne,
  getCurrentEmployeeId,
  DIMENSIONS,
  DIMENSION_LABEL,
  DEFAULT_WEIGHT_PCT,
  type DbReadFilter,
} from './_base';

// ─────────────────────────────────────────────────────────────────────────────
// getConnectors
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectorLite {
  type: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
}

const CONNECTOR_DEFS: Array<{
  type: ConnectorCardDTO['type'];
  name: string;
  powers: string;
}> = [
  { type: 'github', name: 'GitHub', powers: 'PRs, diffs, sizing, reverts, AI→PR linkage' },
  {
    type: 'claude_code',
    name: 'Claude Code',
    powers: 'sessions, tokens, suggestions, skills, cost lens',
  },
  { type: 'sentry', name: 'Sentry', powers: 'deploys, incidents, change-failure, MTTR' },
];

export async function getConnectors(functionId: string): Promise<ConnectorCardDTO[]> {
  const client = await db();
  const rows = (await selectRows(
    client
      .from('connectors')
      .select('type, status, last_sync_at, last_error, function_id')
      .eq('function_id', functionId) as DbReadFilter,
  )) as unknown as ConnectorLite[];

  const byType = new Map(rows.map((r) => [r.type, r]));

  return CONNECTOR_DEFS.map((def) => {
    const row = byType.get(def.type);
    const connected = !!row && row.status === 'connected';
    return {
      type: def.type,
      name: def.name,
      connected,
      statusLabel: connectorStatusLabel(row),
      powers: def.powers,
      syncLabel: row?.last_sync_at ? `synced ${shortDateTime(row.last_sync_at)}` : null,
    };
  });
}

function connectorStatusLabel(row: ConnectorLite | undefined): string {
  if (!row) return 'Not configured';
  switch (row.status) {
    case 'connected':
      return 'Connected';
    case 'syncing':
      return 'Syncing…';
    case 'error':
      return row.last_error ? `Error: ${row.last_error}` : 'Error';
    case 'not_configured':
    default:
      return 'Not configured';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getRosterMatches
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeMatchLite {
  id: string;
  name: string;
  designation?: string | null;
  email: string | null;
  github_handle: string | null;
  claude_account_uuid: string | null;
  attribution_mode: string | null;
  match_status: string | null;
  active: boolean;
}

export async function getRosterMatches(functionId: string): Promise<RosterMatchDTO[]> {
  const client = await db();
  const meId = await getCurrentEmployeeId();

  const rows = (await selectRows(
    client
      .from('employees')
      .select(
        'id, name, designation, email, github_handle, claude_account_uuid, attribution_mode, match_status, active, function_id',
      )
      .eq('function_id', functionId) as DbReadFilter,
  )) as unknown as EmployeeMatchLite[];

  return rows
    .filter((e) => e.active !== false)
    .map((e) => ({
      name: e.name,
      designation: e.designation ?? '',
      githubHandle: e.github_handle,
      email: e.email,
      claudeUuidMasked: maskUuid(e.claude_account_uuid),
      match: matchStatus(e),
      you: meId !== null && e.id === meId,
    }));
}

/** `match_status` is the text enum 'linked'|'byo'|'unmatched' — read it directly. */
function matchStatus(e: EmployeeMatchLite): RosterMatchDTO['match'] {
  if (e.match_status === 'linked' || e.match_status === 'byo') return e.match_status;
  return 'unmatched';
}

function maskUuid(uuid: string | null): string | null {
  if (!uuid) return null;
  if (uuid.length <= 8) return uuid;
  return `${uuid.slice(0, 4)}…${uuid.slice(-4)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// getIndexConfig (versioned weights/anchors — read-only)
// ─────────────────────────────────────────────────────────────────────────────

interface IndexConfigLite {
  version: number;
  weights_jsonb: Record<string, number> | null;
  anchors_jsonb: Record<string, { floor?: number; target: number; ceil?: number }> | null;
  sizing_jsonb: {
    weights?: { files?: number; hunks?: number; modules?: number; blast?: number };
    thresholds?: { s_max?: number; m_max?: number };
    tie_break_pct?: number;
    calibrated?: boolean;
  } | null;
}

/**
 * Fetch the active index_config row. There is no is_active column: the active config
 * is the highest `version` for the function (order by version desc, limit 1). The seed
 * ties config v1 to the bootstrap function. null when absent.
 */
async function activeConfig(functionId: string): Promise<IndexConfigLite | null> {
  const client = await db();
  const row = (await selectOne(() =>
    client
      .from('index_config')
      .select('version, weights_jsonb, anchors_jsonb, sizing_jsonb')
      .eq('function_id', functionId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )) as IndexConfigLite | null;
  return row;
}

export async function getIndexConfig(functionId: string): Promise<IndexConfigRowDTO[]> {
  const cfg = await activeConfig(functionId);
  const weights = cfg?.weights_jsonb ?? null;

  return DIMENSIONS.map((d) => ({
    dimension: d,
    tag: DIMENSION_TAG[d],
    label: DIMENSION_LABEL[d],
    weightPct: weightPct(weights, d),
    anchorLabel: anchorLabel(d),
  }));
}

function weightPct(weights: Record<string, number> | null, d: Dimension): number {
  const w = weights?.[d];
  if (typeof w === 'number') return Math.round(w * 100);
  return DEFAULT_WEIGHT_PCT[d];
}

/** A short human label describing each dimension's primary anchor direction. */
function anchorLabel(d: Dimension): string {
  switch (d) {
    case 'usage':
      return 'AI-assisted PR share: 0 → target';
    case 'efficiency':
      return 'turns: 12 → 3 (inverted)';
    case 'effectiveness':
      return 'merged-without-revert: floor → 1.0';
    case 'proficiency':
      return 'skill leverage: 0 → target';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getSizingRule
// ─────────────────────────────────────────────────────────────────────────────

export async function getSizingRule(functionId: string): Promise<SizingRuleDTO> {
  const cfg = await activeConfig(functionId);
  const sizing = cfg?.sizing_jsonb ?? null;
  const mw = sizing?.weights?.modules ?? 2;
  const bw = sizing?.weights?.blast ?? 3;
  const sMax = sizing?.thresholds?.s_max ?? 6;
  const mMax = sizing?.thresholds?.m_max ?? 18;

  return {
    formula: `files + hunks + ${mw}·modules + ${bw}·blast`,
    thresholds: [`S ≤ ${sMax}`, `M ${sMax + 1}–${mMax}`, `L > ${mMax}`],
    // Frozen once 90-day tertiles are computed; seed sizing is not yet calibrated.
    frozen: sizing?.calibrated === true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// utils
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mon = MONTHS[d.getUTCMonth()] ?? '';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mon} ${d.getUTCDate()}, ${hh}:${mm}`;
}
