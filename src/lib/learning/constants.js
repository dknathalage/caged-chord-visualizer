// Tier 1 — Fixed constants that must NOT be overridden.
// These are physics, math, and structural constants baked into algorithms.

export const CONSTANTS = Object.freeze({
  fsrs: Object.freeze({
    FACTOR: 19 / 81,
    DECAY: -0.5,
    W: Object.freeze([
      0.4026, 1.1839, 3.173, 15.691,   // W[0-3]: initial stability per grade
      7.195, 0.535,                      // W[4-5]: initial difficulty
      1.460,                             // W[6]: difficulty delta
      0.005,                             // W[7]: mean reversion weight
      1.546, 0.119, 1.019,              // W[8-10]: success stability increase
      1.940, 0.110, 0.296, 2.270,       // W[11-14]: failure stability
      0.232, 2.990,                      // W[15-16]: hard penalty / easy bonus
      0.517, 0.662                       // W[17-18]: same-day review
    ]),
    MS_PER_DAY: 86400000,
  }),

  audio: Object.freeze({
    FFT_SIZE: 8192,
    FREQ_MIN: 50,
    FREQ_MAX: 1400,
  }),

  history: Object.freeze({
    MAX_HIST: 5,
    MAX_TIMES: 10,
    MAX_CORRECT_TIMES: 200,
    MAX_CONFUSIONS: 10,
    MAX_RECENT: 5,
    SESSION_WINDOW: 20,
  }),
});
