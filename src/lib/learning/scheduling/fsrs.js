import { clamp } from '../math-utils.js';

// FSRS constants
export const FACTOR = 19 / 81;
export const DECAY = -0.5;

// FSRS default parameters (W[0..18])
export const W = [
  0.4026, 1.1839, 3.173, 15.691,   // W[0-3]: initial stability per grade
  7.195, 0.535,                      // W[4-5]: initial difficulty
  1.460,                             // W[6]: difficulty delta
  0.005,                             // W[7]: mean reversion weight
  1.546, 0.119, 1.019,              // W[8-10]: success stability increase
  1.940, 0.110, 0.296, 2.270,       // W[11-14]: failure stability
  0.232, 2.990,                      // W[15-16]: hard penalty / easy bonus
  0.517, 0.662                       // W[17-18]: same-day review
];

export function fsrsRetrievability(elapsed, S) {
  if (S <= 0) return 0;
  return (1 + FACTOR * elapsed / S) ** DECAY;
}

export function fsrsInitialStability(grade) {
  return W[clamp(grade - 1, 0, 3)];
}

export function fsrsInitialDifficulty(grade) {
  return clamp(W[4] - Math.exp(W[5] * (grade - 1)) + 1, 1, 10);
}

export function fsrsSuccessStability(S, D, R, grade) {
  const sInc = Math.exp(W[8]) * (11 - D) * (S ** -W[9]) * (Math.exp(W[10] * (1 - R)) - 1)
    * (grade === 2 ? W[15] : 1)
    * (grade === 4 ? W[16] : 1);
  return S * Math.max(1.01, sInc); // ensure S always increases on success
}

export function fsrsFailStability(S, D, R) {
  return Math.max(0.1, W[11] * (D ** -W[12]) * ((S + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R)));
}

export function fsrsUpdateDifficulty(D, grade) {
  const d0Easy = clamp(W[4] - Math.exp(W[5] * (4 - 1)) + 1, 1, 10);
  const deltaD = -W[6] * (grade - 3);
  return clamp(W[7] * d0Easy + (1 - W[7]) * (D + deltaD * (10 - D) / 9), 1, 10);
}

export function fsrsInterval(S, desiredRetention) {
  return (S / FACTOR) * (desiredRetention ** (1 / DECAY) - 1);
}

export function gradeFromResponse(ok, timeMs, medianTime) {
  if (!ok) return 1;
  if (medianTime <= 0 || timeMs == null) return 3;
  if (timeMs < medianTime * 0.6) return 4;
  if (timeMs < medianTime * 1.0) return 3;
  return 2;
}

export function gradeFromResponseEnhanced(ok, timeMs, medianTime, avgCents, stdCents) {
  const baseGrade = gradeFromResponse(ok, timeMs, medianTime);
  if (!ok) return 1;
  const absCents = Math.abs(avgCents);
  if (absCents > 25 || stdCents > 20) return Math.max(1, baseGrade - 1);
  if (absCents < 5 && stdCents < 8) return Math.min(4, baseGrade + 1);
  return baseGrade;
}

const MS_PER_DAY = 86400000;

export function updateFSRS(rec, grade) {
  const now = Date.now();

  if (rec.S === 0) {
    rec.S = fsrsInitialStability(grade);
    rec.D = fsrsInitialDifficulty(grade);
  } else {
    const elapsed = rec.lastReviewTs > 0 ? (now - rec.lastReviewTs) / MS_PER_DAY : 0;
    const R = fsrsRetrievability(elapsed, rec.S);

    if (grade >= 2) {
      rec.S = fsrsSuccessStability(rec.S, rec.D, R, grade);
    } else {
      rec.S = fsrsFailStability(rec.S, rec.D, R);
    }
    rec.D = fsrsUpdateDifficulty(rec.D, grade);
  }

  rec.lastReviewTs = now;
  rec.due = now + fsrsInterval(rec.S, 0.9) * MS_PER_DAY;
}
