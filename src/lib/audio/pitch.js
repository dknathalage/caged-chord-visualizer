import { A4, NOTES } from '$lib/constants/music.js';
import { DEFAULTS } from '../learning/defaults.js';

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

/** High-pass pre-emphasis filter. Returns a new buffer (does not mutate input). */
export function preEmphasis(frame, alpha = 0.97) {
  const out = new Float32Array(frame.length);
  out[0] = frame[0];
  // Backward-iterate to avoid overwrite issues
  for (let n = frame.length - 1; n >= 1; n--) {
    out[n] = frame[n] - alpha * frame[n - 1];
  }
  return out;
}

/** Maps RMS to an adaptive YIN threshold in [conservative, aggressive] range. */
export function adaptiveYinThreshold(rmsValue, rmsThreshold) {
  const range = DEFAULTS.audio.yinThresholdRange;
  const conservative = range[0]; // 0.20
  const aggressive = range[1];   // 0.10

  if (rmsValue <= rmsThreshold) return conservative;

  // Map rmsValue from [rmsThreshold, rmsThreshold*10] to [conservative, aggressive]
  // At rmsThreshold -> conservative, at high RMS -> aggressive
  const maxRms = rmsThreshold * 10;
  const t = Math.min(1, Math.max(0, (rmsValue - rmsThreshold) / (maxRms - rmsThreshold)));
  return conservative + t * (aggressive - conservative);
}

/**
 * Multi-candidate YIN pitch detection.
 * Collects all local minima from the CMND, keeps top K, applies transition cost penalties.
 * Returns { hz, confidence } or null.
 */
export function yinMultiCandidate(buf, sr, params, prevFreq = null, K = 5) {
  const yinThreshold = params?.audio?.yinThreshold ?? DEFAULTS.audio.yinThreshold;
  const confidenceThreshold = params?.audio?.confidenceThreshold ?? DEFAULTS.audio.confidenceThreshold;

  const halfLen = Math.floor(buf.length / 2);
  if (halfLen < 3) return null;

  // Difference function and CMND
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

  // Collect candidates using dip-and-trough strategy (matches original YIN logic).
  // Walk tau from 2 upward. When CMND drops below threshold, follow it to the
  // local trough, record that trough as a candidate, then skip ahead until CMND
  // rises above threshold again before looking for the next dip.
  // Cap search at reasonable guitar range — minimum ~60 Hz.
  const maxTau = Math.min(halfLen - 1, Math.floor(sr / 60));
  const candidates = [];
  let tau = 2;
  while (tau <= maxTau) {
    if (d[tau] < yinThreshold) {
      // Follow to trough
      while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
      candidates.push({ tau, cmnd: d[tau] });
      // Skip past this dip
      tau++;
      while (tau <= maxTau && d[tau] < yinThreshold) tau++;
    } else {
      tau++;
    }
  }

  if (candidates.length === 0) return null;

  // The first candidate (lowest tau / highest freq) is the standard YIN pick.
  // Sub-harmonic dips at integer multiples of the period have artificially low
  // CMND values due to normalization, so we cannot rank by raw CMND alone.
  // Instead, the first candidate gets a bonus. Other candidates can only win
  // if transition cost (from prevFreq) tips the balance.
  const SUBHARMONIC_PENALTY = 0.30;

  // Keep top K by CMND among all candidates
  const sorted = candidates.slice().sort((a, b) => a.cmnd - b.cmnd);
  const topK = sorted.slice(0, K);
  // Always include the first (lowest-tau) candidate
  if (!topK.find(c => c.tau === candidates[0].tau)) {
    topK.push(candidates[0]);
  }

  let best = null;
  let bestScore = Infinity;

  for (const cand of topK) {
    const { tau: cTau, cmnd } = cand;
    // Parabolic interpolation for better tau estimate
    const s0 = cTau > 0 ? d[cTau - 1] : d[cTau];
    const s1 = d[cTau];
    const s2 = cTau + 1 < halfLen ? d[cTau + 1] : d[cTau];
    const denom = 2 * (s0 - 2 * s1 + s2);
    const betterTau = denom === 0 ? cTau : cTau + (s0 - s2) / denom;
    const hz = sr / betterTau;
    const confidence = 1 - cmnd;

    if (confidence < confidenceThreshold) continue;

    // Score: base CMND plus sub-harmonic penalty for non-first candidates.
    let score = cmnd;
    if (cTau !== candidates[0].tau) {
      score += SUBHARMONIC_PENALTY;
    }

    // Transition cost penalty
    if (prevFreq != null && prevFreq > 0) {
      const semiDist = Math.abs(12 * Math.log2(hz / prevFreq));
      if (semiDist > 10) {
        score += 0.3;
      } else if (semiDist > 6) {
        score += 0.15;
      }
    }

    if (score < bestScore) {
      bestScore = score;
      best = { hz, confidence };
    }
  }

  return best;
}

/** Original YIN detect — backward compatible, delegates to yinMultiCandidate internally. */
export function yinDetect(buf, sampleRate, params) {
  const result = yinMultiCandidate(buf, sampleRate, params);
  return result ? result.hz : null;
}

export function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
