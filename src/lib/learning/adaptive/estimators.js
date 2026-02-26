import { clamp } from '../math-utils.js';

/**
 * Estimate per-exercise guess probability (pG).
 * Looks at items the student hasn't learned yet (pL < 0.1)
 * and computes the fraction they got correct (i.e. lucky guesses).
 *
 * @param {Map} items - key -> item record from engine
 * @returns {number|null} estimated pG clamped [0.01, 0.20], or null if insufficient data
 */
export function estimatePG(items) {
  let correct = 0;
  let total = 0;

  for (const [, rec] of items) {
    if (rec.pL < 0.1) {
      correct += rec.correct;
      total += rec.attempts;
    }
  }

  if (total < 20) return null;
  return clamp(correct / total, 0.01, 0.20);
}

/**
 * Estimate per-student slip probability (pS).
 * Looks at mastered items (pL > 0.9, attempts >= 5)
 * and computes the error rate (slips on known material).
 *
 * @param {Map} items - key -> item record from engine
 * @returns {number|null} estimated pS clamped [0.02, 0.30], or null if insufficient data
 */
export function estimatePS(items) {
  let errors = 0;
  let total = 0;
  let masteredCount = 0;

  for (const [, rec] of items) {
    if (rec.pL > 0.9 && rec.attempts >= 5) {
      masteredCount++;
      errors += rec.attempts - rec.correct;
      total += rec.attempts;
    }
  }

  if (masteredCount < 5) return null;
  return clamp(errors / total, 0.02, 0.30);
}

/**
 * Estimate adaptive transition probability (pT).
 * Tracks how many attempts it takes items to cross the mastery threshold (pL >= 0.8).
 * Fast learners get a boosted pT, slow learners get a reduced pT.
 *
 * @param {Map} items - key -> item record from engine
 * @param {number} defaultPT - the default pT value to adjust
 * @returns {number|null} adjusted pT clamped [0.05, 0.40], or null if no adjustment needed
 */
export function estimatePT(items, defaultPT) {
  let totalAttempts = 0;
  let masteredItems = 0;

  for (const [, rec] of items) {
    if (rec.pL >= 0.8 && rec.attempts > 0) {
      totalAttempts += rec.attempts;
      masteredItems++;
    }
  }

  if (masteredItems === 0) return null;

  const avgAttempts = totalAttempts / masteredItems;

  if (avgAttempts < 5) {
    return clamp(defaultPT * 1.3, 0.05, 0.40);
  }
  if (avgAttempts > 12) {
    return clamp(defaultPT * 0.7, 0.05, 0.40);
  }

  return null;
}
