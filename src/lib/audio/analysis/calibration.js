/**
 * Noise floor calibration. Collects RMS frames during startup,
 * computes P95 noise floor, sets threshold above it.
 */
export class NoiseCalibrator {
  /**
   * @param {object} params - { targetFrames: 100, safetyMultiplier: 1.5 }
   */
  constructor(params = {}) {
    this._targetFrames = params.targetFrames ?? 100;
    this._safetyMultiplier = params.safetyMultiplier ?? 1.5;
    this._rmsFrames = [];
    this._calibrated = false;
    this._noiseFloor = 0;
    this._rmsThreshold = 0;
  }

  get calibrated() { return this._calibrated; }
  get noiseFloor() { return this._noiseFloor; }
  get rmsThreshold() { return this._rmsThreshold; }

  /**
   * Add an RMS frame. Returns calibration result when done, null otherwise.
   * @param {number} rmsValue - RMS energy of current frame
   * @returns {{ noiseFloor: number, rmsThreshold: number } | null}
   */
  addFrame(rmsValue) {
    if (this._calibrated) return null;
    this._rmsFrames.push(rmsValue);

    if (this._rmsFrames.length >= this._targetFrames) {
      this._compute();
      return { noiseFloor: this._noiseFloor, rmsThreshold: this._rmsThreshold };
    }
    return null;
  }

  _compute() {
    const sorted = [...this._rmsFrames].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    this._noiseFloor = sorted[p95Index] || sorted[sorted.length - 1];
    this._rmsThreshold = this._noiseFloor * this._safetyMultiplier;
    this._calibrated = true;
  }

  reset() {
    this._rmsFrames = [];
    this._calibrated = false;
    this._noiseFloor = 0;
    this._rmsThreshold = 0;
  }
}
