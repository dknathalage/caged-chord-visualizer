import { percentile } from '../math-utils.js';
import { fsrsRetrievability } from '../scheduling/fsrs.js';
import { adaptiveSigma, adaptiveOffset } from '../knowledge/theta.js';
import { DEFAULTS } from '../defaults.js';
import { CONSTANTS } from '../constants.js';

export function scoreCandidate(c, state) {
  const { rec, isNew, item } = c;
  const { config, theta, totalAttempts, sessionWindow, recentKeys, items,
    fatigued, plateauDetected, allCorrectTimes } = state;
  const params = state.params;
  const scoring = params?.scoring ?? DEFAULTS.scoring;
  const plateau = params?.plateau ?? DEFAULTS.plateau;

  const difficulty = config.itemDifficulty ? config.itemDifficulty(item) : 0.5;

  // 2a. Adaptive sigma/offset based on session accuracy
  const sigma = adaptiveSigma(totalAttempts, sessionWindow, params);
  const offset = adaptiveOffset(totalAttempts, sessionWindow, params);

  if (isNew) {
    const mu = theta + offset;
    const score = Math.exp(-((difficulty - mu) ** 2) / (2 * sigma ** 2));
    return score;
  }

  const pL = rec.pL;
  const mastered = isMastered(rec, params);
  const exploitation = Math.min(scoring.exploitationCap, 1 - pL);

  // 2b. Plateau: boost exploration when plateau detected
  const baseC = scoring.explorationC;
  const explorationC = plateauDetected ? baseC * plateau.explorationMultiplier : baseC;
  const exploration = explorationC * Math.sqrt(Math.log(totalAttempts + 1) / Math.max(1, rec.attempts));

  // FSRS retrievability-based review urgency
  let reviewUrgency = 0;
  if (rec.S > 0 && rec.lastReviewTs > 0) {
    const elapsed = (Date.now() - rec.lastReviewTs) / (CONSTANTS.fsrs.MS_PER_DAY);
    const R = fsrsRetrievability(elapsed, rec.S);
    reviewUrgency = mastered
      ? (1 - R) * scoring.reviewUrgency.mastered
      : (1 - R) * scoring.reviewUrgency.unmastered;
  }

  // Confusion pair boost
  let confusionBoost = 0;
  if (rec.confusions.length > 0 && recentKeys.length > 0) {
    const freq = {};
    for (const cf of rec.confusions) freq[cf.detected] = (freq[cf.detected] || 0) + 1;
    for (const rk of recentKeys.slice(-3)) {
      const rrec = items.get(rk);
      if (rrec) {
        if (freq[rk] && freq[rk] >= 2) {
          confusionBoost = scoring.confusionBoost;
          break;
        }
      }
    }
  }

  // Difficulty match bonus
  const matchSigma = plateauDetected ? sigma * plateau.explorationMultiplier : sigma;
  const difficultyMatch = Math.exp(-((difficulty - theta) ** 2) / (2 * matchSigma ** 2)) * scoring.difficultyMatchWeight;

  // Interleave penalty
  let interleave = 0;
  if (recentKeys.length > 0) {
    const lastTwo = recentKeys.slice(-2);
    for (const rk of lastTwo) {
      const rrec = items.get(rk);
      if (rrec) {
        const shared = rec.clusters.some(cid => rrec.clusters.includes(cid));
        if (shared) { interleave = scoring.interleavePenalty; break; }
      }
    }
  }

  // Fatigue bias
  const fatigueBias = fatigued ? (pL * scoring.fatigueBias) : 0;

  // 3b. Coverage bonus
  let coverageBonus = 0;
  if (rec.clusters) {
    const strCl = rec.clusters.find(c => c.startsWith('str_'));
    const zoneCl = rec.clusters.find(c => c.startsWith('zone_'));
    if (strCl && zoneCl) {
      const cell = getCoverageCellFromItems(items, strCl, zoneCl);
      if (cell.count < 3) coverageBonus = scoring.coverageBonus.sparse;
      else if (cell.avgPL < 0.3) coverageBonus = scoring.coverageBonus.lowPL;
    }
  }

  // Stuck penalty
  let stuckPenalty = 0;
  const st = scoring.stuckThresholds;
  const itemKey = rec.key;
  const recentCount = recentKeys.filter(rk => rk === itemKey).length;
  if (recentCount >= st.repeats && pL < st.pL) {
    stuckPenalty = scoring.stuckPenalty;
  } else if (recentCount >= st.altRepeats && pL < st.altPL && rec.attempts >= st.altMinAttempts) {
    stuckPenalty = st.altPenalty;
  }

  return exploitation + exploration + reviewUrgency + confusionBoost
    + difficultyMatch + interleave + fatigueBias + coverageBonus + stuckPenalty;
}

export function isMastered(rec, params) {
  const mastery = params?.mastery ?? DEFAULTS.mastery;
  return rec.pL >= mastery.pLThreshold && rec.attempts >= mastery.minAttempts;
}

export function targetTime(rec, allCorrectTimes) {
  if (allCorrectTimes.length < 5) return 0;
  const base = percentile(allCorrectTimes, 75);
  if (base <= 0) return 0;
  const factor = 1.0 - (rec.pL * 0.4);
  return base * factor;
}

// Internal helper for coverage bonus in scoring
function getCoverageCellFromItems(items, strCluster, zoneCluster) {
  let count = 0, totalPL = 0;
  for (const [, rec] of items) {
    if (rec.clusters.includes(strCluster) && rec.clusters.includes(zoneCluster)) {
      count++;
      totalPL += rec.pL;
    }
  }
  return { count, avgPL: count > 0 ? totalPL / count : 0 };
}
