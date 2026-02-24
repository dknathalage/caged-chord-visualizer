import { A4, NOTES } from '$lib/constants/music.js';

export function semiToFreq(semi) {
  return A4 * Math.pow(2, semi / 12);
}

export function freqToNote(hz) {
  const semi = 12 * Math.log2(hz / A4);
  const rounded = Math.round(semi);
  const cents = Math.round((semi - rounded) * 100);
  const idx = ((rounded % 12) + 12 + 9) % 12;
  return {note: NOTES[idx], cents, semi: rounded};
}

export function yinDetect(buf, sampleRate) {
  const halfLen = Math.floor(buf.length / 2);
  const d = new Float32Array(halfLen);
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
  const s0 = tau > 0 ? d[tau - 1] : d[tau];
  const s1 = d[tau];
  const s2 = tau + 1 < halfLen ? d[tau + 1] : d[tau];
  const betterTau = tau + (s0 - s2) / (2 * (s0 - 2 * s1 + s2));
  const confidence = 1 - d[tau];
  if (confidence < 0.85) return null;
  return sampleRate / betterTau;
}

export function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
