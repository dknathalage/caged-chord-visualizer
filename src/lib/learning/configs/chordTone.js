import { NOTES, CHORD_TYPES } from '$lib/constants/music.js';
import { NT_NATURAL, noteAt, BASE_MIDI, LANDMARKS, nearestLandmark, landmarkZone } from '$lib/music/fretboard.js';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function mapToneToIdx(toneLbl, ct) {
  for (let i = 0; i < ct.fm.length; i++) {
    const f = ct.fm[i];
    if (f === toneLbl) return i;
    if (toneLbl === '3' && (f === '3' || f === '\u266d3')) return i;
    if (toneLbl === '7' && (f === '7' || f === '\u266d7')) return i;
  }
  return -1;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildItem(root, ct, toneIdx, pos) {
  const ri = NOTES.indexOf(root);
  const semi = ct.iv[toneIdx];
  const targetNote = NOTES[(ri + semi) % 12];
  return { root, ctId: ct.id, toneLabel: ct.fm[toneIdx], targetNote, pos };
}

function candidates(root, ct, toneIdx, maxFret) {
  const ri = NOTES.indexOf(root);
  const semi = ct.iv[toneIdx];
  const targetNote = NOTES[(ri + semi) % 12];
  const cands = [];
  for (let s = 0; s < 6; s++)
    for (let f = 0; f <= maxFret; f++)
      if (noteAt(s, f) === targetNote)
        cands.push({ note: targetNote, str: s, fret: f, midi: BASE_MIDI[s] + f });
  return cands;
}

const CHORD_COMPLEXITY = { maj: 0.1, min: 0.15, '7': 0.4, maj7: 0.4, m7: 0.45, dim: 0.5, aug: 0.5, sus2: 0.3, sus4: 0.3 };
const TONE_COMPLEXITY = { 'R': 0.0, '3': 0.15, '\u266d3': 0.2, '5': 0.1, '\u266d5': 0.3, '#5': 0.3, '7': 0.25, '\u266d7': 0.3, '2': 0.2, '4': 0.2 };

export const chordToneConfig = {
  itemDifficulty(item) {
    const cc = CHORD_COMPLEXITY[item.ctId] || 0.3;
    const tc = TONE_COMPLEXITY[item.toneLabel] || 0.2;
    const fretFactor = item.pos.fret / 15;
    const accidental = !NT_NATURAL.includes(item.root) ? 1 : 0;
    return clamp(cc + tc + fretFactor * 0.1 + accidental * 0.1, 0, 1);
  },

  itemKey(item) {
    return item.root + '_' + item.ctId + '_' + item.toneLabel + '_s' + item.pos.str + 'f' + item.pos.fret;
  },

  itemClusters(item) {
    const clusters = [
      'type_' + item.ctId,
      'tone_' + item.toneLabel,
      'str_' + item.pos.str,
      'note_' + item.targetNote,
      landmarkZone(item.pos.fret)
    ];
    if (LANDMARKS.includes(item.pos.fret)) clusters.push('landmark');
    return clusters;
  },

  globalClusters(item) {
    return ['global_note_' + item.targetNote, 'global_zone_' + landmarkZone(item.pos.fret)];
  },

  itemFromKey(key) {
    const m = key.match(/^(.+?)_(.+?)_(.+?)_s(\d+)f(\d+)$/);
    const root = m[1];
    const ctId = m[2];
    const toneLabel = m[3];
    const str = parseInt(m[4], 10);
    const fret = parseInt(m[5], 10);
    const ct = CHORD_TYPES.find(c => c.id === ctId);
    const ri = NOTES.indexOf(root);
    const toneIdx = ct.fm.indexOf(toneLabel);
    const semi = ct.iv[toneIdx];
    const targetNote = NOTES[(ri + semi) % 12];
    return { root, ctId, toneLabel, targetNote, pos: { note: targetNote, str, fret, midi: BASE_MIDI[str] + fret } };
  },

  genRandom(lastItem) {
    const useLandmark = Math.random() < 0.4;

    for (let attempt = 0; attempt < 50; attempt++) {
      const ct = pick(CHORD_TYPES);
      const root = pick(NOTES);
      const toneIdx = Math.floor(Math.random() * ct.fm.length);

      let cands = candidates(root, ct, toneIdx, 15);
      if (cands.length === 0) continue;

      if (useLandmark) {
        const lmCands = cands.filter(c => LANDMARKS.includes(c.fret));
        if (lmCands.length > 0) cands = lmCands;
      }

      const pos = pick(cands);
      const item = buildItem(root, ct, toneIdx, pos);

      if (lastItem && item.root === lastItem.root && item.ctId === lastItem.ctId && item.toneLabel === lastItem.toneLabel && item.pos.str === lastItem.pos.str) continue;

      return item;
    }

    // Fallback
    const ct = pick(CHORD_TYPES);
    const root = pick(NOTES);
    const toneIdx = 0;
    const cands = candidates(root, ct, toneIdx, 15);
    const pos = cands.length > 0 ? pick(cands) : { note: root, str: 0, fret: 0, midi: BASE_MIDI[0] };
    return buildItem(root, ct, toneIdx, pos);
  },

  genFromCluster(clusterId, lastItem) {
    const cands = [];

    for (const ct of CHORD_TYPES) {
      for (const root of NOTES) {
        for (let ti = 0; ti < ct.fm.length; ti++) {
          const positions = candidates(root, ct, ti, 15);
          for (const pos of positions) {
            let match = false;
            if (clusterId.startsWith('type_')) { match = ct.id === clusterId.slice(5); }
            else if (clusterId.startsWith('tone_')) { match = ct.fm[ti] === clusterId.slice(5); }
            else if (clusterId.startsWith('str_')) { match = pos.str === parseInt(clusterId.slice(4), 10); }
            else if (clusterId.startsWith('note_')) { match = pos.note === clusterId.slice(5); }
            else if (clusterId.startsWith('zone_')) { match = landmarkZone(pos.fret) === clusterId; }
            else if (clusterId === 'landmark') { match = LANDMARKS.includes(pos.fret); }

            if (match) cands.push(buildItem(root, ct, ti, pos));
          }
        }
      }
    }

    if (cands.length === 0) return this.genRandom(lastItem);

    if (lastItem && cands.length > 1) {
      const filtered = cands.filter(c => !(c.root === lastItem.root && c.ctId === lastItem.ctId && c.toneLabel === lastItem.toneLabel && c.pos.str === lastItem.pos.str));
      if (filtered.length > 0) return pick(filtered);
    }
    return pick(cands);
  },

  microDrill(failedItem) {
    const { root, ctId, toneLabel, pos } = failedItem;
    const ct = CHORD_TYPES.find(c => c.id === ctId);
    const toneIdx = ct.fm.indexOf(toneLabel);
    if (toneIdx === -1) return [];

    const s = pos.str;

    const lmFret = nearestLandmark(pos.fret);
    const lmCands = candidates(root, ct, toneIdx, 15).filter(c => c.str === s && c.fret === lmFret);
    let drill1;
    if (lmCands.length > 0) {
      drill1 = buildItem(root, ct, toneIdx, lmCands[0]);
    } else {
      const allCands = candidates(root, ct, toneIdx, 15).filter(c => c.str === s);
      drill1 = allCands.length > 0 ? buildItem(root, ct, toneIdx, pick(allCands)) : failedItem;
    }

    const otherLandmarks = LANDMARKS.filter(l => l !== lmFret && l <= 15);
    let drill2;
    if (otherLandmarks.length > 0) {
      const lm2Fret = otherLandmarks.sort((a, b) => Math.abs(a - pos.fret) - Math.abs(b - pos.fret))[0];
      const lm2Cands = candidates(root, ct, toneIdx, 15).filter(c => c.fret === lm2Fret);
      if (lm2Cands.length > 0) {
        drill2 = buildItem(root, ct, toneIdx, pick(lm2Cands));
      } else {
        const anyCands = candidates(root, ct, toneIdx, 15).filter(c => c.str !== s);
        drill2 = anyCands.length > 0 ? buildItem(root, ct, toneIdx, pick(anyCands)) : failedItem;
      }
    } else {
      drill2 = failedItem;
    }

    return [drill1, drill2];
  },

  pickScaffold(item, weakCluster) {
    if (!weakCluster) return [];

    if (weakCluster.startsWith('type_')) {
      const contrastId = weakCluster.slice(5);
      const contrastCt = CHORD_TYPES.find(c => c.id === contrastId);
      if (!contrastCt || contrastCt.id === item.ctId) return [];
      const toneIdx = Math.floor(Math.random() * contrastCt.fm.length);
      const cands = candidates(item.root, contrastCt, toneIdx, 15);
      if (cands.length > 0) return [buildItem(item.root, contrastCt, toneIdx, pick(cands))];
    }

    if (weakCluster.startsWith('tone_')) {
      const ct = CHORD_TYPES.find(c => c.id === item.ctId);
      if (!ct) return [];
      const otherTones = [];
      for (let i = 0; i < ct.fm.length; i++) {
        if (ct.fm[i] !== item.toneLabel) otherTones.push(i);
      }
      if (otherTones.length === 0) return [];
      const toneIdx = pick(otherTones);
      const cands = candidates(item.root, ct, toneIdx, 15);
      if (cands.length > 0) return [buildItem(item.root, ct, toneIdx, pick(cands))];
    }

    if (weakCluster.startsWith('zone_')) {
      const zoneToLandmark = { zone_0: 0, zone_3: 3, zone_5: 5, zone_7: 7, zone_9: 9, zone_12: 12 };
      const lmFret = zoneToLandmark[weakCluster];
      if (lmFret === undefined || lmFret > 15) return [];
      const ct = CHORD_TYPES.find(c => c.id === item.ctId);
      if (!ct) return [];
      const toneIdx = ct.fm.indexOf(item.toneLabel);
      if (toneIdx === -1) return [];
      const cands = candidates(item.root, ct, toneIdx, 15)
        .filter(c => landmarkZone(c.fret) === weakCluster);
      if (cands.length > 0) return [buildItem(item.root, ct, toneIdx, pick(cands))];
    }

    return [];
  }
};
