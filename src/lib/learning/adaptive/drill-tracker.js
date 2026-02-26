/**
 * Creates a drill effectiveness tracker.
 * Tracks whether micro-drills and confusion-drills actually help
 * the student improve on the drilled items.
 *
 * @returns {object} drill tracker with state and methods
 */
export function createDrillTracker() {
  const state = {
    microDrill: { helped: 0, total: 0 },
    confusionDrill: { helped: 0, total: 0 },
  };

  // Pending evaluations: itemKey -> { drillType, preAccuracy, postAttempts }
  const pending = new Map();

  return {
    state,

    /**
     * Tag an item as having just received a drill.
     * Captures the pre-drill accuracy so we can measure improvement.
     *
     * @param {string} itemKey - the item key
     * @param {'microDrill'|'confusionDrill'} drillType
     * @param {Array<boolean>} recentHist - recent history before drill
     */
    markDrillFired(itemKey, drillType, recentHist = []) {
      const correct = recentHist.filter(h => h).length;
      const preAccuracy = recentHist.length > 0 ? correct / recentHist.length : 0;
      pending.set(itemKey, { drillType, preAccuracy, postAttempts: [] });
    },

    /**
     * Check if a drilled item has improved after 3 post-drill attempts.
     * Call this after each attempt on an item that has a pending drill evaluation.
     *
     * @param {string} itemKey - the item key
     * @param {boolean} correct - whether the latest attempt was correct
     * @returns {boolean|null} true if evaluated (and improvement recorded), null if not yet ready
     */
    checkImprovement(itemKey, correct) {
      const entry = pending.get(itemKey);
      if (!entry) return null;

      entry.postAttempts.push(correct);
      if (entry.postAttempts.length < 3) return null;

      // Evaluate: did accuracy improve?
      const postCorrect = entry.postAttempts.filter(h => h).length;
      const postAccuracy = postCorrect / entry.postAttempts.length;
      const improved = postAccuracy > entry.preAccuracy;

      state[entry.drillType].total++;
      if (improved) {
        state[entry.drillType].helped++;
      }

      pending.delete(itemKey);
      return improved;
    },

    /**
     * Get effectiveness ratio for a drill type.
     *
     * @param {'microDrill'|'confusionDrill'} drillType
     * @returns {number|null} helped/total ratio, or null if fewer than 3 evaluations
     */
    getEffectiveness(drillType) {
      const s = state[drillType];
      if (s.total < 3) return null;
      return s.helped / s.total;
    },

    /**
     * Adjust cooldown based on drill effectiveness.
     * Effective drills (>0.6) get shorter cooldowns (-25%).
     * Ineffective drills (<0.3) get longer cooldowns (+50%).
     *
     * @param {number} baseCooldown - the default cooldown value
     * @param {'microDrill'|'confusionDrill'} drillType
     * @returns {number} adjusted cooldown
     */
    adjustCooldown(baseCooldown, drillType) {
      const eff = this.getEffectiveness(drillType);
      if (eff === null) return baseCooldown;
      if (eff > 0.6) return baseCooldown * 0.75;
      if (eff < 0.3) return baseCooldown * 1.5;
      return baseCooldown;
    },
  };
}
