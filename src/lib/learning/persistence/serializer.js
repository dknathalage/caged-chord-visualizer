import { clamp } from '../math-utils.js';

const VERSION = 4;

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

export function serialize(state) {
  const itemsObj = {};
  for (const [key, rec] of state.items) {
    itemsObj[key] = {
      S: rec.S, D: rec.D, lastReviewTs: rec.lastReviewTs, due: rec.due,
      pL: rec.pL, attempts: rec.attempts, correct: rec.correct,
      times: rec.times, avgTime: rec.avgTime,
      lastSeen: rec.lastSeen, lastSeenTs: rec.lastSeenTs,
      hist: rec.hist, streak: rec.streak, clusters: rec.clusters,
      confusions: rec.confusions,
    };
  }
  const clustersObj = {};
  for (const [id, cl] of state.clusters) {
    clustersObj[id] = { correct: cl.correct, total: cl.total };
  }
  return JSON.stringify({
    v: VERSION,
    ts: Date.now(),
    questionNumber: state.questionNumber,
    totalAttempts: state.totalAttempts,
    allCorrectTimes: state.allCorrectTimes,
    items: itemsObj,
    clusters: clustersObj,
    recentKeys: state.recentKeys,
    theta: state.theta,
    thetaHistory: state.thetaHistory,
    adaptive: state.adaptive ?? DEFAULT_ADAPTIVE,
  });
}

export function deserialize(raw) {
  const data = JSON.parse(raw);

  if (data.v === 1) {
    return { version: 1, data };
  }

  if (data.v === 3) {
    // v3 → v4: add default adaptive field
    data.v = 4;
    data.adaptive = DEFAULT_ADAPTIVE;
  }

  if (data.v !== VERSION) return null;

  const items = new Map();
  if (data.items) {
    for (const [key, r] of Object.entries(data.items)) {
      items.set(key, {
        key,
        S: r.S ?? 0,
        D: r.D ?? 5.0,
        lastReviewTs: r.lastReviewTs ?? 0,
        due: r.due ?? 0,
        pL: r.pL ?? 0,
        attempts: r.attempts ?? 0,
        correct: r.correct ?? 0,
        times: r.times ?? [],
        avgTime: r.avgTime ?? 0,
        lastSeen: r.lastSeen ?? 0,
        lastSeenTs: r.lastSeenTs ?? 0,
        hist: r.hist ?? [],
        streak: r.streak ?? 0,
        clusters: r.clusters ?? [],
        confusions: r.confusions ?? [],
      });
    }
  }

  const clusters = new Map();
  if (data.clusters) {
    for (const [id, cl] of Object.entries(data.clusters)) {
      clusters.set(id, { id, correct: cl.correct || 0, total: cl.total || 0 });
    }
  }

  return {
    version: VERSION,
    questionNumber: data.questionNumber || 0,
    totalAttempts: data.totalAttempts || 0,
    allCorrectTimes: data.allCorrectTimes || [],
    recentKeys: data.recentKeys || [],
    theta: data.theta ?? 0.05,
    thetaHistory: data.thetaHistory || [],
    items,
    clusters,
    adaptive: data.adaptive ?? DEFAULT_ADAPTIVE,
  };
}

export function migrateV1(data) {
  const items = new Map();

  if (data.items) {
    for (const [key, r] of Object.entries(data.items)) {
      items.set(key, {
        key,
        S: Math.max(1, r.ivl || 1),
        D: clamp(11 - (r.ef || 2.5) * 2, 1, 10),
        lastReviewTs: r.lastSeenTs || 0,
        due: 0,
        pL: r.pL ?? 0,
        attempts: r.attempts ?? 0,
        correct: r.correct ?? 0,
        times: r.times ?? [],
        avgTime: r.avgTime ?? 0,
        lastSeen: r.lastSeen ?? 0,
        lastSeenTs: r.lastSeenTs ?? 0,
        hist: r.hist ?? [],
        streak: r.streak ?? 0,
        clusters: r.clusters ?? [],
        confusions: [],
      });
    }
  }

  const clusters = new Map();
  if (data.clusters) {
    for (const [id, cl] of Object.entries(data.clusters)) {
      clusters.set(id, { id, correct: cl.correct || 0, total: cl.total || 0 });
    }
  }

  return {
    version: VERSION,
    questionNumber: data.questionNumber || 0,
    totalAttempts: data.totalAttempts || 0,
    allCorrectTimes: data.allCorrectTimes || [],
    recentKeys: data.recentKeys || [],
    theta: 0.05,
    thetaHistory: [],
    items,
    clusters,
    adaptive: DEFAULT_ADAPTIVE,
  };
}
