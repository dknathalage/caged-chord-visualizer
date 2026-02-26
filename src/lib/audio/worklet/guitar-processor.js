// AudioWorkletProcessor for guitar pitch detection.
// Self-contained — no ES module imports allowed in worklet scope.

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const A4 = 440;
const FREQ_MIN = 50;
const FREQ_MAX = 1400;

const RING_SIZE = 8192;
const HOP_SIZE = 512;
const FRAME_SIZE = 4096;

// Adaptive YIN threshold range [conservative, aggressive]
const YIN_THRESHOLD_CONSERVATIVE = 0.20;
const YIN_THRESHOLD_AGGRESSIVE = 0.10;

// Multi-candidate YIN constants
const MAX_CANDIDATES = 5;
const SUBHARMONIC_PENALTY = 0.30;

// Kalman filter defaults
const KALMAN_Q_PITCH = 0.01;
const KALMAN_Q_VELOCITY = 0.005;
const KALMAN_R_SCALE = 5.0;
const KALMAN_RESET_THRESHOLD = 12; // semitones
const KALMAN_SILENCE_FRAMES = 5;

// Cepstrum constants
const EPSILON = 1e-10;

// --- DSP helpers (inlined from pitch.js) ---

function rms(buf, len) {
  let sum = 0;
  for (let i = 0; i < len; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / len);
}

function freqToNote(hz) {
  const semi = 12 * Math.log2(hz / A4);
  const rounded = Math.round(semi);
  const cents = Math.round((semi - rounded) * 100);
  const idx = ((rounded % 12) + 12 + 9) % 12;
  return { note: NOTES[idx], cents, semi: rounded };
}

function hzToSemi(hz) {
  return 12 * Math.log2(hz / A4);
}

function semiToHz(semi) {
  return A4 * Math.pow(2, semi / 12);
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// --- Processor ---

class GuitarProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ring = new Float32Array(RING_SIZE);
    this._writePos = 0;
    this._hopCount = 0;

    // Configurable thresholds (defaults match DEFAULTS.audio)
    this._yinThreshold = 0.15;
    this._confidenceThreshold = 0.85;
    this._rmsThreshold = 0.01;
    this._sampleRate = sampleRate; // global in worklet scope
    this._harmonicCorrection = true;

    // Feature extraction state
    this._enableFeatures = false;
    this._freqTrajectory = [];

    // Chromagram state
    this._enableChromagram = false;

    // Onset detection state
    this._enableOnset = false;
    this._prevMagnitudes = null;

    // Calibration state
    this._calibrating = false;
    this._calFrames = [];
    this._calTarget = 100;
    this._calMultiplier = 1.5;

    // Multi-candidate YIN state
    this._prevFreq = null;

    // Kalman filter state
    this._enableKalman = true;
    this._kalmanInitialized = false;
    this._kalmanState = [0, 0]; // [pitch_semi, velocity]
    this._kalmanP = [[1, 0], [0, 1]]; // covariance
    this._silenceCount = 0;

    // Cepstrum / ensemble state
    this._enableCepstrum = false;

    // CQT state
    this._useCQT = false;
    this._cqtKernels = null;

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  _handleMessage(data) {
    if (data.type === 'configure') {
      const c = data.config;
      if (c.yinThreshold != null) this._yinThreshold = c.yinThreshold;
      if (c.confidenceThreshold != null) this._confidenceThreshold = c.confidenceThreshold;
      if (c.rmsThreshold != null) this._rmsThreshold = c.rmsThreshold;
      if (c.sampleRate != null) this._sampleRate = c.sampleRate;
      if (c.harmonicCorrection != null) this._harmonicCorrection = c.harmonicCorrection;
      if (c.enableFeatures != null) this._enableFeatures = c.enableFeatures;
      if (c.enableChromagram != null) this._enableChromagram = c.enableChromagram;
      if (c.enableOnset != null) this._enableOnset = c.enableOnset;
      if (c.enableCepstrum != null) this._enableCepstrum = c.enableCepstrum;
      if (c.enableKalman != null) this._enableKalman = c.enableKalman;
      if (c.useCQT != null) {
        this._useCQT = c.useCQT;
        if (c.useCQT && !this._cqtKernels) {
          this._cqtKernels = this._buildCQTKernels(this._sampleRate);
        }
      }
    } else if (data.type === 'calibrate') {
      this._calibrating = true;
      this._calFrames = [];
      this._calTarget = data.targetFrames ?? 100;
      this._calMultiplier = data.safetyMultiplier ?? 1.5;
    }
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    const len = channel.length;

    // Write samples into ring buffer
    for (let i = 0; i < len; i++) {
      this._ring[this._writePos] = channel[i];
      this._writePos = (this._writePos + 1) % RING_SIZE;
      this._hopCount++;
    }

    // Process on each hop boundary
    while (this._hopCount >= HOP_SIZE) {
      this._hopCount -= HOP_SIZE;
      this._analyze();
    }

    return true;
  }

  _analyze() {
    // 1. Extract frame, compute RMS
    const frameStart = (this._writePos - FRAME_SIZE + RING_SIZE) % RING_SIZE;
    const frame = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
      frame[i] = this._ring[(frameStart + i) % RING_SIZE];
    }

    const r = rms(frame, FRAME_SIZE);
    const ts = currentTime;

    // Calibration: collect RMS frames
    if (this._calibrating) {
      this._calFrames.push(r);
      if (this._calFrames.length >= this._calTarget) {
        const sorted = [...this._calFrames].sort((a, b) => a - b);
        const p95 = Math.floor(sorted.length * 0.95);
        const noiseFloor = sorted[p95] || sorted[sorted.length - 1];
        const rmsThreshold = noiseFloor * this._calMultiplier;
        this._rmsThreshold = rmsThreshold;
        this._calibrating = false;
        this._calFrames = [];
        this.port.postMessage({ type: 'calibration', noiseFloor, rmsThreshold });
      }
      return;
    }

    // 2. Silence gate check
    if (r < this._rmsThreshold) {
      if (this._enableFeatures) this._freqTrajectory = [];
      // Kalman silence tracking
      if (this._enableKalman) {
        this._silenceCount++;
        if (this._silenceCount >= KALMAN_SILENCE_FRAMES) {
          this._kalmanReset();
        }
      }
      this._prevFreq = null;
      this.port.postMessage({ type: 'analysis', ts, rms: r, pitch: null });
      return;
    }

    // 3. Pre-emphasis on copy of frame (for YIN only)
    const preEmphasized = this._preEmphasis(frame, 0.97);

    // 4. Kalman predict (if enabled)
    let kalmanPrediction = null;
    if (this._enableKalman && this._kalmanInitialized) {
      kalmanPrediction = this._kalmanPredict();
    }

    // 5. Multi-candidate YIN with adaptive threshold on pre-emphasized frame
    const adaptiveThreshold = this._adaptiveYinThreshold(r, this._rmsThreshold);
    const yinResult = this._yinMultiCandidate(preEmphasized, FRAME_SIZE, this._sampleRate, adaptiveThreshold, this._confidenceThreshold);

    // 6. Multi-candidate harmonic correction
    let correctedHz = null;
    let confidence = 0;
    if (yinResult) {
      correctedHz = yinResult.hz;
      confidence = yinResult.confidence;
      if (this._harmonicCorrection) {
        correctedHz = this._harmonicCorrect(correctedHz, frame, FRAME_SIZE, this._sampleRate);
      }
      this._prevFreq = correctedHz;
    } else {
      this._prevFreq = null;
    }

    // 7. Cepstral pitch (if enabled, on original frame)
    let cepResult = null;
    if (this._enableCepstrum && correctedHz != null) {
      cepResult = this._cepstralPitch(frame, this._sampleRate);
    } else if (this._enableCepstrum && !correctedHz) {
      // Try cepstrum even if YIN failed
      cepResult = this._cepstralPitch(frame, this._sampleRate);
    }

    // 8. Ensemble pitch (if cepstrum enabled)
    let finalResult = null;
    if (this._enableCepstrum) {
      const yinForEnsemble = correctedHz ? { hz: correctedHz, confidence } : null;
      finalResult = this._ensemblePitch(yinForEnsemble, cepResult, kalmanPrediction);
      if (finalResult) {
        correctedHz = finalResult.hz;
        confidence = finalResult.confidence;
      }
    }

    // 9. Kalman update (if enabled)
    if (this._enableKalman) {
      if (correctedHz != null) {
        const measuredSemi = hzToSemi(correctedHz);
        const kalmanResult = this._kalmanUpdate(measuredSemi, confidence);
        // Use Kalman-smoothed pitch
        correctedHz = semiToHz(kalmanResult.semi);
        this._silenceCount = 0;
      } else {
        this._silenceCount++;
        if (this._silenceCount >= KALMAN_SILENCE_FRAMES) {
          this._kalmanReset();
        }
      }
    }

    // 10. Compute magnitudes (original frame, not pre-emphasized)
    // Runs before pitch null-check so chromagram/onset work for polyphonic signals
    let magnitudes = null;
    let chromagram = null;
    let spectralFluxVal = null;

    if (this._enableChromagram || this._enableOnset) {
      magnitudes = this._computeMagnitudes(frame, FRAME_SIZE, this._sampleRate);

      // 11. HPS on magnitudes
      magnitudes = this._harmonicProductSpectrum(magnitudes, 3);

      // 12. Chromagram (FFT or CQT path)
      if (this._enableChromagram) {
        if (this._useCQT && this._cqtKernels) {
          chromagram = this._computeCQTChromagram(frame);
        } else {
          chromagram = this._foldToChromagram(magnitudes, this._sampleRate, FRAME_SIZE);
        }
      }

      // 13. Log-compressed spectral flux
      if (this._enableOnset) {
        if (this._prevMagnitudes) {
          spectralFluxVal = 0;
          for (let i = 0; i < magnitudes.length; i++) {
            const diff = Math.log(1 + 1000 * magnitudes[i]) - Math.log(1 + 1000 * this._prevMagnitudes[i]);
            if (diff > 0) spectralFluxVal += diff;
          }
        }
        this._prevMagnitudes = magnitudes;
      }
    }

    if (!correctedHz) {
      if (this._enableFeatures) this._freqTrajectory = [];
      this.port.postMessage({ type: 'analysis', ts, rms: r, pitch: null, chromagram, spectralFlux: spectralFluxVal });
      return;
    }

    // Feature extraction
    let features = null;
    if (this._enableFeatures) {
      this._freqTrajectory.push(correctedHz);
      if (this._freqTrajectory.length > 20) this._freqTrajectory.shift();

      const centsDelta = this._freqTrajectory.length >= 2
        ? 1200 * Math.log2(this._freqTrajectory[this._freqTrajectory.length - 1] / this._freqTrajectory[this._freqTrajectory.length - 2])
        : 0;

      features = {
        freqTrajectory: [...this._freqTrajectory],
        centsDelta,
        rmsDb: r > 0 ? 20 * Math.log10(r) : -Infinity
      };
    }

    // 14. Post message
    const { note, cents, semi } = freqToNote(correctedHz);
    this.port.postMessage({
      type: 'analysis',
      ts,
      rms: r,
      pitch: { hz: correctedHz, confidence, note, cents, semi },
      features,
      chromagram,
      spectralFlux: spectralFluxVal
    });
  }

  // --- Pre-emphasis (inlined from pitch.js) ---

  _preEmphasis(frame, alpha) {
    const out = new Float32Array(frame.length);
    out[0] = frame[0];
    // Backward-iterate to avoid overwrite issues
    for (let n = frame.length - 1; n >= 1; n--) {
      out[n] = frame[n] - alpha * frame[n - 1];
    }
    return out;
  }

  // --- Adaptive YIN threshold (inlined from pitch.js) ---

  _adaptiveYinThreshold(rmsValue, rmsThreshold) {
    if (rmsValue <= rmsThreshold) return YIN_THRESHOLD_CONSERVATIVE;

    // Map rmsValue from [rmsThreshold, rmsThreshold*10] to [conservative, aggressive]
    const maxRms = rmsThreshold * 10;
    const t = Math.min(1, Math.max(0, (rmsValue - rmsThreshold) / (maxRms - rmsThreshold)));
    return YIN_THRESHOLD_CONSERVATIVE + t * (YIN_THRESHOLD_AGGRESSIVE - YIN_THRESHOLD_CONSERVATIVE);
  }

  // --- Multi-candidate YIN (inlined from pitch.js) ---

  _yinMultiCandidate(buf, len, sr, yinTh, confTh) {
    const halfLen = len >> 1;
    if (halfLen < 3) return null;

    // Difference function and CMND
    const d = new Float32Array(halfLen);
    d[0] = 1;
    let runSum = 0;
    for (let tau = 1; tau < halfLen; tau++) {
      let sum = 0;
      for (let i = 0; i < halfLen; i++) {
        const v = buf[i] - buf[i + tau];
        sum += v * v;
      }
      d[tau] = sum;
      runSum += sum;
      d[tau] = runSum === 0 ? 1 : d[tau] * tau / runSum;
    }

    // Collect candidates using dip-and-trough strategy
    const maxTau = Math.min(halfLen - 1, Math.floor(sr / 60));
    const candidates = [];
    let tau = 2;
    while (tau <= maxTau) {
      if (d[tau] < yinTh) {
        // Follow to trough
        while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
        candidates.push({ tau, cmnd: d[tau] });
        // Skip past this dip
        tau++;
        while (tau <= maxTau && d[tau] < yinTh) tau++;
      } else {
        tau++;
      }
    }

    if (candidates.length === 0) return null;

    // Keep top K by CMND
    const sorted = candidates.slice().sort((a, b) => a.cmnd - b.cmnd);
    const topK = sorted.slice(0, MAX_CANDIDATES);
    // Always include the first (lowest-tau) candidate
    if (!topK.find(c => c.tau === candidates[0].tau)) {
      topK.push(candidates[0]);
    }

    let best = null;
    let bestScore = Infinity;

    for (const cand of topK) {
      const { tau: cTau, cmnd } = cand;
      // Parabolic interpolation
      const s0 = cTau > 0 ? d[cTau - 1] : d[cTau];
      const s1 = d[cTau];
      const s2 = cTau + 1 < halfLen ? d[cTau + 1] : d[cTau];
      const denom = 2 * (s0 - 2 * s1 + s2);
      const betterTau = denom === 0 ? cTau : cTau + (s0 - s2) / denom;
      const hz = sr / betterTau;
      const confidence = 1 - cmnd;

      if (confidence < confTh) continue;
      if (hz < FREQ_MIN || hz > FREQ_MAX) continue;

      // Score: base CMND plus sub-harmonic penalty for non-first candidates
      let score = cmnd;
      if (cTau !== candidates[0].tau) {
        score += SUBHARMONIC_PENALTY;
      }

      // Transition cost penalty
      if (this._prevFreq != null && this._prevFreq > 0) {
        const semiDist = Math.abs(12 * Math.log2(hz / this._prevFreq));
        if (semiDist > 10) {
          score += 0.30;
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

  // --- Multi-candidate harmonic correction (inlined from harmonics.js) ---

  _harmonicCorrect(hz, buf, len, sr) {
    if (hz < FREQ_MIN || hz > FREQ_MAX) return hz;

    const halfLen = len >> 1;
    const tauOriginal = Math.round(sr / hz);

    if (tauOriginal >= halfLen || tauOriginal < 1) return hz;

    const cmndOriginal = this._computeCMND(buf, tauOriginal, halfLen);

    // Confidence guard: skip if original CMND is already very low
    if (cmndOriginal < 0.05) return hz;

    // Candidates: [correctedFreq, tau, threshold]
    const candidates = [
      { freq: hz / 2, tau: tauOriginal * 2, threshold: 0.80 },   // sub-octave
      { freq: hz / 3, tau: tauOriginal * 3, threshold: 0.80 },   // 3rd harmonic
      { freq: hz * 2, tau: Math.round(tauOriginal / 2), threshold: 0.55 }, // super-octave
    ];

    let bestFreq = hz;
    let bestCMND = cmndOriginal;

    for (const c of candidates) {
      if (c.freq < FREQ_MIN || c.freq > FREQ_MAX) continue;
      if (c.tau < 1 || c.tau >= halfLen) continue;

      const cmnd = this._computeCMND(buf, c.tau, halfLen);

      if (cmnd < cmndOriginal * c.threshold && cmnd < bestCMND) {
        bestFreq = c.freq;
        bestCMND = cmnd;
      }
    }

    return bestFreq;
  }

  _computeCMND(buf, tau, halfLen) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const v = buf[i] - buf[i + tau];
      sum += v * v;
    }
    let running = 0;
    for (let t = 1; t <= tau; t++) {
      let s = 0;
      for (let i = 0; i < halfLen; i++) {
        const v = buf[i] - buf[i + t];
        s += v * v;
      }
      running += s;
    }
    return running === 0 ? 1 : sum * tau / running;
  }

  // --- Kalman filter (inlined from kalman.js) ---

  _kalmanPredict() {
    if (!this._kalmanInitialized) {
      return { semi: this._kalmanState[0], velocity: this._kalmanState[1] };
    }

    // x = F * x: pitch += velocity, velocity unchanged
    const [p, v] = this._kalmanState;
    this._kalmanState = [p + v, v];

    // P = F * P * F^T + Q
    const P = this._kalmanP;
    const p00 = P[0][0] + P[1][0] + P[0][1] + P[1][1] + KALMAN_Q_PITCH;
    const p01 = P[0][1] + P[1][1];
    const p10 = P[1][0] + P[1][1];
    const p11 = P[1][1] + KALMAN_Q_VELOCITY;

    this._kalmanP = [
      [p00, p01],
      [p10, p11],
    ];

    return { semi: this._kalmanState[0], velocity: this._kalmanState[1] };
  }

  _kalmanUpdate(measuredSemi, confidence) {
    this._silenceCount = 0;

    // First measurement initializes state directly
    if (!this._kalmanInitialized) {
      this._kalmanState = [measuredSemi, 0];
      this._kalmanP = [[1, 0], [0, 1]];
      this._kalmanInitialized = true;
      return { semi: measuredSemi, velocity: 0, gain: 1 };
    }

    // Innovation (residual)
    const innovation = measuredSemi - this._kalmanState[0];

    // Discontinuity check
    if (Math.abs(innovation) > KALMAN_RESET_THRESHOLD) {
      this._kalmanReset();
      this._kalmanState = [measuredSemi, 0];
      this._kalmanInitialized = true;
      return { semi: measuredSemi, velocity: 0, gain: 1 };
    }

    // Measurement noise from confidence
    const R = Math.pow(1 - confidence, 2) * KALMAN_R_SCALE;

    // Innovation covariance S = P[0][0] + R
    const S = this._kalmanP[0][0] + R;

    // Kalman gain K = P H^T / S
    const K0 = this._kalmanP[0][0] / S;
    const K1 = this._kalmanP[1][0] / S;

    // State update
    this._kalmanState[0] += K0 * innovation;
    this._kalmanState[1] += K1 * innovation;

    // Covariance update P = (I - K H) P
    const P = this._kalmanP;
    this._kalmanP = [
      [P[0][0] - K0 * P[0][0], P[0][1] - K0 * P[0][1]],
      [P[1][0] - K1 * P[0][0], P[1][1] - K1 * P[0][1]],
    ];

    return { semi: this._kalmanState[0], velocity: this._kalmanState[1], gain: K0 };
  }

  _kalmanReset() {
    this._kalmanInitialized = false;
    this._silenceCount = 0;
    this._kalmanState = [0, 0];
    this._kalmanP = [[1, 0], [0, 1]];
  }

  // --- Cepstral pitch (inlined from cepstrum.js) ---

  _cepstralPitch(frame, sr) {
    if (!frame || frame.length === 0) return null;

    // Zero-pad to next power of 2
    const n = nextPow2(frame.length);
    const real = new Float32Array(n);
    const imag = new Float32Array(n);

    // Copy frame and apply Hann window
    for (let i = 0; i < frame.length; i++) {
      real[i] = frame[i] * 0.5 * (1 - Math.cos(2 * Math.PI * i / (frame.length - 1)));
    }

    // Forward FFT
    this._fftInPlace(real, imag);

    // Log power spectrum
    for (let i = 0; i < n; i++) {
      const power = real[i] * real[i] + imag[i] * imag[i];
      real[i] = Math.log(power + EPSILON);
      imag[i] = 0;
    }

    // IFFT via conjugate trick: IFFT(X) = conj(FFT(conj(X))) / N
    this._fftInPlace(real, imag);
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] = -imag[i] / n;
    }

    // Search for peak in quefrency range
    const minQ = Math.max(2, Math.floor(sr / FREQ_MAX));
    const maxQ = Math.min(n - 2, Math.ceil(sr / FREQ_MIN));

    let peakIdx = -1;
    let peakVal = -Infinity;
    for (let q = minQ; q <= maxQ; q++) {
      if (real[q] > peakVal) {
        peakVal = real[q];
        peakIdx = q;
      }
    }

    if (peakIdx <= 0 || peakVal <= 0) return null;

    // Parabolic interpolation
    const alpha = real[peakIdx - 1];
    const beta = real[peakIdx];
    const gamma = real[peakIdx + 1];
    const denom = alpha - 2 * beta + gamma;
    let refinedQ = peakIdx;
    if (denom !== 0) {
      refinedQ = peakIdx + 0.5 * (alpha - gamma) / denom;
    }

    return { hz: sr / refinedQ, strength: peakVal };
  }

  // --- Ensemble pitch (inlined from cepstrum.js) ---

  _ensemblePitch(yinResult, cepstrumResult, kalmanPrediction) {
    const hasYin = yinResult != null;
    const hasCep = cepstrumResult != null;

    if (!hasYin && !hasCep) return null;

    if (!hasYin && hasCep) {
      return { hz: cepstrumResult.hz, confidence: cepstrumResult.strength * 0.5 };
    }

    if (hasYin && !hasCep) {
      return { hz: yinResult.hz, confidence: yinResult.confidence };
    }

    // Both YIN and cepstrum
    const semiDist = Math.abs(12 * Math.log2(yinResult.hz / cepstrumResult.hz));

    if (semiDist <= 1) {
      // Agree — boost confidence
      return {
        hz: yinResult.hz,
        confidence: Math.min(1, yinResult.confidence * 1.2)
      };
    }

    // Disagree
    if (kalmanPrediction != null) {
      const kalmanHz = A4 * Math.pow(2, (kalmanPrediction.semi - 69) / 12);
      const yinDist = Math.abs(12 * Math.log2(yinResult.hz / kalmanHz));
      const cepDist = Math.abs(12 * Math.log2(cepstrumResult.hz / kalmanHz));

      if (yinDist <= cepDist) {
        return { hz: yinResult.hz, confidence: yinResult.confidence * 0.7 };
      } else {
        return { hz: cepstrumResult.hz, confidence: (cepstrumResult.strength || 0.5) * 0.7 };
      }
    }

    // Disagree, no Kalman
    return { hz: yinResult.hz, confidence: yinResult.confidence * 0.8 };
  }

  // --- FFT in-place (shared by _computeMagnitudes and _cepstralPitch) ---

  _fftInPlace(real, imag) {
    const n = real.length;
    // Bit reversal
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }
    // FFT butterflies
    for (let bLen = 2; bLen <= n; bLen <<= 1) {
      const halfLen = bLen >> 1;
      const angle = -2 * Math.PI / bLen;
      const wR = Math.cos(angle);
      const wI = Math.sin(angle);
      for (let i = 0; i < n; i += bLen) {
        let cR = 1, cI = 0;
        for (let j = 0; j < halfLen; j++) {
          const tR = cR * real[i + j + halfLen] - cI * imag[i + j + halfLen];
          const tI = cR * imag[i + j + halfLen] + cI * real[i + j + halfLen];
          real[i + j + halfLen] = real[i + j] - tR;
          imag[i + j + halfLen] = imag[i + j] - tI;
          real[i + j] += tR;
          imag[i + j] += tI;
          const nR = cR * wR - cI * wI;
          cI = cR * wI + cI * wR;
          cR = nR;
        }
      }
    }
  }

  // --- Magnitude spectrum ---

  _computeMagnitudes(frame, len) {
    const real = new Float32Array(len);
    const imag = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      real[i] = frame[i] * 0.5 * (1 - Math.cos(2 * Math.PI * i / (len - 1)));
    }
    this._fftInPlace(real, imag);

    const halfLen = len >> 1;
    const magnitudes = new Float32Array(halfLen + 1);
    for (let i = 0; i <= halfLen; i++) {
      magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    return magnitudes;
  }

  // --- Harmonic Product Spectrum (inlined from chromagram.js) ---

  _harmonicProductSpectrum(magnitudes, numHarmonics) {
    const n = magnitudes.length;
    const hps = new Float32Array(n);
    for (let i = 0; i < n; i++) hps[i] = magnitudes[i];

    for (let h = 2; h <= numHarmonics; h++) {
      const limit = Math.floor(n / h);
      for (let i = 0; i < limit; i++) {
        hps[i] *= magnitudes[i * h];
      }
      for (let i = limit; i < n; i++) {
        hps[i] = 0;
      }
    }

    return hps;
  }

  // --- Chromagram ---

  _foldToChromagram(magnitudes, sr, fftSize) {
    const chroma = new Float32Array(12);
    const binHz = sr / fftSize;
    const minBin = Math.ceil(65 / binHz);
    const maxBin = Math.min(Math.floor(2100 / binHz), magnitudes.length - 1);
    for (let bin = minBin; bin <= maxBin; bin++) {
      const freq = bin * binHz;
      const midi = 12 * Math.log2(freq / 440) + 69;
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      const mag2 = magnitudes[bin] * magnitudes[bin];
      chroma[pc] += mag2;
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < 12; i++) chroma[i] /= norm;

    return chroma;
  }

  // --- CQT (inlined from cqt.js) ---

  _buildCQTKernels(sr, binsPerOctave = 12, numOctaves = 6, fMin = 65.41) {
    const totalBins = binsPerOctave * numOctaves;
    const Q = 1 / (Math.pow(2, 1 / binsPerOctave) - 1);
    const kernels = new Array(totalBins);

    for (let k = 0; k < totalBins; k++) {
      const freq = fMin * Math.pow(2, k / binsPerOctave);
      const Nk = Math.ceil(sr / freq * Q);
      const real = new Float32Array(Nk);
      const imag = new Float32Array(Nk);
      const twoPiQOverN = 2 * Math.PI * Q / Nk;

      for (let n = 0; n < Nk; n++) {
        const w = 0.5 * (1 - Math.cos(2 * Math.PI * n / (Nk - 1)));
        const phase = twoPiQOverN * n;
        real[n] = w * Math.cos(phase) / Nk;
        imag[n] = -w * Math.sin(phase) / Nk;
      }

      kernels[k] = { real, imag, len: Nk, freq };
    }

    return kernels;
  }

  _computeCQT(frame, kernels) {
    const numBins = kernels.length;
    const magnitudes = new Float32Array(numBins);
    const frameLen = frame.length;

    for (let k = 0; k < numBins; k++) {
      const { real, imag, len } = kernels[k];
      let dotReal = 0;
      let dotImag = 0;
      const N = Math.min(len, frameLen);

      for (let n = 0; n < N; n++) {
        const s = frame[n];
        dotReal += s * real[n];
        dotImag += s * imag[n];
      }

      magnitudes[k] = Math.sqrt(dotReal * dotReal + dotImag * dotImag);
    }

    return magnitudes;
  }

  _cqtChromagram(cqtBins, binsPerOctave = 12) {
    const chroma = new Float32Array(12);
    const numBins = cqtBins.length;
    const numOctaves = Math.floor(numBins / binsPerOctave);

    for (let oct = 0; oct < numOctaves; oct++) {
      for (let pc = 0; pc < 12; pc++) {
        const idx = pc + oct * binsPerOctave;
        if (idx < numBins) {
          chroma[pc] += cqtBins[idx] * cqtBins[idx];
        }
      }
    }

    // L2 normalize
    let norm = 0;
    for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < 12; i++) chroma[i] /= norm;
    }

    return chroma;
  }

  _computeCQTChromagram(frame) {
    const cqtBins = this._computeCQT(frame, this._cqtKernels);
    return this._cqtChromagram(cqtBins);
  }
}

registerProcessor('guitar-processor', GuitarProcessor);
