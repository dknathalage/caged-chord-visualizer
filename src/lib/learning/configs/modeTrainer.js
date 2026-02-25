import { NOTES, MODES } from '$lib/constants/music.js';
import { NT_NATURAL, LANDMARKS, nearestLandmark, landmarkZone } from '$lib/music/fretboard.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const MODE_COMPLEXITY = {
  ionian: 0.1, dorian: 0.25, phrygian: 0.45, lydian: 0.3,
  mixolydian: 0.25, aeolian: 0.2, locrian: 0.55
};

export const modeTrainerConfig = {
  itemDifficulty(item) {
    const mc = MODE_COMPLEXITY[item.modeId] || 0.3;
    const rootAccidental = !NT_NATURAL.includes(NOTES[item.rootIdx]) ? 0.15 : 0;
    const dirBonus = item.dir === 'updown' ? 0.2 : 0;
    return clamp(mc + rootAccidental + dirBonus, 0, 1);
  },

  itemKey(item) {
    return item.modeId + '_' + item.rootIdx + '_f' + item.startFret;
  },

  itemClusters(item) {
    const clusters = [
      'mode_' + item.modeId,
      'root_' + NOTES[item.rootIdx],
      landmarkZone(item.startFret)
    ];
    if (LANDMARKS.includes(item.startFret)) clusters.push('landmark');
    return clusters;
  },

  globalClusters(item) {
    return ['global_root_' + NOTES[item.rootIdx], 'global_zone_' + landmarkZone(item.startFret)];
  },

  itemFromKey(key) {
    const parts = key.split('_');
    const fPart = parts.pop();
    const rootIdx = parseInt(parts.pop(), 10);
    const modeId = parts.join('_');
    const startFret = parseInt(fPart.slice(1), 10);
    return { rootIdx, modeId, startFret, dir: 'up' };
  },

  genRandom(lastItem) {
    const mode = MODES[Math.floor(Math.random() * MODES.length)];
    const roots = NOTES.map((n, i) => ({ n, i }));
    const root = roots[Math.floor(Math.random() * roots.length)];
    const dir = Math.random() < 0.4 ? 'updown' : 'up';

    let startFret;
    const lmInRange = LANDMARKS.filter(l => l >= 1 && l <= 8);
    if (Math.random() < 0.4 && lmInRange.length > 0) {
      startFret = lmInRange[Math.floor(Math.random() * lmInRange.length)];
    } else {
      startFret = Math.floor(Math.random() * 8) + 1;
    }

    const item = { rootIdx: root.i, modeId: mode.id, startFret, dir };

    if (lastItem && item.modeId === lastItem.modeId && item.rootIdx === lastItem.rootIdx && item.startFret === lastItem.startFret) {
      return this.genRandom(lastItem);
    }
    return item;
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('mode_')) {
      const modeId = clusterId.slice(5);
      if (MODES.find(m => m.id === modeId)) {
        const roots = NOTES.map((n, i) => ({ n, i }));
        const root = roots[Math.floor(Math.random() * roots.length)];
        const dir = Math.random() < 0.4 ? 'updown' : 'up';
        const lmInRange = LANDMARKS.filter(l => l >= 1 && l <= 8);
        const startFret = Math.random() < 0.4 && lmInRange.length > 0
          ? lmInRange[Math.floor(Math.random() * lmInRange.length)]
          : Math.floor(Math.random() * 8) + 1;
        const item = { rootIdx: root.i, modeId, startFret, dir };
        if (lastItem && item.modeId === lastItem.modeId && item.rootIdx === lastItem.rootIdx && item.startFret === lastItem.startFret) {
          return this.genFromCluster(clusterId, null);
        }
        return item;
      }
    }

    if (clusterId.startsWith('root_')) {
      const noteName = clusterId.slice(5);
      const rootIdx = NOTES.indexOf(noteName);
      if (rootIdx >= 0) {
        const mode = MODES[Math.floor(Math.random() * MODES.length)];
        const dir = Math.random() < 0.4 ? 'updown' : 'up';
        const lmInRange = LANDMARKS.filter(l => l >= 1 && l <= 8);
        const startFret = Math.random() < 0.4 && lmInRange.length > 0
          ? lmInRange[Math.floor(Math.random() * lmInRange.length)]
          : Math.floor(Math.random() * 8) + 1;
        const item = { rootIdx, modeId: mode.id, startFret, dir };
        if (lastItem && item.modeId === lastItem.modeId && item.rootIdx === lastItem.rootIdx && item.startFret === lastItem.startFret) {
          return this.genFromCluster(clusterId, null);
        }
        return item;
      }
    }

    if (clusterId.startsWith('zone_')) {
      const zoneFrets = [];
      for (let f = 1; f <= 8; f++) {
        if (landmarkZone(f) === clusterId) zoneFrets.push(f);
      }
      if (zoneFrets.length > 0) {
        const startFret = zoneFrets[Math.floor(Math.random() * zoneFrets.length)];
        const mode = MODES[Math.floor(Math.random() * MODES.length)];
        const roots = NOTES.map((n, i) => ({ n, i }));
        const root = roots[Math.floor(Math.random() * roots.length)];
        const dir = Math.random() < 0.4 ? 'updown' : 'up';
        return { rootIdx: root.i, modeId: mode.id, startFret, dir };
      }
    }

    if (clusterId === 'landmark') {
      const lmInRange = LANDMARKS.filter(l => l >= 1 && l <= 8);
      if (lmInRange.length > 0) {
        const startFret = lmInRange[Math.floor(Math.random() * lmInRange.length)];
        const mode = MODES[Math.floor(Math.random() * MODES.length)];
        const roots = NOTES.map((n, i) => ({ n, i }));
        const root = roots[Math.floor(Math.random() * roots.length)];
        const dir = Math.random() < 0.4 ? 'updown' : 'up';
        return { rootIdx: root.i, modeId: mode.id, startFret, dir };
      }
    }

    return this.genRandom(lastItem);
  },

  microDrill(failedItem) {
    const lmFret = nearestLandmark(failedItem.startFret);
    const atLandmark = lmFret >= 1 ? lmFret : 1;
    const drill1 = {
      rootIdx: failedItem.rootIdx,
      modeId: failedItem.modeId,
      startFret: atLandmark,
      dir: 'up'
    };

    const drill2 = {
      rootIdx: failedItem.rootIdx,
      modeId: 'ionian',
      startFret: failedItem.startFret,
      dir: 'up'
    };

    return [drill1, drill2];
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('mode_')) {
      const modeId = weakCluster.slice(5);
      if (MODES.find(m => m.id === modeId)) {
        return [{ rootIdx: item.rootIdx, modeId, startFret: item.startFret, dir: item.dir || 'up' }];
      }
    }

    if (weakCluster.startsWith('root_')) {
      const noteName = weakCluster.slice(5);
      const rootIdx = NOTES.indexOf(noteName);
      if (rootIdx >= 0 && rootIdx !== item.rootIdx) {
        return [{ rootIdx, modeId: item.modeId, startFret: item.startFret, dir: item.dir || 'up' }];
      }
      const roots = NOTES.map((n, i) => ({ n, i })).filter(x => x.i !== item.rootIdx);
      if (roots.length > 0) {
        const r = roots[Math.floor(Math.random() * roots.length)];
        return [{ rootIdx: r.i, modeId: item.modeId, startFret: item.startFret, dir: item.dir || 'up' }];
      }
    }

    if (weakCluster.startsWith('zone_')) {
      const zoneFrets = [];
      for (let f = 1; f <= 8; f++) {
        if (landmarkZone(f) === weakCluster) zoneFrets.push(f);
      }
      if (zoneFrets.length > 0) {
        const startFret = zoneFrets[Math.floor(Math.random() * zoneFrets.length)];
        return [{ rootIdx: item.rootIdx, modeId: item.modeId, startFret, dir: item.dir || 'up' }];
      }
    }

    if (weakCluster === 'landmark') {
      const lmInRange = LANDMARKS.filter(l => l >= 1 && l <= 8);
      if (lmInRange.length > 0) {
        const startFret = lmInRange[Math.floor(Math.random() * lmInRange.length)];
        return [{ rootIdx: item.rootIdx, modeId: item.modeId, startFret, dir: item.dir || 'up' }];
      }
    }

    return [];
  }
};
