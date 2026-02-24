import { NT_NATURAL, noteAt, fretForNote } from '$lib/music/fretboard.js';

export const fretboardQuizConfig = {
  initialParams: { maxFret: 5, naturalsOnly: true, timer: 0 },

  itemKey(item) {
    return item.mode + '_s' + item.str + 'f' + item.fret;
  },

  itemClusters(item) {
    return [
      'str_' + item.str,
      'note_' + item.note,
      'mode_' + item.mode,
      NT_NATURAL.includes(item.note) ? 'natural' : 'accidental',
      item.fret <= 5 ? 'zone_lo' : item.fret <= 12 ? 'zone_mid' : 'zone_hi'
    ];
  },

  itemFromKey(key, params) {
    const m = key.match(/^(note|fret)_s(\d+)f(\d+)$/);
    const mode = m[1];
    const str = parseInt(m[2], 10);
    const fret = parseInt(m[3], 10);
    return { str, fret, note: noteAt(str, fret), mode };
  },

  genRandom(params, lastItem) {
    const modes = ['note', 'fret'];
    let str, fret, note;
    let attempts = 0;
    do {
      str = Math.floor(Math.random() * 6);
      fret = Math.floor(Math.random() * (params.maxFret + 1));
      note = noteAt(str, fret);
      attempts++;
    } while (
      (params.naturalsOnly && !NT_NATURAL.includes(note)) ||
      (lastItem && str === lastItem.str && fret === lastItem.fret && attempts < 100)
    );
    const mode = modes[Math.floor(Math.random() * 2)];
    return { str, fret, note, mode };
  },

  genFromCluster(clusterId, params, lastItem) {
    const cands = [];
    const modes = ['note', 'fret'];
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= params.maxFret; f++) {
        const n = noteAt(s, f);
        if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;

        for (const mode of modes) {
          // Apply cluster constraint
          if (clusterId.startsWith('str_')) {
            if (s !== parseInt(clusterId.slice(4), 10)) continue;
          } else if (clusterId.startsWith('note_')) {
            if (n !== clusterId.slice(5)) continue;
          } else if (clusterId.startsWith('mode_')) {
            if (mode !== clusterId.slice(5)) continue;
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
          }

          cands.push({ str: s, fret: f, note: n, mode });
        }
      }
    }
    if (cands.length === 0) return this.genRandom(params, lastItem);

    if (lastItem && cands.length > 1) {
      const filtered = cands.filter(c => !(c.str === lastItem.str && c.fret === lastItem.fret));
      if (filtered.length > 0) {
        return filtered[Math.floor(Math.random() * filtered.length)];
      }
    }
    return cands[Math.floor(Math.random() * cands.length)];
  },

  microDrill(failedItem, params) {
    const s = failedItem.str;
    const oppositeMode = failedItem.mode === 'note' ? 'fret' : 'note';

    // 1. Same string, open fret (fret 0), opposite mode
    const open = { str: s, fret: 0, note: noteAt(s, 0), mode: oppositeMode };

    // 2. Same str+fret, opposite mode
    const same = { str: s, fret: failedItem.fret, note: failedItem.note, mode: oppositeMode };

    return [open, same];
  },

  pickScaffold(item, weakCluster, params) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('str_')) {
      // Same string, different fret (string_focus)
      const s = item.str;
      const cands = [];
      for (let f = 0; f <= params.maxFret; f++) {
        if (f === item.fret) continue;
        const n = noteAt(s, f);
        if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;
        const mode = Math.random() < 0.5 ? 'note' : 'fret';
        cands.push({ str: s, fret: f, note: n, mode });
      }
      if (cands.length > 0) return [cands[Math.floor(Math.random() * cands.length)]];
    }

    if (weakCluster.startsWith('note_')) {
      // Same note on different string (octave_pair)
      const cands = [];
      for (let s = 0; s < 6; s++) {
        if (s === item.str) continue;
        for (let f = 0; f <= params.maxFret; f++) {
          if (noteAt(s, f) === item.note) {
            const mode = Math.random() < 0.5 ? 'note' : 'fret';
            cands.push({ str: s, fret: f, note: item.note, mode });
          }
        }
      }
      if (cands.length > 0) return [cands[Math.floor(Math.random() * cands.length)]];
    }

    if (weakCluster === 'accidental') {
      // Nearest accidental note item
      const cands = [];
      for (let f = Math.max(0, item.fret - 2); f <= Math.min(params.maxFret, item.fret + 2); f++) {
        for (let s = 0; s < 6; s++) {
          const n = noteAt(s, f);
          if (!NT_NATURAL.includes(n)) {
            const mode = Math.random() < 0.5 ? 'note' : 'fret';
            cands.push({ str: s, fret: f, note: n, mode });
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
      // Harder: maxFret 5->12, naturalsOnly true->false, maxFret 12->19, timer 0->20->5
      if (p.maxFret < 12) { p.maxFret = 12; }
      else if (p.naturalsOnly) { p.naturalsOnly = false; }
      else if (p.maxFret < 19) { p.maxFret = 19; }
      else if (p.timer === 0) { p.timer = 20; }
      else if (p.timer > 5) { p.timer = 5; }
    } else {
      // Easier: reverse
      if (p.timer > 0 && p.timer <= 5) { p.timer = 20; }
      else if (p.timer > 0) { p.timer = 0; }
      else if (p.maxFret > 12) { p.maxFret = 12; }
      else if (!p.naturalsOnly) { p.naturalsOnly = true; }
      else if (p.maxFret > 5) { p.maxFret = 5; }
    }

    return p;
  }
};
