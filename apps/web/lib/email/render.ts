// lib/email/render.ts
//
// The render ENTRY: assemble a DigestInput (data.ts) and turn it into a ready-to-send
// email (subject + HTML + recipient) via the pure template (template.ts). No LLM, no
// numbers invented here.
//
// EMPTY-STATE SUPPRESSION (the no-dummy-data invariant): a digest is only rendered when
// there is real signal to report. If the employee has no computed index row, or the
// index is below the confidence floor (`suppressed`), OR there is nothing actionable to
// say (no spectrum score, no PR call-out, no recommendation, no course), renderDigest
// returns `null` and the outbox never queues an empty email. This mirrors the M1 read
// layer's "awaiting-signal" behaviour — silence beats a hollow digest.

import { buildDigestInput, type DigestInput } from './data';
import { renderDigestHtml, subjectFor } from './template';

export interface RenderedDigest {
  employeeId: string;
  functionId: string;
  date: string;
  toEmail: string | null; // null ⇒ recipient unknown; outbox skips send
  subject: string;
  html: string;
  input: DigestInput; // the computed input (for logging / tests)
}

/**
 * Does this digest carry any real, sendable signal? Suppressed (no/low-confidence
 * index) is an immediate no. Otherwise we require at least one concrete thing to show:
 * an L1, a scored dimension, a PR call-out, a recommendation, or a course.
 */
function hasSignal(d: DigestInput): boolean {
  if (d.suppressed) return false;
  if (d.l1 !== null) return true;
  if (d.spectrum.some((s) => s.score !== null)) return true;
  if (d.prCallouts.length > 0) return true;
  if (d.topRecommendation) return true;
  if (d.course) return true;
  return false;
}

/**
 * Render the daily digest for (employee, date). Returns null when the employee is
 * unknown/inactive OR when there is insufficient signal (empty-state suppression) —
 * in which case no email is queued.
 */
export async function renderDigest(
  employeeId: string,
  date: string,
  opts?: { appUrl?: string },
): Promise<RenderedDigest | null> {
  const input = await buildDigestInput(employeeId, date, opts);
  if (!input) return null;
  if (!hasSignal(input)) return null;

  return {
    employeeId: input.employeeId,
    functionId: input.functionId,
    date: input.date,
    toEmail: input.toEmail,
    subject: subjectFor(input),
    html: renderDigestHtml(input),
    input,
  };
}
