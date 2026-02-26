// Tier 3 — Parameter resolution.
// Merges: adaptive (per-student) > config overrides (per-exercise) > DEFAULTS (tier 2).
// CONSTANTS (tier 1) are never overridable.

import { CONSTANTS } from './constants.js';
import { DEFAULTS } from './defaults.js';

/**
 * Deep-merge source into target (one level of nesting).
 * Only copies own enumerable properties that exist in target.
 * Returns a new plain object — does not mutate inputs.
 */
function deepMerge(target, source) {
  const result = {};
  for (const key of Object.keys(target)) {
    const tVal = target[key];
    const sVal = source?.[key];
    if (sVal === undefined || sVal === null) {
      result[key] = tVal;
    } else if (typeof tVal === 'object' && !Array.isArray(tVal) && tVal !== null
      && typeof sVal === 'object' && !Array.isArray(sVal) && sVal !== null) {
      result[key] = { ...tVal, ...sVal };
    } else {
      result[key] = sVal;
    }
  }
  return result;
}

/**
 * Resolve parameters using the three-tier hierarchy:
 *
 *   adaptive (per-student, highest priority)
 *     > configOverrides (per-exercise)
 *       > DEFAULTS (tier 2)
 *
 * CONSTANTS (tier 1) are always returned unchanged.
 *
 * @param {Object} configOverrides — per-exercise overrides, or legacy { bktParams }
 * @param {Object} adaptive — per-student adaptive values (e.g. { bkt: { pG, pS, pT } })
 * @returns {{ params: Object, constants: Object }} frozen resolved params + constants
 */
export function resolveParams(configOverrides = {}, adaptive = {}) {
  // Backward compat: config.bktParams (old format) maps to bkt subsystem
  let effectiveOverrides = configOverrides;
  if (configOverrides.bktParams && !configOverrides.bkt) {
    effectiveOverrides = { ...configOverrides, bkt: configOverrides.bktParams };
  }

  // Layer 1: deep-merge config overrides over DEFAULTS
  let resolved = {};
  for (const key of Object.keys(DEFAULTS)) {
    resolved[key] = deepMerge(DEFAULTS[key], effectiveOverrides[key]);
  }

  // Layer 2: apply adaptive overrides (highest priority)
  for (const key of Object.keys(resolved)) {
    if (adaptive[key] !== undefined && adaptive[key] !== null) {
      resolved[key] = deepMerge(resolved[key], adaptive[key]);
    }
  }

  // Freeze everything
  for (const key of Object.keys(resolved)) {
    if (typeof resolved[key] === 'object' && resolved[key] !== null) {
      resolved[key] = Object.freeze(resolved[key]);
    }
  }
  resolved = Object.freeze(resolved);

  return { params: resolved, constants: CONSTANTS };
}
