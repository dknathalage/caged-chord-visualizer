import { noteFindConfig } from './noteFind.js';
import { stringTraversalConfig } from './stringTraversal.js';
import { intervalTrainerConfig } from './intervalTrainer.js';
import { chordToneConfig } from './chordTone.js';
import { chordPlayerConfig } from './chordPlayer.js';
import { scaleRunnerConfig } from './scaleRunner.js';
import { modeTrainerConfig } from './modeTrainer.js';

export const TYPES = [
  { id: 'nf', tier: 1, prereqs: [],     config: noteFindConfig,            name: 'Note Find' },
  { id: 'st', tier: 2, prereqs: ['nf'], config: stringTraversalConfig,     name: 'String Traversal' },
  { id: 'iv', tier: 3, prereqs: ['nf'], config: intervalTrainerConfig,     name: 'Interval' },
  { id: 'ct', tier: 4, prereqs: ['iv'], config: chordToneConfig,           name: 'Chord Tone' },
  { id: 'cp', tier: 5, prereqs: ['ct'], config: chordPlayerConfig,         name: 'Chord Player' },
  { id: 'sr', tier: 6, prereqs: ['cp'], config: scaleRunnerConfig,         name: 'Scale Runner' },
  { id: 'mt', tier: 7, prereqs: ['sr'], config: modeTrainerConfig,         name: 'Mode Trainer' },
];

// --- Helpers ---

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function computeTypeWeights(engine) {
  const mastery = engine?.getMastery?.();
  const weights = {};
  for (const t of TYPES) {
    let prereqPL = 1.0;
    if (t.prereqs.length > 0 && mastery) {
      const prereqItems = mastery.items.filter(i => t.prereqs.some(p => i.key.startsWith(p + ':')));
      prereqPL = prereqItems.length > 0 ? prereqItems.reduce((s, i) => s + i.pL, 0) / prereqItems.length : 0;
    }
    const threshold = 0.3 + t.tier * 0.05;
    let P = t.prereqs.length === 0 ? 1.0 : sigmoid(10 * (prereqPL - threshold));
    if (P < 0.05 && P > 0.01) P = 0.05;

    const typeItems = mastery?.items.filter(i => i.key.startsWith(t.id + ':')) ?? [];
    const typePL = typeItems.length > 0 ? typeItems.reduce((s, i) => s + i.pL, 0) / typeItems.length : 0;
    const weaknessBoost = typeItems.length > 0 ? (1 - typePL) * 0.5 + 0.5 : 1.0;

    weights[t.id] = P * weaknessBoost;
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
  initialParams: {
    _perType: Object.fromEntries(
      TYPES.map(t => [t.id, structuredClone(t.config.initialParams)])
    )
  },

  itemKey(item) {
    const t = typeById(item._type);
    return item._type + ':' + t.config.itemKey(item._inner);
  },

  itemClusters(item) {
    const t = typeById(item._type);
    return ['type_' + item._type, ...t.config.itemClusters(item._inner)];
  },

  itemFromKey(key, params) {
    const colonIdx = key.indexOf(':');
    const typeId = key.slice(0, colonIdx);
    const innerKey = key.slice(colonIdx + 1);
    const t = typeById(typeId);
    const innerItem = t.config.itemFromKey(innerKey, params._perType[typeId]);
    return { _type: typeId, _inner: innerItem };
  },

  genRandom(params, lastItem, engine) {
    const weights = computeTypeWeights(engine);
    const typeId = weightedPick(weights);
    const t = typeById(typeId);
    const innerLast = (lastItem && lastItem._type === typeId) ? lastItem._inner : null;
    const innerItem = t.config.genRandom(params._perType[typeId], innerLast);
    return { _type: typeId, _inner: innerItem };
  },

  genFromCluster(clusterId, params, lastItem) {
    // type_ cluster: delegate to that type's genRandom
    if (clusterId.startsWith('type_')) {
      const typeId = clusterId.slice(5);
      const t = typeById(typeId);
      if (t) {
        const innerLast = (lastItem && lastItem._type === typeId) ? lastItem._inner : null;
        const innerItem = t.config.genRandom(params._perType[typeId], innerLast);
        return { _type: typeId, _inner: innerItem };
      }
    }

    // Non-type cluster: find the matching inner config
    for (const t of TYPES) {
      // Try genFromCluster on each config; the correct one will produce a valid item
      // We check if the config's genFromCluster handles this cluster pattern
      try {
        const innerLast = (lastItem && lastItem._type === t.id) ? lastItem._inner : null;
        const innerItem = t.config.genFromCluster(clusterId, params._perType[t.id], innerLast);
        if (innerItem) return { _type: t.id, _inner: innerItem };
      } catch {
        // This config can't handle this cluster, try next
      }
    }

    // Fallback: genRandom on first type
    return this.genRandom(params, lastItem, null);
  },

  microDrill(failedItem, params) {
    const t = typeById(failedItem._type);
    const innerDrills = t.config.microDrill(failedItem._inner, params._perType[failedItem._type]);
    return innerDrills.map(d => ({ _type: failedItem._type, _inner: d }));
  },

  pickScaffold(item, weakCluster, params) {
    const t = typeById(item._type);
    const innerScaffolds = t.config.pickScaffold(item._inner, weakCluster, params._perType[item._type]);
    return innerScaffolds.map(s => ({ _type: item._type, _inner: s }));
  },

  adjustParams(params, dir, mag) {
    const p = structuredClone(params);
    for (const t of TYPES) {
      const original = JSON.stringify(p._perType[t.id]);
      const newSub = t.config.adjustParams(p._perType[t.id], dir, mag);
      if (JSON.stringify(newSub) !== original) {
        p._perType[t.id] = newSub;
        return p;
      }
    }
    return p;
  }
};
