import { NOTES } from '$lib/constants/music.js';
import { NT_NATURAL, noteAt, BASE_MIDI, LANDMARKS, nearestLandmark, landmarkZone } from '$lib/music/fretboard.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export const noteFindConfig = {
  itemDifficulty(item) {
    const fretFactor = item.fret / 15;
    const accidental = !NT_NATURAL.includes(item.note) ? 1 : 0;
    const landmark = LANDMARKS.includes(item.fret) ? 0 : 1;
    const innerStr = (item.str >= 1 && item.str <= 4) ? 1 : 0;
    return clamp(fretFactor * 0.5 + accidental * 0.2 + landmark * 0.05 + innerStr * 0.05, 0, 1);
  },

  itemKey(item) {
    return 's' + item.str + 'f' + item.fret;
  },

  itemClusters(item) {
    const clusters = [
      'str_' + item.str,
      'note_' + item.note,
      landmarkZone(item.fret),
      NT_NATURAL.includes(item.note) ? 'natural' : 'accidental'
    ];
    if (LANDMARKS.includes(item.fret)) clusters.push('landmark');
    return clusters;
  },

  globalClusters(item) {
    return ['global_note_' + item.note, 'global_zone_' + landmarkZone(item.fret)];
  },

  itemFromKey(key) {
    const m = key.match(/^s(\d+)f(\d+)$/);
    const str = parseInt(m[1], 10);
    const fret = parseInt(m[2], 10);
    return { note: noteAt(str, fret), str, fret, midi: BASE_MIDI[str] + fret };
  },

  genRandom(lastItem) {
    const useLandmark = Math.random() < 0.4;
    const cands = [];
    for (let s = 0; s < 6; s++) {
      const fretPool = useLandmark ? LANDMARKS.filter(l => l <= 15) : null;
      const frets = fretPool || Array.from({ length: 16 }, (_, i) => i);
      for (const f of frets) {
        const n = noteAt(s, f);
        cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
      }
    }
    if (lastItem && cands.length > 6) {
      const filtered = cands.filter(c => !(c.note === lastItem.note && c.str === lastItem.str));
      if (filtered.length > 0) return filtered[Math.floor(Math.random() * filtered.length)];
    }
    return cands[Math.floor(Math.random() * cands.length)];
  },

  genFromCluster(clusterId, lastItem) {
    const cands = [];
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= 15; f++) {
        const n = noteAt(s, f);

        if (clusterId.startsWith('str_')) {
          if (s !== parseInt(clusterId.slice(4), 10)) continue;
        } else if (clusterId.startsWith('note_')) {
          if (n !== clusterId.slice(5)) continue;
        } else if (clusterId.startsWith('zone_')) {
          if (landmarkZone(f) !== clusterId) continue;
        } else if (clusterId === 'landmark') {
          if (!LANDMARKS.includes(f)) continue;
        } else if (clusterId === 'natural') {
          if (!NT_NATURAL.includes(n)) continue;
        } else if (clusterId === 'accidental') {
          if (NT_NATURAL.includes(n)) continue;
        }

        cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
      }
    }
    if (cands.length === 0) return this.genRandom(lastItem);

    if (lastItem && cands.length > 1) {
      const filtered = cands.filter(c => !(c.note === lastItem.note && c.str === lastItem.str));
      if (filtered.length > 0) return filtered[Math.floor(Math.random() * filtered.length)];
    }
    return cands[Math.floor(Math.random() * cands.length)];
  },

  microDrill(failedItem) {
    const s = failedItem.str;
    const f = failedItem.fret;

    const lmFret = nearestLandmark(f);
    const lm = { note: noteAt(s, lmFret), str: s, fret: lmFret, midi: BASE_MIDI[s] + lmFret };

    const sorted = LANDMARKS.filter(l => l !== lmFret && l <= 15)
      .sort((a, b) => Math.abs(a - f) - Math.abs(b - f));
    const lm2Fret = sorted.length > 0 ? sorted[0] : 0;
    const lm2 = { note: noteAt(s, lm2Fret), str: s, fret: lm2Fret, midi: BASE_MIDI[s] + lm2Fret };

    return [lm, lm2];
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('str_')) {
      const s = item.str;
      const cands = [];
      for (let f = 0; f <= 15; f++) {
        if (f === item.fret) continue;
        const n = noteAt(s, f);
        cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
      }
      if (cands.length > 0) return [cands[Math.floor(Math.random() * cands.length)]];
    }

    if (weakCluster.startsWith('note_')) {
      const cands = [];
      for (let s = 0; s < 6; s++) {
        if (s === item.str) continue;
        for (let f = 0; f <= 15; f++) {
          if (noteAt(s, f) === item.note) {
            cands.push({ note: item.note, str: s, fret: f, midi: BASE_MIDI[s] + f });
          }
        }
      }
      if (cands.length > 0) return [cands[Math.floor(Math.random() * cands.length)]];
    }

    if (weakCluster.startsWith('zone_')) {
      const zoneToLandmark = { zone_0: 0, zone_3: 3, zone_5: 5, zone_7: 7, zone_9: 9, zone_12: 12 };
      const lmFret = zoneToLandmark[weakCluster];
      if (lmFret !== undefined && lmFret <= 15) {
        const n = noteAt(item.str, lmFret);
        return [{ note: n, str: item.str, fret: lmFret, midi: BASE_MIDI[item.str] + lmFret }];
      }
    }

    if (weakCluster === 'accidental') {
      const cands = [];
      for (let f = Math.max(0, item.fret - 2); f <= Math.min(15, item.fret + 2); f++) {
        for (let s = 0; s < 6; s++) {
          const n = noteAt(s, f);
          if (!NT_NATURAL.includes(n)) {
            cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
          }
        }
      }
      if (cands.length > 0) return [cands[Math.floor(Math.random() * cands.length)]];
    }

    return [];
  }
};
