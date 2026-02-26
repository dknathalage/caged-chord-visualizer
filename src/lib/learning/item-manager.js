import { DEFAULTS } from './defaults.js';
import { CONSTANTS } from './constants.js';

export function ensureItem(items, clusters, config, item, params) {
  const key = config.itemKey(item);
  if (!items.has(key)) {
    const itemClusters = config.itemClusters(item);
    const transfer = params?.transfer ?? DEFAULTS.transfer;

    // 3a. Knowledge transfer: check global clusters for existing stats
    let initialPL = 0.0;
    const globalCls = itemClusters.filter(c => c.startsWith('global_'));
    if (globalCls.length > 0) {
      let totalAcc = 0, count = 0;
      for (const gcid of globalCls) {
        const cl = clusters.get(gcid);
        if (cl && cl.total >= transfer.clusterMinAttempts) {
          totalAcc += cl.correct / cl.total;
          count++;
        }
      }
      if (count > 0) {
        const avgAcc = totalAcc / count;
        initialPL = Math.min(transfer.cap, avgAcc * transfer.cap);
      }
    }

    const rec = {
      key,
      S: 0,
      D: 5.0,
      lastReviewTs: 0,
      due: 0,
      pL: initialPL,
      attempts: 0,
      correct: 0,
      times: [],
      avgTime: 0,
      lastSeen: 0,
      lastSeenTs: 0,
      hist: [],
      streak: 0,
      clusters: itemClusters,
      confusions: [],
      centsHistory: [],
      avgCents: null,
      techniqueScores: [],
    };
    items.set(key, rec);
    for (const cid of itemClusters) {
      ensureCluster(clusters, cid);
    }
  }
  return items.get(key);
}

export function ensureCluster(clusters, id) {
  if (!clusters.has(id)) {
    clusters.set(id, { id, correct: 0, total: 0 });
  }
  return clusters.get(id);
}

export function trackRecent(recentKeys, config, item) {
  const key = config.itemKey(item);
  recentKeys.push(key);
  if (recentKeys.length > CONSTANTS.history.MAX_RECENT) recentKeys.shift();
}
