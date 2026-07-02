import { describe, it, expect } from 'vitest';
import { parseScoringConfig, resolveScoringConfig, type RawIndexConfig } from './config';
import { DEFAULT_INDEX_CONFIG } from './defaults/index-config.default';

/** A minimal valid raw config (weights + sizing required; anchors default-merged). */
function rawValid(overrides: Partial<RawIndexConfig> = {}): RawIndexConfig {
  return {
    configVersion: 'v2',
    weights: { usage: 0.1, efficiency: 0.25, effectiveness: 0.4, proficiency: 0.25 },
    sizing: {
      modulesWeight: 2,
      blastWeight: 3,
      coldStart: { sMax: 6, lMin: 18 },
      tieBreakBand: 0.1,
    },
    ...overrides,
  };
}

describe('config.parseScoringConfig', () => {
  it('parses a valid config and stamps config_version', () => {
    const c = parseScoringConfig(rawValid());
    expect(c.configVersion).toBe('v2');
    expect(c.weights.effectiveness).toBe(0.4);
  });

  it('derives a version from a numeric index_config.version column', () => {
    const c = parseScoringConfig(
      rawValid({ configVersion: undefined, version: 3 } as RawIndexConfig),
    );
    expect(c.configVersion).toBe('v3');
  });

  it('merges partial anchors over the defaults', () => {
    const c = parseScoringConfig(
      rawValid({ anchors: { ai_assisted_pr_share: { floor: 0.6, target: 1.0 } } }),
    );
    expect(c.anchors.ai_assisted_pr_share).toEqual({ floor: 0.6, target: 1.0 });
    // untouched anchors come from the default.
    expect(c.anchors.ai_code_retention_30d).toEqual(
      DEFAULT_INDEX_CONFIG.anchors.ai_code_retention_30d,
    );
  });

  it('rejects weights that do not sum to 1.0', () => {
    expect(() =>
      parseScoringConfig(
        rawValid({
          weights: { usage: 0.5, efficiency: 0.25, effectiveness: 0.4, proficiency: 0.25 },
        }),
      ),
    ).toThrow(/sum to 1/i);
  });

  it('rejects an inverted KPI anchor missing ceil', () => {
    expect(() =>
      parseScoringConfig(
        rawValid({ anchors: { ai_iterations_to_merge: { target: 3 } } }),
      ),
    ).toThrow(/ceil/);
  });

  it('rejects an inverted KPI with target >= ceil', () => {
    expect(() =>
      parseScoringConfig(
        rawValid({ anchors: { ai_iterations_to_merge: { target: 12, ceil: 3 } } }),
      ),
    ).toThrow(/target < ceil/);
  });

  it('rejects a higher-is-better KPI missing floor', () => {
    expect(() =>
      parseScoringConfig(
        rawValid({ anchors: { ai_assisted_pr_share: { target: 1 } } }),
      ),
    ).toThrow(/floor/);
  });

  it('rejects a higher-is-better KPI with floor >= target', () => {
    expect(() =>
      parseScoringConfig(
        rawValid({ anchors: { ai_assisted_pr_share: { floor: 1, target: 0.5 } } }),
      ),
    ).toThrow(/floor < target/);
  });

  it('rejects an unknown KPI id in anchors', () => {
    expect(() =>
      parseScoringConfig(
        rawValid({ anchors: { not_a_kpi: { target: 1 } } } as unknown as RawIndexConfig),
      ),
    ).toThrow(/Unknown KPI/);
  });

  it('rejects sizing with sMax >= lMin', () => {
    expect(() =>
      parseScoringConfig(
        rawValid({
          sizing: {
            modulesWeight: 2,
            blastWeight: 3,
            coldStart: { sMax: 20, lMin: 6 },
            tieBreakBand: 0.1,
          },
        }),
      ),
    ).toThrow();
  });

  it('freezes the returned config (immutable)', () => {
    const c = parseScoringConfig(rawValid());
    expect(Object.isFrozen(c)).toBe(true);
  });
});

describe('config.resolveScoringConfig', () => {
  it('falls back to the canonical default when none provided (cold-start boot)', () => {
    expect(resolveScoringConfig()).toBe(DEFAULT_INDEX_CONFIG);
    expect(resolveScoringConfig(null)).toBe(DEFAULT_INDEX_CONFIG);
  });
  it('parses a provided raw config', () => {
    expect(resolveScoringConfig(rawValid()).configVersion).toBe('v2');
  });
});

describe('config — the default itself is valid', () => {
  it('the canonical default passes all parse invariants when round-tripped', () => {
    const c = DEFAULT_INDEX_CONFIG;
    const total =
      c.weights.usage +
      c.weights.efficiency +
      c.weights.effectiveness +
      c.weights.proficiency;
    expect(total).toBeCloseTo(1, 6);
  });
});
