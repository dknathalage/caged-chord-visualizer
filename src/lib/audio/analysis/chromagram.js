/**
 * FFT and Chromagram computation.
 * Pure functions — no side effects.
 */

/**
 * Radix-2 Cooley-Tukey FFT (in-place).
 * @param {Float32Array} real - Real part (modified in-place)
 * @param {Float32Array} imag - Imaginary part (modified in-place)
 */
export function fft(real, imag) {
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
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curReal = 1, curImag = 0;
      for (let j = 0; j < halfLen; j++) {
        const tReal = curReal * real[i + j + halfLen] - curImag * imag[i + j + halfLen];
        const tImag = curReal * imag[i + j + halfLen] + curImag * real[i + j + halfLen];
        real[i + j + halfLen] = real[i + j] - tReal;
        imag[i + j + halfLen] = imag[i + j] - tImag;
        real[i + j] += tReal;
        imag[i + j] += tImag;
        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
  }
}

/**
 * Apply Hann window to buffer.
 * @param {Float32Array} buffer - Audio samples (modified in-place)
 */
export function hannWindow(buffer) {
  const n = buffer.length;
  for (let i = 0; i < n; i++) {
    buffer[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  }
}

/**
 * Compute magnitude spectrum from FFT output.
 * @param {Float32Array} real
 * @param {Float32Array} imag
 * @returns {Float32Array} magnitude array of length n/2+1
 */
export function magnitudeSpectrum(real, imag) {
  const n = real.length;
  const mags = new Float32Array((n >> 1) + 1);
  for (let i = 0; i <= n >> 1; i++) {
    mags[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  return mags;
}

/**
 * Fold FFT magnitude bins into 12 pitch classes (C through B).
 * Weighted by magnitude squared, L2-normalized.
 * @param {Float32Array} magnitudes - Magnitude spectrum
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} fftSize - FFT size (e.g., 4096)
 * @returns {Float32Array} 12-bin chromagram, L2-normalized
 */
export function computeChromagram(magnitudes, sampleRate, fftSize) {
  const chroma = new Float32Array(12);
  const binHz = sampleRate / fftSize;

  // Frequency range: 65Hz (C2) to 2100Hz (C7)
  const minBin = Math.ceil(65 / binHz);
  const maxBin = Math.min(Math.floor(2100 / binHz), magnitudes.length - 1);

  for (let bin = minBin; bin <= maxBin; bin++) {
    const freq = bin * binHz;
    // Map frequency to pitch class (0=C, 1=C#, ..., 11=B)
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pitchClass] += magnitudes[bin] * magnitudes[bin]; // magnitude squared weighting
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
