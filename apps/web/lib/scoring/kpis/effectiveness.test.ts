import { describe, it, expect } from 'vitest';
import {
  mergedWithoutRevertRate,
  aiCodeRetention30d,
  changeFailureRate,
  defectReworkRate,
} from './effectiveness';
import { makeMember, makePr, makeDeploy } from '../__fixtures__/rows';

describe('effectiveness.mergedWithoutRevertRate', () => {
  it('is 1 − (AI PRs reverted ÷ AI merged PRs)', () => {
    const m = makeMember({
      prs: [
        makePr({ prId: 'a', aiLinked: true, revertedWithin14d: true }),
        makePr({ prId: 'b', aiLinked: true, revertedWithin14d: false }),
        makePr({ prId: 'c', aiLinked: true, revertedWithin14d: false }),
        makePr({ prId: 'd', aiLinked: true, revertedWithin14d: false }),
      ],
    });
    // 1 reverted of 4 → 1 − 0.25 = 0.75
    expect(mergedWithoutRevertRate(m).value).toBe(0.75);
  });
  it('excludes self-reverts from the revert numerator (anti-gaming)', () => {
    const m = makeMember({
      prs: [
        makePr({ prId: 'a', aiLinked: true, revertedWithin14d: true, isSelfRevert: true }),
        makePr({ prId: 'b', aiLinked: true, revertedWithin14d: false }),
      ],
    });
    // the self-revert is not counted → rate stays 1.0
    expect(mergedWithoutRevertRate(m).value).toBe(1);
  });
  it('is null with no AI merged PRs', () => {
    const m = makeMember({ prs: [makePr({ aiLinked: false })] });
    expect(mergedWithoutRevertRate(m).value).toBeNull();
  });
});

describe('effectiveness.aiCodeRetention30d', () => {
  it('is AI lines alive ÷ AI lines merged', () => {
    const m = makeMember({
      prs: [
        makePr({ prId: 'a', aiLinked: true, aiLinesMerged: 100, aiLinesAliveAt30d: 80 }),
        makePr({ prId: 'b', aiLinked: true, aiLinesMerged: 100, aiLinesAliveAt30d: 60 }),
      ],
    });
    // 140 alive ÷ 200 merged = 0.70
    expect(aiCodeRetention30d(m).value).toBeCloseTo(0.7, 6);
  });
  it('is null when no AI lines were merged', () => {
    const m = makeMember({
      prs: [makePr({ aiLinked: true, aiLinesMerged: 0, aiLinesAliveAt30d: 0 })],
    });
    expect(aiCodeRetention30d(m).value).toBeNull();
  });
});

describe('effectiveness.changeFailureRate (inverted)', () => {
  it('is failed AI deploys ÷ AI deploys', () => {
    const m = makeMember({
      deploys: [
        makeDeploy({ deployId: 'd1', aiAssisted: true, changeFailed: true }),
        makeDeploy({ deployId: 'd2', aiAssisted: true, changeFailed: false }),
        makeDeploy({ deployId: 'd3', aiAssisted: true, changeFailed: false }),
        makeDeploy({ deployId: 'd4', aiAssisted: true, changeFailed: false }),
      ],
    });
    expect(changeFailureRate(m).value).toBe(0.25);
  });
  it('ignores non-AI deploys and is null with no AI deploys (insufficient signal)', () => {
    const m = makeMember({
      deploys: [makeDeploy({ aiAssisted: false, changeFailed: true })],
    });
    expect(changeFailureRate(m).value).toBeNull();
  });
});

describe('effectiveness.defectReworkRate (inverted)', () => {
  it('is rework PRs ÷ merged PRs', () => {
    const m = makeMember({
      prs: [
        makePr({ prId: 'a', defectReworkWithin14d: true }),
        makePr({ prId: 'b', defectReworkWithin14d: false }),
      ],
    });
    expect(defectReworkRate(m).value).toBe(0.5);
  });
});
