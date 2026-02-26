import { noteFindConfig } from './noteFind.js';

import { intervalTrainerConfig } from './intervalTrainer.js';

import { chordPlayerConfig } from './chordPlayer.js';
import { scaleRunnerConfig } from './scaleRunner.js';
import { modeTrainerConfig } from './modeTrainer.js';
import { chordTransitionConfig } from './chordTransition.js';
import { DEFAULTS } from '../defaults.js';

export const TYPES = [
  { id: 'nf', config: noteFindConfig,            name: 'Note Find' },

  { id: 'iv', config: intervalTrainerConfig,     name: 'Interval' },

  { id: 'cp', config: chordPlayerConfig,         name: 'Chord Player' },
  { id: 'sr', config: scaleRunnerConfig,         name: 'Scale Runner' },
  { id: 'mt', config: modeTrainerConfig,         name: 'Mode Trainer' },
  { id: 'cx', config: chordTransitionConfig,     name: 'Chord Transition' },
];

// Global difficulty ranges per type — overlapping for smooth transitions
const TYPE_DIFFICULTY = {
  nf: { base: 0.00, span: 0.40 },

  iv: { base: 0.20, span: 0.35 },

  cp: { base: 0.35, span: 0.35 },
  sr: { base: 0.50, span: 0.35 },
  mt: { base: 0.60, span: 0.40 },
  cx: { base: 0.40, span: 0.40 },
};

// --- Helpers ---

function computeTypeWeights(engine) {
  const theta = engine?.theta ?? 0.05;
  const mastery = engine?.getMastery?.();
  const weights = {};
  const u = engine?.params?.unified ?? DEFAULTS.unified;
  const window = u.thetaWindow;
  const lo = theta - window;
  const hi = theta + window;

  for (const t of TYPES) {
    const td = TYPE_DIFFICULTY[t.id];
    const typeHi = td.base + td.span;

    // Hard gate: type is completely blocked if theta is too far below its base
    if (theta < td.base - 0.15) {
      weights[t.id] = 0;
      continue;
    }

    // Overlap between [lo, hi] and [td.base, typeHi]
    const overlap = Math.max(0, Math.min(hi, typeHi) - Math.max(lo, td.base));
    let w = overlap / (2 * window);

    // Weakness boost: types where student is weak get extra weight
    if (mastery) {
      const typeItems = mastery.items.filter(i => i.key.startsWith(t.id + ':'));
      if (typeItems.length > 0) {
        const typePL = typeItems.reduce((s, i) => s + i.pL, 0) / typeItems.length;
        w *= (1 - typePL) * u.weaknessBoostScale + 0.5;
      }
    }

    if (w > 0 && w < u.minTypeWeight) w = u.minTypeWeight;

    weights[t.id] = w;
  }
  return weights;
}

function weightedPick(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  if (entries.length === 0) return TYPES[0].id;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of entries) {
    r -= w;
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

function typeById(id) {
  return TYPES.find(t => t.id === id);
}

// --- Unified config ---

export const unifiedConfig = {
  _isUnified: true,

  itemDifficulty(item) {
    const t = typeById(item._type);
    const td = TYPE_DIFFICULTY[item._type];
    const internalDiff = t.config.itemDifficulty(item._inner);
    let d = td.base + internalDiff * td.span;
    if (item._recall) d = Math.min(1, d + DEFAULTS.unified.recallDifficultyBoost);
    return d;
  },

  itemKey(item) {
    const t = typeById(item._type);
    const base = item._type + ':' + t.config.itemKey(item._inner);
    return item._recall ? base + '|R' : base;
  },

  itemClusters(item) {
    const t = typeById(item._type);
    const local = ['type_' + item._type, ...t.config.itemClusters(item._inner)];
    const global = t.config.globalClusters?.(item._inner) || [];
    const cls = [...local, ...global];
    if (item._recall) cls.push('recall');
    return cls;
  },

  itemFromKey(key) {
    const isRecall = key.endsWith('|R');
    const cleanKey = isRecall ? key.slice(0, -2) : key;
    const colonIdx = cleanKey.indexOf(':');
    const typeId = cleanKey.slice(0, colonIdx);
    const innerKey = cleanKey.slice(colonIdx + 1);
    const t = typeById(typeId);
    if (!t) return null; // type was removed
    const innerItem = t.config.itemFromKey(innerKey);
    const item = { _type: typeId, _inner: innerItem };
    if (isRecall) item._recall = true;
    return item;
  },

  getTypeIds(engine) {
    const theta = engine?.theta ?? 0.05;
    return TYPES
      .filter(t => theta >= TYPE_DIFFICULTY[t.id].base - 0.15)
      .sort((a, b) => TYPE_DIFFICULTY[a.id].base - TYPE_DIFFICULTY[b.id].base)
      .map(t => t.id);
  },

  genFromType(typeId, lastItem, engine) {
    const t = typeById(typeId);
    if (!t) return this.genRandom(lastItem, engine);
    const innerLast = (lastItem && lastItem._type === typeId) ? lastItem._inner : null;
    const innerItem = t.config.genRandom(innerLast);
    const item = { _type: typeId, _inner: innerItem };
    return this._maybeRecall(item, engine);
  },

  genRandom(lastItem, engine) {
    const weights = computeTypeWeights(engine);
    const typeId = weightedPick(weights);
    const t = typeById(typeId);
    const innerLast = (lastItem && lastItem._type === typeId) ? lastItem._inner : null;
    const innerItem = t.config.genRandom(innerLast);
    const item = { _type: typeId, _inner: innerItem };
    return this._maybeRecall(item, engine);
  },

  _maybeRecall(item, engine) {
    if (!engine || item._recall) return item;
    // Check if recognition version has pL >= threshold
    const recogKey = item._type + ':' + typeById(item._type).config.itemKey(item._inner);
    const rec = engine.items.get(recogKey);
    if (rec && rec.pL >= DEFAULTS.unified.recallPLThreshold && Math.random() < 0.5) {
      return { ...item, _recall: true };
    }
    return item;
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('type_')) {
      const typeId = clusterId.slice(5);
      const t = typeById(typeId);
      if (t) {
        const innerLast = (lastItem && lastItem._type === typeId) ? lastItem._inner : null;
        const innerItem = t.config.genRandom(innerLast);
        return { _type: typeId, _inner: innerItem };
      }
    }

    for (const t of TYPES) {
      try {
        const innerLast = (lastItem && lastItem._type === t.id) ? lastItem._inner : null;
        const innerItem = t.config.genFromCluster(clusterId, innerLast);
        if (innerItem) return { _type: t.id, _inner: innerItem };
      } catch {
        // This config can't handle this cluster, try next
      }
    }

    return this.genRandom(lastItem, null);
  },

  microDrill(failedItem) {
    const t = typeById(failedItem._type);
    const innerDrills = t.config.microDrill(failedItem._inner);
    return innerDrills.map(d => ({ _type: failedItem._type, _inner: d }));
  },

  pickScaffold(item, weakCluster) {
    const t = typeById(item._type);
    const innerScaffolds = t.config.pickScaffold(item._inner, weakCluster);
    return innerScaffolds.map(s => ({ _type: item._type, _inner: s }));
  }
};
