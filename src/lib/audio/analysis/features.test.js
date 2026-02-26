import { describe, it, expect } from 'vitest';
import { rmsToDb, detectArticulation, intonationStats } from './features.js';

describe('rmsToDb', () => {
  it('1.0 → 0 dB', () => {
    expect(rmsToDb(1.0)).toBeCloseTo(0, 5);
  });

  it('0.5 → ~-6 dB', () => {
    expect(rmsToDb(0.5)).toBeCloseTo(-6.02, 1);
  });

  it('0.1 → -20 dB', () => {
    expect(rmsToDb(0.1)).toBeCloseTo(-20, 1);
  });

  it('0 → -Infinity', () => {
    expect(rmsToDb(0)).toBe(-Infinity);
  });

  it('negative → -Infinity', () => {
    expect(rmsToDb(-0.5)).toBe(-Infinity);
  });
});

describe('detectArticulation', () => {
  it('constant frequency → stable=true, vibrato=false, bend=false', () => {
    const freq = 440;
    const history = Array(20).fill(freq);
    const result = detectArticulation(history, freq);
    expect(result.stable).toBe(true);
    expect(result.vibrato).toBe(false);
    expect(result.bend).toBe(false);
  });

  it('sinusoidal frequency (5Hz rate, +/-15 cents) → vibrato=true', () => {
    const nominal = 440;
    // 50 frames at ~10ms each = 0.5s; 5Hz vibrato = 2.5 cycles
    // Needs multiple cycles for reliable zero-crossing rate detection
    const history = [];
    for (let i = 0; i < 50; i++) {
      const centsDev = 15 * Math.sin(2 * Math.PI * 5 * i * 0.01);
      history.push(nominal * Math.pow(2, centsDev / 1200));
    }
    const result = detectArticulation(history, nominal);
    expect(result.vibrato).toBe(true);
    expect(result.vibratoRate).toBeGreaterThanOrEqual(4);
    expect(result.vibratoRate).toBeLessThanOrEqual(8);
  });

  it('monotonically rising frequency (>30 cents) → bend=true', () => {
    const nominal = 440;
    // Rise from 0 cents to +50 cents over 20 frames
    const history = [];
    for (let i = 0; i < 20; i++) {
      const centsDev = (i / 19) * 50;
      history.push(nominal * Math.pow(2, centsDev / 1200));
    }
    const result = detectArticulation(history, nominal);
    expect(result.bend).toBe(true);
    expect(result.bendCents).toBeGreaterThan(30);
  });

  it('random jitter → stable=false', () => {
    const nominal = 440;
    // Large random deviations (+/-30 cents)
    const history = [];
    // Use deterministic pseudo-random for reproducibility
    let seed = 42;
    for (let i = 0; i < 20; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const centsDev = ((seed / 0x7fffffff) * 60) - 30;
      history.push(nominal * Math.pow(2, centsDev / 1200));
    }
    const result = detectArticulation(history, nominal);
    expect(result.stable).toBe(false);
  });

  it('short history (< 5) returns defaults', () => {
    const result = detectArticulation([440, 440, 440], 440);
    expect(result.stable).toBe(true);
    expect(result.vibrato).toBe(false);
    expect(result.bend).toBe(false);
  });

  it('null/empty history returns defaults', () => {
    expect(detectArticulation(null, 440).stable).toBe(true);
    expect(detectArticulation([], 440).stable).toBe(true);
  });
});

describe('intonationStats', () => {
  it('all zeros → avgCents=0, stdCents=0', () => {
    const result = intonationStats([0, 0, 0, 0, 0]);
    expect(result.avgCents).toBe(0);
    expect(result.stdCents).toBe(0);
  });

  it('constant offset → avgCents=offset, stdCents~0', () => {
    const result = intonationStats([10, 10, 10, 10, 10]);
    expect(result.avgCents).toBe(10);
    expect(result.stdCents).toBeCloseTo(0, 1);
  });

  it('known distribution → correct std', () => {
    // [-10, 10] alternating: mean=0, std=10
    const result = intonationStats([-10, 10, -10, 10, -10, 10]);
    expect(result.avgCents).toBe(0);
    expect(result.stdCents).toBeCloseTo(10, 0);
  });

  it('empty → zero defaults', () => {
    const result = intonationStats([]);
    expect(result.avgCents).toBe(0);
    expect(result.stdCents).toBe(0);
    expect(result.timeToStable).toBe(0);
    expect(result.oscillations).toBe(0);
  });

  it('null → zero defaults', () => {
    const result = intonationStats(null);
    expect(result.avgCents).toBe(0);
    expect(result.stdCents).toBe(0);
  });

  it('timeToStable finds first stable window', () => {
    // Starts unstable (>10), then stabilizes
    const result = intonationStats([25, 20, 15, 5, 3, 2, 1, 0]);
    expect(result.timeToStable).toBe(3); // index 3 is first where three consecutive < 10
  });

  it('oscillations counts direction changes', () => {
    // Clear zigzag: 0, 10, 0, 10, 0 → 3 direction changes
    const result = intonationStats([0, 10, 0, 10, 0]);
    expect(result.oscillations).toBe(3);
  });
});
