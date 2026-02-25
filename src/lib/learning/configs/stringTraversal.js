import { NOTES } from '$lib/constants/music.js';
import { NT_NATURAL, fretForNote, landmarkZone } from '$lib/music/fretboard.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function buildItem(note, maxFret = 15) {
  const frets = [];
  for (let s = 0; s < 6; s++) {
    const ff = fretForNote(s, note, maxFret);
    frets.push(ff.length > 0 ? ff[0] : 0);
  }
  return { note, frets };
}

function isPlayableOnAll(note, maxFret) {
  for (let s = 0; s < 6; s++) {
    if (fretForNote(s, note, maxFret).length === 0) return false;
  }
  return true;
}

function chromaticNeighbor(note, offset) {
  const idx = NOTES.indexOf(note);
  return NOTES[((idx + offset) % 12 + 12) % 12];
}

export const stringTraversalConfig = {
  itemDifficulty(item) {
    const accidental = !NT_NATURAL.includes(item.note) ? 1 : 0;
    const avgFret = item.frets.reduce((s, f) => s + f, 0) / item.frets.length;
    const avgFretDist = avgFret / 15;
    const hasHighFret = item.frets.some(f => f >= 10) ? 1 : 0;
    return clamp(accidental * 0.3 + avgFretDist * 0.3 + hasHighFret * 0.2, 0, 1);
  },

  itemKey(item) {
    return 'note_' + item.note;
  },

  itemClusters(item) {
    const loFret = Math.min(...item.frets);
    return [
      'note_' + item.note,
      NT_NATURAL.includes(item.note) ? 'natural' : 'accidental',
      landmarkZone(loFret)
    ];
  },

  globalClusters(item) {
    return ['global_note_' + item.note];
  },

  itemFromKey(key) {
    const note = key.replace('note_', '');
    return buildItem(note);
  },

  genRandom(lastItem) {
    const valid = [];
    for (const n of NOTES) {
      if (isPlayableOnAll(n, 15)) valid.push(n);
    }
    let pick;
    do {
      pick = valid[Math.floor(Math.random() * valid.length)];
    } while (lastItem && pick === lastItem.note && valid.length > 1);
    return buildItem(pick);
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('note_')) {
      const note = clusterId.replace('note_', '');
      return buildItem(note);
    }
    return this.genRandom(lastItem);
  },

  microDrill(failedItem) {
    const drills = [];
    const below = chromaticNeighbor(failedItem.note, -1);
    const above = chromaticNeighbor(failedItem.note, 1);

    if (isPlayableOnAll(below, 15)) drills.push(buildItem(below));
    if (isPlayableOnAll(above, 15)) drills.push(buildItem(above));

    if (drills.length < 2) {
      const twoBelow = chromaticNeighbor(failedItem.note, -2);
      const twoAbove = chromaticNeighbor(failedItem.note, 2);
      if (drills.length === 0) {
        if (isPlayableOnAll(twoBelow, 15)) drills.push(buildItem(twoBelow));
        if (isPlayableOnAll(twoAbove, 15)) drills.push(buildItem(twoAbove));
      } else if (drills[0].note === below) {
        if (isPlayableOnAll(twoAbove, 15)) drills.push(buildItem(twoAbove));
      } else {
        if (isPlayableOnAll(twoBelow, 15)) drills.push(buildItem(twoBelow));
      }
    }

    return drills.slice(0, 2);
  },

  pickScaffold(item, weakCluster) {
    if (weakCluster && weakCluster.startsWith('note_')) {
      const weakNote = weakCluster.replace('note_', '');
      const neighbor = chromaticNeighbor(weakNote, -1);
      if (isPlayableOnAll(neighbor, 15)) return [buildItem(neighbor)];
      const neighborUp = chromaticNeighbor(weakNote, 1);
      if (isPlayableOnAll(neighborUp, 15)) return [buildItem(neighborUp)];
    }
    return [];
  }
};
