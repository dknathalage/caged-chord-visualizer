import { describe, it, expect } from 'vitest';
import { estimatePG, estimatePS, estimatePT } from './estimators.js';

function makeRec(overrides = {}) {
  return {
    key: 'test', pL: 0, attempts: 0, correct: 0,
    times: [], avgTime: 0, hist: [], streak: 0,
    S: 0, D: 5, lastReviewTs: 0, due: 0,
    lastSeen: 0, lastSeenTs: 0, clusters: [], confusions: [],
    ...overrides,
  };
}

describe('estimatePG', () => {
  it('returns null with insufficient data (< 20 attempts)', () => {
    const items = new Map();
    items.set('a', makeRec({ pL: 0.05, attempts: 10, correct: 2 }));
    expect(estimatePG(items)).toBeNull();
  });

  it('computes pG from unlearned items', () => {
    const items = new Map();
    // 4 unlearned items with 5 attempts each = 20 total
    items.set('a', makeRec({ pL: 0.05, attempts: 5, correct: 1 }));
    items.set('b', makeRec({ pL: 0.02, attempts: 5, correct: 0 }));
    items.set('c', makeRec({ pL: 0.08, attempts: 5, correct: 1 }));
    items.set('d', makeRec({ pL: 0.01, attempts: 5, correct: 0 }));
    // 2/20 = 0.10
    expect(estimatePG(items)).toBeCloseTo(0.10, 2);
  });

  it('ignores items with pL >= 0.1', () => {
    const items = new Map();
    items.set('a', makeRec({ pL: 0.05, attempts: 20, correct: 2 }));
    items.set('b', makeRec({ pL: 0.5, attempts: 20, correct: 18 })); // should be ignored
    // 2/20 = 0.10
    expect(estimatePG(items)).toBeCloseTo(0.10, 2);
  });

  it('clamps to minimum 0.01', () => {
    const items = new Map();
    items.set('a', makeRec({ pL: 0.05, attempts: 25, correct: 0 }));
    expect(estimatePG(items)).toBe(0.01);
  });

  it('clamps to maximum 0.20', () => {
    const items = new Map();
    items.set('a', makeRec({ pL: 0.05, attempts: 20, correct: 20 }));
    expect(estimatePG(items)).toBe(0.20);
  });
});

describe('estimatePS', () => {
  it('returns null with fewer than 5 mastered items', () => {
    const items = new Map();
    items.set('a', makeRec({ pL: 0.95, attempts: 10, correct: 9 }));
    items.set('b', makeRec({ pL: 0.92, attempts: 8, correct: 7 }));
    expect(estimatePS(items)).toBeNull();
  });

  it('computes pS from mastered items', () => {
    const items = new Map();
    for (let i = 0; i < 5; i++) {
      items.set(`item_${i}`, makeRec({ pL: 0.95, attempts: 10, correct: 9 }));
    }
    // Total errors = 5, total attempts = 50 -> 5/50 = 0.10
    expect(estimatePS(items)).toBeCloseTo(0.10, 2);
  });

  it('ignores items with low pL or few attempts', () => {
    const items = new Map();
    for (let i = 0; i < 5; i++) {
      items.set(`mastered_${i}`, makeRec({ pL: 0.95, attempts: 10, correct: 9 }));
    }
    items.set('unlearned', makeRec({ pL: 0.2, attempts: 10, correct: 2 }));
    items.set('few_attempts', makeRec({ pL: 0.95, attempts: 3, correct: 3 }));
    // Only 5 mastered items counted: 5 errors / 50 total = 0.10
    expect(estimatePS(items)).toBeCloseTo(0.10, 2);
  });

  it('clamps to minimum 0.02', () => {
    const items = new Map();
    for (let i = 0; i < 5; i++) {
      items.set(`item_${i}`, makeRec({ pL: 0.95, attempts: 10, correct: 10 }));
    }
    expect(estimatePS(items)).toBe(0.02);
  });

  it('clamps to maximum 0.30', () => {
    const items = new Map();
    for (let i = 0; i < 5; i++) {
      items.set(`item_${i}`, makeRec({ pL: 0.95, attempts: 10, correct: 2 }));
    }
    // 40/50 = 0.80, clamped to 0.30
    expect(estimatePS(items)).toBe(0.30);
  });
});

describe('estimatePT', () => {
  it('returns null with no mastered items', () => {
    const items = new Map();
    items.set('a', makeRec({ pL: 0.3, attempts: 5 }));
    expect(estimatePT(items, 0.20)).toBeNull();
  });

  it('boosts pT for fast learners (avg < 5 attempts)', () => {
    const items = new Map();
    for (let i = 0; i < 5; i++) {
      items.set(`item_${i}`, makeRec({ pL: 0.85, attempts: 3 }));
    }
    // avg = 3, fast learner -> 0.20 * 1.3 = 0.26
    expect(estimatePT(items, 0.20)).toBeCloseTo(0.26, 2);
  });

  it('reduces pT for slow learners (avg > 12 attempts)', () => {
    const items = new Map();
    for (let i = 0; i < 5; i++) {
      items.set(`item_${i}`, makeRec({ pL: 0.85, attempts: 15 }));
    }
    // avg = 15, slow learner -> 0.20 * 0.7 = 0.14
    expect(estimatePT(items, 0.20)).toBeCloseTo(0.14, 2);
  });

  it('returns null for average learners (5 <= avg <= 12)', () => {
    const items = new Map();
    for (let i = 0; i < 5; i++) {
      items.set(`item_${i}`, makeRec({ pL: 0.85, attempts: 8 }));
    }
    expect(estimatePT(items, 0.20)).toBeNull();
  });

  it('clamps to maximum 0.40', () => {
    const items = new Map();
    for (let i = 0; i < 5; i++) {
      items.set(`item_${i}`, makeRec({ pL: 0.85, attempts: 3 }));
    }
    // 0.35 * 1.3 = 0.455, clamped to 0.40
    expect(estimatePT(items, 0.35)).toBe(0.40);
  });

  it('clamps to minimum 0.05', () => {
    const items = new Map();
    for (let i = 0; i < 5; i++) {
      items.set(`item_${i}`, makeRec({ pL: 0.85, attempts: 15 }));
    }
    // 0.06 * 0.7 = 0.042, clamped to 0.05
    expect(estimatePT(items, 0.06)).toBe(0.05);
  });

  it('only considers items that crossed pL >= 0.8', () => {
    const items = new Map();
    items.set('mastered1', makeRec({ pL: 0.85, attempts: 3 }));
    items.set('mastered2', makeRec({ pL: 0.90, attempts: 4 }));
    items.set('not_mastered', makeRec({ pL: 0.5, attempts: 20 }));
    // avg of mastered only = (3+4)/2 = 3.5, fast learner
    expect(estimatePT(items, 0.20)).toBeCloseTo(0.26, 2);
  });
});
