import { describe, it, expect } from 'vitest';
import { serialize, deserialize, migrateV1 } from './serializer.js';

// ──────────────────────────────────────────────
// Persistence v4: Adaptive Fields
// ──────────────────────────────────────────────

function makeState(overrides = {}) {
  const items = new Map();
  items.set('A', {
    S: 2, D: 5, lastReviewTs: Date.now(), due: 0,
    pL: 0.5, attempts: 3, correct: 2,
    times: [1000], avgTime: 1000,
    lastSeen: 2, lastSeenTs: Date.now(),
    hist: [true, true, false], streak: 0, clusters: ['default'],
    confusions: [],
  });
  const clusters = new Map();
  clusters.set('default', { correct: 2, total: 3 });

  return {
    questionNumber: 3,
    totalAttempts: 3,
    allCorrectTimes: [1000],
    items,
    clusters,
    recentKeys: ['A'],
    theta: 0.3,
    thetaHistory: [],
    ...overrides,
  };
}

const DEFAULT_ADAPTIVE = {
  pG: null,
  pS: null,
  pT: null,
  drillEffectiveness: {
    microDrill: { helped: 0, total: 0 },
    confusionDrill: { helped: 0, total: 0 },
  },
  featureErrorRates: {},
};

describe('serialize v4', () => {
  it('saves with version 4 and includes adaptive field', () => {
    const state = makeState();
    const raw = JSON.parse(serialize(state));

    expect(raw.v).toBe(4);
    expect(raw.adaptive).toEqual(DEFAULT_ADAPTIVE);
    expect(raw.theta).toBe(0.3);
    expect(raw.items.A).toBeDefined();
    expect(raw.items.A.S).toBe(2);
  });

  it('preserves custom adaptive values on save', () => {
    const custom = {
      pG: 0.08, pS: 0.12, pT: 0.25,
      drillEffectiveness: {
        microDrill: { helped: 5, total: 10 },
        confusionDrill: { helped: 3, total: 7 },
      },
      featureErrorRates: { 'note_C': 0.15 },
    };
    const state = makeState({ adaptive: custom });
    const raw = JSON.parse(serialize(state));

    expect(raw.v).toBe(4);
    expect(raw.adaptive).toEqual(custom);
  });
});

describe('deserialize v4', () => {
  it('loads v3 data and migrates to v4 with default adaptive', () => {
    const v3Data = JSON.stringify({
      v: 3,
      ts: Date.now(),
      questionNumber: 5,
      totalAttempts: 10,
      allCorrectTimes: [1000, 1200],
      items: {
        'A': {
          S: 2, D: 5, lastReviewTs: Date.now(), due: 0,
          pL: 0.6, attempts: 5, correct: 3,
          times: [1000], avgTime: 1000,
          lastSeen: 4, lastSeenTs: Date.now(),
          hist: [true, false, true], streak: 1, clusters: ['default'],
          confusions: [],
        },
      },
      clusters: { default: { correct: 3, total: 5 } },
      recentKeys: ['A'],
      theta: 0.3,
      thetaHistory: [{ ts: Date.now(), theta: 0.3 }],
    });

    const result = deserialize(v3Data);
    expect(result.version).toBe(4);
    expect(result.adaptive).toEqual(DEFAULT_ADAPTIVE);
    expect(result.questionNumber).toBe(5);
    expect(result.theta).toBeCloseTo(0.3);
    expect(result.items.has('A')).toBe(true);
  });

  it('loads v4 data and preserves adaptive values', () => {
    const customAdaptive = {
      pG: 0.08,
      pS: 0.12,
      pT: 0.25,
      drillEffectiveness: {
        microDrill: { helped: 5, total: 10 },
        confusionDrill: { helped: 3, total: 7 },
      },
      featureErrorRates: { 'note_C': 0.15, 'note_F#': 0.4 },
    };
    const v4Data = JSON.stringify({
      v: 4,
      ts: Date.now(),
      questionNumber: 20,
      totalAttempts: 30,
      allCorrectTimes: [900, 1100],
      items: {
        'B': {
          S: 3, D: 4, lastReviewTs: Date.now(), due: 0,
          pL: 0.75, attempts: 10, correct: 8,
          times: [900], avgTime: 1000,
          lastSeen: 19, lastSeenTs: Date.now(),
          hist: [true, true, false], streak: 1, clusters: ['default'],
          confusions: [],
        },
      },
      clusters: { default: { correct: 8, total: 10 } },
      recentKeys: ['B'],
      theta: 0.5,
      thetaHistory: [],
      adaptive: customAdaptive,
    });

    const result = deserialize(v4Data);
    expect(result.version).toBe(4);
    expect(result.adaptive.pG).toBe(0.08);
    expect(result.adaptive.pS).toBe(0.12);
    expect(result.adaptive.pT).toBe(0.25);
    expect(result.adaptive.drillEffectiveness.microDrill).toEqual({ helped: 5, total: 10 });
    expect(result.adaptive.drillEffectiveness.confusionDrill).toEqual({ helped: 3, total: 7 });
    expect(result.adaptive.featureErrorRates).toEqual({ 'note_C': 0.15, 'note_F#': 0.4 });
  });

  it('returns null for unsupported versions', () => {
    const v99 = JSON.stringify({ v: 99, ts: Date.now(), items: {} });
    expect(deserialize(v99)).toBeNull();
  });

  it('handles v1 data by returning version 1 passthrough', () => {
    const v1Data = JSON.stringify({ v: 1, ts: Date.now(), items: {} });
    const result = deserialize(v1Data);
    expect(result.version).toBe(1);
    expect(result.data).toBeDefined();
  });

  it('defaults missing adaptive in v4 data', () => {
    // v4 data with no adaptive field (edge case)
    const v4NoAdaptive = JSON.stringify({
      v: 4,
      ts: Date.now(),
      questionNumber: 0,
      totalAttempts: 0,
      allCorrectTimes: [],
      items: {},
      clusters: {},
      recentKeys: [],
      theta: 0.05,
      thetaHistory: [],
    });

    const result = deserialize(v4NoAdaptive);
    expect(result.version).toBe(4);
    expect(result.adaptive).toEqual(DEFAULT_ADAPTIVE);
  });
});

describe('round-trip serialize/deserialize v4', () => {
  it('preserves all fields through round-trip', () => {
    const customAdaptive = {
      pG: 0.07,
      pS: 0.10,
      pT: null,
      drillEffectiveness: {
        microDrill: { helped: 3, total: 5 },
        confusionDrill: { helped: 0, total: 0 },
      },
      featureErrorRates: { 'note_E': 0.2 },
    };
    const state = makeState({ adaptive: customAdaptive });

    const json = serialize(state);
    const result = deserialize(json);

    expect(result.version).toBe(4);
    expect(result.adaptive.pG).toBe(0.07);
    expect(result.adaptive.pS).toBe(0.10);
    expect(result.adaptive.pT).toBeNull();
    expect(result.adaptive.drillEffectiveness.microDrill).toEqual({ helped: 3, total: 5 });
    expect(result.adaptive.featureErrorRates['note_E']).toBe(0.2);
    expect(result.questionNumber).toBe(3);
    expect(result.theta).toBe(0.3);
    expect(result.items.has('A')).toBe(true);
  });

  it('round-trips default adaptive when none provided', () => {
    const state = makeState(); // no adaptive field
    const json = serialize(state);
    const result = deserialize(json);

    expect(result.version).toBe(4);
    expect(result.adaptive).toEqual(DEFAULT_ADAPTIVE);
  });
});

describe('migrateV1 includes adaptive', () => {
  it('v1 migration produces v4-compatible state with default adaptive', () => {
    const v1Data = {
      v: 1,
      ts: Date.now(),
      questionNumber: 10,
      totalAttempts: 15,
      allCorrectTimes: [1000],
      items: {
        'A': {
          ef: 2.5, ivl: 6, reps: 3, due: 20,
          pL: 0.75, attempts: 10, correct: 7,
          times: [1000], avgTime: 1050,
          lastSeen: 9, lastSeenTs: Date.now(),
          hist: [true, true, false], streak: 0, clusters: ['default'],
        },
      },
      clusters: { default: { correct: 7, total: 10 } },
      recentKeys: ['A'],
    };

    const result = migrateV1(v1Data);
    expect(result.version).toBe(4);
    expect(result.adaptive).toEqual(DEFAULT_ADAPTIVE);
    expect(result.items.has('A')).toBe(true);
    expect(result.theta).toBe(0.05);
  });
});
