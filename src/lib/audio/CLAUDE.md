# Audio Analysis Pipeline

Real-time pitch detection, chord recognition, and onset detection running in an AudioWorklet. All algorithms are inlined in the worklet (no imports) and mirrored in testable `analysis/` modules.

## Module Map

```
pitch.js                  # YIN pitch detection, pre-emphasis, adaptive threshold
pitch.test.js
AudioManager.js           # Web Audio mic lifecycle, event dispatch, chord/onset routing
StableNoteTracker.js      # N-frame note stability filter
TonePlayer.js             # Sine-wave synthesis for reference tones
worklet/
  guitar-processor.js     # Self-contained AudioWorkletProcessor (all algorithms inlined)
  messages.js             # Message type constants
analysis/
  harmonics.js            # Multi-candidate harmonic correction (sub/super/3rd)
  calibration.js          # Noise floor calibration (P95 + safety margin)
  features.js             # Articulation detection (vibrato, bend), intonation stats
  chromagram.js           # FFT, Hann window, chromagram, Harmonic Product Spectrum
  templates.js            # Chord template generation + weighted cosine matching
  guitar-weights.js       # Guitar playability priors for chord scoring
  onset.js                # Log-compressed spectral flux, OnsetDetector, IOITracker
  kalman.js               # Kalman pitch tracker (2D state + velocity)
  cepstrum.js             # Cepstral pitch detection + ensemble logic
  cqt.js                  # Constant-Q Transform (opt-in alternative to FFT chromagram)
  *.test.js               # Co-located tests for each module
```

## Worklet Architecture

The worklet (`guitar-processor.js`) is fully self-contained — no imports allowed. Every algorithm exists in both:
1. **`analysis/` modules** — importable, testable, used by AudioManager fallback path
2. **Inlined in the worklet** — copy-pasted logic for the real-time AudioWorklet thread

When modifying an algorithm, **update both locations**.

### Ring Buffer & Timing

- `RING_SIZE = 8192` samples
- `HOP_SIZE = 512` samples (~10.7ms at 48kHz)
- `FRAME_SIZE = 4096` samples (~85ms at 48kHz)
- Real-time budget: <10ms per hop

### Analysis Pipeline Order

```
1. Extract FRAME_SIZE samples from ring buffer
2. Compute RMS → silence gate
3. Pre-emphasis filter (copy of frame, for YIN only)
4. Kalman predict (if enableKalman)
5. Multi-candidate YIN + adaptive threshold → [{hz, confidence}]
6. Multi-candidate harmonic correction (sub/super/3rd)
7. Cepstral pitch detection (if enableCepstrum)
8. Ensemble pitch (YIN + cepstrum + Kalman agreement)
9. Kalman update
10. Compute magnitudes (original frame, Hann window + FFT)
11. Harmonic Product Spectrum (suppress overtones)
12. Chromagram (FFT fold or CQT, depending on useCQT flag)
13. Log-compressed spectral flux (onset detection)
14. Post message to main thread
```

### Config Flags

Sent via `'configure'` message from AudioManager:

| Flag | Default | Effect |
|------|---------|--------|
| `enableKalman` | `true` | Kalman pitch tracking (smooths pitch, tracks slides) |
| `enableCepstrum` | `false` | Cepstral pitch + ensemble logic (second opinion on pitch) |
| `useCQT` | `false` | CQT chromagram instead of FFT chromagram (better frequency resolution) |
| `enableFeatures` | `false` | Frequency trajectory + articulation detection |
| `enableChromagram` | varies | FFT/CQT chromagram for chord detection |
| `enableOnset` | varies | Spectral flux for rhythm detection |

## Pitch Detection

### YIN — `pitch.js`

Core monophonic pitch detection via autocorrelation.

**Key functions:**
- `yinMultiCandidate(buf, sr, params, prevFreq, K=5)` — main entry point, returns `{hz, confidence}` or null
- `yinDetect(buf, sr, params)` — backward-compat wrapper (returns Hz or null)
- `preEmphasis(frame, alpha=0.97)` — high-pass filter applied before YIN to boost fundamentals
- `adaptiveYinThreshold(rms, rmsThreshold)` — maps RMS to [0.20, 0.10] threshold range

**Multi-candidate algorithm:**
1. Compute CMND (cumulative mean normalized difference)
2. Collect all local minima (dip-and-trough pattern)
3. Keep top K=5 by CMND value
4. Apply sub-harmonic penalty (+0.20 for non-first candidates)
5. Apply transition cost vs previous frequency (+0.15 for >6 semi, +0.30 for >10 semi)
6. Parabolic interpolation on best candidate
7. Return if confidence >= threshold

**Parameters** (from `defaults.js`):
- `audio.yinThreshold`: 0.15 (static fallback)
- `audio.yinThresholdRange`: [0.20, 0.10] (adaptive range)
- `audio.confidenceThreshold`: 0.85
- Frequency range: 50–1400 Hz

### Harmonic Correction — `analysis/harmonics.js`

Corrects octave-up and harmonic errors common on wound guitar strings.

**Candidates checked:**
| Candidate | Tau | Threshold | Rationale |
|-----------|-----|-----------|-----------|
| Sub-octave (hz/2) | tau×2 | 0.80 | Most common error on wound strings |
| 3rd harmonic (hz/3) | tau×3 | 0.80 | Low E (82Hz) often detected as 246Hz |
| Super-octave (hz×2) | tau/2 | 0.70 | Rare; stricter threshold |

- Confidence guard: skips correction if original CMND < 0.05 (already very confident)
- No frequency gate — works across full range (previously gated at 160Hz)
- Exports `computeCMND()` for reuse

### Kalman Pitch Tracker — `analysis/kalman.js`

2D Kalman filter for smooth pitch tracking across slides and vibrato.

**State:** `[pitch_semi, velocity_semi_per_frame]`

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Process noise (pitch) | 0.01 | Allows gradual pitch changes |
| Process noise (velocity) | 0.005 | Allows acceleration changes |
| Measurement noise R | `(1-confidence)² × 5.0` | Low confidence → trust prediction more |
| Reset threshold | 12 semitones | Large jumps trigger re-initialization |
| Silence reset | 5 null frames | Resets state after silence gap |

**API:** `PitchKalman` class with `predict()`, `update(semi, confidence)`, `reset()`

**Helper:** `weightCandidates(candidates, prediction)` — scores multi-candidate YIN results by 60% confidence + 40% prediction agreement

### Cepstral Pitch — `analysis/cepstrum.js`

Second-opinion pitch detection via cepstral analysis.

**Algorithm:** `IFFT(log(|FFT(frame)|²))` → peak in quefrency range [sr/1400, sr/50]

**Ensemble logic** (`ensemblePitch`):
- YIN + cepstrum agree (within 1 semi) → boost confidence ×1.2
- Disagree + Kalman available → pick candidate closer to Kalman prediction (×0.7)
- Disagree, no Kalman → return YIN with reduced confidence (×0.8)

## Chord Detection

### Chromagram — `analysis/chromagram.js`

**FFT path:** Hann window → FFT → magnitude spectrum → HPS → fold to 12 pitch classes → L2-normalize

**Harmonic Product Spectrum** (`harmonicProductSpectrum`): Multiply spectrum by downsampled copies at factors 2 and 3. Suppresses harmonics, emphasizes fundamentals. Applied before chromagram folding.

### CQT — `analysis/cqt.js` (opt-in)

**Constant-Q Transform** with logarithmic frequency resolution (better for music).

- 72 bins: 6 octaves × 12 bins/octave (C2–C8)
- Sparse precomputed kernels (built on `'configure'` message)
- `cqtChromagram()` folds octaves into 12 pitch classes
- Enabled via `useCQT: true` config flag

### Template Matching — `analysis/templates.js`

- 144 templates (12 roots × 12 chord types), L2-normalized
- Cosine similarity matching with optional guitar weights
- `matchChord(observed, templates, minScore=0.65, weights?)` → sorted matches

### Guitar Weights — `analysis/guitar-weights.js`

Playability priors (0.5–1.2) that adjust chord match scores:
- Boost: open/barre chords (maj, min, 7, m7, 5) in guitar keys (C, D, E, G, A) → 1.0–1.15
- Penalize: rare voicings (dim7, aug) in uncommon keys → 0.5

### EMA Smoothing — `AudioManager.js`

ChordDetector uses exponential moving average (alpha=0.3) instead of frame buffering. Re-normalizes after each update.

## Onset Detection — `analysis/onset.js`

**Log-compressed spectral flux:** `Σ max(0, log(1+γ·current[i]) - log(1+γ·previous[i]))` where γ=1000

Log compression makes onset detection robust to volume changes (10× magnitude change ≠ 10× flux).

**OnsetDetector:** Peak picking with adaptive median threshold (×1.5) and minimum interval (50ms).

**IOITracker:** Inter-onset interval tracking for tempo estimation and rhythm pattern matching.

## Events (from AudioManager)

| Event | Payload | Trigger |
|-------|---------|---------|
| `'detect'` | `{note, cents, hz, semitones, confidence, rms, rmsDb, centsDelta, freqTrajectory, articulation}` | Stable pitch detected |
| `'silence'` | — | RMS below threshold |
| `'chord'` | `{root, rootName, typeId, chordName, score, chromagram}` | Chord matched |
| `'onset'` | `{strength, timeMs, spectralFlux}` | Note onset detected |
| `'calibrated'` | `{noiseFloor, rmsThreshold}` | Noise calibration complete |

## Stability & Debounce

Two mechanisms prevent UI flickering during sustained note playback:

### Silence Debounce — `AudioManager.js`

A single null-pitch frame no longer immediately resets the tracker and dispatches `'silence'`. Instead, AudioManager counts consecutive null frames (`_nullFrames`) and only fires silence after `silenceDebounceFrames` (default 5, ~53ms at 48kHz/HOP_SIZE=512) consecutive nulls. This applies to all three silence paths:
- Worklet message with `data.pitch = null`
- RAF loop with RMS below threshold
- RAF loop with invalid/out-of-range frequency

Any valid pitch detection resets the counter to 0. The counter is also reset in `stop()`. The threshold is configurable via `params.audio.silenceDebounceFrames` (Tier 2 default in `defaults.js`).

### Note Grace Frames — `StableNoteTracker.js`

Once a note reaches stable confirmation (N consecutive identical frames), the tracker grants 2 "grace frames." If a different note appears briefly (1-2 frames) before returning to the confirmed note, the transient is ignored and the confirmed note continues to be reported as stable. This prevents brief pitch detection glitches from resetting a note that the user is still holding.

State fields: `_confirmed` (last stable note), `_graceLeft` (remaining grace frames, reset to 2 on each stable confirmation).

## Known Limitations

- Worklet code is duplicated from analysis modules — must be kept in sync manually
- CQT kernel precomputation adds ~50ms startup cost
- Cepstral pitch less accurate below 100Hz (short quefrency range)
- FSRS-based chord template weights are hand-tuned, not learned from data
- No polyphonic pitch detection — chord recognition uses chromagram only
