const SUBDIVISIONS = ['quarter', 'eighth', 'triplet'];
const TEMPO_RANGES = { slow: [60, 80], med: [80, 110], fast: [110, 140] };

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Generate onset pattern (in beats relative to 0)
function patternForSubdivision(subdivision, beats) {
  const pattern = [];
  const step = subdivision === 'quarter' ? 1 : subdivision === 'eighth' ? 0.5 : 1/3;
  for (let b = 0; b < beats; b += step) pattern.push(b);
  return pattern;
}

export const rhythmTrainerConfig = {
  itemDifficulty(item) {
    const tempoFactor = clamp((item.bpm - 60) / 80, 0, 1) * 0.4;
    const subdivFactor = item.subdivision === 'quarter' ? 0 : item.subdivision === 'eighth' ? 0.3 : 0.5;
    return clamp(tempoFactor + subdivFactor, 0, 1);
  },

  itemKey(item) {
    return item.bpm + '_' + item.subdivision + '_' + item.beats;
  },

  itemClusters(item) {
    let tempoCluster = 'tempo_slow';
    if (item.bpm >= 110) tempoCluster = 'tempo_fast';
    else if (item.bpm >= 80) tempoCluster = 'tempo_med';
    return [tempoCluster, 'subdivision_' + item.subdivision];
  },

  globalClusters() {
    return [];
  },

  itemFromKey(key) {
    const parts = key.split('_');
    const bpm = parseInt(parts[0], 10);
    const subdivision = parts[1];
    const beats = parseInt(parts[2], 10);
    return { bpm, subdivision, beats, noteToPlay: 'E' };
  },

  genRandom(lastItem) {
    const subdivision = SUBDIVISIONS[Math.floor(Math.random() * 2)]; // quarter or eighth for now
    const [lo, hi] = subdivision === 'quarter' ? TEMPO_RANGES.slow : TEMPO_RANGES.med;
    const bpm = Math.round(lo + Math.random() * (hi - lo));
    const beats = 4;
    let item;
    do {
      item = { bpm, subdivision, beats, noteToPlay: 'E' };
    } while (lastItem && lastItem.bpm === bpm && lastItem.subdivision === subdivision);
    return item;
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('tempo_')) {
      const range = TEMPO_RANGES[clusterId.slice(6)] || TEMPO_RANGES.med;
      const bpm = Math.round(range[0] + Math.random() * (range[1] - range[0]));
      const subdivision = SUBDIVISIONS[Math.floor(Math.random() * 2)];
      return { bpm, subdivision, beats: 4, noteToPlay: 'E' };
    }
    if (clusterId.startsWith('subdivision_')) {
      const subdivision = clusterId.slice(12);
      const [lo, hi] = TEMPO_RANGES.med;
      const bpm = Math.round(lo + Math.random() * (hi - lo));
      return { bpm, subdivision, beats: 4, noteToPlay: 'E' };
    }
    return this.genRandom(lastItem);
  },

  microDrill(failedItem) {
    const easier = { bpm: Math.max(60, failedItem.bpm - 20), subdivision: 'quarter', beats: 4, noteToPlay: 'E' };
    return [easier];
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];
    if (weakCluster.startsWith('subdivision_')) {
      return [{ bpm: 70, subdivision: 'quarter', beats: 4, noteToPlay: 'E' }];
    }
    return [];
  },

  // Helper for exercise component
  getPattern(item) {
    return patternForSubdivision(item.subdivision, item.beats);
  }
};
