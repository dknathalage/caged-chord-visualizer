import { describe, it, expect } from 'vitest';
import { createDrillTracker } from './drill-tracker.js';

describe('createDrillTracker', () => {
  it('initializes with zeroed state', () => {
    const tracker = createDrillTracker();
    expect(tracker.state.microDrill).toEqual({ helped: 0, total: 0 });
    expect(tracker.state.confusionDrill).toEqual({ helped: 0, total: 0 });
  });

  describe('markDrillFired + checkImprovement', () => {
    it('returns null until 3 post-drill attempts', () => {
      const tracker = createDrillTracker();
      tracker.markDrillFired('item_a', 'microDrill', [false, false, true]);
      expect(tracker.checkImprovement('item_a', true)).toBeNull();
      expect(tracker.checkImprovement('item_a', true)).toBeNull();
    });

    it('evaluates improvement after 3 attempts', () => {
      const tracker = createDrillTracker();
      // Pre-drill: 1/3 correct = 0.333 accuracy
      tracker.markDrillFired('item_a', 'microDrill', [false, false, true]);
      tracker.checkImprovement('item_a', true);
      tracker.checkImprovement('item_a', true);
      const result = tracker.checkImprovement('item_a', true);
      // Post-drill: 3/3 = 1.0 > 0.333 -> improved
      expect(result).toBe(true);
      expect(tracker.state.microDrill).toEqual({ helped: 1, total: 1 });
    });

    it('records non-improvement', () => {
      const tracker = createDrillTracker();
      // Pre-drill: 2/3 correct = 0.667 accuracy
      tracker.markDrillFired('item_a', 'microDrill', [true, false, true]);
      tracker.checkImprovement('item_a', false);
      tracker.checkImprovement('item_a', true);
      const result = tracker.checkImprovement('item_a', false);
      // Post-drill: 1/3 = 0.333 < 0.667 -> not improved
      expect(result).toBe(false);
      expect(tracker.state.microDrill).toEqual({ helped: 0, total: 1 });
    });

    it('returns null for unknown items', () => {
      const tracker = createDrillTracker();
      expect(tracker.checkImprovement('unknown', true)).toBeNull();
    });

    it('clears pending after evaluation', () => {
      const tracker = createDrillTracker();
      tracker.markDrillFired('item_a', 'microDrill', [false, false, false]);
      tracker.checkImprovement('item_a', true);
      tracker.checkImprovement('item_a', true);
      tracker.checkImprovement('item_a', true);
      // Should return null now — no longer pending
      expect(tracker.checkImprovement('item_a', true)).toBeNull();
    });

    it('tracks confusion drills separately', () => {
      const tracker = createDrillTracker();
      tracker.markDrillFired('item_a', 'confusionDrill', [false, false, false]);
      tracker.checkImprovement('item_a', true);
      tracker.checkImprovement('item_a', true);
      tracker.checkImprovement('item_a', true);
      expect(tracker.state.confusionDrill).toEqual({ helped: 1, total: 1 });
      expect(tracker.state.microDrill).toEqual({ helped: 0, total: 0 });
    });

    it('handles zero pre-drill accuracy (empty history)', () => {
      const tracker = createDrillTracker();
      tracker.markDrillFired('item_a', 'microDrill', []);
      tracker.checkImprovement('item_a', true);
      tracker.checkImprovement('item_a', false);
      const result = tracker.checkImprovement('item_a', false);
      // Post: 1/3 = 0.333 > 0 (pre) -> improved
      expect(result).toBe(true);
    });
  });

  describe('getEffectiveness', () => {
    it('returns null with fewer than 3 evaluations', () => {
      const tracker = createDrillTracker();
      expect(tracker.getEffectiveness('microDrill')).toBeNull();

      tracker.state.microDrill.total = 2;
      tracker.state.microDrill.helped = 2;
      expect(tracker.getEffectiveness('microDrill')).toBeNull();
    });

    it('returns ratio with 3+ evaluations', () => {
      const tracker = createDrillTracker();
      tracker.state.microDrill.total = 4;
      tracker.state.microDrill.helped = 3;
      expect(tracker.getEffectiveness('microDrill')).toBeCloseTo(0.75, 2);
    });
  });

  describe('adjustCooldown', () => {
    it('returns base cooldown with insufficient data', () => {
      const tracker = createDrillTracker();
      expect(tracker.adjustCooldown(8, 'microDrill')).toBe(8);
    });

    it('reduces cooldown for effective drills (>0.6)', () => {
      const tracker = createDrillTracker();
      tracker.state.microDrill.total = 5;
      tracker.state.microDrill.helped = 4; // 0.80
      expect(tracker.adjustCooldown(8, 'microDrill')).toBe(6);
    });

    it('increases cooldown for ineffective drills (<0.3)', () => {
      const tracker = createDrillTracker();
      tracker.state.microDrill.total = 5;
      tracker.state.microDrill.helped = 1; // 0.20
      expect(tracker.adjustCooldown(8, 'microDrill')).toBe(12);
    });

    it('returns base cooldown for moderate effectiveness', () => {
      const tracker = createDrillTracker();
      tracker.state.microDrill.total = 5;
      tracker.state.microDrill.helped = 2; // 0.40
      expect(tracker.adjustCooldown(8, 'microDrill')).toBe(8);
    });

    it('works for confusionDrill type', () => {
      const tracker = createDrillTracker();
      tracker.state.confusionDrill.total = 3;
      tracker.state.confusionDrill.helped = 3; // 1.0, effective
      expect(tracker.adjustCooldown(10, 'confusionDrill')).toBe(7.5);
    });
  });
});
