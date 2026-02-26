/**
 * Chord template generation and matching.
 */
import { CHORD_TYPES, NOTES } from '$lib/constants/music.js';

/**
 * Build L2-normalized 12-bin chroma templates for all root x chord type combinations.
 * @returns {Array<{ root: number, rootName: string, typeId: string, typeName: string, chordName: string, template: Float32Array }>}
 */
export function buildChordTemplates() {
  const templates = [];

  for (const ct of CHORD_TYPES) {
    for (let root = 0; root < 12; root++) {
      const template = new Float32Array(12);
      for (const interval of ct.iv) {
        const pitchClass = (root + interval) % 12;
        template[pitchClass] = 1;
      }

      // L2 normalize
      let norm = 0;
      for (let i = 0; i < 12; i++) norm += template[i] * template[i];
      norm = Math.sqrt(norm);
      if (norm > 0) for (let i = 0; i < 12; i++) template[i] /= norm;

      templates.push({
        root,
        rootName: NOTES[root],
        typeId: ct.id,
        typeName: ct.name,
        chordName: NOTES[root] + ct.sym,
        template
      });
    }
  }

  return templates;
}

/**
 * Match observed chromagram against templates using cosine similarity.
 * @param {Float32Array} observed - L2-normalized 12-bin chromagram
 * @param {Array} templates - From buildChordTemplates()
 * @param {number} minScore - Minimum similarity threshold (default 0.65)
 * @returns {Array<{ root: number, rootName: string, typeId: string, chordName: string, score: number }>}
 */
export function matchChord(observed, templates, minScore = 0.65) {
  const results = [];

  for (const t of templates) {
    let dot = 0;
    for (let i = 0; i < 12; i++) dot += observed[i] * t.template[i];
    if (dot >= minScore) {
      results.push({
        root: t.root,
        rootName: t.rootName,
        typeId: t.typeId,
        chordName: t.chordName,
        score: Math.round(dot * 1000) / 1000
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
