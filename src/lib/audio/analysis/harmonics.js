/**
 * Harmonic correction for wound string octave-up errors.
 * After YIN finds a frequency, checks if the sub-octave (freq/2) has a
 * stronger autocorrelation. Wound strings (E2, A2, D3) produce strong
 * harmonics that can fool YIN into detecting the octave above.
 *
 * @param {number} hz - Detected frequency from YIN
 * @param {Float32Array} buffer - Audio buffer used for detection
 * @param {number} sampleRate - Audio sample rate
 * @returns {number} - Corrected frequency (hz or hz/2)
 */
export function harmonicCorrect(hz, buffer, sampleRate) {
  // Only apply when detected freq > 160Hz and sub-octave > FREQ_MIN (50Hz)
  if (hz <= 160 || hz / 2 < 50) return hz;

  const halfLen = Math.floor(buffer.length / 2);
  const tauOriginal = Math.round(sampleRate / hz);
  const tauSubOctave = tauOriginal * 2; // corresponds to freq/2

  if (tauSubOctave >= halfLen) return hz;

  // Compute CMND at both tau values
  const cmndOriginal = computeCMND(buffer, tauOriginal, halfLen);
  const cmndSubOctave = computeCMND(buffer, tauSubOctave, halfLen);

  // If sub-octave has CMND < 85% of original tau's CMND, the fundamental is likely freq/2
  if (cmndSubOctave < cmndOriginal * 0.85) {
    return hz / 2;
  }

  return hz;
}

function computeCMND(buffer, tau, halfLen) {
  // Difference function value at tau
  let sum = 0;
  for (let i = 0; i < halfLen; i++) {
    const v = buffer[i] - buffer[i + tau];
    sum += v * v;
  }
  // Cumulative mean normalized difference
  let running = 0;
  for (let t = 1; t <= tau; t++) {
    let s = 0;
    for (let i = 0; i < halfLen; i++) {
      const v = buffer[i] - buffer[i + t];
      s += v * v;
    }
    running += s;
  }
  return running === 0 ? 1 : sum * tau / running;
}
