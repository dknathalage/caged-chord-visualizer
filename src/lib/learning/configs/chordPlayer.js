import { NOTES } from '$lib/constants/music.js';
import { STD_SHAPES, adaptShape, getBf } from '$lib/music/chords.js';
import { landmarkZone } from '$lib/music/fretboard.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const SHAPE_COMPLEXITY = { e: 0.1, a: 0.15, d: 0.2, c: 0.35, g: 0.4 };
const TYPE_COMPLEXITY = { maj: 0.0, min: 0.05, '7': 0.2, maj7: 0.2, m7: 0.25, dim: 0.3, aug: 0.3, sus2: 0.15, sus4: 0.15 };
const ALL_TYPES = ['maj', 'min', '7', 'maj7', 'm7'];

export const chordPlayerConfig = {
  itemDifficulty(item) {
    const sc = SHAPE_COMPLEXITY[item.shapeId] || 0.3;
    const tc = TYPE_COMPLEXITY[item.typeId] || 0.2;
    return clamp(sc + tc, 0, 1);
  },

  itemKey(item) {
    return item.shapeId + '_' + item.typeId + '_' + item.rootIdx;
  },

  itemClusters(item) {
    const sh = STD_SHAPES.find(s => s.id === item.shapeId);
    const adapted = adaptShape(sh);
    const bf = getBf(adapted, item.rootIdx);
    return [
      'shape_' + item.shapeId,
      'type_' + item.typeId,
      'root_' + NOTES[item.rootIdx],
      landmarkZone(bf)
    ];
  },

  globalClusters(item) {
    return ['global_root_' + NOTES[item.rootIdx], 'global_shape_' + item.shapeId];
  },

  itemFromKey(key) {
    const parts = key.split('_');
    const shapeId = parts[0];
    const rootIdx = parseInt(parts[parts.length - 1], 10);
    const typeId = parts.slice(1, -1).join('_');
    return { shapeId, typeId, rootIdx };
  },

  genRandom(lastItem) {
    const sh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
    const typeId = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
    const rootIdx = Math.floor(Math.random() * 12);
    return { shapeId: sh.id, typeId, rootIdx };
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('shape_')) {
      const shapeId = clusterId.slice(6);
      const typeId = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
      const rootIdx = Math.floor(Math.random() * 12);
      return { shapeId, typeId, rootIdx };
    }

    if (clusterId.startsWith('type_')) {
      const typeId = clusterId.slice(5);
      const sh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
      const rootIdx = Math.floor(Math.random() * 12);
      return { shapeId: sh.id, typeId, rootIdx };
    }

    if (clusterId.startsWith('root_')) {
      const rootName = clusterId.slice(5);
      const rootIdx = NOTES.indexOf(rootName);
      if (rootIdx >= 0) {
        const sh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
        const typeId = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
        return { shapeId: sh.id, typeId, rootIdx };
      }
    }

    if (clusterId.startsWith('zone_')) {
      const sh = STD_SHAPES[Math.floor(Math.random() * STD_SHAPES.length)];
      const typeId = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
      const rootIdx = Math.floor(Math.random() * 12);
      return { shapeId: sh.id, typeId, rootIdx };
    }

    return this.genRandom(lastItem);
  },

  microDrill(failedItem) {
    const drill1 = { shapeId: failedItem.shapeId, typeId: 'maj', rootIdx: failedItem.rootIdx };
    const drill2 = { shapeId: 'e', typeId: failedItem.typeId, rootIdx: failedItem.rootIdx };
    return [drill1, drill2];
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('shape_')) {
      const allShapeIds = STD_SHAPES.map(s => s.id);
      const otherShapes = allShapeIds.filter(id => id !== item.shapeId);
      if (otherShapes.length > 0) {
        const newShapeId = otherShapes[Math.floor(Math.random() * otherShapes.length)];
        return [{ shapeId: newShapeId, typeId: item.typeId, rootIdx: item.rootIdx }];
      }
      return [];
    }

    if (weakCluster.startsWith('type_')) {
      const otherTypes = ALL_TYPES.filter(id => id !== item.typeId);
      if (otherTypes.length > 0) {
        const newTypeId = otherTypes[Math.floor(Math.random() * otherTypes.length)];
        return [{ shapeId: item.shapeId, typeId: newTypeId, rootIdx: item.rootIdx }];
      }
      return [];
    }

    return [];
  }
};
