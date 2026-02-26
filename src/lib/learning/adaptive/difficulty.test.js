import { describe, it, expect } from 'vitest';
import { updateFeatureErrors, getFeatureDifficulty } from './difficulty.js';

describe('updateFeatureErrors', () => {
  it('creates entries for new features', () => {
    const rates = {};
    const result = updateFeatureErrors(rates, {}, true, { string: 2, zone: 'zone_5' });
    expect(result).toEqual({
      string_2: { correct: 1, total: 1 },
      zone_zone_5: { correct: 1, total: 1 },
    });
  });

  it('increments existing feature counts', () => {
    const rates = { string_2: { correct: 3, total: 5 } };
    updateFeatureErrors(rates, {}, false, { string: 2 });
    expect(rates.string_2).toEqual({ correct: 3, total: 6 });
  });

  it('increments correct count on success', () => {
    const rates = { string_2: { correct: 3, total: 5 } };
    updateFeatureErrors(rates, {}, true, { string: 2 });
    expect(rates.string_2).toEqual({ correct: 4, total: 6 });
  });

  it('handles boolean features', () => {
    const rates = {};
    updateFeatureErrors(rates, {}, false, { accidental: true });
    expect(rates.accidental_true).toEqual({ correct: 0, total: 1 });
  });

  it('returns the same object reference', () => {
    const rates = {};
    const result = updateFeatureErrors(rates, {}, true, { string: 1 });
    expect(result).toBe(rates);
  });
});

describe('getFeatureDifficulty', () => {
  it('returns null with insufficient total attempts', () => {
    const rates = {
      string_1: { correct: 8, total: 10 },
      string_2: { correct: 7, total: 10 },
    };
    expect(getFeatureDifficulty(rates, { string: 1 }, 50)).toBeNull();
  });

  it('returns null when no matching features exist', () => {
    const rates = {
      string_1: { correct: 40, total: 50 },
    };
    expect(getFeatureDifficulty(rates, { zone: 'zone_3' }, 50)).toBeNull();
  });

  it('computes weight = 1.0 for average-difficulty feature', () => {
    // Global: 10 errors / 60 total = 0.167 error rate
    // Feature string_1: 5 errors / 30 total = 0.167 error rate
    // Weight = 0.167 / 0.167 = 1.0
    const rates = {
      string_1: { correct: 25, total: 30 },
      string_2: { correct: 25, total: 30 },
    };
    const result = getFeatureDifficulty(rates, { string: 1 }, 50);
    expect(result).toBeCloseTo(1.0, 2);
  });

  it('returns weight > 1 for harder-than-average feature', () => {
    // Global: (30-25) + (30-28) = 5+2 = 7 errors / 60 total = 0.117 error rate
    // Feature string_1: 5/30 = 0.167 error rate
    // Weight = 0.167 / 0.117 = 1.43
    const rates = {
      string_1: { correct: 25, total: 30 },
      string_2: { correct: 28, total: 30 },
    };
    const result = getFeatureDifficulty(rates, { string: 1 }, 50);
    expect(result).toBeGreaterThan(1.0);
  });

  it('returns weight < 1 for easier-than-average feature', () => {
    const rates = {
      string_1: { correct: 28, total: 30 },
      string_2: { correct: 20, total: 30 },
    };
    // Global: 2+10 = 12 errors / 60 = 0.20
    // string_1: 2/30 = 0.067
    // Weight = 0.067 / 0.20 = 0.333
    const result = getFeatureDifficulty(rates, { string: 1 }, 50);
    expect(result).toBeLessThan(1.0);
  });

  it('averages weights across multiple features', () => {
    const rates = {
      string_1: { correct: 25, total: 30 },   // 5/30 = 0.167
      zone_zone_5: { correct: 28, total: 30 }, // 2/30 = 0.067
      string_2: { correct: 25, total: 30 },    // 5/30 = 0.167 (not queried)
    };
    // Global: 12 errors / 90 total = 0.133
    // string_1: 0.167 / 0.133 = 1.25
    // zone_zone_5: 0.067 / 0.133 = 0.50
    // Average: (1.25 + 0.50) / 2 = 0.875
    const result = getFeatureDifficulty(rates, { string: 1, zone: 'zone_5' }, 50);
    expect(result).toBeCloseTo(0.875, 1);
  });

  it('returns null when global error rate is zero', () => {
    const rates = {
      string_1: { correct: 30, total: 30 },
      string_2: { correct: 30, total: 30 },
    };
    expect(getFeatureDifficulty(rates, { string: 1 }, 50)).toBeNull();
  });

  it('respects custom minAttempts', () => {
    const rates = {
      string_1: { correct: 8, total: 10 },
      string_2: { correct: 7, total: 10 },
    };
    // With minAttempts=15, 20 total >= 15, should compute
    const result = getFeatureDifficulty(rates, { string: 1 }, 15);
    expect(result).not.toBeNull();
  });
});
