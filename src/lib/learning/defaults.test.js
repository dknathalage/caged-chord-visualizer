import { describe, it, expect } from 'vitest';
import { DEFAULTS } from './defaults.js';

describe('DEFAULTS (Tier 2 — Overridable)', () => {
  it('exports a frozen object', () => {
    expect(Object.isFrozen(DEFAULTS)).toBe(true);
  });

  describe('bkt', () => {
    it('matches engine.js BKT_AUDIO defaults', () => {
      expect(DEFAULTS.bkt.pG).toBe(0.05);
      expect(DEFAULTS.bkt.pS).toBe(0.15);
      expect(DEFAULTS.bkt.pT).toBe(0.20);
    });
  });

  describe('theta', () => {
    it('initial = 0.05 (engine.js constructor)', () => {
      expect(DEFAULTS.theta.initial).toBe(0.05);
    });

    it('alpha = 10 (theta.js updateTheta)', () => {
      expect(DEFAULTS.theta.alpha).toBe(10);
    });

    it('lr = 0.04 (engine.js report default)', () => {
      expect(DEFAULTS.theta.lr).toBe(0.04);
    });

    it('skipLr = 0.12 (engine.js report skipped)', () => {
      expect(DEFAULTS.theta.skipLr).toBe(0.12);
    });
  });

  describe('plateau', () => {
    it('windowSize = 5 (theta.js checkPlateau)', () => {
      expect(DEFAULTS.plateau.windowSize).toBe(5);
    });

    it('threshold = 0.03 (theta.js range check)', () => {
      expect(DEFAULTS.plateau.threshold).toBe(0.03);
    });

    it('explorationMultiplier = 1.5 (scorer.js plateau C boost)', () => {
      expect(DEFAULTS.plateau.explorationMultiplier).toBe(1.5);
    });
  });

  describe('sigma', () => {
    it('base = 0.12 (theta.js adaptiveSigma default)', () => {
      expect(DEFAULTS.sigma.base).toBe(0.12);
    });

    it('highAccRange = [0.15, 0.25]', () => {
      expect(DEFAULTS.sigma.highAccRange).toEqual([0.15, 0.25]);
    });

    it('lowAccRange = [0.06, 0.10]', () => {
      expect(DEFAULTS.sigma.lowAccRange).toEqual([0.06, 0.10]);
    });

    it('accHighThreshold = 0.90', () => {
      expect(DEFAULTS.sigma.accHighThreshold).toBe(0.90);
    });

    it('accLowThreshold = 0.80', () => {
      expect(DEFAULTS.sigma.accLowThreshold).toBe(0.80);
    });
  });

  describe('offset', () => {
    it('base = 0.02 (theta.js adaptiveOffset default)', () => {
      expect(DEFAULTS.offset.base).toBe(0.02);
    });

    it('highAccValue = 0.05', () => {
      expect(DEFAULTS.offset.highAccValue).toBe(0.05);
    });

    it('lowAccValue = -0.02', () => {
      expect(DEFAULTS.offset.lowAccValue).toBe(-0.02);
    });
  });

  describe('scoring', () => {
    it('exploitationCap = 0.6 (scorer.js Math.min)', () => {
      expect(DEFAULTS.scoring.exploitationCap).toBe(0.6);
    });

    it('explorationC = 1.2 (scorer.js UCB1 constant)', () => {
      expect(DEFAULTS.scoring.explorationC).toBe(1.2);
    });

    it('reviewUrgency mastered=0.3, unmastered=0.5', () => {
      expect(DEFAULTS.scoring.reviewUrgency.mastered).toBe(0.3);
      expect(DEFAULTS.scoring.reviewUrgency.unmastered).toBe(0.5);
    });

    it('confusionBoost = 0.3', () => {
      expect(DEFAULTS.scoring.confusionBoost).toBe(0.3);
    });

    it('difficultyMatchWeight = 0.3', () => {
      expect(DEFAULTS.scoring.difficultyMatchWeight).toBe(0.3);
    });

    it('interleavePenalty = -0.3', () => {
      expect(DEFAULTS.scoring.interleavePenalty).toBe(-0.3);
    });

    it('fatigueBias = 0.3', () => {
      expect(DEFAULTS.scoring.fatigueBias).toBe(0.3);
    });

    it('coverageBonus sparse=0.2, lowPL=0.15', () => {
      expect(DEFAULTS.scoring.coverageBonus.sparse).toBe(0.2);
      expect(DEFAULTS.scoring.coverageBonus.lowPL).toBe(0.15);
    });

    it('stuckPenalty = -1.5', () => {
      expect(DEFAULTS.scoring.stuckPenalty).toBe(-1.5);
    });

    it('stuckThresholds match scorer.js conditions', () => {
      expect(DEFAULTS.scoring.stuckThresholds.repeats).toBe(2);
      expect(DEFAULTS.scoring.stuckThresholds.pL).toBe(0.5);
      expect(DEFAULTS.scoring.stuckThresholds.altRepeats).toBe(1);
      expect(DEFAULTS.scoring.stuckThresholds.altPL).toBe(0.3);
      expect(DEFAULTS.scoring.stuckThresholds.altMinAttempts).toBe(10);
      expect(DEFAULTS.scoring.stuckThresholds.altPenalty).toBe(-0.8);
    });
  });

  describe('mastery', () => {
    it('pLThreshold = 0.80, minAttempts = 3 (scorer.js isMastered)', () => {
      expect(DEFAULTS.mastery.pLThreshold).toBe(0.80);
      expect(DEFAULTS.mastery.minAttempts).toBe(3);
    });
  });

  describe('fsrs', () => {
    it('desiredRetention = 0.90 (fsrs.js updateFSRS)', () => {
      expect(DEFAULTS.fsrs.desiredRetention).toBe(0.90);
    });

    it('gradeThresholds match gradeFromResponse', () => {
      expect(DEFAULTS.fsrs.gradeThresholds.fast).toBe(0.6);
      expect(DEFAULTS.fsrs.gradeThresholds.onTime).toBe(1.0);
    });
  });

  describe('drills', () => {
    it('microDrill params match drills.js', () => {
      expect(DEFAULTS.drills.microDrill.failureCount).toBe(3);
      expect(DEFAULTS.drills.microDrill.windowSize).toBe(5);
      expect(DEFAULTS.drills.microDrill.cooldown).toBe(8);
    });

    it('confusionDrill params match drills.js', () => {
      expect(DEFAULTS.drills.confusionDrill.minOccurrences).toBe(2);
      expect(DEFAULTS.drills.confusionDrill.cooldown).toBe(10);
    });

    it('overdueMax = 10 (drills.js buildOverdueQueue)', () => {
      expect(DEFAULTS.drills.overdueMax).toBe(10);
    });
  });

  describe('fatigue', () => {
    it('sessionWindow = 20 (fatigue.js SESSION_WINDOW)', () => {
      expect(DEFAULTS.fatigue.sessionWindow).toBe(20);
    });

    it('accDropThreshold = 0.20', () => {
      expect(DEFAULTS.fatigue.accDropThreshold).toBe(0.20);
    });

    it('rtIncreaseThreshold = 0.40', () => {
      expect(DEFAULTS.fatigue.rtIncreaseThreshold).toBe(0.40);
    });

    it('recoveryThreshold = 0.90', () => {
      expect(DEFAULTS.fatigue.recoveryThreshold).toBe(0.90);
    });
  });

  describe('coldStart', () => {
    it('minQuestions = 7 (engine.js COLD_START)', () => {
      expect(DEFAULTS.coldStart.minQuestions).toBe(7);
    });
  });

  describe('audio', () => {
    it('stableFrames = 3 (AudioManager.js STABLE_FRAMES)', () => {
      expect(DEFAULTS.audio.stableFrames).toBe(3);
    });

    it('rmsThreshold = 0.01 (AudioManager.js rms check)', () => {
      expect(DEFAULTS.audio.rmsThreshold).toBe(0.01);
    });

    it('yinThreshold = 0.15 (pitch.js YIN threshold)', () => {
      expect(DEFAULTS.audio.yinThreshold).toBe(0.15);
    });

    it('confidenceThreshold = 0.85 (pitch.js confidence)', () => {
      expect(DEFAULTS.audio.confidenceThreshold).toBe(0.85);
    });
  });

  describe('holdDetection', () => {
    it('confirmMs = 300, wrongMs = 600, cooldownMs = 2000', () => {
      expect(DEFAULTS.holdDetection.confirmMs).toBe(300);
      expect(DEFAULTS.holdDetection.wrongMs).toBe(600);
      expect(DEFAULTS.holdDetection.cooldownMs).toBe(2000);
    });
  });

  describe('transfer', () => {
    it('cap = 0.3 (item-manager.js Math.min)', () => {
      expect(DEFAULTS.transfer.cap).toBe(0.3);
    });

    it('clusterMinAttempts = 3 (item-manager.js cl.total >= 3)', () => {
      expect(DEFAULTS.transfer.clusterMinAttempts).toBe(3);
    });
  });

  describe('unified', () => {
    it('recallPLThreshold = 0.7 (unified.js RECALL_PL_THRESHOLD)', () => {
      expect(DEFAULTS.unified.recallPLThreshold).toBe(0.7);
    });

    it('recallDifficultyBoost = 0.2 (unified.js RECALL_DIFFICULTY_BOOST)', () => {
      expect(DEFAULTS.unified.recallDifficultyBoost).toBe(0.2);
    });

    it('thetaWindow = 0.15 (unified.js computeTypeWeights)', () => {
      expect(DEFAULTS.unified.thetaWindow).toBe(0.15);
    });

    it('weaknessBoostScale = 0.5', () => {
      expect(DEFAULTS.unified.weaknessBoostScale).toBe(0.5);
    });

    it('minTypeWeight = 0.05', () => {
      expect(DEFAULTS.unified.minTypeWeight).toBe(0.05);
    });
  });

  it('all subsystem keys are present', () => {
    const expected = [
      'bkt', 'theta', 'plateau', 'sigma', 'offset', 'scoring', 'mastery',
      'fsrs', 'drills', 'fatigue', 'coldStart', 'audio', 'holdDetection',
      'transfer', 'unified'
    ];
    for (const key of expected) {
      expect(DEFAULTS).toHaveProperty(key);
    }
  });
});
