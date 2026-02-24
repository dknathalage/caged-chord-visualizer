import { NOTES, INTERVALS } from '$lib/constants/music.js';
import { NT_NATURAL } from '$lib/music/fretboard.js';

export const intervalNamerConfig = {
  initialParams: { naturalsOnly: true, timer: 0, intervals: [3, 4, 5, 7, 12] },

  itemKey(item) {
    return item.mode + '_' + item.root + '_' + item.interval.abbr;
  },

  itemClusters(item) {
    return [
      'intv_' + item.interval.abbr,
      'mode_' + item.mode,
      'root_' + item.root,
      item.interval.semi <= 4 ? 'size_small' : item.interval.semi <= 8 ? 'size_med' : 'size_large'
    ];
  },

  itemFromKey(key, params) {
    const parts = key.split('_');
    const mode = parts[0];
    const root = parts[1];
    const abbr = parts.slice(2).join('_');
    const interval = INTERVALS.find(iv => iv.abbr === abbr);
    const target = NOTES[(NOTES.indexOf(root) + interval.semi) % 12];
    return { root, rootIdx: NOTES.indexOf(root), interval, target, mode };
  },

  genRandom(params, lastItem) {
    const naturals = NOTES.filter(n => NT_NATURAL.includes(n));
    const allowedIntervals = params.intervals === 'all'
      ? INTERVALS : INTERVALS.filter(iv => params.intervals.includes(iv.semi));

    for (let attempt = 0; attempt < 50; attempt++) {
      const rootPool = params.naturalsOnly ? naturals : NOTES;
      const root = rootPool[Math.floor(Math.random() * rootPool.length)];
      const rootIdx = NOTES.indexOf(root);
      const intv = allowedIntervals[Math.floor(Math.random() * allowedIntervals.length)];
      const target = NOTES[(rootIdx + intv.semi) % 12];

      if (params.naturalsOnly && !NT_NATURAL.includes(target)) continue;

      const mode = Math.random() < 0.5 ? 'name' : 'find';
      const item = { root, rootIdx, interval: intv, target, mode };

      if (lastItem && item.root === lastItem.root && item.interval.abbr === lastItem.interval.abbr && item.mode === lastItem.mode) continue;

      return item;
    }

    // Fallback: C + first allowed interval
    const intv = allowedIntervals[0];
    const target = NOTES[(0 + intv.semi) % 12];
    return { root: 'C', rootIdx: 0, interval: intv, target, mode: 'name' };
  },

  genFromCluster(clusterId, params, lastItem) {
    const naturals = NOTES.filter(n => NT_NATURAL.includes(n));
    const allowedIntervals = params.intervals === 'all'
      ? INTERVALS : INTERVALS.filter(iv => params.intervals.includes(iv.semi));

    for (let attempt = 0; attempt < 50; attempt++) {
      const rootPool = params.naturalsOnly ? naturals : NOTES;
      let root, intv, mode;

      if (clusterId.startsWith('intv_')) {
        const abbr = clusterId.slice(5);
        intv = INTERVALS.find(iv => iv.abbr === abbr);
        if (!intv || (params.intervals !== 'all' && !params.intervals.includes(intv.semi))) {
          intv = allowedIntervals[Math.floor(Math.random() * allowedIntervals.length)];
        }
        root = rootPool[Math.floor(Math.random() * rootPool.length)];
        mode = Math.random() < 0.5 ? 'name' : 'find';
      } else if (clusterId.startsWith('mode_')) {
        mode = clusterId.slice(5);
        root = rootPool[Math.floor(Math.random() * rootPool.length)];
        intv = allowedIntervals[Math.floor(Math.random() * allowedIntervals.length)];
      } else if (clusterId.startsWith('root_')) {
        root = clusterId.slice(5);
        if (params.naturalsOnly && !NT_NATURAL.includes(root)) {
          root = naturals[Math.floor(Math.random() * naturals.length)];
        }
        intv = allowedIntervals[Math.floor(Math.random() * allowedIntervals.length)];
        mode = Math.random() < 0.5 ? 'name' : 'find';
      } else {
        return this.genRandom(params, lastItem);
      }

      const rootIdx = NOTES.indexOf(root);
      const target = NOTES[(rootIdx + intv.semi) % 12];
      if (params.naturalsOnly && !NT_NATURAL.includes(target)) continue;

      return { root, rootIdx, interval: intv, target, mode };
    }

    return this.genRandom(params, lastItem);
  },

  microDrill(failedItem, params) {
    // 1. Same root, easy interval (P5 or P8 if P5 was failed)
    const easySemi = failedItem.interval.semi === 7 ? 12 : 7;
    const easyIntv = INTERVALS.find(iv => iv.semi === easySemi);
    const easyTarget = NOTES[(NOTES.indexOf(failedItem.root) + easySemi) % 12];
    const drill1 = { root: failedItem.root, rootIdx: NOTES.indexOf(failedItem.root), interval: easyIntv, target: easyTarget, mode: failedItem.mode };

    // 2. Same interval, root = C
    const cTarget = NOTES[(0 + failedItem.interval.semi) % 12];
    const drill2 = { root: 'C', rootIdx: 0, interval: failedItem.interval, target: cTarget, mode: failedItem.mode };

    return [drill1, drill2];
  },

  pickScaffold(item, weakCluster, params) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('intv_')) {
      // Same root, ascending interval (ladder)
      const allowedIntervals = params.intervals === 'all'
        ? INTERVALS : INTERVALS.filter(iv => params.intervals.includes(iv.semi));
      let nextIntv = null;
      for (const iv of allowedIntervals) {
        if (iv.semi > item.interval.semi) { nextIntv = iv; break; }
      }
      if (!nextIntv) {
        // Wrap: pick the next semitone up from the full list
        const nextSemi = item.interval.semi < 12 ? item.interval.semi + 1 : item.interval.semi + 2;
        nextIntv = INTERVALS.find(iv => iv.semi >= nextSemi);
      }
      if (nextIntv) {
        const target = NOTES[(NOTES.indexOf(item.root) + nextIntv.semi) % 12];
        if (!params.naturalsOnly || NT_NATURAL.includes(target)) {
          return [{ root: item.root, rootIdx: NOTES.indexOf(item.root), interval: nextIntv, target, mode: item.mode }];
        }
      }
    }

    if (weakCluster.startsWith('root_')) {
      // Same interval, different root
      const naturals = NOTES.filter(n => NT_NATURAL.includes(n));
      const rootPool = params.naturalsOnly ? naturals : NOTES;
      const candidates = rootPool.filter(r => r !== item.root);
      if (candidates.length > 0) {
        const root = candidates[Math.floor(Math.random() * candidates.length)];
        const rootIdx = NOTES.indexOf(root);
        const target = NOTES[(rootIdx + item.interval.semi) % 12];
        if (!params.naturalsOnly || NT_NATURAL.includes(target)) {
          return [{ root, rootIdx, interval: item.interval, target, mode: item.mode }];
        }
      }
    }

    return [];
  },

  adjustParams(params, dir, mag) {
    const p = { ...params };
    if (mag <= 0.3) return p;

    if (dir > 0) {
      // Harder
      if (Array.isArray(p.intervals) && p.intervals.length < 12) {
        p.intervals = 'all';
      } else if (p.naturalsOnly) {
        p.naturalsOnly = false;
      } else if (p.timer === 0) {
        p.timer = 15;
      } else if (p.timer > 4) {
        p.timer = 4;
      }
    } else {
      // Easier
      if (p.timer > 0 && p.timer <= 4) {
        p.timer = 15;
      } else if (p.timer > 0) {
        p.timer = 0;
      } else if (!p.naturalsOnly) {
        p.naturalsOnly = true;
      } else if (p.intervals === 'all') {
        p.intervals = [3, 4, 5, 7, 12];
      }
    }

    return p;
  }
};
