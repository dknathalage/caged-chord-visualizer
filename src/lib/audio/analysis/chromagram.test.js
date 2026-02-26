import { describe, it, expect } from 'vitest';
import { fft, hannWindow, magnitudeSpectrum, computeChromagram } from './chromagram.js';

function generateSine(freq, sampleRate, length) {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
  }
  return buf;
}

describe('fft', () => {
  it('detects peak at correct bin for known sine wave', () => {
    const SR = 44100;
    const N = 4096;
    const freq = 440;
    const real = generateSine(freq, SR, N);
    const imag = new Float32Array(N);

    fft(real, imag);

    const mags = magnitudeSpectrum(real, imag);
    const expectedBin = Math.round(freq * N / SR);

    // Find peak bin
    let peakBin = 0;
    let peakVal = 0;
    for (let i = 1; i < mags.length; i++) {
      if (mags[i] > peakVal) { peakVal = mags[i]; peakBin = i; }
    }

    expect(Math.abs(peakBin - expectedBin)).toBeLessThanOrEqual(1);
  });

  it('detects peak for low frequency sine', () => {
    const SR = 44100;
    const N = 4096;
    const freq = 110;
    const real = generateSine(freq, SR, N);
    const imag = new Float32Array(N);

    fft(real, imag);

    const mags = magnitudeSpectrum(real, imag);
    const expectedBin = Math.round(freq * N / SR);

    let peakBin = 0;
    let peakVal = 0;
    for (let i = 1; i < mags.length; i++) {
      if (mags[i] > peakVal) { peakVal = mags[i]; peakBin = i; }
    }

    expect(Math.abs(peakBin - expectedBin)).toBeLessThanOrEqual(1);
  });
});

describe('hannWindow', () => {
  it('endpoints should be near 0, midpoint should be near 1', () => {
    const n = 1024;
    const buf = new Float32Array(n).fill(1);
    hannWindow(buf);

    // Endpoints
    expect(buf[0]).toBeCloseTo(0, 5);
    expect(buf[n - 1]).toBeCloseTo(0, 5);

    // Midpoint
    const mid = Math.floor(n / 2);
    expect(buf[mid]).toBeCloseTo(1, 2);
  });

  it('preserves symmetry', () => {
    const n = 256;
    const buf = new Float32Array(n).fill(1);
    hannWindow(buf);

    for (let i = 0; i < n / 2; i++) {
      expect(buf[i]).toBeCloseTo(buf[n - 1 - i], 5);
    }
  });
});

describe('computeChromagram', () => {
  const SR = 44100;
  const N = 4096;

  function chromaFromSine(freq) {
    const real = generateSine(freq, SR, N);
    const imag = new Float32Array(N);
    hannWindow(real);
    fft(real, imag);
    const mags = magnitudeSpectrum(real, imag);
    return computeChromagram(mags, SR, N);
  }

  it('pure A440 sine has strongest bin at A (index 9)', () => {
    const chroma = chromaFromSine(440);

    let peakIdx = 0;
    let peakVal = 0;
    for (let i = 0; i < 12; i++) {
      if (chroma[i] > peakVal) { peakVal = chroma[i]; peakIdx = i; }
    }

    expect(peakIdx).toBe(9); // A = index 9
  });

  it('pure C262 sine has strongest bin at C (index 0)', () => {
    const chroma = chromaFromSine(261.63);

    let peakIdx = 0;
    let peakVal = 0;
    for (let i = 0; i < 12; i++) {
      if (chroma[i] > peakVal) { peakVal = chroma[i]; peakIdx = i; }
    }

    expect(peakIdx).toBe(0); // C = index 0
  });

  it('A major chord (A+C#+E) has strong bins at A, C#, E', () => {
    // A=440, C#=554.37, E=659.26
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      buf[i] = Math.sin(2 * Math.PI * 440 * i / SR)
             + Math.sin(2 * Math.PI * 554.37 * i / SR)
             + Math.sin(2 * Math.PI * 659.26 * i / SR);
    }
    hannWindow(buf);
    const imag = new Float32Array(N);
    fft(buf, imag);
    const mags = magnitudeSpectrum(buf, imag);
    const chroma = computeChromagram(mags, SR, N);

    // A=9, C#=1, E=4
    const aVal = chroma[9];
    const csVal = chroma[1];
    const eVal = chroma[4];

    // All three should be significant (non-trivial fraction of max)
    const maxVal = Math.max(...chroma);
    expect(aVal).toBeGreaterThan(maxVal * 0.3);
    expect(csVal).toBeGreaterThan(maxVal * 0.3);
    expect(eVal).toBeGreaterThan(maxVal * 0.3);
  });

  it('output is L2-normalized', () => {
    const chroma = chromaFromSine(440);
    let sumSq = 0;
    for (let i = 0; i < 12; i++) sumSq += chroma[i] * chroma[i];
    expect(Math.sqrt(sumSq)).toBeCloseTo(1, 3);
  });

  it('returns zero vector for silence', () => {
    const mags = new Float32Array(N / 2 + 1); // all zeros
    const chroma = computeChromagram(mags, SR, N);
    for (let i = 0; i < 12; i++) {
      expect(chroma[i]).toBe(0);
    }
  });
});
