import { describe, it, expect } from 'vitest';
import { spectralFlux, OnsetDetector, IOITracker } from './onset.js';

describe('spectralFlux', () => {
  it('returns 0 for identical spectra', () => {
    const a = new Float32Array([1, 2, 3, 4]);
    const b = new Float32Array([1, 2, 3, 4]);
    expect(spectralFlux(a, b)).toBe(0);
  });

  it('returns positive flux for increasing magnitudes', () => {
    const prev = new Float32Array([1, 1, 1, 1]);
    const curr = new Float32Array([3, 3, 3, 3]);
    expect(spectralFlux(curr, prev)).toBe(8); // 4 bins * 2 diff
  });

  it('half-wave rectifies: decreasing bins contribute 0', () => {
    const prev = new Float32Array([5, 5, 5, 5]);
    const curr = new Float32Array([1, 1, 1, 1]);
    expect(spectralFlux(curr, prev)).toBe(0);
  });

  it('mixed increases and decreases: only increases contribute', () => {
    const prev = new Float32Array([1, 5, 1, 5]);
    const curr = new Float32Array([3, 2, 4, 1]);
    // diffs: +2, -3, +3, -4 => only +2 and +3 = 5
    expect(spectralFlux(curr, prev)).toBe(5);
  });

  it('returns 0 when previous is null', () => {
    const curr = new Float32Array([1, 2, 3]);
    expect(spectralFlux(curr, null)).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    const curr = new Float32Array([1, 2, 3]);
    const prev = new Float32Array([1, 2]);
    expect(spectralFlux(curr, prev)).toBe(0);
  });
});

describe('OnsetDetector', () => {
  it('returns null during warmup (< medianWindow frames)', () => {
    const det = new OnsetDetector({ medianWindow: 5 });
    for (let i = 0; i < 4; i++) {
      expect(det.detect(1.0, i * 100)).toBeNull();
    }
  });

  it('detects peaks above adaptive threshold', () => {
    const det = new OnsetDetector({ medianWindow: 5, thresholdMultiplier: 1.5, minOnsetInterval: 0 });
    // Fill with low flux values
    for (let i = 0; i < 4; i++) {
      det.detect(1.0, i * 100);
    }
    // 5th value: still 1.0, median=1.0, threshold=1.5, 1.0 < 1.5 => no onset
    expect(det.detect(1.0, 400)).toBeNull();
    // Now spike to 10.0 => median is still ~1.0, threshold=1.5, 10 > 1.5 => onset
    const result = det.detect(10.0, 500);
    expect(result).not.toBeNull();
    expect(result.strength).toBe(10.0);
    expect(result.timeMs).toBe(500);
  });

  it('respects minOnsetInterval', () => {
    const det = new OnsetDetector({ medianWindow: 3, thresholdMultiplier: 1.0, minOnsetInterval: 200 });
    // Fill window with low values (times spaced so first spike clears minInterval from t=0)
    det.detect(1.0, 0);
    det.detect(1.0, 100);
    det.detect(1.0, 200);
    // Spike detected (300 - 0 = 300 >= 200 from initial _lastOnsetTime=0)
    const r1 = det.detect(5.0, 300);
    expect(r1).not.toBeNull();
    // Another spike too soon (< 200ms after r1 at 300)
    det.detect(1.0, 350); // push a low value to keep median low
    det.detect(1.0, 400);
    const r2 = det.detect(5.0, 450);
    expect(r2).toBeNull(); // 450 - 300 = 150 < 200
    // After enough time passes
    det.detect(1.0, 480);
    det.detect(1.0, 490);
    const r3 = det.detect(5.0, 550);
    expect(r3).not.toBeNull(); // 550 - 300 = 250 >= 200
  });

  it('reset clears state', () => {
    const det = new OnsetDetector({ medianWindow: 3 });
    det.detect(1.0, 0);
    det.detect(1.0, 100);
    det.detect(1.0, 200);
    det.reset();
    // Should be back in warmup
    expect(det.detect(10.0, 300)).toBeNull();
  });
});

describe('IOITracker', () => {
  it('records onsets and computes IOIs correctly', () => {
    const tracker = new IOITracker();
    tracker.addOnset(100);
    tracker.addOnset(350);
    tracker.addOnset(600);
    expect(tracker.getIOIs()).toEqual([250, 250]);
  });

  it('returns empty IOIs for single onset', () => {
    const tracker = new IOITracker();
    tracker.addOnset(100);
    expect(tracker.getIOIs()).toEqual([]);
  });

  describe('estimateTempo', () => {
    it('500ms IOI returns 120 BPM', () => {
      const tracker = new IOITracker();
      tracker.addOnset(0);
      tracker.addOnset(500);
      tracker.addOnset(1000);
      expect(tracker.estimateTempo()).toBe(120);
    });

    it('needs >= 2 IOIs (3 onsets)', () => {
      const tracker = new IOITracker();
      tracker.addOnset(0);
      tracker.addOnset(500);
      // Only 1 IOI
      expect(tracker.estimateTempo()).toBeNull();
    });

    it('returns null with no onsets', () => {
      const tracker = new IOITracker();
      expect(tracker.estimateTempo()).toBeNull();
    });
  });

  describe('matchPattern', () => {
    it('perfect match returns score 1.0', () => {
      const tracker = new IOITracker();
      tracker.addOnset(1000);
      tracker.addOnset(1500);
      tracker.addOnset(2000);
      const result = tracker.matchPattern([0, 500, 1000]);
      expect(result).not.toBeNull();
      expect(result.score).toBe(1.0);
      expect(result.avgErrorMs).toBe(0);
    });

    it('offset match shows errors reflecting offset', () => {
      const tracker = new IOITracker();
      tracker.addOnset(1000);
      tracker.addOnset(1550); // 50ms late
      tracker.addOnset(2050); // 50ms late
      const result = tracker.matchPattern([0, 500, 1000]);
      expect(result).not.toBeNull();
      // errors: [0, 50, 50]
      expect(result.errors).toEqual([0, 50, 50]);
      expect(result.score).toBe(1.0); // all within 75ms tolerance
    });

    it('returns null for insufficient onsets', () => {
      const tracker = new IOITracker();
      tracker.addOnset(1000);
      const result = tracker.matchPattern([0, 500, 1000]);
      expect(result).toBeNull();
    });

    it('scores partial matches correctly', () => {
      const tracker = new IOITracker();
      tracker.addOnset(1000);
      tracker.addOnset(1600); // 100ms late
      tracker.addOnset(2200); // 200ms late
      const result = tracker.matchPattern([0, 500, 1000], 75);
      expect(result).not.toBeNull();
      // errors: [0, 100, 200]; only first within 75ms
      expect(result.score).toBeCloseTo(0.33, 1);
    });
  });

  it('buffer respects maxOnsets limit', () => {
    const tracker = new IOITracker(4);
    for (let i = 0; i < 10; i++) {
      tracker.addOnset(i * 100);
    }
    expect(tracker.onsetCount).toBe(4);
    // IOIs should be from the last 4 onsets: 600, 700, 800, 900
    expect(tracker.getIOIs()).toEqual([100, 100, 100]);
  });

  it('reset clears all onsets', () => {
    const tracker = new IOITracker();
    tracker.addOnset(100);
    tracker.addOnset(200);
    tracker.reset();
    expect(tracker.onsetCount).toBe(0);
    expect(tracker.getIOIs()).toEqual([]);
  });
});
