import { NOTES } from '$lib/constants/music.js';

const PATTERNS = [
  { id: 'basic_down', pattern: ['D','D','D','D'], name: 'All Down' },
  { id: 'down_up', pattern: ['D','U','D','U'], name: 'Down-Up' },
  { id: 'folk', pattern: ['D','D','U','U','D','U'], name: 'Folk' },
  { id: 'rock', pattern: ['D','D','U','D','U'], name: 'Rock' },
  { id: 'reggae', pattern: ['_','U','_','U','_','U','_','U'], name: 'Reggae' },
];

const BEGINNER_PATTERNS = ['basic_down', 'down_up'];

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export const strumPatternConfig = {
  itemDifficulty(item) {
    const patternObj = PATTERNS.find(p => p.id === item.patternId);
    const complexity = patternObj ? patternObj.pattern.length / 8 : 0.5;
    const tempoFactor = clamp((item.bpm - 60) / 80, 0, 1) * 0.3;
    return clamp(complexity * 0.7 + tempoFactor, 0, 1);
  },

  itemKey(item) {
    return item.patternId + '_' + item.bpm + '_' + item.rootIdx;
  },

  itemClusters(item) {
    return [
      'pattern_' + item.patternId,
      'root_' + NOTES[item.rootIdx],
    ];
  },

  globalClusters(item) {
    return ['global_root_' + NOTES[item.rootIdx]];
  },

  itemFromKey(key) {
    const parts = key.split('_');
    const rootIdx = parseInt(parts[parts.length - 1], 10);
    const bpm = parseInt(parts[parts.length - 2], 10);
    const patternId = parts.slice(0, -2).join('_');
    return { patternId, bpm, rootIdx };
  },

  genRandom(lastItem) {
    const pool = BEGINNER_PATTERNS;
    let patternId;
    do {
      patternId = pool[Math.floor(Math.random() * pool.length)];
    } while (lastItem && lastItem.patternId === patternId);
    const bpm = 70 + Math.floor(Math.random() * 30);
    const rootIdx = Math.floor(Math.random() * 12);
    return { patternId, bpm, rootIdx };
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('pattern_')) {
      const patternId = clusterId.slice(8);
      const bpm = 70 + Math.floor(Math.random() * 30);
      const rootIdx = Math.floor(Math.random() * 12);
      return { patternId, bpm, rootIdx };
    }
    if (clusterId.startsWith('root_')) {
      const rootName = clusterId.slice(5);
      const rootIdx = NOTES.indexOf(rootName);
      if (rootIdx >= 0) {
        const patternId = BEGINNER_PATTERNS[Math.floor(Math.random() * BEGINNER_PATTERNS.length)];
        const bpm = 70 + Math.floor(Math.random() * 30);
        return { patternId, bpm, rootIdx };
      }
    }
    return this.genRandom(lastItem);
  },

  microDrill(failedItem) {
    return [{ patternId: 'basic_down', bpm: Math.max(60, failedItem.bpm - 20), rootIdx: failedItem.rootIdx }];
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];
    return [{ patternId: 'basic_down', bpm: 70, rootIdx: item.rootIdx }];
  },

  getPattern(patternId) {
    return PATTERNS.find(p => p.id === patternId);
  }
};
