import { NOTES, INTERVALS } from '$lib/constants/music.js';
import { NT_NATURAL, noteAt, fretForNote, BASE_MIDI } from '$lib/music/fretboard.js';

export const intervalTrainerConfig = {
  initialParams: { maxFret: 10, naturalsOnly: true, timer: 0, intervals: [3, 4, 5, 7, 12] },

  itemKey(item) {
    return item.ref.note + '_' + item.interval.abbr;
  },

  itemClusters(item) {
    return [
      'intv_' + item.interval.abbr,
      'str_' + item.ref.str,
      'root_' + item.ref.note,
      item.interval.semi <= 4 ? 'size_small' : item.interval.semi <= 8 ? 'size_med' : 'size_large'
    ];
  },

  itemFromKey(key, params) {
    const [rootNote, abbr] = key.split('_');
    const intv = INTERVALS.find(i => i.abbr === abbr);
    // Find a valid fret position for the root note
    for (let s = 0; s < 6; s++) {
      const frets = fretForNote(s, rootNote, params.maxFret);
      if (frets.length > 0) {
        const fret = frets[Math.floor(Math.random() * frets.length)];
        const targetNote = NOTES[(NOTES.indexOf(rootNote) + intv.semi) % 12];
        return {
          ref: { note: rootNote, str: s, fret, midi: BASE_MIDI[s] + fret },
          interval: intv,
          targetNote
        };
      }
    }
    // Fallback: fret 0 on string 0
    const targetNote = NOTES[(NOTES.indexOf(rootNote) + intv.semi) % 12];
    return {
      ref: { note: rootNote, str: 0, fret: 0, midi: BASE_MIDI[0] },
      interval: intv,
      targetNote
    };
  },

  genRandom(params, lastItem) {
    const allowedIntvs = INTERVALS.filter(i => params.intervals.includes(i.semi));
    const intv = allowedIntvs[Math.floor(Math.random() * allowedIntvs.length)];

    const cands = [];
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= params.maxFret; f++) {
        const n = noteAt(s, f);
        if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;
        const tn = NOTES[(NOTES.indexOf(n) + intv.semi) % 12];
        if (params.naturalsOnly && !NT_NATURAL.includes(tn)) continue;
        cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
      }
    }

    if (cands.length === 0) return this.genRandom(params, lastItem);

    let pool = cands;
    if (lastItem && cands.length > 6) {
      const filtered = cands.filter(c => !(c.note === lastItem.ref.note && c.str === lastItem.ref.str));
      if (filtered.length > 0) pool = filtered;
    }

    const ref = pool[Math.floor(Math.random() * pool.length)];
    const targetNote = NOTES[(NOTES.indexOf(ref.note) + intv.semi) % 12];
    return { ref, interval: intv, targetNote };
  },

  genFromCluster(clusterId, params, lastItem) {
    if (clusterId.startsWith('intv_')) {
      const abbr = clusterId.slice(5);
      const intv = INTERVALS.find(i => i.abbr === abbr);
      if (intv) {
        const cands = [];
        for (let s = 0; s < 6; s++) {
          for (let f = 0; f <= params.maxFret; f++) {
            const n = noteAt(s, f);
            if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;
            const tn = NOTES[(NOTES.indexOf(n) + intv.semi) % 12];
            if (params.naturalsOnly && !NT_NATURAL.includes(tn)) continue;
            cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
          }
        }
        if (cands.length > 0) {
          let pool = cands;
          if (lastItem && cands.length > 1) {
            const filtered = cands.filter(c => !(c.note === lastItem.ref.note && c.str === lastItem.ref.str));
            if (filtered.length > 0) pool = filtered;
          }
          const ref = pool[Math.floor(Math.random() * pool.length)];
          const targetNote = NOTES[(NOTES.indexOf(ref.note) + intv.semi) % 12];
          return { ref, interval: intv, targetNote };
        }
      }
    }

    if (clusterId.startsWith('str_')) {
      const str = parseInt(clusterId.slice(4), 10);
      const allowedIntvs = INTERVALS.filter(i => params.intervals.includes(i.semi));
      const intv = allowedIntvs[Math.floor(Math.random() * allowedIntvs.length)];
      const cands = [];
      for (let f = 0; f <= params.maxFret; f++) {
        const n = noteAt(str, f);
        if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;
        const tn = NOTES[(NOTES.indexOf(n) + intv.semi) % 12];
        if (params.naturalsOnly && !NT_NATURAL.includes(tn)) continue;
        cands.push({ note: n, str, fret: f, midi: BASE_MIDI[str] + f });
      }
      if (cands.length > 0) {
        const ref = cands[Math.floor(Math.random() * cands.length)];
        const targetNote = NOTES[(NOTES.indexOf(ref.note) + intv.semi) % 12];
        return { ref, interval: intv, targetNote };
      }
    }

    if (clusterId.startsWith('root_')) {
      const rootNote = clusterId.slice(5);
      const allowedIntvs = INTERVALS.filter(i => params.intervals.includes(i.semi));
      const intv = allowedIntvs[Math.floor(Math.random() * allowedIntvs.length)];
      const cands = [];
      for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= params.maxFret; f++) {
          if (noteAt(s, f) !== rootNote) continue;
          const tn = NOTES[(NOTES.indexOf(rootNote) + intv.semi) % 12];
          if (params.naturalsOnly && !NT_NATURAL.includes(tn)) continue;
          cands.push({ note: rootNote, str: s, fret: f, midi: BASE_MIDI[s] + f });
        }
      }
      if (cands.length > 0) {
        const ref = cands[Math.floor(Math.random() * cands.length)];
        const targetNote = NOTES[(NOTES.indexOf(ref.note) + intv.semi) % 12];
        return { ref, interval: intv, targetNote };
      }
    }

    if (clusterId.startsWith('size_')) {
      let filter;
      if (clusterId === 'size_small') filter = i => i.semi <= 4;
      else if (clusterId === 'size_med') filter = i => i.semi > 4 && i.semi <= 8;
      else filter = i => i.semi > 8;

      const allowed = INTERVALS.filter(i => params.intervals.includes(i.semi) && filter(i));
      if (allowed.length > 0) {
        const intv = allowed[Math.floor(Math.random() * allowed.length)];
        const cands = [];
        for (let s = 0; s < 6; s++) {
          for (let f = 0; f <= params.maxFret; f++) {
            const n = noteAt(s, f);
            if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;
            const tn = NOTES[(NOTES.indexOf(n) + intv.semi) % 12];
            if (params.naturalsOnly && !NT_NATURAL.includes(tn)) continue;
            cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
          }
        }
        if (cands.length > 0) {
          const ref = cands[Math.floor(Math.random() * cands.length)];
          const targetNote = NOTES[(NOTES.indexOf(ref.note) + intv.semi) % 12];
          return { ref, interval: intv, targetNote };
        }
      }
    }

    return this.genRandom(params, lastItem);
  },

  microDrill(failedItem, params) {
    const ref = failedItem.ref;
    const failedSemi = failedItem.interval.semi;

    // 1. Same root note/position, but P5 (semi=7). If P5 was failed, use P8 (semi=12).
    const easySemi = failedSemi === 7 ? 12 : 7;
    const easyIntv = INTERVALS.find(i => i.semi === easySemi);
    const easyTarget = NOTES[(NOTES.indexOf(ref.note) + easySemi) % 12];
    const drill1 = {
      ref: { ...ref },
      interval: easyIntv,
      targetNote: easyTarget
    };

    // 2. Same interval as failed, but from open string (fret 0) on any string.
    const openStrings = [];
    for (let s = 0; s < 6; s++) {
      const n = noteAt(s, 0);
      const tn = NOTES[(NOTES.indexOf(n) + failedSemi) % 12];
      openStrings.push({
        ref: { note: n, str: s, fret: 0, midi: BASE_MIDI[s] },
        interval: failedItem.interval,
        targetNote: tn
      });
    }
    const drill2 = openStrings[Math.floor(Math.random() * openStrings.length)];

    return [drill1, drill2];
  },

  pickScaffold(item, weakCluster, params) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('intv_')) {
      // same_root_ladder: same root, next interval in ascending order
      const currentSemi = item.interval.semi;
      const allowed = INTERVALS.filter(i => params.intervals.includes(i.semi) && i.semi > currentSemi);
      if (allowed.length > 0) {
        const nextIntv = allowed[0]; // next ascending
        const targetNote = NOTES[(NOTES.indexOf(item.ref.note) + nextIntv.semi) % 12];
        return [{
          ref: { ...item.ref },
          interval: nextIntv,
          targetNote
        }];
      }
      return [];
    }

    if (weakCluster.startsWith('root_')) {
      // same_interval_diff_root: same interval, different root
      const intv = item.interval;
      const cands = [];
      for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= params.maxFret; f++) {
          const n = noteAt(s, f);
          if (n === item.ref.note) continue;
          if (params.naturalsOnly && !NT_NATURAL.includes(n)) continue;
          const tn = NOTES[(NOTES.indexOf(n) + intv.semi) % 12];
          if (params.naturalsOnly && !NT_NATURAL.includes(tn)) continue;
          cands.push({
            ref: { note: n, str: s, fret: f, midi: BASE_MIDI[s] + f },
            interval: intv,
            targetNote: tn
          });
        }
      }
      if (cands.length > 0) {
        return [cands[Math.floor(Math.random() * cands.length)]];
      }
      return [];
    }

    return [];
  },

  adjustParams(params, dir, mag) {
    const p = structuredClone(params);
    if (mag <= 0.3) return p;

    const ALL_INTERVALS = INTERVALS.map(i => i.semi);
    const isAllIntervals = p.intervals.length === 12;

    if (dir > 0) {
      // Harder
      if (!isAllIntervals) { p.intervals = ALL_INTERVALS; }
      else if (p.maxFret < 14) { p.maxFret = 14; }
      else if (p.maxFret < 19) { p.maxFret = 19; }
      else if (p.naturalsOnly) { p.naturalsOnly = false; }
      else if (p.timer === 0) { p.timer = 20; }
      else if (p.timer > 8) { p.timer = 8; }
    } else {
      // Easier
      if (p.timer > 0 && p.timer <= 8) { p.timer = 20; }
      else if (p.timer > 0) { p.timer = 0; }
      else if (!p.naturalsOnly) { p.naturalsOnly = true; }
      else if (p.maxFret > 14) { p.maxFret = 14; }
      else if (p.maxFret > 10) { p.maxFret = 10; }
      else if (isAllIntervals) { p.intervals = [3, 4, 5, 7, 12]; }
    }

    return p;
  }
};
