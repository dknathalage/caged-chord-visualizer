const ADJ_EVERY = 8;
const COLD_START = 7;
const C = 1.2; // UCB1 exploration constant
const MS_PER_DAY = 86400000;
const MAX_TIMES = 10;
const MAX_HIST = 5;
const MAX_CORRECT_TIMES = 200;
const MAX_CONFUSIONS = 10;
const SESSION_WINDOW = 20;
const STORE_PREFIX = 'gl_learn_';
const VERSION = 2;

// FSRS constants
const FACTOR = 19 / 81;
const DECAY = -0.5;

// FSRS default parameters (W[0..18])
const W = [
  0.4026, 1.1839, 3.173, 15.691,   // W[0-3]: initial stability per grade
  7.195, 0.535,                      // W[4-5]: initial difficulty
  1.460,                             // W[6]: difficulty delta
  0.005,                             // W[7]: mean reversion weight
  1.546, 0.119, 1.019,              // W[8-10]: success stability increase
  1.940, 0.110, 0.296, 2.270,       // W[11-14]: failure stability
  0.232, 2.990,                      // W[15-16]: hard penalty / easy bonus
  0.517, 0.662                       // W[17-18]: same-day review
];

// BKT defaults — all remaining exercises are audio/mic-based
const BKT_AUDIO = { pG: 0.05, pS: 0.10, pT: 0.20 };

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function median(arr) {
  return percentile(arr, 50);
}

// --- FSRS core formulas ---

function fsrsRetrievability(elapsed, S) {
  if (S <= 0) return 0;
  return (1 + FACTOR * elapsed / S) ** DECAY;
}

function fsrsInitialStability(grade) {
  return W[clamp(grade - 1, 0, 3)];
}

function fsrsInitialDifficulty(grade) {
  return clamp(W[4] - Math.exp(W[5] * (grade - 1)) + 1, 1, 10);
}

function fsrsSuccessStability(S, D, R, grade) {
  const sInc = Math.exp(W[8]) * (11 - D) * (S ** -W[9]) * (Math.exp(W[10] * (1 - R)) - 1)
    * (grade === 2 ? W[15] : 1)
    * (grade === 4 ? W[16] : 1);
  return S * Math.max(1.01, sInc); // ensure S always increases on success
}

function fsrsFailStability(S, D, R) {
  return Math.max(0.1, W[11] * (D ** -W[12]) * ((S + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R)));
}

function fsrsUpdateDifficulty(D, grade) {
  const d0Easy = clamp(W[4] - Math.exp(W[5] * (4 - 1)) + 1, 1, 10);
  const deltaD = -W[6] * (grade - 3);
  return clamp(W[7] * d0Easy + (1 - W[7]) * (D + deltaD * (10 - D) / 9), 1, 10);
}

function fsrsInterval(S, desiredRetention) {
  return (S / FACTOR) * (desiredRetention ** (1 / DECAY) - 1);
}

function gradeFromResponse(ok, timeMs, medianTime) {
  if (!ok) return 1;
  if (medianTime <= 0 || timeMs == null) return 3;
  if (timeMs < medianTime * 0.6) return 4;
  if (timeMs < medianTime * 1.0) return 3;
  return 2;
}

export class LearningEngine {
  constructor(config, exerciseId) {
    this.config = config;
    this.exerciseId = exerciseId;
    this.items = new Map();
    this.clusters = new Map();
    this.qNum = 0;
    this.params = structuredClone(config.initialParams);
    this.totalAttempts = 0;
    this.allCorrectTimes = [];
    this.recentKeys = [];
    this.lastItem = null;
    this.bkt = config.bktParams || BKT_AUDIO;

    // Session fatigue tracking
    this.sessionWindow = [];
    this.fatigued = false;
    this.preFatigueAccuracy = null;

    if (exerciseId) this._load();
  }

  next() {
    this.qNum++;

    // Cold start: pure random for first COLD_START questions
    if (this.qNum <= COLD_START) {
      const item = this.config.genRandom(this.params, this.lastItem, this);
      this._ensureItem(item);
      this._trackRecent(item);
      this.lastItem = item;
      return item;
    }

    // Collect candidates: all known items + 3 new random ones
    const candidates = [];

    // Known items
    for (const [key, rec] of this.items) {
      const item = this.config.itemFromKey(key, this.params);
      candidates.push({ item, rec, isNew: false });
    }

    // New candidates — mix in frontier items based on recent mastery
    const fp = this._frontierProb();
    const frontierParams = fp > 0 ? this.config.adjustParams(this.params, 1, 0.5) : null;
    for (let i = 0; i < 3; i++) {
      const useFrontier = frontierParams && Math.random() < fp;
      const p = useFrontier ? frontierParams : this.params;
      const item = this.config.genRandom(p, this.lastItem, this);
      const key = this.config.itemKey(item);
      if (!this.items.has(key)) {
        candidates.push({ item, rec: null, isNew: true });
      }
    }

    if (candidates.length === 0) {
      const item = this.config.genRandom(this.params, this.lastItem, this);
      this._ensureItem(item);
      this._trackRecent(item);
      this.lastItem = item;
      return item;
    }

    // Score candidates with UCB1 + FSRS + confusion + fatigue signals
    let bestScore = -Infinity;
    let bestCandidate = candidates[0];

    for (const c of candidates) {
      const score = this._scoreCandidate(c);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = c;
      }
    }

    const item = bestCandidate.item;
    this._ensureItem(item);
    this._trackRecent(item);
    this.lastItem = item;
    return item;
  }

  report(item, ok, timeMs, meta = {}) {
    const rec = this._ensureItem(item);
    rec.attempts++;
    this.totalAttempts++;

    if (ok) rec.correct++;

    // Update history
    rec.hist.push(ok);
    if (rec.hist.length > MAX_HIST) rec.hist.shift();

    // Streak
    if (ok) {
      rec.streak++;
    } else {
      rec.streak = 0;
    }

    // Response time tracking
    if (timeMs != null && timeMs > 0) {
      rec.times.push(timeMs);
      if (rec.times.length > MAX_TIMES) rec.times.shift();
      rec.avgTime = rec.times.reduce((s, t) => s + t, 0) / rec.times.length;

      if (ok) {
        this.allCorrectTimes.push(timeMs);
        if (this.allCorrectTimes.length > MAX_CORRECT_TIMES) {
          this.allCorrectTimes.shift();
        }
      }
    }

    rec.lastSeen = this.qNum;
    rec.lastSeenTs = Date.now();

    // Confusion tracking
    if (!ok && meta.detected) {
      rec.confusions.push({ detected: meta.detected, ts: Date.now() });
      if (rec.confusions.length > MAX_CONFUSIONS) rec.confusions.shift();
    }

    // FSRS grade
    const med = median(this.allCorrectTimes);
    const grade = gradeFromResponse(ok, timeMs, med);

    // FSRS update
    this._updateFSRS(rec, grade);

    // BKT update (with response-time modulation)
    this._updateBKT(rec, ok, timeMs, med);

    // Update cluster stats
    for (const cid of rec.cls) {
      const cl = this._ensureCluster(cid);
      if (ok) cl.correct++;
      cl.total++;
    }

    // Session fatigue tracking
    this.sessionWindow.push({ ok, timeMs: timeMs || 0, qNum: this.qNum });
    if (this.sessionWindow.length > SESSION_WINDOW) this.sessionWindow.shift();
    this._checkFatigue();

    // Difficulty adjustment every ADJ_EVERY questions
    if (this.qNum > 0 && this.qNum % ADJ_EVERY === 0) {
      this._adjustDifficulty();
    }

    // Auto-save
    if (this.exerciseId) this._save();
  }

  getParams() {
    return { ...this.params };
  }

  getMastery() {
    const now = Date.now();
    const itemList = [];

    for (const [key, rec] of this.items) {
      const elapsed = rec.lastReviewTs > 0 ? (now - rec.lastReviewTs) / MS_PER_DAY : 0;
      const R = rec.S > 0 && rec.lastReviewTs > 0 ? fsrsRetrievability(elapsed, rec.S) : 0;
      const topConfusion = this._topConfusion(rec);
      itemList.push({
        key,
        pL: rec.pL,
        S: rec.S,
        D: rec.D,
        R,
        avgTime: rec.avgTime,
        mastered: this._isMastered(rec),
        attempts: rec.attempts,
        correct: rec.correct,
        streak: rec.streak,
        topConfusion,
      });
    }

    // Cluster stats
    const clusterList = [];
    for (const [id, cl] of this.clusters) {
      const clItems = itemList.filter(i => {
        const rec = this.items.get(i.key);
        return rec && rec.cls.includes(id);
      });
      const avgPL = clItems.length > 0 ? clItems.reduce((s, i) => s + i.pL, 0) / clItems.length : 0;
      const masteredCount = clItems.filter(i => i.mastered).length;
      clusterList.push({
        id,
        avgPL,
        total: cl.total,
        correct: cl.correct,
        masteredPct: clItems.length > 0 ? masteredCount / clItems.length : 0,
      });
    }

    // Overall stats
    const totalItems = itemList.length;
    const masteredCount = itemList.filter(i => i.mastered).length;
    const avgPL = totalItems > 0 ? itemList.reduce((s, i) => s + i.pL, 0) / totalItems : 0;
    const recentTimes = this.allCorrectTimes.slice(-20);
    const avgResponseTime = recentTimes.length > 0 ? recentTimes.reduce((s, t) => s + t, 0) / recentTimes.length : 0;
    const totalCorrect = itemList.reduce((s, i) => s + i.correct, 0);
    const totalAtt = itemList.reduce((s, i) => s + i.attempts, 0);

    return {
      items: itemList,
      clusters: clusterList,
      fatigued: this.fatigued,
      overall: {
        avgPL,
        totalItems,
        masteredCount,
        pctMastered: totalItems > 0 ? masteredCount / totalItems : 0,
        avgResponseTime,
        sessionQuestions: this.qNum,
        sessionAccuracy: totalAtt > 0 ? totalCorrect / totalAtt : 0,
      },
    };
  }

  getConfusions(itemKey) {
    const rec = this.items.get(itemKey);
    if (!rec || rec.confusions.length === 0) return {};
    const freq = {};
    for (const c of rec.confusions) {
      freq[c.detected] = (freq[c.detected] || 0) + 1;
    }
    return freq;
  }

  reset() {
    if (this.exerciseId) {
      try { localStorage.removeItem(STORE_PREFIX + this.exerciseId); } catch (e) { /* noop */ }
    }
    this.items = new Map();
    this.clusters = new Map();
    this.qNum = 0;
    this.params = structuredClone(this.config.initialParams);
    this.totalAttempts = 0;
    this.allCorrectTimes = [];
    this.recentKeys = [];
    this.lastItem = null;
    this.sessionWindow = [];
    this.fatigued = false;
    this.preFatigueAccuracy = null;
  }

  save() {
    if (this.exerciseId) this._save();
  }

  // --- FSRS ---

  _updateFSRS(rec, grade) {
    const now = Date.now();

    if (rec.S === 0) {
      // First review
      rec.S = fsrsInitialStability(grade);
      rec.D = fsrsInitialDifficulty(grade);
    } else {
      const elapsed = rec.lastReviewTs > 0 ? (now - rec.lastReviewTs) / MS_PER_DAY : 0;
      const R = fsrsRetrievability(elapsed, rec.S);

      if (grade >= 2) {
        rec.S = fsrsSuccessStability(rec.S, rec.D, R, grade);
      } else {
        rec.S = fsrsFailStability(rec.S, rec.D, R);
      }
      rec.D = fsrsUpdateDifficulty(rec.D, grade);
    }

    rec.lastReviewTs = now;
    rec.due = now + fsrsInterval(rec.S, 0.9) * MS_PER_DAY;
  }

  // --- BKT (response-time-aware) ---

  _updateBKT(rec, ok, timeMs, medianTime) {
    const { pG, pS, pT } = this.bkt;
    let posterior;
    if (ok) {
      const denom = rec.pL * (1 - pS) + (1 - rec.pL) * pG;
      posterior = denom > 0 ? (rec.pL * (1 - pS)) / denom : rec.pL;
    } else {
      const denom = rec.pL * pS + (1 - rec.pL) * (1 - pG);
      posterior = denom > 0 ? (rec.pL * pS) / denom : rec.pL;
    }

    // Fluency modulation: fast correct → higher pT, slow correct → lower pT
    let effectivePT = pT;
    if (ok && timeMs != null && medianTime > 0) {
      const speedRatio = timeMs / medianTime;
      const fluencyMod = clamp(1.5 - speedRatio, 0.5, 1.5);
      effectivePT = pT * fluencyMod;
    }

    rec.pL = posterior + (1 - posterior) * effectivePT;
  }

  // --- Item selection ---

  _scoreCandidate(c) {
    const { rec, isNew } = c;

    if (isNew) {
      return 1.0 + 0.2; // exploitation(1) + new_bonus(0.2)
    }

    const pL = rec.pL;
    const mastered = this._isMastered(rec);
    const exploitation = 1 - pL;
    const exploration = C * Math.sqrt(Math.log(this.totalAttempts + 1) / Math.max(1, rec.attempts));

    // FSRS retrievability-based review urgency (replaces old due bonus)
    let reviewUrgency = 0;
    if (rec.S > 0 && rec.lastReviewTs > 0) {
      const elapsed = (Date.now() - rec.lastReviewTs) / MS_PER_DAY;
      const R = fsrsRetrievability(elapsed, rec.S);
      reviewUrgency = mastered ? (1 - R) * 0.3 : (1 - R) * 0.5;
    }

    // Confusion pair boost: if this item is frequently confused with a recently-asked item
    let confusionBoost = 0;
    if (rec.confusions.length > 0 && this.recentKeys.length > 0) {
      const freq = {};
      for (const cf of rec.confusions) freq[cf.detected] = (freq[cf.detected] || 0) + 1;
      for (const rk of this.recentKeys.slice(-3)) {
        const rrec = this.items.get(rk);
        if (rrec) {
          // Check if the recently-asked item's key matches a confused detection
          if (freq[rk] && freq[rk] >= 2) {
            confusionBoost = 0.3;
            break;
          }
        }
      }
    }

    // Learning zone bonus (increased)
    const desirable = (pL >= 0.3 && pL <= 0.7) ? 0.25 : 0;

    // Interleave penalty
    let interleave = 0;
    if (this.recentKeys.length > 0) {
      const lastTwo = this.recentKeys.slice(-2);
      for (const rk of lastTwo) {
        const rrec = this.items.get(rk);
        if (rrec) {
          const shared = rec.cls.some(cid => rrec.cls.includes(cid));
          if (shared) { interleave = -0.3; break; }
        }
      }
    }

    // Fatigue bias: prefer easier items when fatigued
    const fatigueBias = this.fatigued ? (pL * 0.3) : 0;

    // Fluency penalty: correct but slow items need more practice
    let fluencyPenalty = 0;
    const med = median(this.allCorrectTimes);
    if (rec.pL > 0.7 && med > 0 && rec.avgTime > med * 1.3) {
      fluencyPenalty = 0.2;
    }

    return exploitation + exploration + reviewUrgency + confusionBoost
      + desirable + interleave + fatigueBias + fluencyPenalty;
  }

  _isMastered(rec) {
    return rec.pL >= 0.90 && rec.S >= 1 && rec.attempts >= 3;
  }

  // --- Session fatigue detection ---

  _checkFatigue() {
    if (this.sessionWindow.length < SESSION_WINDOW) return;

    const half = SESSION_WINDOW / 2;
    const older = this.sessionWindow.slice(0, half);
    const newer = this.sessionWindow.slice(half);

    const accOlder = older.filter(r => r.ok).length / older.length;
    const accNewer = newer.filter(r => r.ok).length / newer.length;

    const timesOlder = older.filter(r => r.timeMs > 0).map(r => r.timeMs);
    const timesNewer = newer.filter(r => r.timeMs > 0).map(r => r.timeMs);
    const avgTimeOlder = timesOlder.length > 0 ? timesOlder.reduce((s, t) => s + t, 0) / timesOlder.length : 0;
    const avgTimeNewer = timesNewer.length > 0 ? timesNewer.reduce((s, t) => s + t, 0) / timesNewer.length : 0;

    if (!this.fatigued) {
      // Detect fatigue: accuracy dropped >20% OR response time increased >40%
      const accDrop = accOlder > 0 ? (accOlder - accNewer) / accOlder : 0;
      const timeIncrease = avgTimeOlder > 0 ? (avgTimeNewer - avgTimeOlder) / avgTimeOlder : 0;

      if (accDrop > 0.20 || timeIncrease > 0.40) {
        this.fatigued = true;
        this.preFatigueAccuracy = accOlder;
        this._adjustDifficulty(-1);
      }
    } else {
      // Recovery: accuracy returns to within 10% of pre-fatigue baseline
      if (this.preFatigueAccuracy != null && accNewer >= this.preFatigueAccuracy * 0.90) {
        this.fatigued = false;
        this.preFatigueAccuracy = null;
      }
    }
  }

  // --- Confusion helpers ---

  _topConfusion(rec) {
    if (!rec.confusions || rec.confusions.length === 0) return null;
    const freq = {};
    for (const c of rec.confusions) freq[c.detected] = (freq[c.detected] || 0) + 1;
    let top = null, topN = 0;
    for (const [k, n] of Object.entries(freq)) {
      if (n > topN) { top = k; topN = n; }
    }
    return top;
  }

  // --- Difficulty adjustment ---

  _adjustDifficulty(forceDir) {
    const seen = [...this.items.values()].filter(r => r.attempts > 0);
    if (seen.length === 0) return;

    const recentWindow = ADJ_EVERY * 2;
    const recent = seen.filter(r => this.qNum - r.lastSeen <= recentWindow);
    const basis = recent.length >= 5 ? recent : seen;
    const avgPL = basis.reduce((s, r) => s + r.pL, 0) / basis.length;

    let dir;
    if (forceDir != null) {
      dir = forceDir;
    } else if (avgPL > 0.80) {
      dir = 1;
    } else if (avgPL < 0.50) {
      dir = -1;
    } else {
      return;
    }

    const midpoint = 0.65;
    const mag = 1 / (1 + Math.exp(-8 * (Math.abs(avgPL - midpoint) - 0.1)));
    this.params = this.config.adjustParams(this.params, dir, mag);
  }

  _frontierProb() {
    const recent = [...this.items.values()]
      .filter(r => r.attempts > 0 && this.qNum - r.lastSeen <= ADJ_EVERY * 2);
    if (recent.length < 3) return 0;
    const avgPL = recent.reduce((s, r) => s + r.pL, 0) / recent.length;
    if (avgPL < 0.6) return 0;
    return Math.min(0.3, (avgPL - 0.6) / 0.3 * 0.3);
  }

  // --- Item/cluster management ---

  _ensureItem(item) {
    const key = this.config.itemKey(item);
    if (!this.items.has(key)) {
      const cls = this.config.itemClusters(item);
      const rec = {
        key,
        S: 0,              // FSRS stability
        D: 5.0,            // FSRS difficulty
        lastReviewTs: 0,   // FSRS last review timestamp
        due: 0,            // FSRS due timestamp
        pL: 0.0,           // BKT learned probability
        attempts: 0,
        correct: 0,
        times: [],
        avgTime: 0,
        lastSeen: 0,
        lastSeenTs: 0,
        hist: [],
        streak: 0,
        cls,
        confusions: [],    // last N wrong detections
      };
      this.items.set(key, rec);
      for (const cid of cls) {
        this._ensureCluster(cid);
      }
    }
    return this.items.get(key);
  }

  _ensureCluster(id) {
    if (!this.clusters.has(id)) {
      this.clusters.set(id, { id, correct: 0, total: 0 });
    }
    return this.clusters.get(id);
  }

  _trackRecent(item) {
    const key = this.config.itemKey(item);
    this.recentKeys.push(key);
    if (this.recentKeys.length > 5) this.recentKeys.shift();
  }

  _medianTime() {
    return median(this.allCorrectTimes);
  }

  // --- Persistence ---

  _save() {
    try {
      const itemsObj = {};
      for (const [key, rec] of this.items) {
        itemsObj[key] = {
          S: rec.S, D: rec.D, lastReviewTs: rec.lastReviewTs, due: rec.due,
          pL: rec.pL, attempts: rec.attempts, correct: rec.correct,
          times: rec.times, avgTime: rec.avgTime,
          lastSeen: rec.lastSeen, lastSeenTs: rec.lastSeenTs,
          hist: rec.hist, streak: rec.streak, cls: rec.cls,
          confusions: rec.confusions,
        };
      }
      const clustersObj = {};
      for (const [id, cl] of this.clusters) {
        clustersObj[id] = { correct: cl.correct, total: cl.total };
      }
      const data = {
        v: VERSION,
        ts: Date.now(),
        qNum: this.qNum,
        totalAttempts: this.totalAttempts,
        allCorrectTimes: this.allCorrectTimes,
        items: itemsObj,
        clusters: clustersObj,
        recentKeys: this.recentKeys,
      };
      localStorage.setItem(STORE_PREFIX + this.exerciseId, JSON.stringify(data));
    } catch (e) {
      // localStorage may be full or unavailable
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + this.exerciseId);
      if (!raw) return;
      const data = JSON.parse(raw);

      // Migration from v1 (SM-2) → v2 (FSRS)
      if (data.v === 1) {
        this._migrateV1(data);
        return;
      }

      if (data.v !== VERSION) return;

      this.qNum = data.qNum || 0;
      this.totalAttempts = data.totalAttempts || 0;
      this.allCorrectTimes = data.allCorrectTimes || [];
      this.recentKeys = data.recentKeys || [];

      // Restore items
      if (data.items) {
        for (const [key, r] of Object.entries(data.items)) {
          this.items.set(key, {
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
            cls: r.cls ?? [],
            confusions: r.confusions ?? [],
          });
        }
      }

      // Restore clusters
      if (data.clusters) {
        for (const [id, cl] of Object.entries(data.clusters)) {
          this.clusters.set(id, { id, correct: cl.correct || 0, total: cl.total || 0 });
        }
      }
    } catch (e) {
      // Corrupt data — start fresh
      this.items = new Map();
      this.clusters = new Map();
    }
  }

  _migrateV1(data) {
    this.qNum = data.qNum || 0;
    this.totalAttempts = data.totalAttempts || 0;
    this.allCorrectTimes = data.allCorrectTimes || [];
    this.recentKeys = data.recentKeys || [];

    if (data.items) {
      for (const [key, r] of Object.entries(data.items)) {
        this.items.set(key, {
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
          cls: r.cls ?? [],
          confusions: [],
        });
      }
    }

    if (data.clusters) {
      for (const [id, cl] of Object.entries(data.clusters)) {
        this.clusters.set(id, { id, correct: cl.correct || 0, total: cl.total || 0 });
      }
    }

    // Save in new format immediately
    if (this.exerciseId) this._save();
  }
}
