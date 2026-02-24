import { NOTES } from '$lib/constants/music.js';
import { NT_NATURAL, noteAt, BASE_MIDI } from '$lib/music/fretboard.js';

export const noteFindConfig = {
  initialParams: { maxFret: 5, naturalsOnly: true, timer: 0 },

  itemKey(item) {
    return 's' + item.str + 'f' + item.fret;
  },

  itemClusters(item) {
    const clusters = [
      'str_' + item.str,
      'note_' + item.note,
      item.fret <= 5 ? 'zone_lo' : item.fret <= 12 ? 'zone_mid' : 'zone_hi',
      NT_NATURAL.includes(item.note) ? 'natural' : 'accidental'
    ];
    if (item.fret === 0 || item.fret === 5 || item.fret === 7 || item.fret === 12) {
      clusters.push('landmark');
    }
    return clusters;
  },

  itemFromKey(key, params) {
    const m = key.match(/^s(\d+)f(\d+)$/);
    const str = parseInt(m[1], 10);
    const fret = parseInt(m[2], 10);
    return { note: noteAt(str, fret), str, fret, midi: BASE_MIDI[str] + fret };
  },

  genRandom(params, lastItem) {
    const cands = [];
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= params.maxFret; f++) {
        const n = noteAt(s, f);
        if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;
        cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
      }
    }
    if (lastItem && cands.length > 6) {
      const filtered = cands.filter(c => !(c.note === lastItem.note && c.str === lastItem.str));
      if (filtered.length > 0) {
        return filtered[Math.floor(Math.random() * filtered.length)];
      }
    }
    return cands[Math.floor(Math.random() * cands.length)];
  },

  genFromCluster(clusterId, params, lastItem) {
    const cands = [];
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= params.maxFret; f++) {
        const n = noteAt(s, f);
        if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;

        // Apply cluster constraint
        if (clusterId.startsWith('str_')) {
          if (s !== parseInt(clusterId.slice(4), 10)) continue;
        } else if (clusterId.startsWith('note_')) {
          if (n !== clusterId.slice(5)) continue;
        } else if (clusterId === 'zone_lo') {
          if (f > 5) continue;
        } else if (clusterId === 'zone_mid') {
          if (f <= 5 || f > 12) continue;
        } else if (clusterId === 'zone_hi') {
          if (f <= 12) continue;
        } else if (clusterId === 'natural') {
          if (!NT_NATURAL.includes(n)) continue;
        } else if (clusterId === 'accidental') {
          if (NT_NATURAL.includes(n)) continue;
        } else if (clusterId === 'landmark') {
          if (f !== 0 && f !== 5 && f !== 7 && f !== 12) continue;
        }

        cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
      }
    }
    if (cands.length === 0) return this.genRandom(params, lastItem);

    if (lastItem && cands.length > 1) {
      const filtered = cands.filter(c => !(c.note === lastItem.note && c.str === lastItem.str));
      if (filtered.length > 0) {
        return filtered[Math.floor(Math.random() * filtered.length)];
      }
    }
    return cands[Math.floor(Math.random() * cands.length)];
  },

  microDrill(failedItem, params) {
    const s = failedItem.str;
    const f = failedItem.fret;

    // 1. Open string on same string
    const open = { note: noteAt(s, 0), str: s, fret: 0, midi: BASE_MIDI[s] };

    // 2. Nearest landmark fret (5, 7, or 12) on same string
    const landmarks = [5, 7, 12];
    let nearest = landmarks[0];
    let minDist = Math.abs(f - landmarks[0]);
    for (let i = 1; i < landmarks.length; i++) {
      const d = Math.abs(f - landmarks[i]);
      if (d < minDist) { minDist = d; nearest = landmarks[i]; }
    }
    const lm = { note: noteAt(s, nearest), str: s, fret: nearest, midi: BASE_MIDI[s] + nearest };

    return [open, lm];
  },

  pickScaffold(item, weakCluster, params) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('str_')) {
      // Same string, different fret
      const s = item.str;
      const cands = [];
      for (let f = 0; f <= params.maxFret; f++) {
        if (f === item.fret) continue;
        const n = noteAt(s, f);
        if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;
        cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
      }
      if (cands.length > 0) return [cands[Math.floor(Math.random() * cands.length)]];
    }

    if (weakCluster.startsWith('note_')) {
      // Same note, different string (octave pair)
      const cands = [];
      for (let s = 0; s < 6; s++) {
        if (s === item.str) continue;
        for (let f = 0; f <= params.maxFret; f++) {
          if (noteAt(s, f) === item.note) {
            cands.push({ note: item.note, str: s, fret: f, midi: BASE_MIDI[s] + f });
          }
        }
      }
      if (cands.length > 0) return [cands[Math.floor(Math.random() * cands.length)]];
    }

    if (weakCluster === 'accidental') {
      // An accidental note near item
      const cands = [];
      for (let f = Math.max(0, item.fret - 2); f <= Math.min(params.maxFret, item.fret + 2); f++) {
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
  },

  adjustParams(params, dir, mag) {
    const p = { ...params };
    if (mag <= 0.3) return p;

    if (dir > 0) {
      // Harder
      if (p.maxFret < 12) { p.maxFret = 12; }
      else if (p.maxFret < 19) { p.maxFret = 19; }
      else if (p.naturalsOnly) { p.naturalsOnly = false; }
      else if (p.timer === 0) { p.timer = 15; }
      else if (p.timer > 5) { p.timer = 5; }
    } else {
      // Easier
      if (p.timer > 0 && p.timer < 15) { p.timer = 15; }
      else if (p.timer > 0) { p.timer = 0; }
      else if (!p.naturalsOnly) { p.naturalsOnly = true; }
      else if (p.maxFret > 12) { p.maxFret = 12; }
      else if (p.maxFret > 5) { p.maxFret = 5; }
    }

    return p;
  }
};
