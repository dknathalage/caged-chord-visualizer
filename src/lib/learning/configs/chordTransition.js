import { NOTES } from '$lib/constants/music.js';
import { STD_SHAPES, adaptShape, getBf } from '$lib/music/chords.js';
import { landmarkZone } from '$lib/music/fretboard.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const SHAPE_COMPLEXITY = { e: 0.1, a: 0.15, d: 0.2, c: 0.35, g: 0.4 };
const TYPE_COMPLEXITY = { maj: 0.0, min: 0.05, '7': 0.2, maj7: 0.2, m7: 0.25, dim: 0.3, aug: 0.3, sus2: 0.15, sus4: 0.15 };
const ALL_TYPES = ['maj', 'min', '7', 'maj7', 'm7'];

const COMMON_PAIRS = [
  ['maj', 'min'], ['maj', 'maj'], ['min', 'min'],
  ['maj', '7'], ['min', 'm7'], ['maj', 'maj7'],
  ['7', 'maj'], ['m7', '7'],
];

export const chordTransitionConfig = {
  itemDifficulty(item) {
    const fromSc = SHAPE_COMPLEXITY[item.fromShapeId] || 0.3;
    const fromTc = TYPE_COMPLEXITY[item.fromTypeId] || 0.2;
    const toSc = SHAPE_COMPLEXITY[item.toShapeId] || 0.3;
    const toTc = TYPE_COMPLEXITY[item.toTypeId] || 0.2;
    let diff = (fromSc + fromTc + toSc + toTc) / 2;
    if (item.fromShapeId !== item.toShapeId) diff += 0.1;
    if (item.fromRootIdx !== item.toRootIdx) diff += 0.1;
    return clamp(diff, 0, 1);
  },

  itemKey(item) {
    return item.fromShapeId + '_' + item.fromTypeId + '_' + item.fromRootIdx + '>' +
           item.toShapeId + '_' + item.toTypeId + '_' + item.toRootIdx;
  },

  itemClusters(item) {
    return [
      'from_shape_' + item.fromShapeId,
      'to_shape_' + item.toShapeId,
      'from_root_' + NOTES[item.fromRootIdx],
      'to_root_' + NOTES[item.toRootIdx],
    ];
  },

  globalClusters(item) {
    const clusters = [
      'global_root_' + NOTES[item.fromRootIdx],
      'global_root_' + NOTES[item.toRootIdx],
      'global_shape_' + item.fromShapeId,
      'global_shape_' + item.toShapeId,
    ];
    // Deduplicate if from === to
    return [...new Set(clusters)];
  },

  itemFromKey(key) {
    const [fromHalf, toHalf] = key.split('>');
    const fromParts = fromHalf.split('_');
    const toParts = toHalf.split('_');
    const fromShapeId = fromParts[0];
    const fromRootIdx = parseInt(fromParts[fromParts.length - 1], 10);
    const fromTypeId = fromParts.slice(1, -1).join('_');
    const toShapeId = toParts[0];
    const toRootIdx = parseInt(toParts[toParts.length - 1], 10);
    const toTypeId = toParts.slice(1, -1).join('_');
    return { fromShapeId, fromTypeId, fromRootIdx, toShapeId, toTypeId, toRootIdx };
  },

  genRandom(lastItem) {
    const pair = COMMON_PAIRS[Math.floor(Math.random() * COMMON_PAIRS.length)];
    const fromSh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
    const toSh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
    const fromRoot = Math.floor(Math.random() * 12);
    const toRoot = Math.floor(Math.random() * 12);
    const item = {
      fromShapeId: fromSh.id, fromTypeId: pair[0], fromRootIdx: fromRoot,
      toShapeId: toSh.id, toTypeId: pair[1], toRootIdx: toRoot,
    };
    if (lastItem && this.itemKey(item) === this.itemKey(lastItem)) {
      return this.genRandom(lastItem);
    }
    return item;
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('from_shape_')) {
      const shapeId = clusterId.slice(11);
      const pair = COMMON_PAIRS[Math.floor(Math.random() * COMMON_PAIRS.length)];
      const toSh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
      return {
        fromShapeId: shapeId, fromTypeId: pair[0], fromRootIdx: Math.floor(Math.random() * 12),
        toShapeId: toSh.id, toTypeId: pair[1], toRootIdx: Math.floor(Math.random() * 12),
      };
    }

    if (clusterId.startsWith('to_shape_')) {
      const shapeId = clusterId.slice(9);
      const pair = COMMON_PAIRS[Math.floor(Math.random() * COMMON_PAIRS.length)];
      const fromSh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
      return {
        fromShapeId: fromSh.id, fromTypeId: pair[0], fromRootIdx: Math.floor(Math.random() * 12),
        toShapeId: shapeId, toTypeId: pair[1], toRootIdx: Math.floor(Math.random() * 12),
      };
    }

    if (clusterId.startsWith('from_root_')) {
      const rootName = clusterId.slice(10);
      const rootIdx = NOTES.indexOf(rootName);
      if (rootIdx >= 0) {
        const pair = COMMON_PAIRS[Math.floor(Math.random() * COMMON_PAIRS.length)];
        const fromSh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
        const toSh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
        return {
          fromShapeId: fromSh.id, fromTypeId: pair[0], fromRootIdx: rootIdx,
          toShapeId: toSh.id, toTypeId: pair[1], toRootIdx: Math.floor(Math.random() * 12),
        };
      }
    }

    if (clusterId.startsWith('to_root_')) {
      const rootName = clusterId.slice(8);
      const rootIdx = NOTES.indexOf(rootName);
      if (rootIdx >= 0) {
        const pair = COMMON_PAIRS[Math.floor(Math.random() * COMMON_PAIRS.length)];
        const fromSh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
        const toSh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
        return {
          fromShapeId: fromSh.id, fromTypeId: pair[0], fromRootIdx: Math.floor(Math.random() * 12),
          toShapeId: toSh.id, toTypeId: pair[1], toRootIdx: rootIdx,
        };
      }
    }

    return this.genRandom(lastItem);
  },

  microDrill(failedItem) {
    return [
      {
        fromShapeId: failedItem.fromShapeId, fromTypeId: failedItem.fromTypeId, fromRootIdx: failedItem.fromRootIdx,
        toShapeId: failedItem.fromShapeId, toTypeId: failedItem.fromTypeId, toRootIdx: failedItem.fromRootIdx,
      },
      {
        fromShapeId: failedItem.toShapeId, fromTypeId: failedItem.toTypeId, fromRootIdx: failedItem.toRootIdx,
        toShapeId: failedItem.toShapeId, toTypeId: failedItem.toTypeId, toRootIdx: failedItem.toRootIdx,
      },
    ];
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('from_shape_') || weakCluster.startsWith('to_shape_')) {
      const allShapeIds = STD_SHAPES.map(s => s.id);
      const otherShapes = allShapeIds.filter(id => id !== item.fromShapeId && id !== item.toShapeId);
      if (otherShapes.length > 0) {
        const newShape = otherShapes[Math.floor(Math.random() * otherShapes.length)];
        return [{ fromShapeId: newShape, fromTypeId: item.fromTypeId, fromRootIdx: item.fromRootIdx,
                  toShapeId: newShape, toTypeId: item.toTypeId, toRootIdx: item.toRootIdx }];
      }
      return [];
    }

    if (weakCluster.startsWith('from_root_') || weakCluster.startsWith('to_root_')) {
      const newRoot = Math.floor(Math.random() * 12);
      return [{ fromShapeId: item.fromShapeId, fromTypeId: item.fromTypeId, fromRootIdx: newRoot,
                toShapeId: item.toShapeId, toTypeId: item.toTypeId, toRootIdx: newRoot }];
    }

    return [];
  },
};
