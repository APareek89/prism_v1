// Confidence — deterministic, published formula. Below the 0.40 publish floor
// an index is suppressed as "Insufficient" (score null), never shown as a
// shaky number. Each index carries its OWN confidence (spec §2).
//
// Main:    merged PRs (cap 12) 50% · sessions (cap 20) 30% · AI-linked PRs (cap 8) 20%
// Harness: AI-linked PRs (cap 8) 60% · connected-repo sessions (cap 20) 40%
// (Preview formula — recalibrate with real data; the SHAPE is the contract:
//  monotone in signal counts, capped, published.)

import { CONFIDENCE_PUBLISH_FLOOR } from '@prism/contract';

const part = (n: number, cap: number, weight: number) => (Math.min(n, cap) / cap) * weight;

export function mainConfidence(mergedPrs: number, sessions: number, aiPrs: number): number {
  return round2(part(mergedPrs, 12, 0.5) + part(sessions, 20, 0.3) + part(aiPrs, 8, 0.2));
}

export function harnessConfidence(aiPrs: number, connectedSessions: number): number {
  return round2(part(aiPrs, 8, 0.6) + part(connectedSessions, 20, 0.4));
}

export const publishable = (confidence: number): boolean => confidence >= CONFIDENCE_PUBLISH_FLOOR;

const round2 = (n: number) => Math.round(n * 100) / 100;
