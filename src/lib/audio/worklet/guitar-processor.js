// AudioWorkletProcessor for guitar pitch detection.
// Self-contained — no ES module imports allowed in worklet scope.

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const A4 = 440;
const FREQ_MIN = 50;
const FREQ_MAX = 1400;

const RING_SIZE = 8192;
const HOP_SIZE = 512;
const FRAME_SIZE = 4096;

// --- DSP helpers (inlined from pitch.js) ---

function rms(buf, len) {
  let sum = 0;
  for (let i = 0; i < len; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / len);
}

function yinDetect(buf, offset, len, sampleRate, yinThreshold, confidenceThreshold) {
  const halfLen = len >> 1;
  const d = new Float32Array(halfLen);
  d[0] = 1;
  let runSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const v = buf[(offset + i) % RING_SIZE] - buf[(offset + i + tau) % RING_SIZE];
      sum += v * v;
    }
    d[tau] = sum;
    runSum += sum;
    d[tau] = runSum === 0 ? 1 : d[tau] * tau / runSum;
  }
  let tau = 2;
  while (tau < halfLen) {
    if (d[tau] < yinThreshold) {
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
  if (confidence < confidenceThreshold) return null;
  const freq = sampleRate / betterTau;
  if (freq < FREQ_MIN || freq > FREQ_MAX) return null;
  return { hz: freq, confidence };
}

function freqToNote(hz) {
  const semi = 12 * Math.log2(hz / A4);
  const rounded = Math.round(semi);
  const cents = Math.round((semi - rounded) * 100);
  const idx = ((rounded % 12) + 12 + 9) % 12;
  return { note: NOTES[idx], cents, semi: rounded };
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
    // Compute frame start: FRAME_SIZE samples before current writePos
    const frameStart = (this._writePos - FRAME_SIZE + RING_SIZE) % RING_SIZE;

    // Copy frame into contiguous buffer for RMS
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

    if (r < this._rmsThreshold) {
      this.port.postMessage({ type: 'analysis', ts, rms: r, pitch: null });
      return;
    }

    // YIN on contiguous frame buffer (offset=0, len=FRAME_SIZE)
    const result = this._yinContiguous(frame, FRAME_SIZE, this._sampleRate, this._yinThreshold, this._confidenceThreshold);

    if (!result) {
      if (this._enableFeatures) this._freqTrajectory = [];
      this.port.postMessage({ type: 'analysis', ts, rms: r, pitch: null });
      return;
    }

    // Harmonic correction for wound strings
    let correctedHz = result.hz;
    if (this._harmonicCorrection && correctedHz > 160 && correctedHz / 2 >= 50) {
      correctedHz = this._harmonicCorrect(correctedHz, frame, FRAME_SIZE, this._sampleRate);
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

    // Compute magnitude spectrum (needed for both chromagram and onset)
    let magnitudes = null;
    let chromagram = null;
    let spectralFluxVal = null;

    if (this._enableChromagram || this._enableOnset) {
      magnitudes = this._computeMagnitudes(frame, FRAME_SIZE, this._sampleRate);

      if (this._enableChromagram) {
        chromagram = this._foldToChromagram(magnitudes, this._sampleRate, FRAME_SIZE);
      }

      if (this._enableOnset) {
        if (this._prevMagnitudes) {
          spectralFluxVal = 0;
          for (let i = 0; i < magnitudes.length; i++) {
            const diff = magnitudes[i] - this._prevMagnitudes[i];
            if (diff > 0) spectralFluxVal += diff;
          }
        }
        this._prevMagnitudes = magnitudes;
      }
    }

    const { note, cents, semi } = freqToNote(correctedHz);
    this.port.postMessage({
      type: 'analysis',
      ts,
      rms: r,
      pitch: { hz: correctedHz, confidence: result.confidence, note, cents, semi },
      features,
      chromagram,
      spectralFlux: spectralFluxVal
    });
  }

  _computeMagnitudes(frame, len) {
    // Copy frame and apply Hann window
    const real = new Float32Array(len);
    const imag = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      real[i] = frame[i] * 0.5 * (1 - Math.cos(2 * Math.PI * i / (len - 1)));
    }

    // Radix-2 Cooley-Tukey FFT (in-place)
    for (let i = 1, j = 0; i < len; i++) {
      let bit = len >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }
    for (let bLen = 2; bLen <= len; bLen <<= 1) {
      const halfLen = bLen >> 1;
      const angle = -2 * Math.PI / bLen;
      const wR = Math.cos(angle);
      const wI = Math.sin(angle);
      for (let i = 0; i < len; i += bLen) {
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

    // Compute magnitudes for positive frequencies
    const halfLen = len >> 1;
    const magnitudes = new Float32Array(halfLen + 1);
    for (let i = 0; i <= halfLen; i++) {
      magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    return magnitudes;
  }

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

  _harmonicCorrect(hz, buf, len, sr) {
    const halfLen = len >> 1;
    const tauOrig = Math.round(sr / hz);
    const tauSub = tauOrig * 2;
    if (tauSub >= halfLen) return hz;

    // Compute CMND at original and sub-octave tau
    let sumOrig = 0, sumSub = 0;
    for (let i = 0; i < halfLen; i++) {
      const vO = buf[i] - buf[i + tauOrig];
      sumOrig += vO * vO;
      const vS = buf[i] - buf[i + tauSub];
      sumSub += vS * vS;
    }
    let runOrig = 0, runSub = 0;
    for (let t = 1; t <= tauSub; t++) {
      let s = 0;
      for (let i = 0; i < halfLen; i++) {
        const v = buf[i] - buf[i + t];
        s += v * v;
      }
      if (t <= tauOrig) runOrig += s;
      runSub += s;
    }
    const cmndOrig = runOrig === 0 ? 1 : sumOrig * tauOrig / runOrig;
    const cmndSub = runSub === 0 ? 1 : sumSub * tauSub / runSub;

    return cmndSub < cmndOrig * 0.85 ? hz / 2 : hz;
  }

  _yinContiguous(buf, len, sr, yinTh, confTh) {
    const halfLen = len >> 1;
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
    let tau = 2;
    while (tau < halfLen) {
      if (d[tau] < yinTh) {
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
    if (confidence < confTh) return null;
    const freq = sr / betterTau;
    if (freq < FREQ_MIN || freq > FREQ_MAX) return null;
    return { hz: freq, confidence };
  }
}

registerProcessor('guitar-processor', GuitarProcessor);
