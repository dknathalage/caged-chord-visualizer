/**
 * Update per-feature error rates after an attempt.
 *
 * @param {object} featureErrorRates - map of featureKey -> { correct, total }
 * @param {object} item - the item (unused directly, but passed for context)
 * @param {boolean} correct - whether the attempt was correct
 * @param {object} features - feature dict, e.g. { string: 2, zone: 'zone_5', accidental: true }
 * @returns {object} updated featureErrorRates (same reference, mutated for efficiency)
 */
export function updateFeatureErrors(featureErrorRates, item, correct, features) {
  for (const [key, value] of Object.entries(features)) {
    const featureKey = `${key}_${value}`;
    if (!featureErrorRates[featureKey]) {
      featureErrorRates[featureKey] = { correct: 0, total: 0 };
    }
    featureErrorRates[featureKey].total++;
    if (correct) {
      featureErrorRates[featureKey].correct++;
    }
  }
  return featureErrorRates;
}

/**
 * Compute difficulty adjustment weight based on per-feature error rates.
 * After minAttempts total, compares each feature's error rate to the global rate.
 * Features with higher-than-average error rates produce weights > 1 (harder).
 *
 * @param {object} featureErrorRates - map of featureKey -> { correct, total }
 * @param {object} features - feature dict for the item being evaluated
 * @param {number} minAttempts - minimum total attempts before computing (default 50)
 * @returns {number|null} average difficulty weight, or null if insufficient data
 */
export function getFeatureDifficulty(featureErrorRates, features, minAttempts = 50) {
  // Compute global totals
  let globalErrors = 0;
  let globalTotal = 0;
  for (const entry of Object.values(featureErrorRates)) {
    globalErrors += entry.total - entry.correct;
    globalTotal += entry.total;
  }

  if (globalTotal < minAttempts) return null;

  const globalRate = globalTotal > 0 ? globalErrors / globalTotal : 0;
  if (globalRate === 0) return null;

  const weights = [];
  for (const [key, value] of Object.entries(features)) {
    const featureKey = `${key}_${value}`;
    const entry = featureErrorRates[featureKey];
    if (!entry || entry.total === 0) continue;
    const featureRate = (entry.total - entry.correct) / entry.total;
    weights.push(featureRate / globalRate);
  }

  if (weights.length === 0) return null;
  return weights.reduce((sum, w) => sum + w, 0) / weights.length;
}
