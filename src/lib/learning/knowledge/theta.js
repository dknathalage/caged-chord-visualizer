import { clamp } from '../math-utils.js';
import { DEFAULTS } from '../defaults.js';

export function updateTheta(theta, difficulty, ok, lr = DEFAULTS.theta.lr, params) {
  const alpha = params?.theta?.alpha ?? DEFAULTS.theta.alpha;
  const expected = 1 / (1 + Math.exp(-alpha * (theta - difficulty)));
  if (ok) {
    theta += lr * (1 - expected);
  } else {
    theta -= lr * expected;
  }
  return clamp(theta, 0, 1);
}

export function checkPlateau(thetaHistory, params) {
  const p = params?.plateau ?? DEFAULTS.plateau;
  if (thetaHistory.length < p.windowSize) return false;
  const recent = thetaHistory.slice(-p.windowSize);
  const thetas = recent.map(h => h.theta);
  const range = Math.max(...thetas) - Math.min(...thetas);
  return range < p.threshold;
}

export function adaptiveSigma(totalAttempts, sessionWindow, params) {
  const s = params?.sigma ?? DEFAULTS.sigma;
  if (totalAttempts < 10) return s.base;
  const recent = sessionWindow.slice(-20);
  if (recent.length < 10) return s.base;
  const acc = recent.filter(r => r.ok).length / recent.length;
  if (acc > s.accHighThreshold) return s.highAccRange[0] + (acc - s.accHighThreshold) * 1.0; // 0.15-0.25
  if (acc < s.accLowThreshold) return s.lowAccRange[0] + acc * 0.05; // 0.06-0.10
  return s.base;
}

export function adaptiveOffset(totalAttempts, sessionWindow, params) {
  const o = params?.offset ?? DEFAULTS.offset;
  const s = params?.sigma ?? DEFAULTS.sigma;
  if (totalAttempts < 10) return o.base;
  const recent = sessionWindow.slice(-20);
  if (recent.length < 10) return o.base;
  const acc = recent.filter(r => r.ok).length / recent.length;
  if (acc > s.accHighThreshold) return o.highAccValue;
  if (acc < s.accLowThreshold) return o.lowAccValue;
  return o.base;
}
