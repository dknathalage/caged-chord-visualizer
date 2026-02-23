// ═══════════════════════════════════════════════════
// Shared — Constants + Pitch Utilities
// ═══════════════════════════════════════════════════

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const A4 = 440;

const TUNINGS = {
  std:      { id:'std',      name:'Standard',        label:'EADGBE',    tuning:[4,9,2,7,11,4], stringNames:['E','A','D','G','B','e'] },
  halfDown: { id:'halfDown', name:'Half Step Down',   label:'E\u266dA\u266dD\u266dG\u266dB\u266de\u266d', tuning:[3,8,1,6,10,3], stringNames:['E\u266d','A\u266d','D\u266d','G\u266d','B\u266d','e\u266d'] },
  dropD:    { id:'dropD',    name:'Drop D',           label:'DADGBE',    tuning:[2,9,2,7,11,4], stringNames:['D','A','D','G','B','e'] },
  openG:    { id:'openG',    name:'Open G',           label:'DGDGBD',    tuning:[2,7,2,7,11,2], stringNames:['D','G','D','G','B','D'] },
  openD:    { id:'openD',    name:'Open D',           label:'DADF#AD',   tuning:[2,9,2,6,9,2],  stringNames:['D','A','D','F#','A','D'] },
  dadgad:   { id:'dadgad',   name:'DADGAD',           label:'DADGAD',    tuning:[2,9,2,7,9,2],  stringNames:['D','A','D','G','A','D'] }
};

// Semitone offset from A4 → frequency in Hz
function semiToFreq(semi) {
  return A4 * Math.pow(2, semi / 12);
}

// Frequency → {note, cents, semi}
function freqToNote(hz) {
  const semi = 12 * Math.log2(hz / A4);
  const rounded = Math.round(semi);
  const cents = Math.round((semi - rounded) * 100);
  const idx = ((rounded % 12) + 12 + 9) % 12; // A=9 in our array
  return {note: NOTES[idx], cents, semi: rounded};
}

// YIN Pitch Detection
function yinDetect(buf, sampleRate) {
  const halfLen = Math.floor(buf.length / 2);
  const d = new Float32Array(halfLen);

  // Step 1+2: squared difference + cumulative mean normalized
  d[0] = 1;
  let runSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
    runSum += sum;
    d[tau] = runSum === 0 ? 1 : d[tau] * tau / runSum;
  }

  // Step 3: absolute threshold (0.15 = permissive enough for low strings)
  const threshold = 0.15;
  let tau = 2;
  while (tau < halfLen) {
    if (d[tau] < threshold) {
      while (tau + 1 < halfLen && d[tau + 1] < d[tau]) tau++;
      break;
    }
    tau++;
  }
  if (tau === halfLen) return null;

  // Step 4: parabolic interpolation
  const s0 = tau > 0 ? d[tau - 1] : d[tau];
  const s1 = d[tau];
  const s2 = tau + 1 < halfLen ? d[tau + 1] : d[tau];
  const betterTau = tau + (s0 - s2) / (2 * (s0 - 2 * s1 + s2));

  const confidence = 1 - d[tau];
  if (confidence < 0.70) return null;

  return sampleRate / betterTau;
}

// RMS silence gate
function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
