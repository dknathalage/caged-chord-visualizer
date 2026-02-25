const KEY = 'gl_progress';
const THRESHOLD = 50;

function empty() {
  return { exercises: {} };
}

export function loadProgress() {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.exercises) return empty();
    return data;
  } catch {
    return empty();
  }
}

export function saveExercise(id, { bestScore, bestAccuracy }) {
  if (typeof window === 'undefined') return;
  const data = loadProgress();
  const prev = data.exercises[id] || {};
  data.exercises[id] = {
    bestScore: Math.max(prev.bestScore || 0, bestScore || 0),
    bestAccuracy: Math.max(prev.bestAccuracy || 0, bestAccuracy || 0),
    completedAt: (Math.max(prev.bestScore || 0, bestScore || 0) >= THRESHOLD)
      ? (prev.completedAt || new Date().toISOString())
      : prev.completedAt || null
  };
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function markVisited(id) {
  if (typeof window === 'undefined') return;
  const data = loadProgress();
  if (!data.exercises[id]) {
    data.exercises[id] = { bestScore: 0, bestAccuracy: 0, completedAt: null, visited: true };
  } else {
    data.exercises[id].visited = true;
  }
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getChapterProgress(chapterId, chapters) {
  const ch = chapters.find(c => c.id === chapterId);
  if (!ch || !ch.exercises || ch.exercises.length === 0) return { total: 0, completed: 0, pct: 0 };
  const data = loadProgress();
  const total = ch.exercises.length;
  let completed = 0;
  for (const ex of ch.exercises) {
    const rec = data.exercises[ex.id];
    if (rec && (rec.bestScore >= THRESHOLD || rec.visited)) completed++;
  }
  return { total, completed, pct: Math.round(completed / total * 100) };
}

export function resetProgress() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}

export function loadUnifiedMastery() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('gl_learn_practice');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.items) return null;
    const items = Object.entries(data.items).map(([key, rec]) => ({ key, pL: rec.pL ?? 0 }));
    const overall = items.length > 0 ? items.reduce((s, i) => s + i.pL, 0) / items.length : 0;
    return { overall, items, totalItems: items.length };
  } catch { return null; }
}

export { THRESHOLD };
