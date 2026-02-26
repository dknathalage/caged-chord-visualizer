import { describe, it, expect } from 'vitest';
import { harmonicCorrect } from './harmonics.js';

function generateSine(freq, sampleRate, length) {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
  }
  return buf;
}

function generateWithHarmonic(fundamental, harmonicFreq, harmonicAmp, sampleRate, length) {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = Math.sin(2 * Math.PI * fundamental * i / sampleRate)
           + harmonicAmp * Math.sin(2 * Math.PI * harmonicFreq * i / sampleRate);
  }
  return buf;
}

describe('harmonicCorrect', () => {
  const SR = 44100;
  const LEN = 4096;

  it('pure sine at 220Hz stays at 220Hz', () => {
    const buf = generateSine(220, SR, LEN);
    const result = harmonicCorrect(220, buf, SR);
    expect(result).toBe(220);
  });

  it('sine at 220Hz with strong 2nd harmonic at 440Hz stays at 220Hz', () => {
    // When YIN correctly detects the fundamental at 220Hz, no correction needed
    const buf = generateWithHarmonic(220, 440, 0.8, SR, LEN);
    const result = harmonicCorrect(220, buf, SR);
    // 220Hz is > 160Hz, sub-octave would be 110Hz which is valid
    // But the buffer has a strong fundamental at 220Hz, so CMND at tau for 220Hz
    // should be good, and the sub-octave (110Hz) shouldn't win
    expect(result).toBe(220);
  });

  it('wound string octave-up error: YIN detects 220Hz but fundamental is 110Hz', () => {
    // Simulate wound string: strong fundamental at 110Hz, YIN incorrectly detects 220Hz
    // Buffer has 110Hz fundamental with weaker 220Hz harmonic
    const buf = generateWithHarmonic(110, 220, 0.3, SR, LEN);
    // YIN mistakenly reports 220Hz, correction should find 110Hz is stronger
    const result = harmonicCorrect(220, buf, SR);
    expect(result).toBe(110);
  });

  it('sine at 100Hz (below 160Hz threshold) gets no correction', () => {
    const buf = generateSine(100, SR, LEN);
    const result = harmonicCorrect(100, buf, SR);
    expect(result).toBe(100);
  });

  it('sine at 80Hz where sub-octave would be 40Hz (below FREQ_MIN) gets no correction', () => {
    const buf = generateSine(80, SR, LEN);
    const result = harmonicCorrect(80, buf, SR);
    expect(result).toBe(80);
  });

  it('high frequency pure sine (440Hz) stays at 440Hz', () => {
    const buf = generateSine(440, SR, LEN);
    const result = harmonicCorrect(440, buf, SR);
    expect(result).toBe(440);
  });

  it('returns original hz when tauSubOctave exceeds halfLen', () => {
    // Very short buffer where sub-octave tau would be too large
    const shortBuf = generateSine(200, SR, 256);
    const result = harmonicCorrect(200, shortBuf, SR);
    // tauOriginal = 44100/200 = 220, tauSubOctave = 440, halfLen = 128
    // tauSubOctave >= halfLen, so should return original
    expect(result).toBe(200);
  });
});
