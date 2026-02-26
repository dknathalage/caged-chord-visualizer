import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateV3toV4 } from './migration.js';

describe('migrateV3toV4', () => {
  it('bumps version to 4 and adds default adaptive', () => {
    const data = { v: 3, theta: 0.3, items: {} };
    migrateV3toV4(data);

    expect(data.v).toBe(4);
    expect(data.adaptive).toEqual({
      pG: null,
      pS: null,
      pT: null,
      drillEffectiveness: {
        microDrill: { helped: 0, total: 0 },
        confusionDrill: { helped: 0, total: 0 },
      },
      featureErrorRates: {},
    });
  });

  it('preserves existing fields', () => {
    const data = {
      v: 3,
      theta: 0.5,
      items: { A: { pL: 0.6 } },
      clusters: { default: { correct: 3, total: 5 } },
    };
    migrateV3toV4(data);

    expect(data.v).toBe(4);
    expect(data.theta).toBe(0.5);
    expect(data.items.A.pL).toBe(0.6);
    expect(data.clusters.default.correct).toBe(3);
    expect(data.adaptive).toBeDefined();
  });
});

describe('migrateToUnified v3→v4→v5 chain', () => {
  const store = {};
  const localStorageMock = {
    getItem: vi.fn(k => store[k] ?? null),
    setItem: vi.fn((k, v) => { store[k] = String(v); }),
    removeItem: vi.fn(k => { delete store[k]; }),
    clear: vi.fn(() => { for (const k in store) delete store[k]; }),
  };

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    globalThis.localStorage = localStorageMock;
    // window must exist for migrateToUnified
    globalThis.window = {};
  });

  it('migrates existing v3 data to v5 with adaptive', async () => {
    const v3Data = {
      v: 3,
      ts: Date.now(),
      questionNumber: 5,
      totalAttempts: 10,
      allCorrectTimes: [1000],
      items: { A: { pL: 0.6 } },
      clusters: { default: { correct: 3, total: 5 } },
      recentKeys: ['A'],
      theta: 0.3,
    };
    store['gl_learn_practice'] = JSON.stringify(v3Data);

    const { migrateToUnified } = await import('./migration.js');
    migrateToUnified();

    const result = JSON.parse(store['gl_learn_practice']);
    expect(result.v).toBe(5);
    expect(result.adaptive).toEqual({
      pG: null,
      pS: null,
      pT: null,
      drillEffectiveness: {
        microDrill: { helped: 0, total: 0 },
        confusionDrill: { helped: 0, total: 0 },
      },
      featureErrorRates: {},
      audioFeatures: { calibratedNoiseFloor: null, avgOnsetStrength: null },
    });
    expect(result.theta).toBe(0.3);
    expect(result.items.A.pL).toBe(0.6);
    expect(result.items.A.centsHistory).toEqual([]);
    expect(result.items.A.avgCents).toBeNull();
    expect(result.items.A.techniqueScores).toEqual([]);
  });

  it('chains v2→v3→v4→v5 migration', async () => {
    const v2Data = {
      v: 2,
      ts: Date.now(),
      questionNumber: 3,
      totalAttempts: 5,
      allCorrectTimes: [1000],
      items: { A: { pL: 0.4 } },
      clusters: {},
      recentKeys: [],
    };
    store['gl_learn_practice'] = JSON.stringify(v2Data);

    const { migrateToUnified } = await import('./migration.js');
    migrateToUnified();

    const result = JSON.parse(store['gl_learn_practice']);
    expect(result.v).toBe(5);
    expect(result.theta).toBeDefined();
    expect(result.adaptive).toBeDefined();
    expect(result.adaptive.pG).toBeNull();
    expect(result.adaptive.audioFeatures).toEqual({ calibratedNoiseFloor: null, avgOnsetStrength: null });
  });
});
