import { describe, it, expect } from 'vitest';
import { resolveParams } from './params.js';
import { CONSTANTS } from './constants.js';
import { DEFAULTS } from './defaults.js';

describe('resolveParams (Tier 3 — Resolution Logic)', () => {

  describe('default resolution (no overrides)', () => {
    it('returns DEFAULTS values when called with no arguments', () => {
      const { params } = resolveParams();
      expect(params.bkt.pG).toBe(DEFAULTS.bkt.pG);
      expect(params.bkt.pS).toBe(DEFAULTS.bkt.pS);
      expect(params.bkt.pT).toBe(DEFAULTS.bkt.pT);
    });

    it('returns all subsystem keys from DEFAULTS', () => {
      const { params } = resolveParams();
      for (const key of Object.keys(DEFAULTS)) {
        expect(params).toHaveProperty(key);
      }
    });

    it('preserves all values across subsystems', () => {
      const { params } = resolveParams();
      expect(params.theta.alpha).toBe(DEFAULTS.theta.alpha);
      expect(params.theta.lr).toBe(DEFAULTS.theta.lr);
      expect(params.scoring.explorationC).toBe(DEFAULTS.scoring.explorationC);
      expect(params.mastery.pLThreshold).toBe(DEFAULTS.mastery.pLThreshold);
      expect(params.fatigue.sessionWindow).toBe(DEFAULTS.fatigue.sessionWindow);
      expect(params.coldStart.minQuestions).toBe(DEFAULTS.coldStart.minQuestions);
      expect(params.audio.stableFrames).toBe(DEFAULTS.audio.stableFrames);
      expect(params.holdDetection.confirmMs).toBe(DEFAULTS.holdDetection.confirmMs);
      expect(params.transfer.cap).toBe(DEFAULTS.transfer.cap);
      expect(params.unified.recallPLThreshold).toBe(DEFAULTS.unified.recallPLThreshold);
    });

    it('returns frozen params object', () => {
      const { params } = resolveParams();
      expect(Object.isFrozen(params)).toBe(true);
    });

    it('returns frozen subsystem objects', () => {
      const { params } = resolveParams();
      expect(Object.isFrozen(params.bkt)).toBe(true);
      expect(Object.isFrozen(params.scoring)).toBe(true);
      expect(Object.isFrozen(params.fatigue)).toBe(true);
    });
  });

  describe('config overrides (per-exercise)', () => {
    it('overrides a single value in bkt subsystem', () => {
      const { params } = resolveParams({ bkt: { pG: 0.10 } });
      expect(params.bkt.pG).toBe(0.10);
      expect(params.bkt.pS).toBe(DEFAULTS.bkt.pS); // untouched
      expect(params.bkt.pT).toBe(DEFAULTS.bkt.pT); // untouched
    });

    it('overrides a nested object in scoring subsystem', () => {
      const { params } = resolveParams({ scoring: { explorationC: 2.0 } });
      expect(params.scoring.explorationC).toBe(2.0);
      expect(params.scoring.exploitationCap).toBe(DEFAULTS.scoring.exploitationCap);
    });

    it('overrides nested sub-object (reviewUrgency)', () => {
      const { params } = resolveParams({ scoring: { reviewUrgency: { mastered: 0.5 } } });
      expect(params.scoring.reviewUrgency.mastered).toBe(0.5);
      expect(params.scoring.reviewUrgency.unmastered).toBe(DEFAULTS.scoring.reviewUrgency.unmastered);
    });

    it('overrides multiple subsystems at once', () => {
      const { params } = resolveParams({
        bkt: { pT: 0.30 },
        mastery: { minAttempts: 5 },
        coldStart: { minQuestions: 10 },
      });
      expect(params.bkt.pT).toBe(0.30);
      expect(params.mastery.minAttempts).toBe(5);
      expect(params.coldStart.minQuestions).toBe(10);
    });

    it('does not add unknown subsystems', () => {
      const { params } = resolveParams({ unknownSubsystem: { foo: 1 } });
      expect(params.unknownSubsystem).toBeUndefined();
    });
  });

  describe('adaptive overrides (per-student)', () => {
    it('adaptive bkt overrides DEFAULTS', () => {
      const { params } = resolveParams({}, { bkt: { pG: 0.08, pS: 0.12 } });
      expect(params.bkt.pG).toBe(0.08);
      expect(params.bkt.pS).toBe(0.12);
      expect(params.bkt.pT).toBe(DEFAULTS.bkt.pT); // untouched
    });

    it('adaptive overrides config overrides (higher priority)', () => {
      const { params } = resolveParams(
        { bkt: { pG: 0.10 } },          // config says 0.10
        { bkt: { pG: 0.03 } }           // adaptive says 0.03
      );
      expect(params.bkt.pG).toBe(0.03); // adaptive wins
    });

    it('adaptive overrides config for any subsystem', () => {
      const { params } = resolveParams(
        { fatigue: { sessionWindow: 30 } },
        { fatigue: { sessionWindow: 15 } }
      );
      expect(params.fatigue.sessionWindow).toBe(15); // adaptive wins
    });

    it('does not apply null adaptive subsystem', () => {
      const { params } = resolveParams({}, { bkt: null });
      expect(params.bkt.pG).toBe(DEFAULTS.bkt.pG);
    });

    it('does not apply undefined adaptive subsystem', () => {
      const { params } = resolveParams({}, { bkt: undefined });
      expect(params.bkt.pG).toBe(DEFAULTS.bkt.pG);
    });
  });

  describe('backward compatibility with bktParams', () => {
    it('maps bktParams to bkt subsystem', () => {
      const { params } = resolveParams({ bktParams: { pG: 0.07, pS: 0.20, pT: 0.25 } });
      expect(params.bkt.pG).toBe(0.07);
      expect(params.bkt.pS).toBe(0.20);
      expect(params.bkt.pT).toBe(0.25);
    });

    it('bktParams is ignored when bkt is also present', () => {
      const { params } = resolveParams({
        bkt: { pG: 0.09 },
        bktParams: { pG: 0.07 },
      });
      expect(params.bkt.pG).toBe(0.09); // bkt takes precedence over bktParams
    });

    it('adaptive still overrides bktParams', () => {
      const { params } = resolveParams(
        { bktParams: { pG: 0.07 } },
        { bkt: { pG: 0.02 } }
      );
      expect(params.bkt.pG).toBe(0.02); // adaptive wins over bktParams
    });
  });

  describe('CONSTANTS not overridable', () => {
    it('returns CONSTANTS unchanged', () => {
      const { constants } = resolveParams();
      expect(constants).toBe(CONSTANTS);
    });

    it('CONSTANTS is the same frozen object regardless of overrides', () => {
      const { constants } = resolveParams({ bkt: { pG: 99 } }, { bkt: { pS: 99 } });
      expect(constants).toBe(CONSTANTS);
      expect(constants.fsrs.FACTOR).toBeCloseTo(19 / 81);
      expect(constants.fsrs.DECAY).toBe(-0.5);
    });

    it('CONSTANTS values are not present in params', () => {
      const { params } = resolveParams();
      expect(params.fsrs.FACTOR).toBeUndefined();
      expect(params.fsrs.DECAY).toBeUndefined();
      expect(params.fsrs.W).toBeUndefined();
      expect(params.fsrs.MS_PER_DAY).toBeUndefined();
    });

    it('config overrides cannot inject CONSTANTS-level keys into params', () => {
      const { params } = resolveParams({ fsrs: { FACTOR: 999 } });
      // FACTOR is not a key in DEFAULTS.fsrs, so it won't appear
      expect(params.fsrs.FACTOR).toBeUndefined();
      expect(params.fsrs.desiredRetention).toBe(DEFAULTS.fsrs.desiredRetention);
    });
  });

  describe('deep merge does not mutate DEFAULTS', () => {
    it('DEFAULTS remains unchanged after resolveParams with overrides', () => {
      const originalPG = DEFAULTS.bkt.pG;
      const originalPT = DEFAULTS.bkt.pT;
      const originalLr = DEFAULTS.theta.lr;

      resolveParams({ bkt: { pG: 0.99 }, theta: { lr: 0.99 } });

      expect(DEFAULTS.bkt.pG).toBe(originalPG);
      expect(DEFAULTS.bkt.pT).toBe(originalPT);
      expect(DEFAULTS.theta.lr).toBe(originalLr);
    });

    it('DEFAULTS remains unchanged after adaptive overrides', () => {
      const originalPG = DEFAULTS.bkt.pG;

      resolveParams({}, { bkt: { pG: 0.99 } });

      expect(DEFAULTS.bkt.pG).toBe(originalPG);
    });

    it('multiple calls return independent results', () => {
      const { params: p1 } = resolveParams({ bkt: { pG: 0.01 } });
      const { params: p2 } = resolveParams({ bkt: { pG: 0.99 } });
      expect(p1.bkt.pG).toBe(0.01);
      expect(p2.bkt.pG).toBe(0.99);
    });
  });

  describe('full resolution priority chain', () => {
    it('adaptive > config > DEFAULTS', () => {
      const { params } = resolveParams(
        { bkt: { pG: 0.10, pS: 0.20 } },   // config overrides pG and pS
        { bkt: { pG: 0.03 } }                // adaptive overrides only pG
      );
      expect(params.bkt.pG).toBe(0.03);  // adaptive
      expect(params.bkt.pS).toBe(0.20);  // config override
      expect(params.bkt.pT).toBe(0.20);  // DEFAULTS
    });

    it('empty overrides fall through to DEFAULTS', () => {
      const { params } = resolveParams({}, {});
      expect(params.bkt.pG).toBe(DEFAULTS.bkt.pG);
      expect(params.theta.lr).toBe(DEFAULTS.theta.lr);
    });
  });
});
