// lib/connectors/sentry/incidents.ts
//
// Map Sentry issues/alerts → public.incidents rows, tie each to its deploy, and flag
// deploys.change_failed. Columns are the AUTHORITATIVE migration 0009 set:
//   incidents(id, function_id, deploy_id, started_at, resolved_at, severity,
//             ingested_at)
//   deploys(... change_failed ...)
//
// MTTR inputs: started_at (issue firstSeen) and resolved_at (issue lastSeen, only when
// the issue is resolved). The scoring engine computes MTTR = resolved_at - started_at;
// we only persist the two timestamps — no aggregation here (connectors stay raw).
//
// Change-failure: an issue whose firstRelease (preferred) or lastRelease maps to a
// known deploy sha marks that deploy as change_failed. Issues that can't be tied to a
// deploy still produce an incident row (deploy_id null) so MTTR signal isn't lost.

import type { SentryIssue } from './client';

/** Insert shape for one incidents row. Matches migration 0009 columns EXACTLY
 *  (id/ingested_at are DB-defaulted). deploy_id is resolved against persisted
 *  deploys at write time, so we carry the *sha* here and let the connector join. */
export interface IncidentInsert {
  function_id: string;
  /** filled in by the connector after deploys are upserted (sha → deploy id). */
  deploy_id: string | null;
  started_at: string | null;
  resolved_at: string | null;
  severity: string | null;
  /** transient: the release sha this issue points at; used to resolve deploy_id and
   *  to flag change_failed. NOT a DB column — stripped before insert. */
  _releaseSha: string | null;
}

/** The persisted insert (DB columns only) — `_releaseSha` removed. */
export type IncidentRow = Omit<IncidentInsert, '_releaseSha'>;

/** Sentry severity → our severity string. We keep Sentry's level verbatim (fatal /
 *  error / warning / info / debug); null when absent. */
function severityFor(issue: SentryIssue): string | null {
  return issue.level?.trim() || null;
}

/** Resolved timestamp: only meaningful when the issue is actually resolved. An
 *  unresolved/ignored issue has no resolution time → null (open incident, MTTR TBD). */
function resolvedAtFor(issue: SentryIssue): string | null {
  if ((issue.status ?? '').toLowerCase() !== 'resolved') return null;
  return issue.lastSeen?.trim() || null;
}

/** The release sha an incident should attribute to. firstRelease is where the error
 *  was introduced (the change that failed); fall back to lastRelease. Reuses the same
 *  sha-ish detection as releases.ts so versions that ARE shas line up. */
function releaseShaFor(issue: SentryIssue): string | null {
  const first = issue.firstRelease?.version?.trim();
  if (first) return first;
  const last = issue.lastRelease?.version?.trim();
  if (last) return last;
  return null;
}

/**
 * Map Sentry issues → incident inserts. `_releaseSha` is carried so the connector can
 * resolve deploy_id from the deploys it just upserted and flip change_failed. Issues
 * without a firstSeen are skipped (no MTTR start → no usable incident).
 */
export function mapIssuesToIncidents(issues: SentryIssue[], functionId: string): IncidentInsert[] {
  const out: IncidentInsert[] = [];

  for (const issue of issues) {
    const startedAt = issue.firstSeen?.trim() || null;
    if (!startedAt) continue; // can't anchor MTTR without a start; skip, never throw

    out.push({
      function_id: functionId,
      deploy_id: null,
      started_at: startedAt,
      resolved_at: resolvedAtFor(issue),
      severity: severityFor(issue),
      _releaseSha: releaseShaFor(issue),
    });
  }

  return out;
}

/**
 * Given incidents (with `_releaseSha`) and a sha→deployId map, return:
 *   - rows: persistable incident rows (deploy_id resolved, `_releaseSha` stripped)
 *   - failedDeployIds: deploy ids that an incident attributes to (→ change_failed=true)
 *
 * Pure — the connector applies the writes. Keeping this here makes MTTR + change-
 * failure wiring unit-testable without a DB.
 */
export function resolveIncidentDeploys(
  incidents: IncidentInsert[],
  shaToDeployId: Map<string, string>,
): { rows: IncidentRow[]; failedDeployIds: string[] } {
  const failed = new Set<string>();
  const rows: IncidentRow[] = incidents.map((inc) => {
    const deployId = inc._releaseSha ? shaToDeployId.get(inc._releaseSha) ?? null : null;
    if (deployId) failed.add(deployId);
    // strip the transient field
    const { _releaseSha, ...row } = inc;
    void _releaseSha;
    return { ...row, deploy_id: deployId };
  });
  return { rows, failedDeployIds: [...failed] };
}
