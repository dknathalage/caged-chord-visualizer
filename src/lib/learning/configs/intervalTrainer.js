import { NOTES, INTERVALS } from '$lib/constants/music.js';
import { NT_NATURAL, noteAt, fretForNote, BASE_MIDI, LANDMARKS, nearestLandmark, landmarkZone } from '$lib/music/fretboard.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const DISSONANCE = {
  1: 0.8, 2: 0.4, 3: 0.3, 4: 0.3, 5: 0.2, 6: 0.7, 7: 0.1,
  8: 0.5, 9: 0.4, 10: 0.5, 11: 0.6, 12: 0.1
};

export const intervalTrainerConfig = {
  itemDifficulty(item) {
    const dissonance = DISSONANCE[item.interval.semi] || 0.5;
    const fretFactor = item.ref.fret / 15;
    const accidental = !NT_NATURAL.includes(item.ref.note) ? 1 : 0;
    return clamp(dissonance * 0.7 + fretFactor * 0.15 + accidental * 0.15, 0, 1);
  },

  itemKey(item) {
    return item.ref.note + '_' + item.interval.abbr;
  },

  itemClusters(item) {
    const clusters = [
      'intv_' + item.interval.abbr,
      'str_' + item.ref.str,
      'root_' + item.ref.note,
      item.interval.semi <= 4 ? 'size_small' : item.interval.semi <= 8 ? 'size_med' : 'size_large',
      landmarkZone(item.ref.fret)
    ];
    if (LANDMARKS.includes(item.ref.fret)) clusters.push('landmark');
    return clusters;
  },

  globalClusters(item) {
    return ['global_note_' + item.ref.note, 'global_zone_' + landmarkZone(item.ref.fret)];
  },

  itemFromKey(key) {
    const [rootNote, abbr] = key.split('_');
    const intv = INTERVALS.find(i => i.abbr === abbr);
    for (let s = 0; s < 6; s++) {
      const frets = fretForNote(s, rootNote, 24);
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
    const targetNote = NOTES[(NOTES.indexOf(rootNote) + intv.semi) % 12];
    return {
      ref: { note: rootNote, str: 0, fret: 0, midi: BASE_MIDI[0] },
      interval: intv,
      targetNote
    };
  },

  genRandom(lastItem) {
    const intv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
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

    if (cands.length === 0) return this.genRandom(lastItem);

    let pool = cands;
    if (lastItem && cands.length > 6) {
      const filtered = cands.filter(c => !(c.note === lastItem.ref.note && c.str === lastItem.ref.str));
      if (filtered.length > 0) pool = filtered;
    }

    const ref = pool[Math.floor(Math.random() * pool.length)];
    const targetNote = NOTES[(NOTES.indexOf(ref.note) + intv.semi) % 12];
    return { ref, interval: intv, targetNote };
  },

  genFromCluster(clusterId, lastItem) {
    if (clusterId.startsWith('intv_')) {
      const abbr = clusterId.slice(5);
      const intv = INTERVALS.find(i => i.abbr === abbr);
      if (intv) {
        const cands = [];
        for (let s = 0; s < 6; s++) {
          for (let f = 0; f <= 15; f++) {
            const n = noteAt(s, f);
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
      const intv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
      const cands = [];
      for (let f = 0; f <= 15; f++) {
        const n = noteAt(str, f);
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
      const intv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
      const cands = [];
      for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= 15; f++) {
          if (noteAt(s, f) !== rootNote) continue;
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

      const allowed = INTERVALS.filter(filter);
      if (allowed.length > 0) {
        const intv = allowed[Math.floor(Math.random() * allowed.length)];
        const cands = [];
        for (let s = 0; s < 6; s++) {
          for (let f = 0; f <= 15; f++) {
            const n = noteAt(s, f);
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

    if (clusterId.startsWith('zone_')) {
      const intv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
      const cands = [];
      for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= 15; f++) {
          if (landmarkZone(f) !== clusterId) continue;
          const n = noteAt(s, f);
          cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
        }
      }
      if (cands.length > 0) {
        const ref = cands[Math.floor(Math.random() * cands.length)];
        const targetNote = NOTES[(NOTES.indexOf(ref.note) + intv.semi) % 12];
        return { ref, interval: intv, targetNote };
      }
    }

    if (clusterId === 'landmark') {
      const intv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
      const cands = [];
      for (let s = 0; s < 6; s++) {
        for (const f of LANDMARKS) {
          if (f > 15) continue;
          const n = noteAt(s, f);
          cands.push({ note: n, str: s, fret: f, midi: BASE_MIDI[s] + f });
        }
      }
      if (cands.length > 0) {
        const ref = cands[Math.floor(Math.random() * cands.length)];
        const targetNote = NOTES[(NOTES.indexOf(ref.note) + intv.semi) % 12];
        return { ref, interval: intv, targetNote };
      }
    }

    return this.genRandom(lastItem);
  },

  microDrill(failedItem) {
    const ref = failedItem.ref;
    const failedSemi = failedItem.interval.semi;

    const easySemi = failedSemi === 7 ? 12 : 7;
    const easyIntv = INTERVALS.find(i => i.semi === easySemi);
    const easyTarget = NOTES[(NOTES.indexOf(ref.note) + easySemi) % 12];
    const drill1 = {
      ref: { ...ref },
      interval: easyIntv,
      targetNote: easyTarget
    };

    const lmFret = nearestLandmark(ref.fret);
    const lmStrings = [];
    for (let s = 0; s < 6; s++) {
      const n = noteAt(s, lmFret);
      const tn = NOTES[(NOTES.indexOf(n) + failedSemi) % 12];
      lmStrings.push({
        ref: { note: n, str: s, fret: lmFret, midi: BASE_MIDI[s] + lmFret },
        interval: failedItem.interval,
        targetNote: tn
      });
    }
    const drill2 = lmStrings[Math.floor(Math.random() * lmStrings.length)];

    return [drill1, drill2];
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('intv_')) {
      const currentSemi = item.interval.semi;
      const allowed = INTERVALS.filter(i => i.semi > currentSemi);
      if (allowed.length > 0) {
        const nextIntv = allowed[0];
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
      const intv = item.interval;
      const cands = [];
      for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= 15; f++) {
          const n = noteAt(s, f);
          if (n === item.ref.note) continue;
          const tn = NOTES[(NOTES.indexOf(n) + intv.semi) % 12];
          cands.push({
            ref: { note: n, str: s, fret: f, midi: BASE_MIDI[s] + f },
            interval: intv,
            targetNote: tn
          });
        }
      }
      if (cands.length > 0) return [cands[Math.floor(Math.random() * cands.length)]];
      return [];
    }

    if (weakCluster.startsWith('zone_')) {
      const zoneToLandmark = { zone_0: 0, zone_3: 3, zone_5: 5, zone_7: 7, zone_9: 9, zone_12: 12 };
      const lmFret = zoneToLandmark[weakCluster];
      if (lmFret !== undefined && lmFret <= 15) {
        const intv = item.interval;
        const n = noteAt(item.ref.str, lmFret);
        const tn = NOTES[(NOTES.indexOf(n) + intv.semi) % 12];
        return [{
          ref: { note: n, str: item.ref.str, fret: lmFret, midi: BASE_MIDI[item.ref.str] + lmFret },
          interval: intv,
          targetNote: tn
        }];
      }
      return [];
    }

    return [];
  }
};
