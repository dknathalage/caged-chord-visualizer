import { NOTES, CHORD_TYPES } from '$lib/constants/music.js';

const TYPE_COMPLEXITY = {
  maj: 0.1, min: 0.15, '7': 0.3, maj7: 0.35, m7: 0.4,
  sus2: 0.2, sus4: 0.2, dim: 0.45, aug: 0.4, '5': 0.05
};

const BEGINNER_TYPES = ['maj', 'min', '5'];
const INTERMEDIATE_TYPES = ['maj', 'min', '7', 'sus2', 'sus4', '5'];

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export const chordRecognitionConfig = {
  itemDifficulty(item) {
    return clamp(TYPE_COMPLEXITY[item.typeId] ?? 0.3, 0, 1);
  },

  itemKey(item) {
    return item.rootIdx + '_' + item.typeId;
  },

  itemClusters(item) {
    const ct = CHORD_TYPES.find(c => c.id === item.typeId);
    const quality = ct && ct.iv.includes(3) ? 'minor_family' : 'major_family';
    return [
      'root_' + NOTES[item.rootIdx],
      'type_' + item.typeId,
      'quality_' + quality
    ];
  },

  globalClusters(item) {
    return ['global_root_' + NOTES[item.rootIdx]];
  },

  itemFromKey(key) {
    const parts = key.split('_');
    const rootIdx = parseInt(parts[0], 10);
    const typeId = parts.slice(1).join('_');
    return { rootIdx, typeId };
  },

  genRandom(lastItem) {
    const typePool = INTERMEDIATE_TYPES;
    let typeId, rootIdx;
    do {
      typeId = typePool[Math.floor(Math.random() * typePool.length)];
      rootIdx = Math.floor(Math.random() * 12);
    } while (lastItem && rootIdx === lastItem.rootIdx && typeId === lastItem.typeId);
    return { rootIdx, typeId };
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('root_')) {
      const rootName = clusterId.slice(5);
      const rootIdx = NOTES.indexOf(rootName);
      if (rootIdx >= 0) {
        const typeId = INTERMEDIATE_TYPES[Math.floor(Math.random() * INTERMEDIATE_TYPES.length)];
        return { rootIdx, typeId };
      }
    }
    if (clusterId.startsWith('type_')) {
      const typeId = clusterId.slice(5);
      const rootIdx = Math.floor(Math.random() * 12);
      return { rootIdx, typeId };
    }
    return this.genRandom(lastItem);
  },

  microDrill(failedItem) {
    const drill1 = { rootIdx: failedItem.rootIdx, typeId: 'maj' };
    const drill2 = { rootIdx: failedItem.rootIdx, typeId: 'min' };
    return [drill1, drill2];
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];
    if (weakCluster.startsWith('type_')) {
      const simpler = BEGINNER_TYPES.filter(t => t !== item.typeId);
      if (simpler.length > 0) {
        return [{ rootIdx: item.rootIdx, typeId: simpler[Math.floor(Math.random() * simpler.length)] }];
      }
    }
    return [];
  }
};
