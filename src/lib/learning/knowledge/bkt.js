import { clamp } from '../math-utils.js';
import { fsrsRetrievability } from '../scheduling/fsrs.js';
import { CONSTANTS } from '../constants.js';

const MS_PER_DAY = CONSTANTS.fsrs.MS_PER_DAY;

export function updateBKT(rec, ok, timeMs, medianTime, bkt) {
  const { pG, pS, pT } = bkt;
  let posterior;
  if (ok) {
    const denom = rec.pL * (1 - pS) + (1 - rec.pL) * pG;
    posterior = denom > 0 ? (rec.pL * (1 - pS)) / denom : rec.pL;
  } else {
    const denom = rec.pL * pS + (1 - rec.pL) * (1 - pG);
    posterior = denom > 0 ? (rec.pL * pS) / denom : rec.pL;
  }

  // Fluency modulation: fast correct -> higher pT, slow correct -> lower pT
  let effectivePT = pT;
  if (ok && timeMs != null && medianTime > 0) {
    const speedRatio = timeMs / medianTime;
    const fluencyMod = clamp(1.5 - speedRatio, 0.5, 1.5);
    effectivePT = pT * fluencyMod;
  }

  rec.pL = posterior + (1 - posterior) * effectivePT;
}

export function reconcileBKTFSRS(rec) {
  if (rec.S <= 0) return;
  const now = Date.now();
  const elapsed = rec.lastReviewTs > 0 ? (now - rec.lastReviewTs) / MS_PER_DAY : 0;
  const R = fsrsRetrievability(elapsed, rec.S);

  // High pL + low R: BKT thinks learned, FSRS thinks forgotten
  if (rec.pL > 0.8 && R < 0.5 && rec.S > 0) {
    rec.pL = rec.pL * 0.8 + R * 0.2;
  }
  // Low pL + high S + high R: FSRS stable, BKT disagrees
  else if (rec.pL < 0.4 && rec.S > 5 && R > 0.85) {
    rec.pL = rec.pL * 0.7 + R * 0.3;
  }
  // High pL + very low S + few attempts: lucky streak
  else if (rec.pL > 0.8 && rec.S < 0.5 && rec.attempts < 5) {
    rec.pL = Math.min(rec.pL, 0.7);
  }
}
