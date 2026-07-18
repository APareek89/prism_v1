import { describe, expect, it } from 'vitest';
import { decodePrInsight } from './pr-insight';

describe('decodePrInsight', () => {
  it('uses authoritative trace metadata instead of UUID digits', () => {
    expect(decodePrInsight({
      refs: ['pr:9f62eb06-5446-4060-a86a-6b3054215f17:merged'],
      verdict: 're_prompt',
      ref: '#22',
      sizeBucket: 'L',
    }, 'PR narrative', 'Several iterations were observed.')).toEqual({
      flag: 're-prompt',
      prNumber: '#22',
      sizeBucket: 'L',
    });
  });

  it('does not misclassify a clean narrative that says no revert occurred', () => {
    expect(decodePrInsight([], '#8 clean AI-assisted merge', 'No revert or rework occurred.').flag).toBe('clean');
  });

  it('does not manufacture a PR number from an arbitrary UUID', () => {
    expect(decodePrInsight(['pr:9f62eb06-5446-4060-a86a'], 'Legacy insight', 'Review it.').prNumber).toBeNull();
  });
});
