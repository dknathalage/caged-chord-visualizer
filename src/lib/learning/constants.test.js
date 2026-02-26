import { describe, it, expect } from 'vitest';
import { CONSTANTS } from './constants.js';

describe('CONSTANTS (Tier 1 — Fixed)', () => {
  it('exports a frozen object', () => {
    expect(Object.isFrozen(CONSTANTS)).toBe(true);
  });

  describe('fsrs', () => {
    it('is frozen', () => {
      expect(Object.isFrozen(CONSTANTS.fsrs)).toBe(true);
    });

    it('FACTOR = 19/81', () => {
      expect(CONSTANTS.fsrs.FACTOR).toBeCloseTo(19 / 81, 10);
    });

    it('DECAY = -0.5', () => {
      expect(CONSTANTS.fsrs.DECAY).toBe(-0.5);
    });

    it('MS_PER_DAY = 86400000', () => {
      expect(CONSTANTS.fsrs.MS_PER_DAY).toBe(86400000);
    });

    it('W has 19 elements', () => {
      expect(CONSTANTS.fsrs.W).toHaveLength(19);
      expect(Object.isFrozen(CONSTANTS.fsrs.W)).toBe(true);
    });

    it('W values match fsrs.js', () => {
      const expected = [
        0.4026, 1.1839, 3.173, 15.691,
        7.195, 0.535,
        1.460,
        0.005,
        1.546, 0.119, 1.019,
        1.940, 0.110, 0.296, 2.270,
        0.232, 2.990,
        0.517, 0.662,
      ];
      for (let i = 0; i < 19; i++) {
        expect(CONSTANTS.fsrs.W[i]).toBeCloseTo(expected[i], 5);
      }
    });
  });

  describe('audio', () => {
    it('is frozen', () => {
      expect(Object.isFrozen(CONSTANTS.audio)).toBe(true);
    });

    it('FFT_SIZE = 8192', () => {
      expect(CONSTANTS.audio.FFT_SIZE).toBe(8192);
    });

    it('FREQ_MIN = 50', () => {
      expect(CONSTANTS.audio.FREQ_MIN).toBe(50);
    });

    it('FREQ_MAX = 1400', () => {
      expect(CONSTANTS.audio.FREQ_MAX).toBe(1400);
    });
  });

  describe('history', () => {
    it('is frozen', () => {
      expect(Object.isFrozen(CONSTANTS.history)).toBe(true);
    });

    it('MAX_HIST = 5', () => {
      expect(CONSTANTS.history.MAX_HIST).toBe(5);
    });

    it('MAX_TIMES = 10', () => {
      expect(CONSTANTS.history.MAX_TIMES).toBe(10);
    });

    it('MAX_CORRECT_TIMES = 200', () => {
      expect(CONSTANTS.history.MAX_CORRECT_TIMES).toBe(200);
    });

    it('MAX_CONFUSIONS = 10', () => {
      expect(CONSTANTS.history.MAX_CONFUSIONS).toBe(10);
    });

    it('MAX_RECENT = 5', () => {
      expect(CONSTANTS.history.MAX_RECENT).toBe(5);
    });

    it('SESSION_WINDOW = 20', () => {
      expect(CONSTANTS.history.SESSION_WINDOW).toBe(20);
    });
  });
});
