/**
 * Onset detection via spectral flux + IOI tracking.
 */

/**
 * Compute spectral flux (half-wave rectified spectral difference).
 * @param {Float32Array} current - Current magnitude spectrum
 * @param {Float32Array} previous - Previous magnitude spectrum
 * @returns {number} - Spectral flux value (>= 0)
 */
export function spectralFlux(current, previous) {
  if (!previous || current.length !== previous.length) return 0;
  let flux = 0;
  for (let i = 0; i < current.length; i++) {
    const diff = current[i] - previous[i];
    if (diff > 0) flux += diff; // half-wave rectified
  }
  return flux;
}

/**
 * Onset detector using spectral flux with adaptive threshold.
 */
export class OnsetDetector {
  /**
   * @param {object} opts
   * @param {number} opts.medianWindow - Median filter window size (default 7)
   * @param {number} opts.minOnsetInterval - Minimum ms between onsets (default 50)
   * @param {number} opts.thresholdMultiplier - Multiplier above median for threshold (default 1.5)
   */
  constructor(opts = {}) {
    this._medianWindow = opts.medianWindow ?? 7;
    this._minInterval = opts.minOnsetInterval ?? 50;
    this._thresholdMult = opts.thresholdMultiplier ?? 1.5;
    this._fluxHistory = [];
    this._lastOnsetTime = 0;
  }

  /**
   * Process a spectral flux value and detect onset.
   * @param {number} flux - Spectral flux value
   * @param {number} timeMs - Current time in ms
   * @returns {{ strength: number, timeMs: number } | null}
   */
  detect(flux, timeMs) {
    this._fluxHistory.push(flux);
    if (this._fluxHistory.length > this._medianWindow) {
      this._fluxHistory.shift();
    }

    if (this._fluxHistory.length < this._medianWindow) return null;

    // Adaptive threshold: median of recent flux * multiplier
    const sorted = [...this._fluxHistory].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const threshold = median * this._thresholdMult;

    // Peak picking: flux exceeds threshold and min interval passed
    if (flux > threshold && flux > 0 && (timeMs - this._lastOnsetTime) >= this._minInterval) {
      this._lastOnsetTime = timeMs;
      return { strength: flux, timeMs };
    }

    return null;
  }

  reset() {
    this._fluxHistory = [];
    this._lastOnsetTime = 0;
  }
}

/**
 * Inter-Onset Interval tracker for rhythm analysis.
 */
export class IOITracker {
  /**
   * @param {number} maxOnsets - Maximum onset buffer size (default 32)
   */
  constructor(maxOnsets = 32) {
    this._maxOnsets = maxOnsets;
    this._onsets = [];
  }

  /**
   * Record an onset time.
   * @param {number} timeMs - Onset time in ms
   */
  addOnset(timeMs) {
    this._onsets.push(timeMs);
    if (this._onsets.length > this._maxOnsets) this._onsets.shift();
  }

  /**
   * Get inter-onset intervals in ms.
   * @returns {number[]}
   */
  getIOIs() {
    const iois = [];
    for (let i = 1; i < this._onsets.length; i++) {
      iois.push(this._onsets[i] - this._onsets[i - 1]);
    }
    return iois;
  }

  /**
   * Estimate tempo in BPM from median IOI.
   * @returns {number | null} - Estimated BPM or null if insufficient data
   */
  estimateTempo() {
    const iois = this.getIOIs();
    if (iois.length < 2) return null;
    const sorted = [...iois].sort((a, b) => a - b);
    const medianIOI = sorted[Math.floor(sorted.length / 2)];
    if (medianIOI <= 0) return null;
    return Math.round(60000 / medianIOI);
  }

  /**
   * Match recorded onsets against a target pattern.
   * @param {number[]} targetPattern - Expected onset times relative to first onset (ms)
   * @param {number} toleranceMs - Timing tolerance in ms (default 75)
   * @returns {{ score: number, errors: number[], avgErrorMs: number } | null}
   */
  matchPattern(targetPattern, toleranceMs = 75) {
    if (this._onsets.length < targetPattern.length) return null;

    // Use the most recent onsets matching pattern length
    const recent = this._onsets.slice(-targetPattern.length);
    const baseTime = recent[0];
    const errors = [];

    for (let i = 0; i < targetPattern.length; i++) {
      const expected = baseTime + targetPattern[i];
      const actual = recent[i];
      errors.push(actual - expected);
    }

    const absErrors = errors.map(Math.abs);
    const avgError = absErrors.reduce((a, b) => a + b, 0) / absErrors.length;
    const withinTolerance = absErrors.filter(e => e <= toleranceMs).length;
    const score = withinTolerance / targetPattern.length;

    return { score: Math.round(score * 100) / 100, errors, avgErrorMs: Math.round(avgError) };
  }

  get onsetCount() { return this._onsets.length; }

  reset() {
    this._onsets = [];
  }
}
