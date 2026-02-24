import { NOTES, CHORD_TYPES } from '$lib/constants/music.js';

export const chordSpellerConfig = {
  initialParams: { types: ['maj', 'min'], timer: 0 },

  itemKey(item) {
    return item.mode + '_' + item.root + '_' + item.ct.id;
  },

  itemClusters(item) {
    return [
      'type_' + item.ct.id,
      'root_' + item.root,
      'mode_' + item.mode,
      item.ct.iv.length <= 3 ? 'triads' : 'sevenths'
    ];
  },

  itemFromKey(key, params) {
    const [mode, root, ctId] = key.split('_');
    const ct = CHORD_TYPES.find(c => c.id === ctId);
    return { root, rootIdx: NOTES.indexOf(root), ct, mode };
  },

  genRandom(params, lastItem) {
    const rootIdx = Math.floor(Math.random() * 12);
    const root = NOTES[rootIdx];
    const allowedTypes = CHORD_TYPES.filter(c => params.types.includes(c.id));
    const ct = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];
    const mode = Math.random() < 0.5 ? 'spell' : 'name';
    return { root, rootIdx, ct, mode };
  },

  genFromCluster(clusterId, params, lastItem) {
    if (clusterId.startsWith('type_')) {
      const ctId = clusterId.slice(5);
      const ct = CHORD_TYPES.find(c => c.id === ctId);
      if (ct && params.types.includes(ct.id)) {
        const rootIdx = Math.floor(Math.random() * 12);
        const root = NOTES[rootIdx];
        const mode = Math.random() < 0.5 ? 'spell' : 'name';
        return { root, rootIdx, ct, mode };
      }
    }

    if (clusterId.startsWith('root_')) {
      const root = clusterId.slice(5);
      const rootIdx = NOTES.indexOf(root);
      if (rootIdx >= 0) {
        const allowedTypes = CHORD_TYPES.filter(c => params.types.includes(c.id));
        const ct = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];
        const mode = Math.random() < 0.5 ? 'spell' : 'name';
        return { root, rootIdx, ct, mode };
      }
    }

    if (clusterId.startsWith('mode_')) {
      const mode = clusterId.slice(5);
      const rootIdx = Math.floor(Math.random() * 12);
      const root = NOTES[rootIdx];
      const allowedTypes = CHORD_TYPES.filter(c => params.types.includes(c.id));
      const ct = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];
      return { root, rootIdx, ct, mode };
    }

    if (clusterId === 'triads' || clusterId === 'sevenths') {
      const isTriad = clusterId === 'triads';
      const allowedTypes = CHORD_TYPES.filter(c => params.types.includes(c.id) && (isTriad ? c.iv.length <= 3 : c.iv.length > 3));
      if (allowedTypes.length > 0) {
        const rootIdx = Math.floor(Math.random() * 12);
        const root = NOTES[rootIdx];
        const ct = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];
        const mode = Math.random() < 0.5 ? 'spell' : 'name';
        return { root, rootIdx, ct, mode };
      }
    }

    return this.genRandom(params, lastItem);
  },

  microDrill(failedItem, params) {
    const { root, rootIdx, mode } = failedItem;
    const majCt = CHORD_TYPES.find(c => c.id === 'maj');

    // 1. Same root, major triad, same mode
    const drill1 = { root, rootIdx, ct: majCt, mode };

    // 2. Same root, quality contrast, same mode
    let contrastCt;
    const failedId = failedItem.ct.id;
    if (failedId === 'maj') {
      contrastCt = CHORD_TYPES.find(c => c.id === 'min');
    } else if (failedId === 'min') {
      contrastCt = CHORD_TYPES.find(c => c.id === 'maj');
    } else if (failedId === '7' || failedId === 'maj7' || failedId === 'm7') {
      // 7th chord -> triad version
      if (failedId === '7' || failedId === 'maj7') {
        contrastCt = CHORD_TYPES.find(c => c.id === 'maj');
      } else {
        contrastCt = CHORD_TYPES.find(c => c.id === 'min');
      }
    } else {
      contrastCt = majCt;
    }

    const drill2 = { root, rootIdx, ct: contrastCt, mode };

    return [drill1, drill2];
  },

  pickScaffold(item, weakCluster, params) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('type_')) {
      // quality_contrast: same root, contrasting quality
      const failedId = item.ct.id;
      let contrastId;
      if (failedId === 'maj') contrastId = 'min';
      else if (failedId === 'min') contrastId = 'maj';
      else if (failedId === '7' || failedId === 'maj7' || failedId === 'm7') {
        // triad -> 7th extension
        contrastId = failedId === 'm7' ? 'min' : 'maj';
      } else {
        contrastId = 'maj';
      }
      const contrastCt = CHORD_TYPES.find(c => c.id === contrastId);
      if (contrastCt && params.types.includes(contrastCt.id)) {
        return [{ root: item.root, rootIdx: item.rootIdx, ct: contrastCt, mode: item.mode }];
      }
      return [];
    }

    if (weakCluster.startsWith('root_')) {
      // same chord type, different root
      let newRootIdx;
      do {
        newRootIdx = Math.floor(Math.random() * 12);
      } while (newRootIdx === item.rootIdx);
      const newRoot = NOTES[newRootIdx];
      return [{ root: newRoot, rootIdx: newRootIdx, ct: item.ct, mode: item.mode }];
    }

    return [];
  },

  adjustParams(params, dir, mag) {
    const p = structuredClone(params);
    if (mag <= 0.3) return p;

    // Difficulty levels:
    // Level 1: types ['maj','min'], timer 0
    // Level 2: types ['maj','min','7','maj7','m7'], timer 0
    // Level 3: types ['maj','min','7','maj7','m7','dim','aug','sus2','sus4'], timer 0
    // Then timer: 0 -> 20 -> 5

    const level1 = ['maj', 'min'];
    const level2 = ['maj', 'min', '7', 'maj7', 'm7'];
    const level3 = ['maj', 'min', '7', 'maj7', 'm7', 'dim', 'aug', 'sus2', 'sus4'];

    const currentLevel = p.types.length <= 2 ? 1 : p.types.length <= 5 ? 2 : 3;

    if (dir > 0) {
      // Harder
      if (currentLevel === 1) { p.types = level2; }
      else if (currentLevel === 2) { p.types = level3; }
      else if (p.timer === 0) { p.timer = 20; }
      else if (p.timer > 5) { p.timer = 5; }
    } else {
      // Easier
      if (p.timer > 0 && p.timer <= 5) { p.timer = 20; }
      else if (p.timer > 0) { p.timer = 0; }
      else if (currentLevel === 3) { p.types = level2; }
      else if (currentLevel === 2) { p.types = level1; }
    }

    return p;
  }
};
