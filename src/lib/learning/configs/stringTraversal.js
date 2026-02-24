import { NOTES } from '$lib/constants/music.js';
import { NT_NATURAL, fretForNote } from '$lib/music/fretboard.js';

function buildItem(note, maxFret) {
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
  initialParams: { maxFret: 10, naturalsOnly: true, timer: 0 },

  itemKey(item) {
    return 'note_' + item.note;
  },

  itemClusters(item) {
    return [
      'note_' + item.note,
      NT_NATURAL.includes(item.note) ? 'natural' : 'accidental'
    ];
  },

  itemFromKey(key, params) {
    const note = key.replace('note_', '');
    return buildItem(note, params.maxFret);
  },

  genRandom(params, lastItem) {
    const valid = [];
    const pool = params.naturalsOnly ? NT_NATURAL : NOTES;
    for (const n of pool) {
      if (isPlayableOnAll(n, params.maxFret)) valid.push(n);
    }
    let pick;
    do {
      pick = valid[Math.floor(Math.random() * valid.length)];
    } while (lastItem && pick === lastItem.note && valid.length > 1);
    return buildItem(pick, params.maxFret);
  },

  genFromCluster(clusterId, params, lastItem) {
    if (clusterId.startsWith('note_')) {
      const note = clusterId.replace('note_', '');
      return buildItem(note, params.maxFret);
    }
    return this.genRandom(params, lastItem);
  },

  microDrill(failedItem, params) {
    const drills = [];
    const below = chromaticNeighbor(failedItem.note, -1);
    const above = chromaticNeighbor(failedItem.note, 1);

    if (isPlayableOnAll(below, params.maxFret)) {
      drills.push(buildItem(below, params.maxFret));
    }
    if (isPlayableOnAll(above, params.maxFret)) {
      drills.push(buildItem(above, params.maxFret));
    }

    // If we only got one direction, try two semitones in the other direction
    if (drills.length < 2) {
      const twoBelow = chromaticNeighbor(failedItem.note, -2);
      const twoAbove = chromaticNeighbor(failedItem.note, 2);
      if (drills.length === 0) {
        // Neither neighbor worked, try further out
        if (isPlayableOnAll(twoBelow, params.maxFret)) drills.push(buildItem(twoBelow, params.maxFret));
        if (isPlayableOnAll(twoAbove, params.maxFret)) drills.push(buildItem(twoAbove, params.maxFret));
      } else if (drills[0].note === below) {
        // Had below but not above, try two above
        if (isPlayableOnAll(twoAbove, params.maxFret)) drills.push(buildItem(twoAbove, params.maxFret));
      } else {
        // Had above but not below, try two below
        if (isPlayableOnAll(twoBelow, params.maxFret)) drills.push(buildItem(twoBelow, params.maxFret));
      }
    }

    return drills.slice(0, 2);
  },

  pickScaffold(item, weakCluster, params) {
    if (weakCluster && weakCluster.startsWith('note_')) {
      const weakNote = weakCluster.replace('note_', '');
      const neighbor = chromaticNeighbor(weakNote, -1);
      if (isPlayableOnAll(neighbor, params.maxFret)) {
        return [buildItem(neighbor, params.maxFret)];
      }
      const neighborUp = chromaticNeighbor(weakNote, 1);
      if (isPlayableOnAll(neighborUp, params.maxFret)) {
        return [buildItem(neighborUp, params.maxFret)];
      }
    }
    return [];
  },

  adjustParams(params, dir, mag) {
    const p = { ...params };

    // Escalation order (harder): maxFret 10->14->19, naturalsOnly true->false, timer 0->45->15
    if (dir > 0 && mag > 0.3) {
      // Make harder
      if (p.maxFret === 10) p.maxFret = 14;
      else if (p.maxFret === 14) p.maxFret = 19;
      else if (p.naturalsOnly) p.naturalsOnly = false;
      else if (p.timer === 0) p.timer = 45;
      else if (p.timer === 45) p.timer = 15;
    } else if (dir < 0 && mag > 0.3) {
      // Make easier
      if (p.timer === 15) p.timer = 45;
      else if (p.timer === 45) p.timer = 0;
      else if (!p.naturalsOnly) p.naturalsOnly = true;
      else if (p.maxFret === 19) p.maxFret = 14;
      else if (p.maxFret === 14) p.maxFret = 10;
    }

    return p;
  }
};
