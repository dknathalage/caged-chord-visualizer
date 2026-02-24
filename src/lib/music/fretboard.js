import { NOTES, TUNINGS, A4 } from '$lib/constants/music.js';

export const NT_NATURAL = ['C','D','E','F','G','A','B'];
export const NT_TUNING = TUNINGS.std.tuning;
export const NT_STR_NAMES = TUNINGS.std.stringNames;
export const BASE_MIDI = [40, 45, 50, 55, 59, 64];

export function noteAt(s, f) { return NOTES[(NT_TUNING[s] + f) % 12]; }

export function fretForNote(s, n, max) {
  const b = NT_TUNING[s], ni = NOTES.indexOf(n), r = [];
  for (let f = 0; f <= max; f++) if ((b + f) % 12 === ni) r.push(f);
  return r;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- Fretboard layout config — change these to resize everything ----
export const FB = {
  FRETS: 7,    // number of frets visible (window around target)
  FW:    58,   // fret width  (viewBox units)
  SH:    36,   // string spacing (viewBox units)
  DOT:   16,   // note dot radius
};

// Derived viewBox dimensions (use for placeholder SVGs etc.)
export function fbDims() {
  const { FRETS, FW, SH, DOT } = FB;
  const MG = DOT * 2.5;
  const W = Math.ceil(MG + FRETS * FW + MG * 0.5);
  const H = Math.ceil(DOT * 1.8 + 6 * SH + DOT * 1.5);
  return { W, H };
}

// Shared fretboard renderer — draws board structure, calls dotsFn for note markers
export function drawBoard(sf, dotsFn) {
  const { FRETS, FW, SH, DOT } = FB;
  const MG  = DOT * 2.5;
  const FL  = MG, FR = FL + FRETS * FW;
  const TOP = DOT * 1.8;
  const W   = Math.ceil(FR + MG * 0.5);
  const H   = Math.ceil(TOP + 6 * SH + DOT * 1.5);
  const isOpen = sf === 0;
  const NW  = Math.max(4, DOT * 0.35);

  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect x="${FL - NW}" y="${TOP}" width="${FR - FL + 2 * NW}" height="${6 * SH}" rx="${NW}" fill="#1a1a2e"/>`;

  for (let i = 0; i <= FRETS; i++) {
    const x = FL + i * FW;
    s += i === 0 && isOpen
      ? `<rect x="${x - NW/2}" y="${TOP}" width="${NW}" height="${6 * SH}" rx="${NW/2}" fill="#ddd"/>`
      : `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + 6 * SH}" stroke="#333" stroke-width="${Math.max(1, FW * 0.035)}"/>`;
  }

  for (let i = 0; i < 6; i++) {
    const ri = 5 - i, y = TOP + i * SH + SH / 2;
    s += `<line x1="${FL}" y1="${y}" x2="${FR}" y2="${y}" stroke="#444" stroke-width="${SH * 0.075 - ri * SH * 0.009}"/>`;
    s += `<text x="${MG * 0.4}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="#444" font-size="${DOT}" font-family="JetBrains Mono">${NT_STR_NAMES[ri]}</text>`;
  }

  for (let i = 0; i < FRETS; i++) {
    const x = FL + i * FW + FW / 2;
    s += `<text x="${x}" y="${TOP + 6 * SH + DOT * 1.1}" text-anchor="middle" fill="#444" font-size="${DOT * 0.85}" font-family="JetBrains Mono">${sf + i + 1}</text>`;
  }

  const inlays = [3, 5, 7, 9, 15, 17, 19, 21];
  const IR = Math.max(2, DOT * 0.2);
  for (let i = 0; i < FRETS; i++) {
    const fn = sf + i + 1, x = FL + i * FW + FW / 2;
    if (inlays.includes(fn)) s += `<circle cx="${x}" cy="${TOP - IR * 2.5}" r="${IR}" fill="#333"/>`;
    if (fn === 12) {
      s += `<circle cx="${x - IR * 2}" cy="${TOP - IR * 2.5}" r="${IR}" fill="#333"/>`;
      s += `<circle cx="${x + IR * 2}" cy="${TOP - IR * 2.5}" r="${IR}" fill="#333"/>`;
    }
  }

  s += dotsFn({ FL, TOP, SH, FW, DOT, sf, FRETS });
  s += `</svg>`;
  return s;
}

// Compute start-fret for a sliding window centered on a target fret
function _sf(targetFret) {
  let sf = Math.max(0, targetFret - Math.floor(FB.FRETS / 2));
  if (sf + FB.FRETS > 22) sf = Math.max(0, 22 - FB.FRETS);
  return sf;
}

export function renderFB(target, detected, isCorrect) {
  return drawBoard(_sf(target.fret), ({ FL, TOP, SH, FW, DOT, sf, FRETS }) => {
    const tfr = target.fret - sf;
    if (tfr < 0 || tfr > FRETS) return '';
    const cy = TOP + (5 - target.str) * SH + SH / 2;
    const cx = target.fret === 0 ? FL + DOT * 0.2 : FL + (tfr - 1) * FW + FW / 2;
    const col = isCorrect ? '#4ECB71' : '#58A6FF';
    const fs = target.note.length > 1 ? DOT * 0.8 : DOT;
    let d = '';
    d += `<circle cx="${cx}" cy="${cy}" r="${DOT * 1.3}" fill="${col}" opacity=".15"/>`;
    d += `<circle cx="${cx}" cy="${cy}" r="${DOT}" fill="${col}"/>`;
    d += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${fs}" font-weight="bold" font-family="JetBrains Mono">${target.note}</text>`;
    return d;
  });
}

export function fbMiniBoard(str, fret) {
  return drawBoard(_sf(fret), ({ FL, TOP, SH, FW, DOT, sf, FRETS }) => {
    const tfr = fret - sf;
    if (tfr < 0 || tfr > FRETS) return '';
    const cy = TOP + (5 - str) * SH + SH / 2;
    const cx = fret === 0 ? FL + DOT * 0.2 : FL + (tfr - 1) * FW + FW / 2;
    let d = '';
    d += `<circle cx="${cx}" cy="${cy}" r="${DOT * 1.1}" fill="#C084FC" opacity=".15"/>`;
    d += `<circle cx="${cx}" cy="${cy}" r="${DOT * 0.8}" fill="#C084FC"/>`;
    d += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${DOT}" font-weight="bold" font-family="JetBrains Mono">?</text>`;
    return d;
  });
}

export function scaleSequence(ri, iv, startFret, maxFret) {
  const end = Math.min(startFret + 4, maxFret);
  const seq = [];
  for (let s = 0; s < 6; s++) {
    for (let f = startFret; f <= end; f++) {
      const noteIdx = (NT_TUNING[s] + f) % 12;
      const interval = ((noteIdx - ri) % 12 + 12) % 12;
      if (iv.includes(interval)) {
        seq.push({ note: NOTES[noteIdx], str: s, fret: f, midi: BASE_MIDI[s] + f });
      }
    }
  }
  seq.sort((a, b) => a.midi - b.midi);
  return seq;
}
