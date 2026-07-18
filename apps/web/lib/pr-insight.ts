// Shared decoder for persisted PR-level insight metadata. New trace rows store the
// authoritative verdict, PR ref, and size bucket as typed fields. Legacy rows fall
// back to their title/evidence refs without ever treating UUID digits as PR numbers.

export type PrInsightFlag = 'clean' | 're-prompt' | 'revert' | 'ai-slop';
export type PrSizeBucket = 'S' | 'M' | 'L';

export interface DecodedPrInsight {
  flag: PrInsightFlag;
  prNumber: string | null;
  sizeBucket: PrSizeBucket | null;
}

export function decodePrInsight(
  evidence: unknown,
  title: string,
  body: string,
): DecodedPrInsight {
  const record = evidenceRecord(evidence);
  const refs = evidenceRefs(evidence);
  return {
    flag: storedFlag(record?.verdict) ?? inferFlag(title, body),
    prNumber: storedPrNumber(record?.ref) ?? legacyPrNumber(refs),
    sizeBucket: storedSize(record?.sizeBucket) ?? legacySize(refs),
  };
}

function evidenceRecord(evidence: unknown): Record<string, unknown> | null {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  return evidence as Record<string, unknown>;
}

function evidenceRefs(evidence: unknown): string[] {
  if (Array.isArray(evidence)) return evidence.filter((value): value is string => typeof value === 'string');
  const refs = evidenceRecord(evidence)?.refs;
  return Array.isArray(refs) ? refs.filter((value): value is string => typeof value === 'string') : [];
}

function storedFlag(value: unknown): PrInsightFlag | null {
  if (value === 'clean' || value === 'revert') return value;
  if (value === 're_prompt') return 're-prompt';
  if (value === 'ai_slop') return 'ai-slop';
  return null;
}

function inferFlag(title: string, body: string): PrInsightFlag {
  const titleText = title.toLowerCase();
  // Clean narratives correctly say "no revert or rework" in the body, so the explicit
  // title verdict must win over negative words used to describe their absence.
  if (titleText.includes('clean')) return 'clean';
  const text = `${titleText} ${body}`.toLowerCase();
  if (text.includes('revert')) return 'revert';
  if (text.includes('slop')) return 'ai-slop';
  if (text.includes('re-prompt') || text.includes('reprompt') || text.includes('iteration')) return 're-prompt';
  return 'clean';
}

function storedPrNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^#(\d+)$/);
  return match ? `#${match[1]}` : null;
}

function legacyPrNumber(refs: string[]): string | null {
  const ref = refs.find((value) => /^#\d+$/.test(value) || /(?:^|:)pr:#\d+(?::|$)/.test(value));
  if (!ref) return null;
  const match = ref.match(/#(\d+)/);
  return match ? `#${match[1]}` : null;
}

function storedSize(value: unknown): PrSizeBucket | null {
  return value === 'S' || value === 'M' || value === 'L' ? value : null;
}

function legacySize(refs: string[]): PrSizeBucket | null {
  for (const ref of refs) {
    const match = ref.match(/(?:^|[:=\s])([SML])(?:$|[:\s])/);
    if (match) return match[1] as PrSizeBucket;
  }
  return null;
}
