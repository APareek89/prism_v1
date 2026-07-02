// lib/agents/__tests__/grounding.test.ts
//
// The grounding gate is the enforcement half of the determinism boundary. These tests
// pin: (1) numbers not present in the inputs are rejected; (2) grounded numbers pass;
// (3) dangling evidence refs are rejected; (4) the number canonicalization; and
// (5) the mock-model narration always passes its own gate (so a keyless run is clean).

import { describe, it, expect } from 'vitest';
import {
  buildAllowedNumbers,
  extractNumbers,
  canonical,
  checkGrounding,
  evidenceIdSet,
  repairNote,
} from '../grounding';
import { groundedProduce } from '../nodes/ground-run';
import { mockImprovementArea, mockChangeGovernance, mockPrLevel } from '../mock-model';
import { EVIDENCE, EVIDENCE_IDS, USAGE_AREA, EFFICIENCY_DELTA, PR_RECORD_REVERT, PR_EVIDENCE } from './fixtures';

describe('extractNumbers / canonical', () => {
  it('extracts integers and decimals, ignoring sign and units', () => {
    expect(extractNumbers('rose by 40% to 62.5')).toEqual([canonical(40), canonical(62.5)]);
  });
  it('canonicalizes 40, 40.0, and −40 to the same token', () => {
    expect(canonical(40)).toBe(canonical(40.0));
    expect(canonical(40)).toBe(canonical(-40));
  });
  it('strips trailing zeros', () => {
    expect(canonical(62.5)).toBe('62.5');
    expect(canonical(62.0)).toBe('62');
  });
});

describe('buildAllowedNumbers', () => {
  it('includes every evidence value plus extra allowed numbers', () => {
    const allowed = buildAllowedNumbers(EVIDENCE, [88, 100]);
    expect(allowed.has(canonical(40))).toBe(true); // from evidence
    expect(allowed.has(canonical(62))).toBe(true);
    expect(allowed.has(canonical(8))).toBe(true); // −8 canonicalizes to 8
    expect(allowed.has(canonical(88))).toBe(true); // extra
    expect(allowed.has(canonical(100))).toBe(true);
    expect(allowed.has(canonical(999))).toBe(false);
  });
});

describe('checkGrounding — numbers', () => {
  const allowed = buildAllowedNumbers(EVIDENCE);
  const ids = evidenceIdSet(EVIDENCE);

  it('passes prose whose numbers are all in the allowed set', () => {
    const r = checkGrounding(['Usage sits at 40 today.'], [EVIDENCE_IDS[0]!], allowed, ids);
    expect(r.ok).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('rejects a hallucinated number not in the inputs', () => {
    const r = checkGrounding(['Usage jumped to 73 this week.'], [EVIDENCE_IDS[0]!], allowed, ids);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.kind === 'ungrounded_number')).toBe(true);
  });

  it('passes number-free prose', () => {
    const r = checkGrounding(['Usage is below its target.'], [EVIDENCE_IDS[0]!], allowed, ids);
    expect(r.ok).toBe(true);
  });
});

describe('checkGrounding — evidence refs', () => {
  const allowed = buildAllowedNumbers(EVIDENCE);
  const ids = evidenceIdSet(EVIDENCE);

  it('rejects a dangling evidence ref', () => {
    const r = checkGrounding(['Usage is low.'], ['kpi:does_not_exist'], allowed, ids);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.kind === 'dangling_evidence')).toBe(true);
  });

  it('passes when every ref resolves', () => {
    const r = checkGrounding(['Usage is low.'], EVIDENCE_IDS, allowed, ids);
    expect(r.ok).toBe(true);
  });

  it('collects both kinds of violation at once', () => {
    const r = checkGrounding(['Usage is 999.'], ['nope'], allowed, ids);
    expect(r.violations.map((v) => v.kind).sort()).toEqual(['dangling_evidence', 'ungrounded_number']);
  });
});

describe('repairNote', () => {
  it('produces a corrective note naming both violation kinds', () => {
    const r = checkGrounding(['Usage is 999.'], ['nope'], buildAllowedNumbers(EVIDENCE), evidenceIdSet(EVIDENCE));
    const note = repairNote(r.violations);
    expect(note).toContain('ungrounded');
    expect(note).toContain('999');
    expect(note).toContain('nope');
  });
});

describe('groundedProduce — repair + drop policy', () => {
  it('returns the first item when it grounds', async () => {
    let calls = 0;
    const out = await groundedProduce(
      async () => {
        calls += 1;
        return { title: 'Lift usage', body: 'Usage is below target.', evidenceRefs: [EVIDENCE_IDS[0]!] };
      },
      (i) => ({ prose: [i.title, i.body], evidenceRefs: i.evidenceRefs }),
      EVIDENCE,
    );
    expect(out).not.toBeNull();
    expect(calls).toBe(1); // no repair needed
  });

  it('repairs once, then succeeds', async () => {
    let calls = 0;
    const out = await groundedProduce(
      async (note) => {
        calls += 1;
        // first call hallucinates 999; repair (note present) fixes it.
        return note
          ? { title: 'Lift usage', body: 'Usage is below target.', evidenceRefs: [EVIDENCE_IDS[0]!] }
          : { title: 'Usage is 999', body: 'x', evidenceRefs: [EVIDENCE_IDS[0]!] };
      },
      (i) => ({ prose: [i.title, i.body], evidenceRefs: i.evidenceRefs }),
      EVIDENCE,
    );
    expect(out).not.toBeNull();
    expect(calls).toBe(2); // one repair
  });

  it('drops the item when even the repair fails', async () => {
    let calls = 0;
    const out = await groundedProduce(
      async () => {
        calls += 1;
        return { title: 'Usage is 999', body: 'x', evidenceRefs: ['nope'] };
      },
      (i) => ({ prose: [i.title, i.body], evidenceRefs: i.evidenceRefs }),
      EVIDENCE,
    );
    expect(out).toBeNull();
    expect(calls).toBe(2); // first + one repair, then dropped
  });
});

describe('mock-model narration is always grounding-clean', () => {
  it('improvement-area mock passes its own gate', () => {
    const out = mockImprovementArea([USAGE_AREA], EVIDENCE);
    const allowed = buildAllowedNumbers(EVIDENCE, [USAGE_AREA.norm, USAGE_AREA.target]);
    const ids = evidenceIdSet(EVIDENCE);
    for (const item of out.items) {
      const r = checkGrounding([item.title, item.body], item.evidenceRefs, allowed, ids);
      expect(r.ok).toBe(true);
    }
  });

  it('change-governance mock passes its own gate', () => {
    const out = mockChangeGovernance([EFFICIENCY_DELTA], EVIDENCE);
    const allowed = buildAllowedNumbers(EVIDENCE, [EFFICIENCY_DELTA.latest, EFFICIENCY_DELTA.baseline, EFFICIENCY_DELTA.delta]);
    const ids = evidenceIdSet(EVIDENCE);
    for (const d of out.drivers) {
      const r = checkGrounding([d.title, d.body], d.evidenceRefs, allowed, ids);
      expect(r.ok).toBe(true);
    }
  });

  it('pr-level mock passes its own gate and never emits a number', () => {
    const out = mockPrLevel(PR_RECORD_REVERT, PR_EVIDENCE);
    const allowed = buildAllowedNumbers(PR_EVIDENCE, [PR_RECORD_REVERT.aiIterations]);
    const ids = evidenceIdSet(PR_EVIDENCE);
    const r = checkGrounding([out.reason, out.fix], out.evidenceRefs, allowed, ids);
    expect(r.ok).toBe(true);
  });
});
