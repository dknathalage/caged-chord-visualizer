let COLD_START = 7;
const C = 1.2; // UCB1 exploration constant
const MS_PER_DAY = 86400000;
const MAX_TIMES = 10;
const MAX_HIST = 5;
const MAX_CORRECT_TIMES = 200;
const MAX_CONFUSIONS = 10;
const SESSION_WINDOW = 20;
const STORE_PREFIX = 'gl_learn_';
const VERSION = 3;

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
    this.theta = 0.05; // student ability (0-1), starts just above easiest items
    this.totalAttempts = 0;
    this.allCorrectTimes = [];
    this.recentKeys = [];
    this.lastItem = null;
    this.bkt = config.bktParams || BKT_AUDIO;

    // Session fatigue tracking
    this.sessionWindow = [];
    this.fatigued = false;
    this.preFatigueAccuracy = null;

    // Phase 1: transient queues (not persisted)
    this.microDrillQueue = [];
    this.confusionDrillQueue = [];
    this.overdueQueue = null; // null = not built yet
    this.coldStartTypes = null;

    // Phase 2: plateau detection
    this.thetaHistory = [];
    this.plateauDetected = false;

    if (exerciseId) this._load();
  }

  next() {
    this.qNum++;

    // Cold start: round-robin types sorted by difficulty, then random
    const typeIds = this.config.getTypeIds ? this.config.getTypeIds(this) : [];
    const typeCount = typeIds.length;
    const dynamicColdStart = Math.max(COLD_START, typeCount);
    if (this.qNum <= dynamicColdStart) {
      let item;
      // Round-robin through types in difficulty order (no shuffle)
      if (typeCount > 0 && this.qNum <= typeCount) {
        if (!this.coldStartTypes) {
          this.coldStartTypes = [...typeIds];
        }
        const typeId = this.coldStartTypes[this.qNum - 1];
        item = this.config.genFromType(typeId, this.lastItem, this);
      } else {
        item = this.config.genRandom(this.lastItem, this);
      }
      this._ensureItem(item);
      this._trackRecent(item);
      this.lastItem = item;
      return item;
    }

    // 1c. Overdue queue (FSRS due-date session planning)
    if (this.overdueQueue === null) {
      this._buildOverdueQueue();
    }
    if (this.overdueQueue.length > 0) {
      const item = this.overdueQueue.shift();
      this._ensureItem(item);
      this._trackRecent(item);
      this.lastItem = item;
      return item;
    }

    // 1a. Micro-drill queue
    if (this.microDrillQueue.length > 0) {
      const item = this.microDrillQueue.shift();
      this._ensureItem(item);
      this._trackRecent(item);
      this.lastItem = item;
      return item;
    }
    if (this._shouldMicroDrill()) {
      const drills = this.config.microDrill ? this.config.microDrill(this.lastItem) : null;
      if (drills && drills.length > 0) {
        this.microDrillQueue = drills.slice(1);
        const item = drills[0];
        this._ensureItem(item);
        this._trackRecent(item);
        this.lastItem = item;
        return item;
      }
    }

    // 1b. Confusion drill queue
    if (this.confusionDrillQueue.length > 0) {
      const item = this.confusionDrillQueue.shift();
      this._ensureItem(item);
      this._trackRecent(item);
      this.lastItem = item;
      return item;
    }
    this._buildConfusionDrill();
    if (this.confusionDrillQueue.length > 0) {
      const item = this.confusionDrillQueue.shift();
      this._ensureItem(item);
      this._trackRecent(item);
      this.lastItem = item;
      return item;
    }

    // Collect candidates: all known items + 10 new random ones
    const candidates = [];

    // Known items
    for (const [key, rec] of this.items) {
      const item = this.config.itemFromKey(key);
      candidates.push({ item, rec, isNew: false });
    }

    // New candidates
    for (let i = 0; i < 10; i++) {
      const item = this.config.genRandom(this.lastItem, this);
      const key = this.config.itemKey(item);
      if (!this.items.has(key)) {
        candidates.push({ item, rec: null, isNew: true });
      }
    }

    if (candidates.length === 0) {
      const item = this.config.genRandom(this.lastItem, this);
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

    // 1e. BKT/FSRS reconciliation
    this._reconcileBKTFSRS(rec);

    // Update cluster stats
    for (const cid of rec.cls) {
      const cl = this._ensureCluster(cid);
      if (ok) cl.correct++;
      cl.total++;
    }

    // Update theta (student ability)
    const itemDifficulty = this.config.itemDifficulty ? this.config.itemDifficulty(item) : 0.5;
    const lr = meta.skipped ? 0.12 : 0.04;
    this._updateTheta(itemDifficulty, ok, lr);

    // 2b. Theta snapshot for plateau detection (every 20 questions)
    if (this.totalAttempts % 20 === 0) {
      this.thetaHistory.push({ ts: Date.now(), theta: this.theta });
      if (this.thetaHistory.length > 50) this.thetaHistory.shift();
    }
    this._checkPlateau();

    // Session fatigue tracking
    this.sessionWindow.push({ ok, timeMs: timeMs || 0, qNum: this.qNum });
    if (this.sessionWindow.length > SESSION_WINDOW) this.sessionWindow.shift();
    this._checkFatigue();

    // Auto-save
    if (this.exerciseId) this._save();
  }

  getMastery() {
    const now = Date.now();
    const itemList = [];

    for (const [key, rec] of this.items) {
      const elapsed = rec.lastReviewTs > 0 ? (now - rec.lastReviewTs) / MS_PER_DAY : 0;
      const R = rec.S > 0 && rec.lastReviewTs > 0 ? fsrsRetrievability(elapsed, rec.S) : 0;
      const topConfusion = this._topConfusion(rec);
      const targetTime = this._targetTime(rec);
      const fluencyRatio = targetTime > 0 && rec.avgTime > 0 ? rec.avgTime / targetTime : 0;
      itemList.push({
        key,
        pL: rec.pL,
        S: rec.S,
        D: rec.D,
        R,
        avgTime: rec.avgTime,
        targetTime,
        fluencyRatio,
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
      coverage: this.getCoverageMatrix(),
      overall: {
        avgPL,
        totalItems,
        masteredCount,
        pctMastered: totalItems > 0 ? masteredCount / totalItems : 0,
        avgResponseTime,
        sessionQuestions: this.qNum,
        sessionAccuracy: totalAtt > 0 ? totalCorrect / totalAtt : 0,
        theta: this.theta,
        plateauDetected: this.plateauDetected,
      },
    };
  }

  getItemStats(itemKey) {
    const rec = this.items.get(itemKey);
    if (!rec) return null;
    const now = Date.now();
    const elapsed = rec.lastReviewTs > 0 ? (now - rec.lastReviewTs) / MS_PER_DAY : 0;
    const R = rec.S > 0 && rec.lastReviewTs > 0 ? fsrsRetrievability(elapsed, rec.S) : 0;
    const targetTime = this._targetTime(rec);
    const fluencyRatio = targetTime > 0 && rec.avgTime > 0 ? rec.avgTime / targetTime : 0;
    return {
      key: rec.key, pL: rec.pL, S: rec.S, D: rec.D, R, fluencyRatio,
      attempts: rec.attempts, correct: rec.correct, streak: rec.streak,
      topConfusion: this._topConfusion(rec), avgTime: rec.avgTime,
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
    this.theta = 0.05;
    this.totalAttempts = 0;
    this.allCorrectTimes = [];
    this.recentKeys = [];
    this.lastItem = null;
    this.sessionWindow = [];
    this.fatigued = false;
    this.preFatigueAccuracy = null;
    // Phase 1 transient state
    this.microDrillQueue = [];
    this.confusionDrillQueue = [];
    this.overdueQueue = null;
    this.coldStartTypes = null;
    // Phase 2
    this.thetaHistory = [];
    this.plateauDetected = false;
  }

  save() {
    if (this.exerciseId) this._save();
  }

  // --- Theta (student ability) update ---

  _updateTheta(difficulty, ok, lr = 0.04) {
    const alpha = 10;
    const expected = 1 / (1 + Math.exp(-alpha * (this.theta - difficulty)));
    if (ok) {
      this.theta += lr * (1 - expected);
    } else {
      this.theta -= lr * expected;
    }
    this.theta = clamp(this.theta, 0, 1);
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
    const { rec, isNew, item } = c;

    // Get item difficulty from config
    const difficulty = this.config.itemDifficulty ? this.config.itemDifficulty(item) : 0.5;

    // 2a. Adaptive sigma/offset based on session accuracy
    const sigma = this._adaptiveSigma();
    const offset = this._adaptiveOffset();

    if (isNew) {
      // Gaussian centered slightly above θ (zone of proximal development)
      const mu = this.theta + offset;
      const score = Math.exp(-((difficulty - mu) ** 2) / (2 * sigma ** 2));
      return score;
    }

    const pL = rec.pL;
    const mastered = this._isMastered(rec);
    const exploitation = 1 - pL;

    // 2b. Plateau: boost exploration when plateau detected
    const explorationC = this.plateauDetected ? C * 1.5 : C;
    const exploration = explorationC * Math.sqrt(Math.log(this.totalAttempts + 1) / Math.max(1, rec.attempts));

    // FSRS retrievability-based review urgency
    let reviewUrgency = 0;
    if (rec.S > 0 && rec.lastReviewTs > 0) {
      const elapsed = (Date.now() - rec.lastReviewTs) / MS_PER_DAY;
      const R = fsrsRetrievability(elapsed, rec.S);
      reviewUrgency = mastered ? (1 - R) * 0.3 : (1 - R) * 0.5;
    }

    // Confusion pair boost
    let confusionBoost = 0;
    if (rec.confusions.length > 0 && this.recentKeys.length > 0) {
      const freq = {};
      for (const cf of rec.confusions) freq[cf.detected] = (freq[cf.detected] || 0) + 1;
      for (const rk of this.recentKeys.slice(-3)) {
        const rrec = this.items.get(rk);
        if (rrec) {
          if (freq[rk] && freq[rk] >= 2) {
            confusionBoost = 0.3;
            break;
          }
        }
      }
    }

    // Difficulty match bonus — also uses adaptive sigma, with plateau widening
    const matchSigma = this.plateauDetected ? sigma * 1.5 : sigma;
    const difficultyMatch = Math.exp(-((difficulty - this.theta) ** 2) / (2 * matchSigma ** 2)) * 0.3;

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

    // Fatigue bias
    const fatigueBias = this.fatigued ? (pL * 0.3) : 0;

    // 2c. Improved fluency penalty using target time
    let fluencyPenalty = 0;
    const targetTime = this._targetTime(rec);
    if (rec.pL > 0.5 && targetTime > 0 && rec.avgTime > 0) {
      const ratio = rec.avgTime / targetTime;
      if (ratio > 1.3) {
        fluencyPenalty = Math.min(0.4, (ratio - 1.3) * 0.4);
      }
    }

    // 3b. Coverage bonus
    let coverageBonus = 0;
    if (rec.cls) {
      const strCl = rec.cls.find(c => c.startsWith('str_'));
      const zoneCl = rec.cls.find(c => c.startsWith('zone_'));
      if (strCl && zoneCl) {
        const cell = this._getCoverageCell(strCl, zoneCl);
        if (cell.count < 3) coverageBonus = 0.2;
        else if (cell.avgPL < 0.3) coverageBonus = 0.15;
      }
    }

    return exploitation + exploration + reviewUrgency + confusionBoost
      + difficultyMatch + interleave + fatigueBias + fluencyPenalty + coverageBonus;
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

  // --- Phase 1 helpers ---

  _shouldMicroDrill() {
    if (!this.lastItem) return false;
    const key = this.config.itemKey(this.lastItem);
    const rec = this.items.get(key);
    if (!rec || rec.hist.length < 3) return false;
    const recent = rec.hist.slice(-5);
    const failures = recent.filter(h => !h).length;
    return failures >= 3;
  }

  _buildOverdueQueue() {
    const now = Date.now();
    const overdue = [];
    for (const [key, rec] of this.items) {
      if (rec.due > 0 && rec.due < now) {
        const item = this.config.itemFromKey(key);
        overdue.push({ item, overdueness: now - rec.due });
      }
    }
    overdue.sort((a, b) => b.overdueness - a.overdueness);
    this.overdueQueue = overdue.slice(0, 10).map(o => o.item);
  }

  _buildConfusionDrill() {
    if (!this.lastItem) return;
    const key = this.config.itemKey(this.lastItem);
    const rec = this.items.get(key);
    if (!rec || rec.confusions.length === 0) return;

    // Cooldown: 10-question gap
    if (rec._lastConfDrill && (this.qNum - rec._lastConfDrill) < 10) return;

    // Last answer must be wrong
    if (rec.hist.length === 0 || rec.hist[rec.hist.length - 1]) return;

    // Find confused values with ≥2 occurrences
    const freq = {};
    for (const cf of rec.confusions) freq[cf.detected] = (freq[cf.detected] || 0) + 1;
    let confusedValue = null;
    for (const [val, count] of Object.entries(freq)) {
      if (count >= 2) { confusedValue = val; break; }
    }
    if (!confusedValue) return;

    // Build alternation: [original, confused, original, confused]
    const original = this.lastItem;
    const confused = this._itemForConfusedValue(confusedValue, original);
    if (!confused) return;

    rec._lastConfDrill = this.qNum;
    this.confusionDrillQueue = [original, confused, original, confused];
  }

  _itemForConfusedValue(confusedValue, originalItem) {
    if (this.config.genFromCluster) {
      try {
        return this.config.genFromCluster('note_' + confusedValue, originalItem);
      } catch { /* fallthrough */ }
    }
    return null;
  }

  // --- Phase 1e: BKT/FSRS reconciliation ---

  _reconcileBKTFSRS(rec) {
    if (rec.S <= 0) return;
    const now = Date.now();
    const elapsed = rec.lastReviewTs > 0 ? (now - rec.lastReviewTs) / MS_PER_DAY : 0;
    const R = fsrsRetrievability(elapsed, rec.S);

    // High pL + low R: BKT thinks learned, FSRS thinks forgotten
    if (rec.pL > 0.8 && R < 0.5 && rec.S > 0) {
      rec.pL = rec.pL * 0.8 + R * 0.2;
    }
    // Low pL + high S + high R: FSRS stable, BKT disagrees
    else if (rec.pL < 0.4 && rec.S > 5 && R > 0.85) {
      rec.pL = rec.pL * 0.7 + R * 0.3;
    }
    // High pL + very low S + few attempts: lucky streak
    else if (rec.pL > 0.8 && rec.S < 0.5 && rec.attempts < 5) {
      rec.pL = Math.min(rec.pL, 0.7);
    }
  }

  // --- Phase 2 helpers ---

  _adaptiveSigma() {
    if (this.totalAttempts < 10) return 0.12;
    const recent = this.sessionWindow.slice(-20);
    if (recent.length < 10) return 0.12;
    const acc = recent.filter(r => r.ok).length / recent.length;
    if (acc > 0.90) return 0.15 + (acc - 0.90) * 1.0; // 0.15-0.25
    if (acc < 0.80) return 0.06 + acc * 0.05; // 0.06-0.10
    return 0.12;
  }

  _adaptiveOffset() {
    if (this.totalAttempts < 10) return 0.02;
    const recent = this.sessionWindow.slice(-20);
    if (recent.length < 10) return 0.02;
    const acc = recent.filter(r => r.ok).length / recent.length;
    if (acc > 0.90) return 0.05;
    if (acc < 0.80) return -0.02;
    return 0.02;
  }

  _checkPlateau() {
    if (this.thetaHistory.length < 5) {
      this.plateauDetected = false;
      return;
    }
    const recent = this.thetaHistory.slice(-5);
    const thetas = recent.map(h => h.theta);
    const range = Math.max(...thetas) - Math.min(...thetas);
    this.plateauDetected = range < 0.03;
  }

  _targetTime(rec) {
    if (this.allCorrectTimes.length < 5) return 0;
    const base = percentile(this.allCorrectTimes, 75);
    if (base <= 0) return 0;
    const factor = 1.0 - (rec.pL * 0.4); // mastered items get 60% of base
    return base * factor;
  }

  // --- Phase 3b: Coverage tracking ---

  getCoverageMatrix() {
    // 6 strings × 6 zones
    const zones = ['zone_0', 'zone_3', 'zone_5', 'zone_7', 'zone_9', 'zone_12'];
    const matrix = {};
    for (let s = 0; s < 6; s++) {
      for (const z of zones) {
        const cellKey = `str_${s}:${z}`;
        matrix[cellKey] = { count: 0, totalPL: 0, avgPL: 0 };
      }
    }

    for (const [, rec] of this.items) {
      const strCl = rec.cls.find(c => c.startsWith('str_'));
      const zoneCl = rec.cls.find(c => c.startsWith('zone_'));
      if (strCl && zoneCl) {
        const cellKey = `${strCl}:${zoneCl}`;
        if (matrix[cellKey]) {
          matrix[cellKey].count++;
          matrix[cellKey].totalPL += rec.pL;
          matrix[cellKey].avgPL = matrix[cellKey].totalPL / matrix[cellKey].count;
        }
      }
    }

    return matrix;
  }

  _getCoverageCell(strCluster, zoneCluster) {
    const cellKey = `${strCluster}:${zoneCluster}`;
    let count = 0, totalPL = 0;
    for (const [, rec] of this.items) {
      if (rec.cls.includes(strCluster) && rec.cls.includes(zoneCluster)) {
        count++;
        totalPL += rec.pL;
      }
    }
    return { count, avgPL: count > 0 ? totalPL / count : 0 };
  }

  // --- Item/cluster management ---

  _ensureItem(item) {
    const key = this.config.itemKey(item);
    if (!this.items.has(key)) {
      const cls = this.config.itemClusters(item);

      // 3a. Knowledge transfer: check global clusters for existing stats
      let initialPL = 0.0;
      const globalCls = cls.filter(c => c.startsWith('global_'));
      if (globalCls.length > 0) {
        let totalAcc = 0, count = 0;
        for (const gcid of globalCls) {
          const cl = this.clusters.get(gcid);
          if (cl && cl.total >= 3) {
            totalAcc += cl.correct / cl.total;
            count++;
          }
        }
        if (count > 0) {
          const avgAcc = totalAcc / count;
          initialPL = Math.min(0.3, avgAcc * 0.3);
        }
      }

      const rec = {
        key,
        S: 0,              // FSRS stability
        D: 5.0,            // FSRS difficulty
        lastReviewTs: 0,   // FSRS last review timestamp
        due: 0,            // FSRS due timestamp
        pL: initialPL,     // BKT learned probability (may be boosted by knowledge transfer)
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
        theta: this.theta,
        thetaHistory: this.thetaHistory,
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
      this.theta = data.theta ?? 0.05;
      this.thetaHistory = data.thetaHistory || [];

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
    this.theta = 0.05;

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
