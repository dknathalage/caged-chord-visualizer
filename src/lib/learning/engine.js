const BOX_INTERVALS = [0, 2, 6, 15, 40];
const ROLLING_WINDOW = 20;
const TARGET_LO = 0.70, TARGET_HI = 0.85;
const ADJ_EVERY = 10;
const MICRO_DRILL_COUNT = 2;

export class LearningEngine {
  constructor(config) {
    this.config = config;
    this.items = new Map();
    this.clusters = new Map();
    this.qNum = 0;
    this.params = structuredClone(config.initialParams);
    this.microQ = [];
    this.scaffoldQ = [];
    this.history = [];
    this.lastItem = null;
  }

  next() {
    let item;

    // 1. Micro-drill queue
    if (this.microQ.length > 0) {
      item = this.microQ.shift();
      this._ensureItem(item);
      this.lastItem = item;
      this.qNum++;
      return item;
    }

    // 2. Scaffold queue
    if (this.scaffoldQ.length > 0) {
      item = this.scaffoldQ.shift();
      this._ensureItem(item);
      this.lastItem = item;
      this.qNum++;
      return item;
    }

    // 3. Interleaving decision
    const acc = this.history.length > 0
      ? this.history.reduce((s, v) => s + v, 0) / this.history.length
      : 0.5;
    const newRatio = 0.3 + 0.5 * acc;

    if (Math.random() < newRatio) {
      // 4. New item
      item = this.config.genRandom(this.params, this.lastItem);
      this._ensureItem(item);
    } else {
      // 5. Review item
      item = this._reviewPick();
      if (item === null) {
        item = this.config.genRandom(this.params, this.lastItem);
        this._ensureItem(item);
      }
    }

    // 6. Scaffold injection — 35% chance
    if (Math.random() < 0.35) {
      const weak = this._weakestCluster();
      const scaffolds = this.config.pickScaffold(item, weak, this.params);
      if (scaffolds && scaffolds.length > 0) {
        this.scaffoldQ.push(...scaffolds);
      }
    }

    // 7. Store last item, increment question counter
    this.lastItem = item;
    this.qNum++;

    // 8. Return
    return item;
  }

  report(item, ok) {
    // Rolling history
    this.history.push(ok);
    if (this.history.length > ROLLING_WINDOW) {
      this.history.shift();
    }

    // Get or create item record
    const rec = this._ensureItem(item);

    // Update item history
    rec.hist.push(ok);
    if (rec.hist.length > 5) {
      rec.hist.shift();
    }
    rec.seen++;

    if (ok) {
      rec.streak++;
      this._checkPromotion(rec);
    } else {
      rec.streak = 0;
      this._demote(rec);
      // Micro-drill trigger
      const drills = this.config.microDrill(item, this.params);
      if (drills && drills.length > 0) {
        this.microQ.push(...drills.slice(0, MICRO_DRILL_COUNT));
      }
    }

    // Update cluster stats
    const clusterIds = this.config.itemClusters(item);
    for (const cid of clusterIds) {
      const cl = this._ensureCluster(cid);
      if (ok) cl.correct++;
      cl.total++;
    }

    // Difficulty adjustment every ADJ_EVERY questions
    if (this.qNum > 0 && this.qNum % ADJ_EVERY === 0) {
      this._adjustDifficulty();
    }
  }

  getParams() {
    return { ...this.params };
  }

  _ensureItem(item) {
    const key = this.config.itemKey(item);
    if (!this.items.has(key)) {
      const cls = this.config.itemClusters(item);
      const rec = { key, box: 0, due: 0, hist: [], streak: 0, seen: 0, cls };
      this.items.set(key, rec);
      for (const cid of cls) {
        const cl = this._ensureCluster(cid);
        cl.items.add(key);
      }
    }
    return this.items.get(key);
  }

  _ensureCluster(id) {
    if (!this.clusters.has(id)) {
      this.clusters.set(id, { id, correct: 0, total: 0, items: new Set() });
    }
    return this.clusters.get(id);
  }

  _weakestCluster() {
    let worst = null;
    let worstAcc = Infinity;
    for (const cl of this.clusters.values()) {
      if (cl.total < 2) continue;
      const a = cl.correct / cl.total;
      if (a < worstAcc) {
        worstAcc = a;
        worst = cl.id;
      }
    }
    return worst;
  }

  _reviewPick() {
    const due = [];
    for (const rec of this.items.values()) {
      if (rec.due <= this.qNum) {
        due.push(rec);
      }
    }
    if (due.length === 0) return null;

    due.sort((a, b) => a.box - b.box || a.due - b.due);
    const rec = due[0];
    const item = this.config.itemFromKey(rec.key, this.params);
    this._ensureItem(item);
    return item;
  }

  _checkPromotion(rec) {
    const acc = this.history.length > 0
      ? this.history.reduce((s, v) => s + v, 0) / this.history.length
      : 0.5;

    let needed;
    if (acc < 0.60) needed = 1;
    else if (acc <= 0.75) needed = 2;
    else needed = 3;

    if (rec.streak >= needed) {
      rec.box = Math.min(4, rec.box + 1);
      rec.due = this.qNum + BOX_INTERVALS[rec.box];
    }
  }

  _demote(rec) {
    rec.box = Math.max(0, Math.min(1, rec.box));
    rec.due = this.qNum + BOX_INTERVALS[rec.box];
  }

  _adjustDifficulty() {
    const acc = this.history.length > 0
      ? this.history.reduce((s, v) => s + v, 0) / this.history.length
      : 0.5;

    let dir;
    if (acc > TARGET_HI) dir = 1;
    else if (acc < TARGET_LO) dir = -1;
    else return;

    const midpoint = (TARGET_LO + TARGET_HI) / 2;
    const mag = 1 / (1 + Math.exp(-8 * (Math.abs(acc - midpoint) - 0.1)));
    this.params = this.config.adjustParams(this.params, dir, mag);
  }
}
