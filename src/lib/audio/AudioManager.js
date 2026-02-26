import { yinDetect, rms, freqToNote } from './pitch.js';
import { harmonicCorrect } from './analysis/harmonics.js';
import { NoiseCalibrator } from './analysis/calibration.js';
import { detectArticulation } from './analysis/features.js';
import { buildChordTemplates, matchChord } from './analysis/templates.js';
import { OnsetDetector, IOITracker } from './analysis/onset.js';
import { CONSTANTS } from '../learning/constants.js';
import { DEFAULTS } from '../learning/defaults.js';
import { StableNoteTracker } from './StableNoteTracker.js';

class ChordDetector {
  constructor() {
    this._emaChroma = null;
    this._emaAlpha = 0.3;
    this._lastChord = null;
    this._stableCount = 0;
    this._templates = null;
  }

  update(chromagram) {
    if (!this._templates) {
      this._templates = buildChordTemplates();
    }

    // EMA smoothing
    if (!this._emaChroma) {
      this._emaChroma = new Float32Array(chromagram);
    } else {
      const a = this._emaAlpha;
      for (let i = 0; i < 12; i++) {
        this._emaChroma[i] = a * chromagram[i] + (1 - a) * this._emaChroma[i];
      }
    }

    // L2 re-normalize after EMA update
    const smoothed = new Float32Array(12);
    let norm = 0;
    for (let i = 0; i < 12; i++) norm += this._emaChroma[i] * this._emaChroma[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < 12; i++) smoothed[i] = this._emaChroma[i] / norm;
    }

    const matches = matchChord(smoothed, this._templates);
    if (matches.length === 0) {
      this._lastChord = null;
      this._stableCount = 0;
      return null;
    }

    const top = matches[0];
    if (this._lastChord && top.chordName === this._lastChord.chordName) {
      this._stableCount++;
    } else {
      this._lastChord = top;
      this._stableCount = 1;
    }

    // Require 3+ stable frames
    if (this._stableCount >= 3) {
      return { ...top, chromagram: smoothed };
    }
    return null;
  }

  reset() {
    this._emaChroma = null;
    this._lastChord = null;
    this._stableCount = 0;
  }
}

export class AudioManager extends EventTarget {
  constructor(params) {
    super();
    this.audioCtx = null;
    this.analyser = null;
    this.stream = null;
    this.rafId = null;
    this.buffer = null;
    this.cachedSampleRate = null;
    this._params = params;
    this._tracker = new StableNoteTracker(params?.audio?.stableFrames ?? DEFAULTS.audio.stableFrames);
    this._rmsThreshold = params?.audio?.rmsThreshold ?? DEFAULTS.audio.rmsThreshold;
    this._harmonicCorrection = params?.audio?.harmonicCorrectionEnabled ?? DEFAULTS.audio.harmonicCorrectionEnabled;
    this._useWorklet = false;
    this._workletNode = null;
    this._calibrator = null;
    this._nullFrames = 0;
    this._silenceDebounce = params?.audio?.silenceDebounceFrames ?? DEFAULTS.audio.silenceDebounceFrames;
    this._chordDetector = new ChordDetector();
    this._onsetDetector = new OnsetDetector();
    this._ioiTracker = new IOITracker();
  }

  async start() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}
      });
      const src = ctx.createMediaStreamSource(stream);
      this.audioCtx = ctx;
      this.stream = stream;
      this.cachedSampleRate = ctx.sampleRate;

      // Try worklet first
      try {
        const url = new URL('./worklet/guitar-processor.js', import.meta.url);
        await ctx.audioWorklet.addModule(url);
        this._workletNode = new AudioWorkletNode(ctx, 'guitar-processor');
        src.connect(this._workletNode);
        this._workletNode.port.onmessage = (e) => this._handleWorkletMessage(e.data);
        this._workletNode.port.postMessage({
          type: 'configure',
          config: {
            yinThreshold: this._params?.audio?.yinThreshold ?? DEFAULTS.audio.yinThreshold,
            confidenceThreshold: this._params?.audio?.confidenceThreshold ?? DEFAULTS.audio.confidenceThreshold,
            rmsThreshold: this._rmsThreshold,
            sampleRate: ctx.sampleRate,
            harmonicCorrection: this._harmonicCorrection,
            enableFeatures: this._params?.audio?.enableFeatures ?? DEFAULTS.audio.enableFeatures,
            enableChromagram: this._params?.audio?.enableChromagram ?? false,
            enableOnset: this._params?.audio?.enableOnset ?? false,
          }
        });
        this._useWorklet = true;
        return { ok: true };
      } catch (workletErr) {
        // Fallback to RAF with AnalyserNode
        console.warn('AudioWorklet not available, falling back to RAF:', workletErr.message);
        const an = ctx.createAnalyser();
        an.fftSize = CONSTANTS.audio.FFT_SIZE;
        src.connect(an);
        this.analyser = an;
        this.buffer = new Float32Array(an.fftSize);
        return { ok: true };
      }
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return { ok: false, error: 'mic_denied', message: 'Microphone access denied. Please allow microphone in browser settings.' };
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return { ok: false, error: 'no_mic', message: 'No microphone found on this device.' };
      }
      return { ok: false, error: 'unknown', message: 'Could not start audio: ' + (err && err.message || 'unknown error') };
    }
  }

  _handleWorkletMessage(data) {
    if (data.type === 'calibration') {
      this._rmsThreshold = data.rmsThreshold;
      this.dispatchEvent(new CustomEvent('calibrated', {
        detail: { noiseFloor: data.noiseFloor, rmsThreshold: data.rmsThreshold }
      }));
      return;
    }
    if (data.type !== 'analysis') return;

    // Chord detection from chromagram — runs regardless of pitch
    if (data.chromagram) {
      const chord = this._chordDetector.update(data.chromagram);
      if (chord) {
        this.dispatchEvent(new CustomEvent('chord', {
          detail: { root: chord.root, rootName: chord.rootName, typeId: chord.typeId, chordName: chord.chordName, score: chord.score, chromagram: chord.chromagram }
        }));
      }
    }

    // Onset detection from spectral flux — runs regardless of pitch
    if (data.spectralFlux != null) {
      const onset = this._onsetDetector.detect(data.spectralFlux, data.ts * 1000);
      if (onset) {
        this._ioiTracker.addOnset(onset.timeMs);
        this.dispatchEvent(new CustomEvent('onset', {
          detail: { strength: onset.strength, timeMs: onset.timeMs, spectralFlux: data.spectralFlux }
        }));
      }
    }

    if (!data.pitch) {
      this._nullFrames++;
      if (this._nullFrames >= this._silenceDebounce && this._tracker.lastNote !== null) {
        this._tracker.reset();
        this.dispatchEvent(new CustomEvent('silence'));
      }
      return;
    }
    this._nullFrames = 0;

    const { note, cents, hz, semi, confidence } = data.pitch;
    const result = this._tracker.update(note);
    if (result.stable) {
      const detail = {
        note, cents, hz, semitones: semi,
        confidence: confidence ?? null,
        rms: data.rms ?? null,
        rmsDb: data.features?.rmsDb ?? null,
        centsDelta: data.features?.centsDelta ?? null,
        freqTrajectory: data.features?.freqTrajectory ?? null,
        articulation: null,
      };

      if (data.features?.freqTrajectory?.length >= 5) {
        detail.articulation = detectArticulation(data.features.freqTrajectory, hz);
      }

      this.dispatchEvent(new CustomEvent('detect', { detail }));
    }
  }

  get ioiTracker() { return this._ioiTracker; }

  startLoop() {
    if (this._useWorklet) return; // worklet handles its own loop
    this._startRafLoop();
  }

  calibrate(params) {
    const targetFrames = params?.targetFrames ?? DEFAULTS.calibration.targetFrames;
    const safetyMultiplier = params?.safetyMultiplier ?? DEFAULTS.calibration.safetyMultiplier;

    if (this._useWorklet) {
      this._workletNode.port.postMessage({
        type: 'calibrate',
        targetFrames,
        safetyMultiplier,
      });
    } else {
      this._calibrator = new NoiseCalibrator({ targetFrames, safetyMultiplier });
    }
  }

  _startRafLoop() {
    const FREQ_MIN = CONSTANTS.audio.FREQ_MIN;
    const FREQ_MAX = CONSTANTS.audio.FREQ_MAX;
    const loop = () => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      const r = rms(this.buffer);

      // Calibration in RAF path
      if (this._calibrator && !this._calibrator.calibrated) {
        const calResult = this._calibrator.addFrame(r);
        if (calResult) {
          this._rmsThreshold = calResult.rmsThreshold;
          this._calibrator = null;
          this.dispatchEvent(new CustomEvent('calibrated', {
            detail: calResult
          }));
        }
        this.rafId = requestAnimationFrame(loop);
        return;
      }

      if (r < this._rmsThreshold) {
        this._nullFrames++;
        if (this._nullFrames >= this._silenceDebounce && this._tracker.lastNote !== null) {
          this._tracker.reset();
          this.dispatchEvent(new CustomEvent('silence'));
        }
        this.rafId = requestAnimationFrame(loop);
        return;
      }
      let hz = yinDetect(this.buffer, this.audioCtx.sampleRate);
      if (!hz || hz < FREQ_MIN || hz > FREQ_MAX) {
        this._nullFrames++;
        if (this._nullFrames >= this._silenceDebounce && this._tracker.lastNote !== null) {
          this._tracker.reset();
          this.dispatchEvent(new CustomEvent('silence'));
        }
        this.rafId = requestAnimationFrame(loop);
        return;
      }
      this._nullFrames = 0;
      // Harmonic correction for wound strings
      if (this._harmonicCorrection && hz > 160 && hz / 2 >= 50) {
        hz = harmonicCorrect(hz, this.buffer, this.audioCtx.sampleRate);
      }
      const {note, cents, semi} = freqToNote(hz);
      const result = this._tracker.update(note);
      if (result.stable) {
        this.dispatchEvent(new CustomEvent('detect', {
          detail: { note, cents, hz, semitones: semi, confidence: null, rms: null, rmsDb: null, centsDelta: null, freqTrajectory: null, articulation: null }
        }));
      }
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this._workletNode) {
      this._workletNode.disconnect();
      this._workletNode = null;
    }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
    this.analyser = null;
    this.buffer = null;
    this._tracker.reset();
    this._nullFrames = 0;
    this._useWorklet = false;
    this._calibrator = null;
    this._chordDetector.reset();
    this._onsetDetector.reset();
    this._ioiTracker.reset();
  }
}
