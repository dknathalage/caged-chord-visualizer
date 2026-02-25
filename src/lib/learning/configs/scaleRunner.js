import { NOTES, SCALES } from '$lib/constants/music.js';
import { NT_NATURAL, LANDMARKS, nearestLandmark, landmarkZone } from '$lib/music/fretboard.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const SCALE_COMPLEXITY = { maj_pent: 0.1, min_pent: 0.15, major: 0.35, natural_min: 0.4 };
const ALL_SCALE_IDS = ['major', 'natural_min', 'maj_pent', 'min_pent'];

export const scaleRunnerConfig = {
  itemDifficulty(item) {
    const sc = SCALE_COMPLEXITY[item.scaleId] || 0.3;
    const rootAccidental = !NT_NATURAL.includes(NOTES[item.rootIdx]) ? 0.15 : 0;
    const dirBonus = item.dir === 'updown' ? 0.2 : 0;
    return clamp(sc + rootAccidental + dirBonus, 0, 1);
  },

  itemKey(item) {
    return item.scaleId + '_' + item.rootIdx + '_f' + item.startFret;
  },

  itemClusters(item) {
    const clusters = [
      'scale_' + item.scaleId,
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
    const fretMatch = key.match(/_f(\d+)$/);
    const startFret = parseInt(fretMatch[1], 10);
    const beforeFret = key.slice(0, fretMatch.index);
    const lastUnderscore = beforeFret.lastIndexOf('_');
    const rootIdx = parseInt(beforeFret.slice(lastUnderscore + 1), 10);
    const scaleId = beforeFret.slice(0, lastUnderscore);
    return { scaleId, rootIdx, startFret, dir: 'up' };
  },

  genRandom(lastItem) {
    const scaleId = ALL_SCALE_IDS[Math.floor(Math.random() * ALL_SCALE_IDS.length)];
    const rootIdx = Math.floor(Math.random() * 12);
    const dir = Math.random() < 0.4 ? 'updown' : 'up';

    let startFret;
    const landmarksInRange = LANDMARKS.filter(l => l >= 1 && l <= 8);
    if (Math.random() < 0.4 && landmarksInRange.length > 0) {
      startFret = landmarksInRange[Math.floor(Math.random() * landmarksInRange.length)];
    } else {
      startFret = Math.floor(Math.random() * 8) + 1;
    }

    const item = { scaleId, rootIdx, startFret, dir };

    if (lastItem && item.scaleId === lastItem.scaleId && item.rootIdx === lastItem.rootIdx && item.startFret === lastItem.startFret) {
      return this.genRandom(lastItem);
    }

    return item;
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('scale_')) {
      const scaleId = clusterId.slice(6);
      const rootIdx = Math.floor(Math.random() * 12);
      const startFret = Math.floor(Math.random() * 8) + 1;
      const dir = Math.random() < 0.4 ? 'updown' : 'up';
      return { scaleId, rootIdx, startFret, dir };
    }

    if (clusterId.startsWith('root_')) {
      const noteName = clusterId.slice(5);
      const rootIdx = NOTES.indexOf(noteName);
      const scaleId = ALL_SCALE_IDS[Math.floor(Math.random() * ALL_SCALE_IDS.length)];
      const startFret = Math.floor(Math.random() * 8) + 1;
      const dir = Math.random() < 0.4 ? 'updown' : 'up';
      return { scaleId, rootIdx, startFret, dir };
    }

    if (clusterId.startsWith('zone_')) {
      const zoneToLandmark = { zone_0: 0, zone_3: 3, zone_5: 5, zone_7: 7, zone_9: 9, zone_12: 12 };
      const lm = zoneToLandmark[clusterId];
      let startFret;
      if (lm !== undefined && lm >= 1 && lm <= 8) {
        startFret = lm;
      } else {
        startFret = Math.floor(Math.random() * 8) + 1;
      }
      const scaleId = ALL_SCALE_IDS[Math.floor(Math.random() * ALL_SCALE_IDS.length)];
      const rootIdx = Math.floor(Math.random() * 12);
      const dir = Math.random() < 0.4 ? 'updown' : 'up';
      return { scaleId, rootIdx, startFret, dir };
    }

    if (clusterId === 'landmark') {
      const landmarksInRange = LANDMARKS.filter(l => l >= 1 && l <= 8);
      const startFret = landmarksInRange.length > 0
        ? landmarksInRange[Math.floor(Math.random() * landmarksInRange.length)]
        : Math.floor(Math.random() * 8) + 1;
      const scaleId = ALL_SCALE_IDS[Math.floor(Math.random() * ALL_SCALE_IDS.length)];
      const rootIdx = Math.floor(Math.random() * 12);
      const dir = Math.random() < 0.4 ? 'updown' : 'up';
      return { scaleId, rootIdx, startFret, dir };
    }

    return this.genRandom(lastItem);
  },

  microDrill(failedItem) {
    const drills = [];

    const lmFret = nearestLandmark(failedItem.startFret);
    const landmarkFret = lmFret >= 1 ? lmFret : 1;
    drills.push({
      scaleId: failedItem.scaleId,
      rootIdx: failedItem.rootIdx,
      startFret: landmarkFret,
      dir: 'up'
    });

    const pentIds = ['maj_pent', 'min_pent'];
    const pentId = pentIds.includes(failedItem.scaleId)
      ? (failedItem.scaleId === 'maj_pent' ? 'min_pent' : 'maj_pent')
      : 'maj_pent';
    drills.push({
      scaleId: pentId,
      rootIdx: failedItem.rootIdx,
      startFret: failedItem.startFret,
      dir: 'up'
    });

    return drills;
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('scale_')) {
      const scaleId = weakCluster.slice(6);
      return [{ scaleId, rootIdx: item.rootIdx, startFret: item.startFret, dir: item.dir || 'up' }];
    }

    if (weakCluster.startsWith('root_')) {
      const noteName = weakCluster.slice(5);
      const rootIdx = NOTES.indexOf(noteName);
      if (rootIdx >= 0) {
        return [{ scaleId: item.scaleId, rootIdx, startFret: item.startFret, dir: item.dir || 'up' }];
      }
    }

    if (weakCluster.startsWith('zone_')) {
      const zoneToLandmark = { zone_0: 0, zone_3: 3, zone_5: 5, zone_7: 7, zone_9: 9, zone_12: 12 };
      const lm = zoneToLandmark[weakCluster];
      if (lm !== undefined) {
        const startFret = Math.max(1, lm);
        return [{ scaleId: item.scaleId, rootIdx: item.rootIdx, startFret, dir: item.dir || 'up' }];
      }
    }

    return [];
  }
};
