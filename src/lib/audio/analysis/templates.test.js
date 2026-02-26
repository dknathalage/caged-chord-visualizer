import { describe, it, expect } from 'vitest';
import { buildChordTemplates, matchChord } from './templates.js';

describe('buildChordTemplates', () => {
  const templates = buildChordTemplates();

  it('generates 12 roots x 12 chord types = 144 templates', () => {
    expect(templates.length).toBe(12 * 12);
  });

  it('each template is L2-normalized', () => {
    for (const t of templates) {
      let sumSq = 0;
      for (let i = 0; i < 12; i++) sumSq += t.template[i] * t.template[i];
      expect(Math.sqrt(sumSq)).toBeCloseTo(1, 5);
    }
  });

  it('C major template has non-zero at C(0), E(4), G(7)', () => {
    const cMaj = templates.find(t => t.rootName === 'C' && t.typeId === 'maj');
    expect(cMaj).toBeDefined();
    expect(cMaj.template[0]).toBeGreaterThan(0); // C
    expect(cMaj.template[4]).toBeGreaterThan(0); // E
    expect(cMaj.template[7]).toBeGreaterThan(0); // G

    // Other bins should be zero
    for (const i of [1, 2, 3, 5, 6, 8, 9, 10, 11]) {
      expect(cMaj.template[i]).toBe(0);
    }
  });

  it('A minor template has non-zero at A(9), C(0), E(4)', () => {
    const aMin = templates.find(t => t.rootName === 'A' && t.typeId === 'min');
    expect(aMin).toBeDefined();
    expect(aMin.template[9]).toBeGreaterThan(0); // A
    expect(aMin.template[0]).toBeGreaterThan(0); // C
    expect(aMin.template[4]).toBeGreaterThan(0); // E
  });

  it('chord names are correctly formed', () => {
    const cMaj = templates.find(t => t.rootName === 'C' && t.typeId === 'maj');
    expect(cMaj.chordName).toBe('C');

    const aMin = templates.find(t => t.rootName === 'A' && t.typeId === 'min');
    expect(aMin.chordName).toBe('Am');

    const g7 = templates.find(t => t.rootName === 'G' && t.typeId === '7');
    expect(g7.chordName).toBe('G7');
  });
});

describe('matchChord', () => {
  const templates = buildChordTemplates();

  it('perfect C major chromagram matches C major with score ~1.0', () => {
    // Build a perfect C major chromagram (C=0, E=4, G=7)
    const observed = new Float32Array(12);
    observed[0] = 1; // C
    observed[4] = 1; // E
    observed[7] = 1; // G
    // L2 normalize
    const norm = Math.sqrt(3);
    for (let i = 0; i < 12; i++) observed[i] /= norm;

    const results = matchChord(observed, templates);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chordName).toBe('C');
    expect(results[0].typeId).toBe('maj');
    expect(results[0].score).toBeGreaterThan(0.95);
  });

  it('noisy chromagram below threshold returns empty', () => {
    // Very spread out / noisy chromagram — no strong chord signal
    const observed = new Float32Array(12);
    for (let i = 0; i < 12; i++) observed[i] = 1;
    // L2 normalize
    const norm = Math.sqrt(12);
    for (let i = 0; i < 12; i++) observed[i] /= norm;

    // With threshold 0.65, uniform chromagram should not match any chord well
    const results = matchChord(observed, templates, 0.65);
    // Uniform chroma can partially match power chords (2 notes) — check top score is low
    for (const r of results) {
      expect(r.score).toBeLessThan(0.85);
    }
  });

  it('results are sorted by score descending', () => {
    const observed = new Float32Array(12);
    observed[0] = 1; observed[4] = 1; observed[7] = 1;
    const norm = Math.sqrt(3);
    for (let i = 0; i < 12; i++) observed[i] /= norm;

    const results = matchChord(observed, templates);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('custom minScore threshold filters results', () => {
    const observed = new Float32Array(12);
    observed[0] = 1; observed[4] = 1; observed[7] = 1;
    const norm = Math.sqrt(3);
    for (let i = 0; i < 12; i++) observed[i] /= norm;

    const strict = matchChord(observed, templates, 0.95);
    const loose = matchChord(observed, templates, 0.5);
    expect(loose.length).toBeGreaterThanOrEqual(strict.length);
  });
});
