/**
 * Multi-candidate harmonic correction.
 * After YIN finds a frequency, checks sub-octave (freq/2), super-octave (freq*2),
 * and 3rd harmonic (freq/3) candidates. Scores each by CMND value and returns
 * the best correction that passes its threshold, or the original frequency.
 *
 * Guitar fundamentals are usually the lowest partial, so sub-octave and 3rd
 * harmonic corrections are preferred (threshold 0.80) over super-octave (0.55).
 *
 * @param {number} hz - Detected frequency from YIN
 * @param {Float32Array} buffer - Audio buffer used for detection
 * @param {number} sampleRate - Audio sample rate
 * @returns {number} - Corrected frequency
 */

const FREQ_MIN = 50;
const FREQ_MAX = 1400;

export function harmonicCorrect(hz, buffer, sampleRate) {
  if (hz < FREQ_MIN || hz > FREQ_MAX) return hz;

  const halfLen = Math.floor(buffer.length / 2);
  const tauOriginal = Math.round(sampleRate / hz);

  if (tauOriginal >= halfLen || tauOriginal < 1) return hz;

  const cmndOriginal = computeCMND(buffer, tauOriginal, halfLen);

  // If original CMND is already very low, the detected frequency is confident —
  // no correction needed. This prevents false corrections on clean signals where
  // sub-harmonic taus also have near-zero CMND due to perfect periodicity.
  if (cmndOriginal < 0.05) return hz;

  // Candidates: [correctedFreq, tau, threshold]
  // Sub-octave (freq/2): tau * 2, threshold 0.80 — prefer lower fundamental
  // 3rd harmonic (freq/3): tau * 3, threshold 0.80 — prefer lower fundamental
  // Super-octave (freq*2): tau / 2, threshold 0.55 — stricter, less common
  const candidates = [
    { freq: hz / 2, tau: tauOriginal * 2, threshold: 0.80 },
    { freq: hz / 3, tau: tauOriginal * 3, threshold: 0.80 },
    { freq: hz * 2, tau: Math.round(tauOriginal / 2), threshold: 0.55 },
  ];

  let bestFreq = hz;
  let bestCMND = cmndOriginal;

  for (const c of candidates) {
    // Skip if corrected frequency is out of valid range
    if (c.freq < FREQ_MIN || c.freq > FREQ_MAX) continue;
    // Skip if tau is out of usable range
    if (c.tau < 1 || c.tau >= halfLen) continue;

    const cmnd = computeCMND(buffer, c.tau, halfLen);

    // Candidate must beat original by its threshold AND be the best so far
    if (cmnd < cmndOriginal * c.threshold && cmnd < bestCMND) {
      bestFreq = c.freq;
      bestCMND = cmnd;
    }
  }

  return bestFreq;
}

export function computeCMND(buffer, tau, halfLen) {
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
