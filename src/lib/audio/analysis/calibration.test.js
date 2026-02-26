import { describe, it, expect } from 'vitest';
import { NoiseCalibrator } from './calibration.js';

describe('NoiseCalibrator', () => {
  it('collects exactly targetFrames before computing', () => {
    const cal = new NoiseCalibrator({ targetFrames: 5 });
    expect(cal.calibrated).toBe(false);

    expect(cal.addFrame(0.01)).toBeNull();
    expect(cal.addFrame(0.02)).toBeNull();
    expect(cal.addFrame(0.01)).toBeNull();
    expect(cal.addFrame(0.015)).toBeNull();
    expect(cal.calibrated).toBe(false);

    const result = cal.addFrame(0.012);
    expect(result).not.toBeNull();
    expect(cal.calibrated).toBe(true);
  });

  it('computes P95 noise floor correctly', () => {
    const cal = new NoiseCalibrator({ targetFrames: 20, safetyMultiplier: 1.0 });

    // Feed 20 values: 0.01 to 0.20
    for (let i = 1; i <= 20; i++) {
      cal.addFrame(i * 0.01);
    }

    // P95 index = floor(20 * 0.95) = 19 (0-indexed), sorted values are 0.01..0.20
    // sorted[19] = 0.20
    expect(cal.noiseFloor).toBeCloseTo(0.20, 5);
  });

  it('applies safety multiplier', () => {
    const cal = new NoiseCalibrator({ targetFrames: 10, safetyMultiplier: 2.0 });

    for (let i = 0; i < 10; i++) {
      cal.addFrame(0.01);
    }

    expect(cal.noiseFloor).toBeCloseTo(0.01, 5);
    expect(cal.rmsThreshold).toBeCloseTo(0.02, 5);
  });

  it('low noise environment produces low threshold', () => {
    const cal = new NoiseCalibrator({ targetFrames: 100, safetyMultiplier: 1.5 });

    for (let i = 0; i < 100; i++) {
      cal.addFrame(0.001 + Math.random() * 0.001); // very low RMS: 0.001-0.002
    }

    expect(cal.rmsThreshold).toBeLessThan(0.005);
  });

  it('noisy environment produces higher threshold', () => {
    const cal = new NoiseCalibrator({ targetFrames: 100, safetyMultiplier: 1.5 });

    for (let i = 0; i < 100; i++) {
      cal.addFrame(0.05 + Math.random() * 0.03); // noisy: 0.05-0.08
    }

    expect(cal.rmsThreshold).toBeGreaterThan(0.05);
  });

  it('reset clears state', () => {
    const cal = new NoiseCalibrator({ targetFrames: 5 });

    for (let i = 0; i < 5; i++) cal.addFrame(0.01);
    expect(cal.calibrated).toBe(true);

    cal.reset();
    expect(cal.calibrated).toBe(false);
    expect(cal.noiseFloor).toBe(0);
    expect(cal.rmsThreshold).toBe(0);

    // Can recalibrate after reset
    for (let i = 0; i < 5; i++) cal.addFrame(0.02);
    expect(cal.calibrated).toBe(true);
    expect(cal.noiseFloor).toBeCloseTo(0.02, 5);
  });

  it('returns null after already calibrated', () => {
    const cal = new NoiseCalibrator({ targetFrames: 3 });

    cal.addFrame(0.01);
    cal.addFrame(0.02);
    const result = cal.addFrame(0.015);
    expect(result).not.toBeNull();

    expect(cal.addFrame(0.03)).toBeNull();
  });

  it('uses default params when none provided', () => {
    const cal = new NoiseCalibrator();

    // Default targetFrames is 100
    for (let i = 0; i < 99; i++) {
      expect(cal.addFrame(0.01)).toBeNull();
    }
    const result = cal.addFrame(0.01);
    expect(result).not.toBeNull();
    // Default safetyMultiplier is 1.5
    expect(cal.rmsThreshold).toBeCloseTo(0.015, 5);
  });
});
