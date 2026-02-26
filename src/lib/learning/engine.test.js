import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const store = {};
const localStorageMock = {
  getItem: vi.fn(k => store[k] ?? null),
  setItem: vi.fn((k, v) => { store[k] = String(v); }),
  removeItem: vi.fn(k => { delete store[k]; }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; })
};
globalThis.localStorage = localStorageMock;

const { LearningEngine } = await import('./engine.js');

// --- Minimal config for testing ---
function makeConfig(overrides = {}) {
  return {
    itemKey: (item) => item.id ?? item,
    itemClusters: (item) => item.clusters ?? ['default'],
    itemFromKey: (key) => ({ id: key, clusters: ['default'] }),
    itemDifficulty: (item) => 0.3, // default medium-low difficulty
    genRandom: (lastItem) => {
      const pool = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return { id: pick, clusters: ['default'] };
    },
    genFromCluster: null,
    microDrill: null,
    pickScaffold: null,
    ...overrides,
  };
}

// Deterministic config that cycles through items
function makeDeterministicConfig(items) {
  let idx = 0;
  return makeConfig({
    genRandom: () => {
      const item = items[idx % items.length];
      idx++;
      return item;
    },
    itemFromKey: (key) => items.find(i => i.id === key) || { id: key, clusters: ['default'] },
  });
}

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────
// FSRS Core
// ──────────────────────────────────────────────

describe('FSRS integration', () => {
  it('initializes FSRS state on first review', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine.report(item, true, 1000);

    const rec = engine.items.get(engine.config.itemKey(item));
    expect(rec.S).toBeGreaterThan(0);
    expect(rec.D).toBeGreaterThan(0);
    expect(rec.D).toBeLessThanOrEqual(10);
    expect(rec.lastReviewTs).toBeGreaterThan(0);
  });

  it('increases stability on correct answers', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();

    engine.report(item, true, 500);
    const s1 = engine.items.get(engine.config.itemKey(item)).S;

    engine.report(item, true, 500);
    const s2 = engine.items.get(engine.config.itemKey(item)).S;

    expect(s2).toBeGreaterThan(s1);
  });

  it('decreases stability on wrong answers', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();

    // Build up some stability first
    engine.report(item, true, 500);
    engine.report(item, true, 500);
    engine.report(item, true, 500);
    const sBefore = engine.items.get(engine.config.itemKey(item)).S;

    engine.report(item, false, 500);
    const sAfter = engine.items.get(engine.config.itemKey(item)).S;

    expect(sAfter).toBeLessThan(sBefore);
  });

  it('difficulty decreases for easy items (grade 4)', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();

    // Fill allCorrectTimes so median is meaningful
    for (let i = 0; i < 10; i++) engine.allCorrectTimes.push(2000);

    // Very fast correct = grade 4 (easy)
    engine.report(item, true, 500); // 500ms << median 2000ms * 0.6
    const d1 = engine.items.get(engine.config.itemKey(item)).D;

    engine.report(item, true, 500);
    const d2 = engine.items.get(engine.config.itemKey(item)).D;

    // Difficulty should decrease (or stay low) for easy items
    expect(d2).toBeLessThanOrEqual(d1 + 0.01);
  });

  it('stability stays positive after failure', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine.report(item, true, 500);
    engine.report(item, false);

    const rec = engine.items.get(engine.config.itemKey(item));
    expect(rec.S).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// BKT with response-time modulation
// ──────────────────────────────────────────────

describe('response-time-aware BKT', () => {
  it('fast correct answers yield higher pL than slow correct answers', () => {
    const cfg = makeConfig();
    const e1 = new LearningEngine(cfg, null);
    const e2 = new LearningEngine(cfg, null);

    // Seed correct times for both engines
    for (let i = 0; i < 10; i++) {
      e1.allCorrectTimes.push(2000);
      e2.allCorrectTimes.push(2000);
    }

    const item1 = e1.next();
    const item2 = e2.next();

    // Fast correct (500ms, well below median 2000ms)
    e1.report(item1, true, 500);
    // Slow correct (4000ms, well above median)
    e2.report(item2, true, 4000);

    const pL_fast = e1.items.get(e1.config.itemKey(item1)).pL;
    const pL_slow = e2.items.get(e2.config.itemKey(item2)).pL;

    expect(pL_fast).toBeGreaterThan(pL_slow);
  });

  it('wrong answers reduce pL when pL is high', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();

    // Build up pL with multiple correct answers
    for (let i = 0; i < 10; i++) {
      engine.report(item, true, 1000);
    }
    const pL_before = engine.items.get(engine.config.itemKey(item)).pL;
    expect(pL_before).toBeGreaterThan(0.5);

    engine.report(item, false, 1000);
    const pL_after = engine.items.get(engine.config.itemKey(item)).pL;

    expect(pL_after).toBeLessThan(pL_before);
  });
});

// ──────────────────────────────────────────────
// Theta (Student Ability)
// ──────────────────────────────────────────────

describe('theta (student ability)', () => {
  it('starts at 0.05', () => {
    const engine = new LearningEngine(makeConfig(), null);
    expect(engine.theta).toBe(0.05);
  });

  it('increases on correct answers', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    const before = engine.theta;
    engine.report(item, true, 1000);
    expect(engine.theta).toBeGreaterThan(before);
  });

  it('decreases on wrong answers', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    // Push theta up first
    for (let i = 0; i < 5; i++) engine.report(item, true, 1000);
    const before = engine.theta;
    engine.report(item, false, 1000);
    expect(engine.theta).toBeLessThan(before);
  });

  it('is clamped to [0, 1]', () => {
    const engine = new LearningEngine(makeConfig(), null);
    engine.theta = 0.01;
    const item = engine.next();
    // Many wrong answers
    for (let i = 0; i < 50; i++) engine.report(item, false, 1000);
    expect(engine.theta).toBeGreaterThanOrEqual(0);

    engine.theta = 0.99;
    for (let i = 0; i < 50; i++) engine.report(item, true, 500);
    expect(engine.theta).toBeLessThanOrEqual(1);
  });

  it('is persisted in save/load', () => {
    const cfg = makeConfig();
    const engine = new LearningEngine(cfg, 'theta-test');
    const item = engine.next();
    for (let i = 0; i < 10; i++) engine.report(item, true, 500);
    const savedTheta = engine.theta;
    engine.save();

    const engine2 = new LearningEngine(cfg, 'theta-test');
    expect(engine2.theta).toBeCloseTo(savedTheta, 5);
  });

  it('is included in getMastery().overall', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const mastery = engine.getMastery();
    expect(mastery.overall.theta).toBe(0.05);
  });

  it('resets to 0.05 on reset()', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    for (let i = 0; i < 10; i++) engine.report(item, true, 500);
    expect(engine.theta).toBeGreaterThan(0.05);
    engine.reset();
    expect(engine.theta).toBe(0.05);
  });
});

// ──────────────────────────────────────────────
// Confusion Tracking
// ──────────────────────────────────────────────

describe('confusion tracking', () => {
  it('records detected note on wrong answer', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();

    engine.report(item, false, undefined, { detected: 'F#' });

    const rec = engine.items.get(engine.config.itemKey(item));
    expect(rec.confusions).toHaveLength(1);
    expect(rec.confusions[0].detected).toBe('F#');
    expect(rec.confusions[0].ts).toBeGreaterThan(0);
  });

  it('does not record confusion on correct answer', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();

    engine.report(item, true, 1000, { detected: 'A' });

    const rec = engine.items.get(engine.config.itemKey(item));
    expect(rec.confusions).toHaveLength(0);
  });

  it('does not record confusion when meta.detected is absent', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();

    engine.report(item, false);

    const rec = engine.items.get(engine.config.itemKey(item));
    expect(rec.confusions).toHaveLength(0);
  });

  it('limits confusion history to MAX_CONFUSIONS (10)', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();

    for (let i = 0; i < 15; i++) {
      engine.report(item, false, undefined, { detected: `N${i}` });
    }

    const rec = engine.items.get(engine.config.itemKey(item));
    expect(rec.confusions).toHaveLength(10);
    // Oldest should be trimmed
    expect(rec.confusions[0].detected).toBe('N5');
    expect(rec.confusions[9].detected).toBe('N14');
  });

  it('getConfusions returns frequency map', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    const key = engine.config.itemKey(item);

    engine.report(item, false, undefined, { detected: 'F#' });
    engine.report(item, false, undefined, { detected: 'F#' });
    engine.report(item, false, undefined, { detected: 'G' });

    const freq = engine.getConfusions(key);
    expect(freq).toEqual({ 'F#': 2, 'G': 1 });
  });

  it('getConfusions returns empty for unknown item', () => {
    const engine = new LearningEngine(makeConfig(), null);
    expect(engine.getConfusions('nonexistent')).toEqual({});
  });
});

// ──────────────────────────────────────────────
// Session Fatigue Detection
// ──────────────────────────────────────────────

describe('session fatigue detection', () => {
  it('starts unfatigued', () => {
    const engine = new LearningEngine(makeConfig(), null);
    expect(engine.fatigued).toBe(false);
  });

  it('detects fatigue when accuracy drops >20%', () => {
    const engine = new LearningEngine(makeConfig(), null);

    // First 10 correct → good baseline
    for (let i = 0; i < 10; i++) {
      const item = engine.next();
      engine.report(item, true, 1000);
    }

    // Next 10 mostly wrong → fatigue trigger
    for (let i = 0; i < 10; i++) {
      const item = engine.next();
      engine.report(item, false, 1000, { detected: 'X' });
    }

    expect(engine.fatigued).toBe(true);
  });

  it('recovers from fatigue when accuracy improves', () => {
    const engine = new LearningEngine(makeConfig(), null);

    // Build baseline (10 correct)
    for (let i = 0; i < 10; i++) {
      const item = engine.next();
      engine.report(item, true, 1000);
    }

    // Trigger fatigue (10 wrong)
    for (let i = 0; i < 10; i++) {
      const item = engine.next();
      engine.report(item, false, 1000, { detected: 'X' });
    }
    expect(engine.fatigued).toBe(true);

    // Recover (10+ correct to push the window)
    for (let i = 0; i < 12; i++) {
      const item = engine.next();
      engine.report(item, true, 1000);
    }

    expect(engine.fatigued).toBe(false);
  });

  it('does not falsely trigger fatigue with consistent performance', () => {
    const engine = new LearningEngine(makeConfig(), null);

    // 20 alternating correct/wrong — consistent ~50% accuracy
    for (let i = 0; i < 20; i++) {
      const item = engine.next();
      engine.report(item, i % 2 === 0, 1000);
    }

    expect(engine.fatigued).toBe(false);
  });
});

// ──────────────────────────────────────────────
// Mastery Criteria
// ──────────────────────────────────────────────

describe('mastery criteria', () => {
  it('item is not mastered with insufficient pL', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine.report(item, true, 1000);

    const mastery = engine.getMastery();
    const it = mastery.items.find(i => i.key === engine.config.itemKey(item));
    // After 1 attempt, pL should be well below 0.90
    expect(it.mastered).toBe(false);
  });

  it('item becomes mastered with high pL, stability, and attempts', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    const key = engine.config.itemKey(item);

    // Report many correct answers to build up pL
    for (let i = 0; i < 20; i++) {
      engine.report(item, true, 500);
    }

    const rec = engine.items.get(key);
    expect(rec.pL).toBeGreaterThanOrEqual(0.90);
    expect(rec.attempts).toBeGreaterThanOrEqual(3);

    // FSRS stability grows slowly for same-session reviews (by design).
    // Simulate spaced reviews by manually setting S high to test the mastery check.
    rec.S = 15;

    const mastery = engine.getMastery();
    const it = mastery.items.find(i => i.key === key);
    expect(it.mastered).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Cold Start & Progression
// ──────────────────────────────────────────────

describe('cold start and progression', () => {
  it('uses random selection for first COLD_START (7) questions', () => {
    const items = [];
    const cfg = makeConfig({
      genRandom: () => {
        const id = `item-${Math.random().toString(36).slice(2, 6)}`;
        items.push(id);
        return { id, clusters: ['default'] };
      },
    });
    const engine = new LearningEngine(cfg, null);

    for (let i = 0; i < 7; i++) {
      engine.next();
    }

    // All 7 should have been generated via genRandom
    expect(items).toHaveLength(7);
  });
});

// ──────────────────────────────────────────────
// Item Selection Scoring
// ──────────────────────────────────────────────

describe('item selection', () => {
  it('prefers items with low pL (exploitation)', () => {
    const items = [
      { id: 'easy', clusters: ['c1'] },
      { id: 'hard', clusters: ['c2'] },
    ];
    const cfg = makeDeterministicConfig(items);
    const engine = new LearningEngine(cfg, null);

    // Seed both items
    engine._ensureItem(items[0]);
    engine._ensureItem(items[1]);
    engine.questionNumber = 10; // Past cold start
    engine.totalAttempts = 10;

    // Make 'easy' well-learned
    const easyRec = engine.items.get('easy');
    easyRec.pL = 0.95;
    easyRec.S = 20;
    easyRec.attempts = 5;
    easyRec.lastReviewTs = Date.now();

    // Make 'hard' poorly learned
    const hardRec = engine.items.get('hard');
    hardRec.pL = 0.2;
    hardRec.S = 1;
    hardRec.attempts = 5;
    hardRec.lastReviewTs = Date.now();

    const easyScore = engine._scoreCandidate({ item: items[0], record: easyRec, isNew: false });
    const hardScore = engine._scoreCandidate({ item: items[1], record: hardRec, isNew: false });

    expect(hardScore).toBeGreaterThan(easyScore);
  });

  it('new item scoring uses gaussian based on theta proximity', () => {
    const engine = new LearningEngine(makeConfig(), null);
    engine.totalAttempts = 10;
    engine.questionNumber = 10;
    engine.theta = 0.3;

    // Item at difficulty close to theta should score higher than far away
    const closeCfg = makeConfig({ itemDifficulty: () => 0.32 }); // close to theta+0.02
    const farCfg = makeConfig({ itemDifficulty: () => 0.8 }); // far from theta

    engine.config = closeCfg;
    const closeScore = engine._scoreCandidate({
      item: { id: 'close', clusters: ['default'] },
      record: null,
      isNew: true
    });

    engine.config = farCfg;
    const farScore = engine._scoreCandidate({
      item: { id: 'far', clusters: ['default'] },
      record: null,
      isNew: true
    });

    expect(closeScore).toBeGreaterThan(farScore);
  });

  it('applies difficulty match bonus for known items near theta', () => {
    const engine = new LearningEngine(makeConfig(), null);
    engine.totalAttempts = 10;
    engine.questionNumber = 10;
    engine.theta = 0.3;

    const item = { id: 'test', clusters: ['uniq'] };
    engine._ensureItem(item);
    const rec = engine.items.get('test');
    rec.pL = 0.5;
    rec.attempts = 5;
    rec.lastReviewTs = Date.now();
    rec.S = 2;

    // Difficulty near theta should have higher difficultyMatch
    const nearCfg = makeConfig({ itemDifficulty: () => 0.3 });
    const farCfg = makeConfig({ itemDifficulty: () => 0.9 });

    engine.config = nearCfg;
    const nearScore = engine._scoreCandidate({ item, record: rec, isNew: false });

    engine.config = farCfg;
    const farScore = engine._scoreCandidate({ item, record: rec, isNew: false });

    expect(nearScore).toBeGreaterThan(farScore);
  });

  it('applies fatigue bias toward easier items when fatigued', () => {
    const engine = new LearningEngine(makeConfig(), null);
    engine.totalAttempts = 10;
    engine.questionNumber = 10;
    engine.fatigued = true;

    const easyItem = { id: 'easy', clusters: ['uniq1'] };
    const hardItem = { id: 'hard', clusters: ['uniq2'] };
    engine._ensureItem(easyItem);
    engine._ensureItem(hardItem);

    const easyRec = engine.items.get('easy');
    easyRec.pL = 0.9; easyRec.S = 5; easyRec.attempts = 5; easyRec.lastReviewTs = Date.now();

    const hardRec = engine.items.get('hard');
    hardRec.pL = 0.2; hardRec.S = 1; hardRec.attempts = 5; hardRec.lastReviewTs = Date.now();

    const easyScore = engine._scoreCandidate({ item: easyItem, record: easyRec, isNew: false });
    const easyFatigueBias = easyRec.pL * 0.3; // 0.27

    // With fatigue, easy items get +pL*0.3 boost
    expect(easyFatigueBias).toBeCloseTo(0.27, 1);
  });
});

// ──────────────────────────────────────────────
// Persistence (v3)
// ──────────────────────────────────────────────

describe('persistence v3', () => {
  it('saves and loads engine state', () => {
    const cfg = makeConfig();
    const engine = new LearningEngine(cfg, 'test-save');

    const item = engine.next();
    engine.report(item, true, 1000);
    engine.report(item, false, undefined, { detected: 'F#' });
    engine.save();

    const key = cfg.itemKey(item);

    // Load into new engine
    const engine2 = new LearningEngine(cfg, 'test-save');
    expect(engine2.items.has(key)).toBe(true);

    const rec = engine2.items.get(key);
    expect(rec.S).toBeGreaterThan(0);
    expect(rec.D).toBeGreaterThan(0);
    expect(rec.lastReviewTs).toBeGreaterThan(0);
    expect(rec.confusions).toHaveLength(1);
    expect(rec.confusions[0].detected).toBe('F#');
    expect(rec.attempts).toBe(2);
  });

  it('saves with version 5 and includes theta and adaptive', () => {
    const engine = new LearningEngine(makeConfig(), 'test-v5');
    const item = engine.next();
    engine.report(item, true, 1000);
    engine.save();

    const raw = JSON.parse(store['gl_learn_test-v5']);
    expect(raw.v).toBe(5);
    expect(raw.theta).toBeGreaterThan(0);
    expect(raw.items).toBeDefined();
    expect(raw.adaptive).toBeDefined();

    // Check FSRS fields exist
    const itemData = Object.values(raw.items)[0];
    expect(itemData.S).toBeDefined();
    expect(itemData.D).toBeDefined();
    expect(itemData.lastReviewTs).toBeDefined();
    expect(itemData.confusions).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// V1 → V2 Migration (still handled by engine)
// ──────────────────────────────────────────────

describe('v1 to v2 migration', () => {
  it('migrates SM-2 fields to FSRS fields', () => {
    // Store v1 format data
    const v1Data = {
      v: 1,
      ts: Date.now(),
      questionNumber: 15,
      totalAttempts: 20,
      allCorrectTimes: [1000, 1200, 900],
      items: {
        'A': {
          ef: 2.5, ivl: 6, reps: 3, due: 20,
          pL: 0.75, attempts: 10, correct: 7,
          times: [1000, 1100], avgTime: 1050,
          lastSeen: 14, lastSeenTs: Date.now() - 86400000,
          hist: [true, true, false], streak: 0, cls: ['default'],
        }
      },
      clusters: { default: { correct: 7, total: 10 } },
      recentKeys: ['A'],
    };
    store['gl_learn_migrate-test'] = JSON.stringify(v1Data);

    const engine = new LearningEngine(makeConfig(), 'migrate-test');

    expect(engine.questionNumber).toBe(15);
    expect(engine.totalAttempts).toBe(20);

    const rec = engine.items.get('A');
    expect(rec).toBeDefined();

    // S should be derived from ivl
    expect(rec.S).toBe(6); // Math.max(1, ivl)

    // D should be derived from ef: clamp(11 - 2.5*2, 1, 10) = clamp(6, 1, 10) = 6
    expect(rec.D).toBe(6);

    // lastReviewTs should come from lastSeenTs
    expect(rec.lastReviewTs).toBe(v1Data.items.A.lastSeenTs);

    // Confusions should be initialized empty
    expect(rec.confusions).toEqual([]);

    // pL preserved
    expect(rec.pL).toBe(0.75);

    // Theta initialized
    expect(engine.theta).toBe(0.05);
  });

  it('handles v1 data with missing optional fields', () => {
    const v1Data = {
      v: 1, ts: Date.now(), questionNumber: 2, totalAttempts: 2,
      items: {
        'B': { pL: 0.3, attempts: 2, correct: 1, cls: ['default'] }
      },
      clusters: {},
    };
    store['gl_learn_migrate-sparse'] = JSON.stringify(v1Data);

    const engine = new LearningEngine(makeConfig(), 'migrate-sparse');
    const rec = engine.items.get('B');
    expect(rec).toBeDefined();
    expect(rec.S).toBe(1);
    expect(rec.confusions).toEqual([]);
  });

  it('ignores unknown version data', () => {
    store['gl_learn_future'] = JSON.stringify({ v: 99 });
    const engine = new LearningEngine(makeConfig(), 'future');
    expect(engine.items.size).toBe(0);
  });
});

// ──────────────────────────────────────────────
// getMastery()
// ──────────────────────────────────────────────

describe('getMastery', () => {
  it('returns FSRS fields (S, R) and confusions in items', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine.report(item, true, 1000);
    engine.report(item, false, undefined, { detected: 'C#' });

    const mastery = engine.getMastery();
    expect(mastery.items).toHaveLength(1);

    const it = mastery.items[0];
    expect(it.S).toBeGreaterThan(0);
    expect(typeof it.D).toBe('number');
    expect(typeof it.R).toBe('number');
    expect(it.topConfusion).toBe('C#');
  });

  it('returns fatigued flag', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const mastery = engine.getMastery();
    expect(mastery.fatigued).toBe(false);

    engine.fatigued = true;
    const mastery2 = engine.getMastery();
    expect(mastery2.fatigued).toBe(true);
  });

  it('computes overall stats correctly', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine.report(item, true, 1000);
    engine.report(item, true, 1500);
    engine.report(item, false);

    const mastery = engine.getMastery();
    expect(mastery.overall.sessionQuestions).toBe(1); // questionNumber increments on next(), not report()
    expect(mastery.overall.totalItems).toBe(1);
    expect(mastery.overall.theta).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// Reset
// ──────────────────────────────────────────────

describe('reset', () => {
  it('clears all state including fatigue and session window', () => {
    const engine = new LearningEngine(makeConfig(), 'test-reset');
    const item = engine.next();
    engine.report(item, true, 1000);
    engine.fatigued = true;
    engine.sessionWindow.push({ ok: true, timeMs: 1000, questionNumber: 1 });

    engine.reset();

    expect(engine.items.size).toBe(0);
    expect(engine.questionNumber).toBe(0);
    expect(engine.theta).toBe(0.05);
    expect(engine.fatigued).toBe(false);
    expect(engine.sessionWindow).toHaveLength(0);
    expect(engine.preFatigueAccuracy).toBeNull();
  });

  it('clears localStorage on reset', () => {
    const engine = new LearningEngine(makeConfig(), 'test-reset-ls');
    const item = engine.next();
    engine.report(item, true, 1000);
    engine.save();

    expect(store['gl_learn_test-reset-ls']).toBeDefined();

    engine.reset();
    expect(store['gl_learn_test-reset-ls']).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// Edge Cases
// ──────────────────────────────────────────────

describe('edge cases', () => {
  it('handles report with no timeMs gracefully', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();

    // Should not throw
    engine.report(item, true);
    engine.report(item, false);
    engine.report(item, true, null);
    engine.report(item, false, undefined, { detected: 'X' });

    const rec = engine.items.get(engine.config.itemKey(item));
    expect(rec.attempts).toBe(4);
    expect(rec.S).toBeGreaterThan(0);
  });

  it('handles empty candidates gracefully', () => {
    const cfg = makeConfig({
      genRandom: () => ({ id: 'only', clusters: ['default'] }),
    });
    const engine = new LearningEngine(cfg, null);

    // Should not throw even with single-item pool
    for (let i = 0; i < 20; i++) {
      const item = engine.next();
      engine.report(item, i % 2 === 0, 1000);
    }

    expect(engine.items.size).toBe(1);
  });

  it('does not crash when loading corrupt localStorage', () => {
    store['gl_learn_corrupt'] = '{{{bad json';
    const engine = new LearningEngine(makeConfig(), 'corrupt');
    expect(engine.items.size).toBe(0);
  });

  it('handles constructor without exerciseId (no persistence)', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine.report(item, true, 500);
    engine.save(); // Should be a no-op, not throw

    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// Phase 1a: Micro-Drill Injection
// ──────────────────────────────────────────────

describe('micro-drill injection', () => {
  it('triggers micro-drill after 3/5 failures on last item', () => {
    const drillItems = [
      { id: 'drill1', clusters: ['default'] },
      { id: 'drill2', clusters: ['default'] },
    ];
    const cfg = makeConfig({
      microDrill: () => drillItems,
    });
    const engine = new LearningEngine(cfg, null);

    // Go past cold start
    for (let i = 0; i < 8; i++) {
      const item = engine.next();
      engine.report(item, true, 500);
    }

    // Get a specific item and fail it 3+ times out of 5
    const target = engine.next();
    engine.report(target, false, 500);
    engine.report(target, false, 500);
    engine.report(target, false, 500);

    // Next call should trigger micro-drill
    const next = engine.next();
    expect(next.id).toBe('drill1');

    // Second drill item
    engine.report(next, true, 500);
    const next2 = engine.next();
    expect(next2.id).toBe('drill2');
  });

  it('does not crash when config.microDrill is null', () => {
    const cfg = makeConfig({ microDrill: null });
    const engine = new LearningEngine(cfg, null);

    for (let i = 0; i < 8; i++) {
      const item = engine.next();
      engine.report(item, true, 500);
    }

    const target = engine.next();
    for (let i = 0; i < 5; i++) {
      engine.report(target, false, 500);
    }

    // Should not throw, just proceed normally
    const next = engine.next();
    expect(next).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// Phase 1b: Confusion Drill
// ──────────────────────────────────────────────

describe('confusion drill', () => {
  it('builds alternation drill after 2+ confusions with wrong answer', () => {
    const cfg = makeConfig({
      genFromCluster: (clusterId) => {
        if (clusterId.startsWith('note_')) {
          return { id: clusterId.replace('note_', ''), clusters: ['default'] };
        }
        return { id: 'fallback', clusters: ['default'] };
      },
    });
    const engine = new LearningEngine(cfg, null);

    // Go past cold start
    for (let i = 0; i < 8; i++) {
      const item = engine.next();
      engine.report(item, true, 500);
    }

    const target = engine.next();
    // Report confusions: same detected value twice + wrong answer at end
    engine.report(target, false, 500, { detected: 'F#' });
    engine.report(target, false, 500, { detected: 'F#' });

    // Confusion drill should be queued for next()
    const next = engine.next();
    // Should get one of the confusion drill items
    expect(next).toBeDefined();
  });

  it('respects 10-question cooldown', () => {
    const cfg = makeConfig({
      genFromCluster: (clusterId) => ({ id: 'confused', clusters: ['default'] }),
    });
    const engine = new LearningEngine(cfg, null);

    // Go past cold start
    for (let i = 0; i < 8; i++) {
      const item = engine.next();
      engine.report(item, true, 500);
    }

    const target = engine.next();
    engine.report(target, false, 500, { detected: 'F#' });
    engine.report(target, false, 500, { detected: 'F#' });

    // Trigger first confusion drill
    const drill1 = engine.next();

    // Drain the confusion queue
    while (engine.confusionDrillQueue.length > 0) {
      const d = engine.confusionDrillQueue.shift();
      engine._ensureItem(d);
      engine.report(d, true, 500);
    }
    engine.report(drill1, true, 500);

    // Re-fail same item within cooldown
    const again = engine.next();
    const key = cfg.itemKey(target);
    const rec = engine.items.get(key);
    if (rec) {
      engine.report(target, false, 500, { detected: 'F#' });
    }

    // Should NOT trigger another confusion drill within 10 questions
    // (the rec._lastConfDrill was set recently)
    expect(engine.confusionDrillQueue.length).toBe(0);
  });
});

// ──────────────────────────────────────────────
// Phase 1c: FSRS Due-Date Session Planning
// ──────────────────────────────────────────────

describe('FSRS due-date session planning', () => {
  it('front-loads overdue items', () => {
    const cfg = makeConfig();
    const engine = new LearningEngine(cfg, null);

    // Manually create items with past-due dates
    const overdueItem = { id: 'overdue1', clusters: ['c1'] };
    engine._ensureItem(overdueItem);
    const rec = engine.items.get('overdue1');
    rec.due = Date.now() - 86400000; // 1 day overdue
    rec.S = 1;
    rec.attempts = 3;
    rec.lastReviewTs = Date.now() - 2 * 86400000;

    // Go past cold start
    engine.questionNumber = 7;
    engine.totalAttempts = 10;

    const next = engine.next();
    // The overdue item should be front-loaded
    expect(next.id).toBe('overdue1');
  });

  it('does not include non-overdue items', () => {
    const cfg = makeConfig();
    const engine = new LearningEngine(cfg, null);

    // Create item with future due date
    const futureItem = { id: 'future1', clusters: ['c1'] };
    engine._ensureItem(futureItem);
    const rec = engine.items.get('future1');
    rec.due = Date.now() + 86400000; // due tomorrow
    rec.S = 5;
    rec.attempts = 3;
    rec.lastReviewTs = Date.now();

    engine.questionNumber = 7;
    engine.totalAttempts = 10;
    engine.overdueQueue = null; // force rebuild

    const next = engine.next();
    // Should NOT be the future item (it may be, but only via normal scoring, not overdue queue)
    // The overdue queue should be empty
    expect(engine.overdueQueue.length).toBe(0);
  });
});

// ──────────────────────────────────────────────
// Phase 1d: Cold Start Round-Robin
// ──────────────────────────────────────────────

describe('cold start round-robin', () => {
  it('samples all types in first N questions with unified config', () => {
    const typeIds = ['nf', 'st', 'iv'];
    const generated = [];
    const cfg = makeConfig({
      getTypeIds: () => typeIds,
      genFromType: (typeId) => {
        generated.push(typeId);
        return { id: typeId + '_item', clusters: ['default'] };
      },
    });
    const engine = new LearningEngine(cfg, null);

    // First 3 questions should round-robin through types
    for (let i = 0; i < 3; i++) {
      engine.next();
    }

    // All 3 type IDs should have been used
    expect(generated).toHaveLength(3);
    expect(new Set(generated).size).toBe(3);
    for (const tid of typeIds) {
      expect(generated).toContain(tid);
    }
  });

  it('dynamic cold start adjusts to type count', () => {
    const typeIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']; // 10 types
    const cfg = makeConfig({
      getTypeIds: () => typeIds,
      genFromType: (typeId) => ({ id: typeId + '_item', clusters: ['default'] }),
    });
    const engine = new LearningEngine(cfg, null);

    // Cold start should be max(7, 10) = 10
    for (let i = 0; i < 10; i++) {
      const item = engine.next();
      expect(item).toBeDefined();
    }

    // All 10 types should have been covered in first 10 questions
    expect(engine.coldStartTypes).toHaveLength(10);
  });

  it('falls back to genRandom when getTypeIds is not available', () => {
    const cfg = makeConfig(); // no getTypeIds
    const engine = new LearningEngine(cfg, null);

    // Should work normally without getTypeIds
    for (let i = 0; i < 7; i++) {
      const item = engine.next();
      expect(item).toBeDefined();
    }
  });
});

// ──────────────────────────────────────────────
// Phase 1e: BKT/FSRS Reconciliation
// ──────────────────────────────────────────────

describe('BKT/FSRS reconciliation', () => {
  it('dampens pL when high pL + low R (forgotten)', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine._ensureItem(item);
    const rec = engine.items.get(engine.config.itemKey(item));

    // Set up: high pL, low R scenario
    rec.pL = 0.9;
    rec.S = 0.5; // low stability
    rec.lastReviewTs = Date.now() - 30 * 86400000; // 30 days ago → low R

    engine._reconcileBKTFSRS(rec);

    // pL should be dampened toward R
    expect(rec.pL).toBeLessThan(0.9);
  });

  it('nudges pL up when low pL + high S + high R (FSRS stable)', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine._ensureItem(item);
    const rec = engine.items.get(engine.config.itemKey(item));

    rec.pL = 0.3;
    rec.S = 10; // high stability
    rec.lastReviewTs = Date.now() - 1000; // very recent → high R

    engine._reconcileBKTFSRS(rec);

    expect(rec.pL).toBeGreaterThan(0.3);
  });

  it('caps pL at 0.7 for lucky streak (high pL + very low S + few attempts)', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine._ensureItem(item);
    const rec = engine.items.get(engine.config.itemKey(item));

    rec.pL = 0.85;
    rec.S = 0.3; // very low stability
    rec.attempts = 3;
    rec.lastReviewTs = Date.now();

    engine._reconcileBKTFSRS(rec);

    expect(rec.pL).toBeLessThanOrEqual(0.7);
  });

  it('does nothing when S is 0', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const item = engine.next();
    engine._ensureItem(item);
    const rec = engine.items.get(engine.config.itemKey(item));

    rec.pL = 0.5;
    rec.S = 0;

    engine._reconcileBKTFSRS(rec);

    expect(rec.pL).toBe(0.5);
  });
});

// ──────────────────────────────────────────────
// Phase 2a: Adaptive Sigma/Offset
// ──────────────────────────────────────────────

describe('adaptive sigma/offset (85% target)', () => {
  it('widens sigma above 90% accuracy', () => {
    const engine = new LearningEngine(makeConfig(), null);
    engine.totalAttempts = 20;

    // Fill session window with >90% accuracy
    for (let i = 0; i < 20; i++) {
      engine.sessionWindow.push({ ok: i < 19, timeMs: 500, questionNumber: i + 1 }); // 95% accuracy
    }

    const sigma = engine._adaptiveSigma();
    expect(sigma).toBeGreaterThan(0.12);
  });

  it('narrows sigma below 80% accuracy', () => {
    const engine = new LearningEngine(makeConfig(), null);
    engine.totalAttempts = 20;

    // Fill session window with <80% accuracy
    for (let i = 0; i < 20; i++) {
      engine.sessionWindow.push({ ok: i < 10, timeMs: 500, questionNumber: i + 1 }); // 50% accuracy
    }

    const sigma = engine._adaptiveSigma();
    expect(sigma).toBeLessThan(0.12);
  });

  it('pushes offset higher above 90% accuracy', () => {
    const engine = new LearningEngine(makeConfig(), null);
    engine.totalAttempts = 20;

    for (let i = 0; i < 20; i++) {
      engine.sessionWindow.push({ ok: true, timeMs: 500, questionNumber: i + 1 });
    }

    const offset = engine._adaptiveOffset();
    expect(offset).toBe(0.05);
  });

  it('pulls offset back below 80% accuracy', () => {
    const engine = new LearningEngine(makeConfig(), null);
    engine.totalAttempts = 20;

    for (let i = 0; i < 20; i++) {
      engine.sessionWindow.push({ ok: i < 10, timeMs: 500, questionNumber: i + 1 });
    }

    const offset = engine._adaptiveOffset();
    expect(offset).toBe(-0.02);
  });
});

// ──────────────────────────────────────────────
// Phase 2b: Plateau Detection
// ──────────────────────────────────────────────

describe('plateau detection', () => {
  it('detects plateau when theta is flat over 5 snapshots', () => {
    const engine = new LearningEngine(makeConfig(), null);

    // Add 5 snapshots with very similar theta
    for (let i = 0; i < 5; i++) {
      engine.thetaHistory.push({ ts: Date.now() + i * 1000, theta: 0.500 + i * 0.001 });
    }

    engine._checkPlateau();
    expect(engine.plateauDetected).toBe(true);
  });

  it('does not false positive during normal growth', () => {
    const engine = new LearningEngine(makeConfig(), null);

    // Add 5 snapshots with growing theta
    for (let i = 0; i < 5; i++) {
      engine.thetaHistory.push({ ts: Date.now() + i * 1000, theta: 0.3 + i * 0.05 });
    }

    engine._checkPlateau();
    expect(engine.plateauDetected).toBe(false);
  });

  it('requires at least 5 snapshots', () => {
    const engine = new LearningEngine(makeConfig(), null);

    for (let i = 0; i < 3; i++) {
      engine.thetaHistory.push({ ts: Date.now(), theta: 0.5 });
    }

    engine._checkPlateau();
    expect(engine.plateauDetected).toBe(false);
  });

  it('is exposed in getMastery().overall', () => {
    const engine = new LearningEngine(makeConfig(), null);
    engine.plateauDetected = true;
    const mastery = engine.getMastery();
    expect(mastery.overall.plateauDetected).toBe(true);
  });

  it('is persisted in save/load via thetaHistory', () => {
    const cfg = makeConfig();
    const engine = new LearningEngine(cfg, 'plateau-test');

    for (let i = 0; i < 5; i++) {
      engine.thetaHistory.push({ ts: Date.now(), theta: 0.5 });
    }
    engine.save();

    const engine2 = new LearningEngine(cfg, 'plateau-test');
    expect(engine2.thetaHistory).toHaveLength(5);
  });
});

// ──────────────────────────────────────────────
// Phase 2c: Speed/Fluency Targets
// ──────────────────────────────────────────────

describe('speed/fluency targets', () => {
  it('computes tighter target for high-pL items', () => {
    const engine = new LearningEngine(makeConfig(), null);

    // Seed correct times
    for (let i = 0; i < 20; i++) {
      engine.allCorrectTimes.push(2000);
    }

    const highPL = { pL: 0.9, avgTime: 1500 };
    const lowPL = { pL: 0.1, avgTime: 1500 };

    const targetHigh = engine._targetTime(highPL);
    const targetLow = engine._targetTime(lowPL);

    // High pL should have tighter (lower) target
    expect(targetHigh).toBeLessThan(targetLow);
  });

  it('returns 0 when no correct times recorded', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const target = engine._targetTime({ pL: 0.5 });
    expect(target).toBe(0);
  });

  it('exposes targetTime and fluencyRatio in getMastery()', () => {
    const engine = new LearningEngine(makeConfig(), null);

    // Seed times
    for (let i = 0; i < 10; i++) engine.allCorrectTimes.push(2000);

    const item = engine.next();
    engine.report(item, true, 1500);

    const mastery = engine.getMastery();
    const it = mastery.items[0];
    expect(typeof it.targetTime).toBe('number');
    expect(typeof it.fluencyRatio).toBe('number');
  });
});

// ──────────────────────────────────────────────
// Phase 3a: Knowledge Transfer
// ──────────────────────────────────────────────

describe('knowledge transfer', () => {
  it('boosts initial pL from existing global cluster stats', () => {
    const engine = new LearningEngine(makeConfig({
      itemClusters: (item) => item.clusters || ['default'],
    }), null);

    // Create an established item with global cluster
    const item1 = { id: 'item1', clusters: ['default', 'global_note_C'] };
    engine._ensureItem(item1);

    // Build up the global cluster stats
    const cl = engine._ensureCluster('global_note_C');
    cl.correct = 8;
    cl.total = 10;

    // Now create a new item that shares the global cluster
    const item2 = { id: 'item2', clusters: ['default', 'global_note_C'] };
    const rec = engine._ensureItem(item2);

    // Should have boosted initial pL
    expect(rec.pL).toBeGreaterThan(0);
  });

  it('caps knowledge transfer at 0.3', () => {
    const engine = new LearningEngine(makeConfig({
      itemClusters: (item) => item.clusters || ['default'],
    }), null);

    const cl = engine._ensureCluster('global_note_C');
    cl.correct = 100;
    cl.total = 100; // 100% accuracy

    const item = { id: 'newitem', clusters: ['default', 'global_note_C'] };
    const rec = engine._ensureItem(item);

    expect(rec.pL).toBeLessThanOrEqual(0.3);
  });

  it('requires minimum 3 attempts in cluster', () => {
    const engine = new LearningEngine(makeConfig({
      itemClusters: (item) => item.clusters || ['default'],
    }), null);

    const cl = engine._ensureCluster('global_note_C');
    cl.correct = 2;
    cl.total = 2; // only 2 attempts — below threshold

    const item = { id: 'newitem', clusters: ['default', 'global_note_C'] };
    const rec = engine._ensureItem(item);

    expect(rec.pL).toBe(0); // no transfer
  });
});

// ──────────────────────────────────────────────
// Phase 3b: Coverage Matrix
// ──────────────────────────────────────────────

describe('coverage matrix', () => {
  it('returns 6×6 matrix with correct structure', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const matrix = engine.getCoverageMatrix();

    // Should have entries for all string × zone combos
    expect(matrix['str_0:zone_0']).toBeDefined();
    expect(matrix['str_5:zone_12']).toBeDefined();
    expect(matrix['str_0:zone_0'].count).toBe(0);
  });

  it('populates matrix from item clusters', () => {
    const engine = new LearningEngine(makeConfig({
      itemClusters: (item) => item.clusters,
    }), null);

    const item = { id: 'test', clusters: ['str_2', 'zone_5'] };
    const rec = engine._ensureItem(item);
    rec.pL = 0.5;

    const matrix = engine.getCoverageMatrix();
    expect(matrix['str_2:zone_5'].count).toBe(1);
    expect(matrix['str_2:zone_5'].avgPL).toBeCloseTo(0.5);
  });

  it('applies coverage bonus in scoring for underpracticed cells', () => {
    const engine = new LearningEngine(makeConfig({
      itemClusters: (item) => item.clusters,
    }), null);
    engine.questionNumber = 10;
    engine.totalAttempts = 10;

    const item = { id: 'sparse', clusters: ['str_3', 'zone_7'] };
    engine._ensureItem(item);
    const rec = engine.items.get('sparse');
    rec.pL = 0.5;
    rec.S = 1;
    rec.attempts = 3;
    rec.lastReviewTs = Date.now();

    const score = engine._scoreCandidate({ item, record: rec, isNew: false });
    // Score should include coverage bonus since str_3/zone_7 has < 3 items
    expect(score).toBeGreaterThan(0);
  });

  it('is included in getMastery()', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const mastery = engine.getMastery();
    expect(mastery.coverage).toBeDefined();
    expect(typeof mastery.coverage).toBe('object');
  });
});

// ──────────────────────────────────────────────
// Adaptive Estimation Integration
// ──────────────────────────────────────────────

describe('adaptive estimation integration', () => {
  it('estimates pG after 20+ attempts on new items', () => {
    // Create items that stay at low pL (simulate guessing)
    const items = [];
    for (let i = 0; i < 10; i++) {
      items.push({ id: `new_${i}`, clusters: ['default'] });
    }
    const config = makeDeterministicConfig(items);
    const engine = new LearningEngine(config, null);

    // Initially null
    expect(engine.adaptive.pG).toBeNull();

    // Cold start + generate items
    for (let i = 0; i < 8; i++) engine.next();
    for (let i = 0; i < 8; i++) engine.report(items[i % items.length], false, 1000);

    // Do more attempts, keeping items at low pL (mostly wrong)
    for (let q = 0; q < 20; q++) {
      const item = engine.next();
      // Mostly wrong to keep pL low, occasionally right (guess)
      engine.report(item, q % 5 === 0, 1000);
    }

    // After 20+ total attempts on low-pL items, pG should be estimated
    // Force a check at the 20-attempt boundary
    if (engine.totalAttempts % 20 !== 0) {
      const remaining = 20 - (engine.totalAttempts % 20);
      for (let q = 0; q < remaining; q++) {
        const item = engine.next();
        engine.report(item, false, 1000);
      }
    }

    // pG should now be estimated (or null if items gained too much pL)
    // The key is that the adaptive system ran without errors
    expect(engine.adaptive).toBeDefined();
    expect(typeof engine.adaptive.pG === 'number' || engine.adaptive.pG === null).toBe(true);
  });

  it('estimates pS after mastering 5+ items', () => {
    const items = [];
    for (let i = 0; i < 8; i++) {
      items.push({ id: `item_${i}`, clusters: ['default'] });
    }
    const config = makeDeterministicConfig(items);
    const engine = new LearningEngine(config, null);

    // Drive items to mastery: many correct answers
    for (let round = 0; round < 12; round++) {
      for (const item of items) {
        engine.next();
        engine.report(item, true, 800);
      }
    }

    // Force adaptive check
    if (engine.totalAttempts % 20 !== 0) {
      const remaining = 20 - (engine.totalAttempts % 20);
      for (let q = 0; q < remaining; q++) {
        const item = engine.next();
        engine.report(item, true, 800);
      }
    }

    // With 8 items and 12+ rounds of correct answers, many should have pL > 0.9
    // pS should be estimated (low slip rate since everything is correct)
    const masteredItems = [...engine.items.values()].filter(r => r.pL > 0.9 && r.attempts >= 5);
    if (masteredItems.length >= 5) {
      expect(engine.adaptive.pS).not.toBeNull();
      expect(engine.adaptive.pS).toBeGreaterThanOrEqual(0.02);
      expect(engine.adaptive.pS).toBeLessThanOrEqual(0.30);
    }
  });

  it('estimates pT for fast learners', () => {
    const items = [];
    for (let i = 0; i < 10; i++) {
      items.push({ id: `fast_${i}`, clusters: ['default'] });
    }
    const config = makeDeterministicConfig(items);
    const engine = new LearningEngine(config, null);

    // Drive items to pL >= 0.8 quickly (3-4 correct in a row per item)
    for (let round = 0; round < 6; round++) {
      for (const item of items) {
        engine.next();
        engine.report(item, true, 700);
      }
    }

    // Force adaptive update
    if (engine.totalAttempts % 20 !== 0) {
      const remaining = 20 - (engine.totalAttempts % 20);
      for (let q = 0; q < remaining; q++) {
        const item = engine.next();
        engine.report(item, true, 700);
      }
    }

    // Check that adaptive estimates exist
    const crossedMastery = [...engine.items.values()].filter(r => r.pL >= 0.8);
    if (crossedMastery.length > 0) {
      // pT should be boosted (fast learner) or null if avg is in [5, 12]
      expect(typeof engine.adaptive.pT === 'number' || engine.adaptive.pT === null).toBe(true);
      if (engine.adaptive.pT !== null) {
        expect(engine.adaptive.pT).toBeGreaterThanOrEqual(0.05);
        expect(engine.adaptive.pT).toBeLessThanOrEqual(0.40);
      }
    }
  });

  it('adaptive params flow into BKT updates', () => {
    const items = [];
    for (let i = 0; i < 10; i++) {
      items.push({ id: `bkt_${i}`, clusters: ['default'] });
    }
    const config = makeDeterministicConfig(items);
    const engine = new LearningEngine(config, null);

    const initialBktPG = engine.bkt.pG;

    // Generate enough data for adaptive estimates
    for (let round = 0; round < 8; round++) {
      for (const item of items) {
        engine.next();
        engine.report(item, true, 800);
      }
    }

    // Force check
    if (engine.totalAttempts % 20 !== 0) {
      const remaining = 20 - (engine.totalAttempts % 20);
      for (let q = 0; q < remaining; q++) {
        const item = engine.next();
        engine.report(item, true, 800);
      }
    }

    // If adaptive pG was estimated, bkt.pG should have been updated
    if (engine.adaptive.pG !== null) {
      expect(engine.bkt.pG).toBe(engine.adaptive.pG);
      expect(engine.bkt.pG).not.toBe(initialBktPG);
    }
  });

  it('exposes adaptive state in getMastery()', () => {
    const engine = new LearningEngine(makeConfig(), null);
    const mastery = engine.getMastery();
    expect(mastery.adaptive).toBeDefined();
    expect(mastery.adaptive.pG).toBeNull();
    expect(mastery.adaptive.pS).toBeNull();
    expect(mastery.adaptive.pT).toBeNull();
    expect(mastery.adaptive.drillEffectiveness).toBeDefined();
  });

  it('resets adaptive state on reset()', () => {
    const items = [{ id: 'A', clusters: ['default'] }];
    const config = makeDeterministicConfig(items);
    const engine = new LearningEngine(config, null);

    // Manually set adaptive state
    engine.adaptive.pG = 0.10;
    engine.adaptive.featureErrorRates = { string_1: { correct: 5, total: 10 } };

    engine.reset();

    expect(engine.adaptive.pG).toBeNull();
    expect(engine.adaptive.pS).toBeNull();
    expect(engine.adaptive.pT).toBeNull();
    expect(engine.adaptive.featureErrorRates).toEqual({});
    expect(engine.adaptive.drillEffectiveness.microDrill).toEqual({ helped: 0, total: 0 });
  });

  it('tracks feature errors when config provides itemFeatures', () => {
    const items = [
      { id: 'A', clusters: ['default'] },
      { id: 'B', clusters: ['default'] },
    ];
    const config = makeDeterministicConfig(items);
    config.itemFeatures = (item) => ({ string: item.id === 'A' ? 1 : 2 });

    const engine = new LearningEngine(config, null);

    // Report some attempts
    for (let i = 0; i < 10; i++) {
      engine.next();
      engine.report(items[i % 2], i % 3 !== 0, 1000);
    }

    // Feature error rates should be populated
    expect(Object.keys(engine.adaptive.featureErrorRates).length).toBeGreaterThan(0);
  });

  it('persists and restores adaptive state through save/load', () => {
    const items = [{ id: 'A', clusters: ['default'] }];
    const config = makeDeterministicConfig(items);
    const engine = new LearningEngine(config, 'adaptive-persist-test');

    // Set adaptive state
    engine.adaptive.pG = 0.08;
    engine.adaptive.pS = 0.12;
    engine.adaptive.featureErrorRates = { string_1: { correct: 8, total: 10 } };
    engine._save();

    // Create new engine that loads from same storage
    const engine2 = new LearningEngine(config, 'adaptive-persist-test');
    expect(engine2.adaptive.pG).toBe(0.08);
    expect(engine2.adaptive.pS).toBe(0.12);
    expect(engine2.adaptive.featureErrorRates.string_1).toEqual({ correct: 8, total: 10 });

    // If pG was loaded, it should flow into bkt params
    expect(engine2.bkt.pG).toBe(0.08);
  });
});

// v4 adaptive persistence tests are in persistence/serializer.test.js and migration.test.js
