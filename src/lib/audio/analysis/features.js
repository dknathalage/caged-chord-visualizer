/**
 * Audio feature extraction utilities.
 * All functions are pure — no side effects.
 */

/**
 * Convert linear RMS to dBFS (decibels relative to full scale).
 * @param {number} rmsLinear - RMS value in [0, 1]
 * @returns {number} dBFS value (negative, 0 = full scale)
 */
export function rmsToDb(rmsLinear) {
  if (rmsLinear <= 0) return -Infinity;
  return 20 * Math.log10(rmsLinear);
}

/**
 * Detect articulation type from frequency trajectory.
 * @param {number[]} freqHistory - Array of recent Hz values (last ~20 frames)
 * @param {number} nominalHz - Expected frequency of the detected note
 * @returns {{ vibrato: boolean, vibratoRate: number, bend: boolean, bendCents: number, stable: boolean }}
 */
export function detectArticulation(freqHistory, nominalHz) {
  if (!freqHistory || freqHistory.length < 5 || !nominalHz) {
    return { vibrato: false, vibratoRate: 0, bend: false, bendCents: 0, stable: true };
  }

  // Convert to cents deviation from nominal
  const centsDev = freqHistory.map(hz => 1200 * Math.log2(hz / nominalHz));

  // Vibrato: zero-crossing rate of cents deviation in ~4-8Hz range
  // At ~100 frames/sec (hop=512 at 48kHz), 4-8Hz vibrato = period of ~12-25 frames
  let zeroCrossings = 0;
  const mean = centsDev.reduce((a, b) => a + b, 0) / centsDev.length;
  const centered = centsDev.map(c => c - mean);
  for (let i = 1; i < centered.length; i++) {
    if ((centered[i] > 0 && centered[i - 1] <= 0) || (centered[i] < 0 && centered[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }
  // Approximate rate: zeroCrossings / (2 * duration_in_seconds)
  // Each frame is ~10ms (hop=512 at 48kHz)
  const durationSec = freqHistory.length * 0.01;
  const vibratoRate = zeroCrossings / (2 * durationSec);
  const vibrato = vibratoRate >= 4 && vibratoRate <= 8 && Math.max(...centsDev.map(Math.abs)) > 10;

  // Bend: monotonic cents deviation > 30 cents
  let monotonic = true;
  let direction = 0;
  for (let i = 1; i < centsDev.length; i++) {
    const diff = centsDev[i] - centsDev[i - 1];
    if (direction === 0) {
      direction = Math.sign(diff);
    } else if (Math.sign(diff) !== 0 && Math.sign(diff) !== direction) {
      monotonic = false;
      break;
    }
  }
  const totalBend = centsDev[centsDev.length - 1] - centsDev[0];
  const bend = monotonic && Math.abs(totalBend) > 30;
  const bendCents = bend ? Math.round(totalBend) : 0;

  // Stable: std(cents) < 10
  const centsStd = std(centsDev);
  const stable = centsStd < 10;

  return { vibrato, vibratoRate: Math.round(vibratoRate * 10) / 10, bend, bendCents, stable };
}

/**
 * Compute intonation statistics from a buffer of cents values.
 * @param {number[]} centsHistory - Array of cents deviation values
 * @returns {{ avgCents: number, stdCents: number, timeToStable: number, oscillations: number }}
 */
export function intonationStats(centsHistory) {
  if (!centsHistory || centsHistory.length === 0) {
    return { avgCents: 0, stdCents: 0, timeToStable: 0, oscillations: 0 };
  }

  const avgCents = Math.round(centsHistory.reduce((a, b) => a + b, 0) / centsHistory.length);
  const stdCents = Math.round(std(centsHistory) * 10) / 10;

  // Time to stable: index where cents first stays within +/-10 for 3+ consecutive frames
  let timeToStable = centsHistory.length;
  for (let i = 0; i < centsHistory.length - 2; i++) {
    if (Math.abs(centsHistory[i]) < 10 && Math.abs(centsHistory[i + 1]) < 10 && Math.abs(centsHistory[i + 2]) < 10) {
      timeToStable = i;
      break;
    }
  }

  // Oscillations: count direction changes
  let oscillations = 0;
  for (let i = 2; i < centsHistory.length; i++) {
    const prev = centsHistory[i - 1] - centsHistory[i - 2];
    const curr = centsHistory[i] - centsHistory[i - 1];
    if (prev * curr < 0) oscillations++;
  }

  return { avgCents, stdCents, timeToStable, oscillations };
}

function std(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}
