export function migrateToUnified() {
  if (typeof window === 'undefined') return;
  const TYPE_MAP = {
    'note-find': 'nf', 'string-traversal': 'st', 'interval-trainer': 'iv',
    'chord-tone': 'ct', 'chord-player': 'cp', 'scale-runner': 'sr', 'mode-trainer': 'mt'
  };
  const TARGET_KEY = 'gl_learn_practice';

  // Check if migration is needed
  const existing = localStorage.getItem(TARGET_KEY);
  if (existing) {
    // Migrate v2 → v3: add theta if missing
    try {
      const data = JSON.parse(existing);
      if (data.v === 2) {
        data.v = 3;
        data.theta = 0.05;
        // Estimate theta from existing mastery data
        if (data.items) {
          const items = Object.values(data.items);
          if (items.length > 0) {
            const avgPL = items.reduce((s, r) => s + (r.pL || 0), 0) / items.length;
            data.theta = Math.min(0.8, avgPL * 0.7 + 0.05);
          }
        }
        localStorage.setItem(TARGET_KEY, JSON.stringify(data));
      }
    } catch { /* corrupt data, leave as-is */ }
    return;
  }

  const merged = { v: 3, ts: Date.now(), qNum: 0, totalAttempts: 0, allCorrectTimes: [], items: {}, clusters: {}, recentKeys: [], theta: 0.05 };

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
      const prev = merged.clusters[id] || { correct: 0, total: 0 };
      merged.clusters[id] = { correct: prev.correct + cl.correct, total: prev.total + cl.total };
    }
    const typeClKey = 'type_' + prefix;
    if (!merged.clusters[typeClKey]) merged.clusters[typeClKey] = { correct: 0, total: 0 };

    merged.qNum += data.qNum || 0;
    merged.totalAttempts += data.totalAttempts || 0;
    merged.allCorrectTimes.push(...(data.allCorrectTimes || []).slice(-30));
  }

  // Estimate theta from merged data
  if (Object.keys(merged.items).length > 0) {
    const items = Object.values(merged.items);
    const avgPL = items.reduce((s, r) => s + (r.pL || 0), 0) / items.length;
    merged.theta = Math.min(0.8, avgPL * 0.7 + 0.05);
    localStorage.setItem(TARGET_KEY, JSON.stringify(merged));
  }
}
