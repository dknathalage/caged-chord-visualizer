import { DEFAULTS } from '../defaults.js';

export function checkFatigue(sessionWindow, fatigued, preFatigueAccuracy, params) {
  const f = params?.fatigue ?? DEFAULTS.fatigue;
  const windowSize = f.sessionWindow;

  if (sessionWindow.length < windowSize) {
    return { fatigued, preFatigueAccuracy };
  }

  const half = windowSize / 2;
  const older = sessionWindow.slice(0, half);
  const newer = sessionWindow.slice(half);

  const accOlder = older.filter(r => r.ok).length / older.length;
  const accNewer = newer.filter(r => r.ok).length / newer.length;

  const timesOlder = older.filter(r => r.timeMs > 0).map(r => r.timeMs);
  const timesNewer = newer.filter(r => r.timeMs > 0).map(r => r.timeMs);
  const avgTimeOlder = timesOlder.length > 0 ? timesOlder.reduce((s, t) => s + t, 0) / timesOlder.length : 0;
  const avgTimeNewer = timesNewer.length > 0 ? timesNewer.reduce((s, t) => s + t, 0) / timesNewer.length : 0;

  if (!fatigued) {
    const accDrop = accOlder > 0 ? (accOlder - accNewer) / accOlder : 0;
    const timeIncrease = avgTimeOlder > 0 ? (avgTimeNewer - avgTimeOlder) / avgTimeOlder : 0;

    if (accDrop > f.accDropThreshold || timeIncrease > f.rtIncreaseThreshold) {
      return { fatigued: true, preFatigueAccuracy: accOlder };
    }
  } else {
    if (preFatigueAccuracy != null && accNewer >= preFatigueAccuracy * f.recoveryThreshold) {
      return { fatigued: false, preFatigueAccuracy: null };
    }
  }

  return { fatigued, preFatigueAccuracy };
}
