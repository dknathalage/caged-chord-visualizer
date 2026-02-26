import { DEFAULTS } from '../defaults.js';

export function shouldMicroDrill(lastItem, items, config, questionNumber, params) {
  if (!lastItem) return false;
  const key = config.itemKey(lastItem);
  const rec = items.get(key);
  const md = params?.drills?.microDrill ?? DEFAULTS.drills.microDrill;
  if (!rec || rec.hist.length < md.failureCount) return false;
  // Cooldown: don't micro-drill same item within cooldown questions
  if (rec._lastMicroDrill && (questionNumber - rec._lastMicroDrill) < md.cooldown) return false;
  const recent = rec.hist.slice(-md.windowSize);
  const failures = recent.filter(h => !h).length;
  if (failures >= md.failureCount) {
    rec._lastMicroDrill = questionNumber;
    return true;
  }
  return false;
}

export function buildOverdueQueue(items, config, params) {
  const now = Date.now();
  const overdueMax = params?.drills?.overdueMax ?? DEFAULTS.drills.overdueMax;
  const overdue = [];
  for (const [key, rec] of items) {
    if (rec.due > 0 && rec.due < now) {
      const item = config.itemFromKey(key);
      if (!item) continue; // type was removed
      overdue.push({ item, overdueness: now - rec.due });
    }
  }
  overdue.sort((a, b) => b.overdueness - a.overdueness);
  return overdue.slice(0, overdueMax).map(o => o.item);
}

export function buildConfusionDrill(lastItem, items, config, questionNumber, itemForConfusedValue, params) {
  if (!lastItem) return [];
  const key = config.itemKey(lastItem);
  const rec = items.get(key);
  if (!rec || rec.confusions.length === 0) return [];

  const cd = params?.drills?.confusionDrill ?? DEFAULTS.drills.confusionDrill;

  // Cooldown
  if (rec._lastConfDrill && (questionNumber - rec._lastConfDrill) < cd.cooldown) return [];

  // Last answer must be wrong
  if (rec.hist.length === 0 || rec.hist[rec.hist.length - 1]) return [];

  // Find confused values with >=minOccurrences occurrences
  const freq = {};
  for (const cf of rec.confusions) freq[cf.detected] = (freq[cf.detected] || 0) + 1;
  let confusedValue = null;
  for (const [val, count] of Object.entries(freq)) {
    if (count >= cd.minOccurrences) { confusedValue = val; break; }
  }
  if (!confusedValue) return [];

  // Build alternation: [original, confused, original, confused]
  const original = lastItem;
  const confused = itemForConfusedValue(confusedValue, original);
  if (!confused) return [];

  rec._lastConfDrill = questionNumber;
  return [original, confused, original, confused];
}
