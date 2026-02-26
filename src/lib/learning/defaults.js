// Tier 2 — Overridable defaults, organized by subsystem.
// These can be overridden per-exercise via config or per-student via adaptive params.

export const DEFAULTS = Object.freeze({
  bkt: Object.freeze({ pG: 0.05, pS: 0.15, pT: 0.20 }),

  theta: Object.freeze({ initial: 0.05, alpha: 10, lr: 0.04, skipLr: 0.12 }),

  plateau: Object.freeze({
    windowSize: 5,
    threshold: 0.03,
    explorationMultiplier: 1.5,
  }),

  sigma: Object.freeze({
    base: 0.12,
    highAccRange: Object.freeze([0.15, 0.25]),
    lowAccRange: Object.freeze([0.06, 0.10]),
    accHighThreshold: 0.90,
    accLowThreshold: 0.80,
  }),

  offset: Object.freeze({
    base: 0.02,
    highAccValue: 0.05,
    lowAccValue: -0.02,
  }),

  scoring: Object.freeze({
    exploitationCap: 0.6,
    explorationC: 1.2,
    reviewUrgency: Object.freeze({ mastered: 0.3, unmastered: 0.5 }),
    confusionBoost: 0.3,
    difficultyMatchWeight: 0.3,
    interleavePenalty: -0.3,
    fatigueBias: 0.3,
    coverageBonus: Object.freeze({ sparse: 0.2, lowPL: 0.15 }),
    stuckPenalty: -1.5,
    stuckThresholds: Object.freeze({
      repeats: 2,
      pL: 0.5,
      altRepeats: 1,
      altPL: 0.3,
      altMinAttempts: 10,
      altPenalty: -0.8,
    }),
  }),

  mastery: Object.freeze({ pLThreshold: 0.80, minAttempts: 3 }),

  fsrs: Object.freeze({
    desiredRetention: 0.90,
    gradeThresholds: Object.freeze({ fast: 0.6, onTime: 1.0 }),
  }),

  drills: Object.freeze({
    microDrill: Object.freeze({ failureCount: 3, windowSize: 5, cooldown: 8 }),
    confusionDrill: Object.freeze({ minOccurrences: 2, cooldown: 10 }),
    overdueMax: 10,
  }),

  fatigue: Object.freeze({
    sessionWindow: 20,
    accDropThreshold: 0.20,
    rtIncreaseThreshold: 0.40,
    recoveryThreshold: 0.90,
  }),

  coldStart: Object.freeze({ minQuestions: 7 }),

  audio: Object.freeze({
    stableFrames: 3,
    rmsThreshold: 0.01,
    yinThreshold: 0.15,
    confidenceThreshold: 0.85,
    harmonicCorrectionEnabled: true,
    enableFeatures: false,
  }),

  calibration: Object.freeze({
    targetFrames: 100,
    safetyMultiplier: 1.5,
  }),

  holdDetection: Object.freeze({
    confirmMs: 300,
    wrongMs: 600,
    cooldownMs: 2000,
    adaptiveConfirmMs: true,
    confirmMsRange: Object.freeze([200, 500]),
  }),

  transfer: Object.freeze({
    cap: 0.3,
    clusterMinAttempts: 3,
  }),

  unified: Object.freeze({
    recallPLThreshold: 0.7,
    recallDifficultyBoost: 0.2,
    thetaWindow: 0.15,
    weaknessBoostScale: 0.5,
    minTypeWeight: 0.05,
  }),

  intonation: Object.freeze({
    poorCentsThreshold: 25,
    poorStdThreshold: 20,
    excellentCentsThreshold: 5,
    excellentStdThreshold: 8,
  }),
});
