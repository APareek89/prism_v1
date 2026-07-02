// lib/adoption/transitions.ts
//
// The PURE rec-lifecycle state machine (PRD §10.4). No I/O, no clock.
//
//   suggested → acknowledged → in_progress → adopted
//                    └──────────────┴──────────→ dismissed
//
// DETERMINISM BOUNDARY: the monitor NEVER narrates and NEVER invents a status. It feeds a
// verified `AdoptionSignal` (computed in code from re-read evidence) into nextStatus, which
// returns the single allowed next status. Two hard rules encode the split with the
// user-driven route (which owns suggested→acknowledged and acknowledged→in_progress):
//
//   • The monitor only ADVANCES on evidence. It never moves a rec *backward*.
//   • The monitor never auto-acknowledges. suggested→acknowledged is a human action
//     (the "existing route"); on a `none` signal the monitor leaves the status as-is.
//     It MAY auto-advance acknowledged→in_progress on an `active` signal (partial
//     progress is objectively evidenced), and any open state → adopted/dismissed on a
//     terminal signal.

export type RecStatus =
  | 'suggested'
  | 'acknowledged'
  | 'in_progress'
  | 'adopted'
  | 'dismissed';

/** The open (non-terminal) statuses the monitor may act on. */
export const OPEN_STATUSES: readonly RecStatus[] = ['suggested', 'acknowledged', 'in_progress'];

/** Whether a status is terminal (monitor leaves it alone). */
export function isTerminal(s: RecStatus): boolean {
  return s === 'adopted' || s === 'dismissed';
}

/**
 * The evidence-derived signal for a rec, computed in code by the predicates:
 *   • 'adopted' — the recommended change is now fully evidenced (target met).
 *   • 'active'  — partial, objective progress toward the target (advances to in_progress).
 *   • 'stale'   — the recommendation is no longer applicable for a NON-adoption reason
 *                 (e.g. the member stopped the activity the rec targeted; the denominator
 *                 vanished) → dismiss, evidence-gated.
 *   • 'none'    — no change; leave the rec where the human put it.
 */
export type AdoptionSignal = 'adopted' | 'active' | 'stale' | 'none';

/**
 * Compute the next status from the current status + the evidence signal. Returns the SAME
 * status when no monitor-driven transition applies (idempotent). Never regresses.
 */
export function nextStatus(current: RecStatus, signal: AdoptionSignal): RecStatus {
  if (isTerminal(current)) return current; // adopted/dismissed are final

  switch (signal) {
    case 'adopted':
      return 'adopted'; // terminal win from any open state
    case 'stale':
      return 'dismissed'; // evidence-gated dismissal from any open state
    case 'active':
      // Partial progress: advance acknowledged → in_progress. Do NOT auto-acknowledge a
      // still-suggested rec (that's the human's step); leave in_progress unchanged.
      return current === 'acknowledged' ? 'in_progress' : current;
    case 'none':
    default:
      return current; // no monitor-driven change
  }
}

/** Whether a proposed transition is a real change (drives whether we write). */
export function isTransition(from: RecStatus, to: RecStatus): boolean {
  return from !== to;
}
