export function migrateToUnified() {
  if (typeof window === 'undefined') return;
  const TYPE_MAP = {
    'note-find': 'nf', 'string-traversal': 'st', 'interval-trainer': 'iv',
    'chord-tone': 'ct', 'chord-player': 'cp', 'scale-runner': 'sr', 'mode-trainer': 'mt'
  };
  const TARGET_KEY = 'gl_learn_practice';
  if (localStorage.getItem(TARGET_KEY)) return;

  const merged = { v: 2, ts: Date.now(), qNum: 0, totalAttempts: 0, allCorrectTimes: [], items: {}, clusters: {}, recentKeys: [] };

  for (const [exId, prefix] of Object.entries(TYPE_MAP)) {
    const raw = localStorage.getItem('gl_learn_' + exId);
    if (!raw) continue;
    let data;
    try { data = JSON.parse(raw); } catch { continue; }
    if (!data?.items) continue;

    for (const [key, rec] of Object.entries(data.items)) {
      const newKey = prefix + ':' + key;
      merged.items[newKey] = { ...rec, cls: ['type_' + prefix, ...(rec.cls || [])] };
    }
    for (const [id, cl] of Object.entries(data.clusters || {})) {
      const existing = merged.clusters[id] || { correct: 0, total: 0 };
      merged.clusters[id] = { correct: existing.correct + cl.correct, total: existing.total + cl.total };
    }
    const typeClKey = 'type_' + prefix;
    if (!merged.clusters[typeClKey]) merged.clusters[typeClKey] = { correct: 0, total: 0 };

    merged.qNum += data.qNum || 0;
    merged.totalAttempts += data.totalAttempts || 0;
    merged.allCorrectTimes.push(...(data.allCorrectTimes || []).slice(-30));
  }

  if (Object.keys(merged.items).length > 0) {
    localStorage.setItem(TARGET_KEY, JSON.stringify(merged));
  }
}
