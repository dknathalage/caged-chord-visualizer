<script>
  import { onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { saveExercise } from '$lib/progress.js';
  import { NOTES, INTERVALS, CHORD_TYPES, SCALES, MODES } from '$lib/constants/music.js';
  import { AudioManager } from '$lib/audio/AudioManager.js';
  import { NT_STR_NAMES, BASE_MIDI, noteAt, fretForNote, renderFB, fbDims, scaleSequence, FB, drawBoard } from '$lib/music/fretboard.js';
  import { CFG, STD_SHAPES, adaptShape, getBf, resolve, renderDiagram, STD_COLORS } from '$lib/music/chords.js';
  import { LearningEngine } from '$lib/learning/engine.js';
  import { unifiedConfig, TYPES } from '$lib/learning/configs/unified.js';
  import { migrateToUnified } from '$lib/learning/migration.js';
  import { renderRing } from '$lib/skilltree.js';
  import LearningDashboard from '$lib/components/LearningDashboard.svelte';
  import PitchDisplay from '$lib/components/challenges/PitchDisplay.svelte';
  import NoteFind from '$lib/components/challenges/NoteFind.svelte';

  import IntervalTrainer from '$lib/components/challenges/IntervalTrainer.svelte';

  import ChordPlayer from '$lib/components/challenges/ChordPlayer.svelte';
  import ScaleRunner from '$lib/components/challenges/ScaleRunner.svelte';
  import ModeTrainer from '$lib/components/challenges/ModeTrainer.svelte';
  import ChordTransition from '$lib/components/challenges/ChordTransition.svelte';

  // Run migration on mount
  migrateToUnified();

  let qStartTime = 0;

  // --- Core state ---
  let phase = $state('idle');
  let score = $state(0);
  let streak = $state(0);
  let best = $state(0);
  let correct = $state(0);
  let attempts = $state(0);
  // Current challenge
  let challengeType = $state(null);
  let curItem = $state(null);
  let recall = $state(false);

  // NoteFind state
  let nfTarget = $state(null);
  let nfFbHtml = $state('');
  let nfFbSuccess = $state(false);
  let nfFbFlash = $state(false);

  // IntervalTrainer state
  let ivRef = $state(null);
  let ivInterval = $state(null);
  let ivTarget = $state(null);
  let ivTargetDisplay = $state('\u2014');
  let ivTargetHidden = $state(false);
  let ivFbHtml = $state('');
  let ivFbSuccess = $state(false);
  let ivFbFlash = $state(false);

  // ChordPlayer state
  let cpChallenge = $state(null);
  let cpVoiceIdx = $state(0);
  let cpVoiceDone = $state([]);
  let cpFbSuccess = $state(false);
  let cpFbFlash = $state(false);

  // ScaleRunner state
  let srChallenge = $state(null);
  let srNoteIdx = $state(0);
  let srFbHtml = $state('');
  let srFbVisible = $state(false);
  let srFbSuccess = $state(false);
  let srFbFlash = $state(false);

  // ModeTrainer state
  let mtChallenge = $state(null);
  let mtNoteIdx = $state(0);
  let mtFbHtml = $state('');
  let mtFbVisible = $state(false);
  let mtFbSuccess = $state(false);
  let mtFbFlash = $state(false);

  // ChordTransition state
  let cxFromChallenge = $state(null);
  let cxToChallenge = $state(null);
  let cxPhase = $state('from');
  let cxVoiceIdx = $state(0);
  let cxVoiceDone = $state([]);
  let cxFbSuccess = $state(false);
  let cxFbFlash = $state(false);

  // Pitch display state
  let detectedNote = $state('\u2014');
  let detectedClass = $state('');
  let centsLbl = $state('');
  let centsLeft = $state('50%');
  let hzText = $state('');

  // Message state
  let msgText = $state('Press Start to begin');
  let msgErr = $state(false);

  // Hold detection
  let holdStart = 0;
  let wrongHold = 0;
  let wrongCd = 0;
  let lastDetected = '';

  // Audio & Engine
  const audio = new AudioManager();
  let engine = new LearningEngine(unifiedConfig, 'practice');

  // Mastery state for idle view
  let mastery = $state(null);

  function refreshMastery() {
    mastery = engine.getMastery();
  }

  // Compute per-type mastery from engine mastery
  function typeMastery(m) {
    if (!m) return TYPES.map(t => ({ ...t, avgPL: 0, count: 0 }));
    return TYPES.map(t => {
      const items = m.items.filter(i => i.key.startsWith(t.id + ':'));
      const avgPL = items.length > 0 ? items.reduce((s, i) => s + i.pL, 0) / items.length : 0;
      return { ...t, avgPL, count: items.length };
    });
  }

  let typeStats = $derived(typeMastery(mastery));

  // --- Derived ---
  let accuracy = $derived(attempts > 0 ? Math.round(correct / attempts * 100) + '%' : '\u2014');
  let accuracyNum = $derived(attempts > 0 ? correct / attempts : 0);
  let showStart = $derived(phase === 'idle');
  let showActive = $derived(phase !== 'idle');
  let showReset = $derived(score > 0 || attempts > 0 || engine.totalAttempts > 0);

  // --- Stats-for-nerds: current item stats ---
  let curItemKey = $derived(curItem ? engine.config.itemKey(curItem) : null);
  let curItemStats = $derived(curItemKey ? engine.getItemStats(curItemKey) : null);

  // Stats-for-nerds: expand/collapse state
  let sessionExpanded = $state(false);
  let engineExpanded = $state(false);
  let coverageExpanded = $state(false);

  // Session mastery (refreshed after each answer)
  let sessionMastery = $state(null);
  function refreshSessionMastery() {
    sessionMastery = engine.getMastery();
  }

  // Helper: format values for stats bar
  function sfnPlColor(pL) {
    if (pL >= 0.95) return '#4ECB71';
    if (pL >= 0.5) return '#F0A030';
    return '#FF6B6B';
  }
  function sfnFmtPL(v) { return v.toFixed(2); }
  function sfnFmtMs(v) { return v > 0 ? (v / 1000).toFixed(1) + 's' : '\u2014'; }
  function sfnFmtS(v) { return v >= 1 ? v.toFixed(0) + 'd' : v > 0 ? '<1d' : '\u2014'; }
  function sfnFmtR(v) { return v > 0 ? (v * 100).toFixed(0) + '%' : '\u2014'; }
  function sfnFluencyColor(r) {
    if (r <= 0) return 'var(--mt)';
    if (r < 1.0) return '#4ECB71';
    if (r <= 1.3) return '#F0A030';
    return '#FF6B6B';
  }
  function sfnFatigueColor(f) {
    if (!f) return '#4ECB71';
    return '#FF6B6B';
  }
  function sfnFatigueLabel(f) {
    return f ? 'Fatigued' : 'Fresh';
  }

  // Coverage heatmap SVG
  function renderCoverageHeatmap(coverage) {
    if (!coverage) return '';
    const zones = ['zone_0', 'zone_3', 'zone_5', 'zone_7', 'zone_9', 'zone_12'];
    const zoneLabels = ['0', '3', '5', '7', '9', '12+'];
    const cellW = 28, cellH = 18, padL = 24, padT = 16, gap = 2;
    const w = padL + zones.length * (cellW + gap);
    const h = padT + 6 * (cellH + gap);
    let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
    // Zone labels
    for (let z = 0; z < zones.length; z++) {
      svg += `<text x="${padL + z * (cellW + gap) + cellW / 2}" y="10" text-anchor="middle" fill="var(--mt)" font-size="8" font-family="JetBrains Mono">${zoneLabels[z]}</text>`;
    }
    // String labels
    const strNames = ['e','B','G','D','A','E'];
    for (let s = 0; s < 6; s++) {
      svg += `<text x="${padL - 6}" y="${padT + s * (cellH + gap) + cellH / 2 + 3}" text-anchor="end" fill="var(--mt)" font-size="8" font-family="JetBrains Mono">${strNames[s]}</text>`;
    }
    // Cells
    for (let s = 0; s < 6; s++) {
      for (let z = 0; z < zones.length; z++) {
        const cellKey = `str_${s}:${zones[z]}`;
        const cell = coverage[cellKey] || { count: 0, avgPL: 0 };
        const opacity = cell.count === 0 ? 0.08 : Math.min(1, 0.3 + cell.count * 0.15);
        let fill;
        if (cell.count === 0) fill = '#30363D';
        else if (cell.avgPL >= 0.8) fill = '#4ECB71';
        else if (cell.avgPL >= 0.4) fill = '#F0A030';
        else fill = '#FF6B6B';
        const x = padL + z * (cellW + gap);
        const y = padT + s * (cellH + gap);
        svg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="3" fill="${fill}" opacity="${opacity}"/>`;
        if (cell.count > 0) {
          svg += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 3}" text-anchor="middle" fill="#fff" font-size="7" font-family="JetBrains Mono" opacity="0.9">${Math.round(cell.avgPL * 100)}</text>`;
        }
      }
    }
    svg += '</svg>';
    return svg;
  }

  // Sparkline for theta history
  function renderThetaSparkline(history) {
    if (!history || history.length < 2) return '';
    const w = 80, h = 20, pad = 2;
    const thetas = history.map(h => h.theta);
    const min = Math.min(...thetas);
    const max = Math.max(...thetas);
    const range = max - min || 0.01;
    const pts = thetas.map((t, i) => {
      const x = pad + (i / (thetas.length - 1)) * (w - pad * 2);
      const y = h - pad - ((t - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    }).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><polyline points="${pts}" fill="none" stroke="var(--ac)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  // --- Detected display ---
  function showDetected(note, cents, hz, isCorrect) {
    if (!note) {
      detectedNote = '\u2014'; detectedClass = ''; centsLbl = ''; centsLeft = '50%'; hzText = '';
      return;
    }
    detectedNote = note;
    detectedClass = isCorrect ? 'nt-correct' : 'nt-wrong';
    centsLbl = (cents > 0 ? '+' : '') + cents + ' cents';
    centsLeft = Math.max(5, Math.min(95, 50 + cents / 50 * 45)) + '%';
    hzText = hz.toFixed(1) + ' Hz';
  }

  // --- Scoring ---
  function scoreCorrect(b, mult) {
    phase = 'success'; correct++; attempts++; streak++;
    if (streak > best) best = streak;
    let pts = b + streak * mult;
    if (streak === 5) pts += 20;
    if (streak === 10) pts += 50;
    score += pts;
    refreshSessionMastery();
    return pts;
  }

  function onWrong() {
    streak = 0; attempts++;
    const pen = Math.min(score, 5);
    score -= pen;
    engine.report(curItem, false, undefined, { detected: lastDetected });
    wrongCd = performance.now(); wrongHold = 0;
    msgText = pen > 0 ? '\u2212' + pen + ' points' : 'Wrong!';
    msgErr = true;
    refreshSessionMastery();
  }

  function checkHold(isCorrect, onConfirm) {
    if (isCorrect && phase === 'listening') {
      wrongHold = 0;
      if (!holdStart) holdStart = performance.now();
      if (performance.now() - holdStart >= 300) { onConfirm(); return; }
    } else {
      holdStart = 0;
      if (!isCorrect && phase === 'listening') {
        if (!wrongHold) wrongHold = performance.now();
        const now = performance.now();
        if (now - wrongHold >= 600 && now - wrongCd >= 2000) onWrong();
      } else {
        wrongHold = 0;
      }
    }
  }

  // --- Scale/Mode fretboard renderer ---
  function renderSeqFB(seq, currentIdx, startFret) {
    const center = startFret + 2;
    let sf = Math.max(0, center - Math.floor(FB.FRETS / 2));
    if (sf + FB.FRETS > 22) sf = Math.max(0, 22 - FB.FRETS);
    return drawBoard(sf, ({ FL, TOP, SH, FW, DOT, sf, FRETS }) => {
      const uniqueNotes = [...new Map(seq.map(n => [`${n.str}-${n.fret}`, n])).values()];
      let d = '';
      for (const n of uniqueNotes) {
        const tfr = n.fret - sf;
        if (tfr < 0 || tfr > FRETS) continue;
        const cy = TOP + (5 - n.str) * SH + SH / 2;
        const cx = n.fret === 0 ? FL + DOT * 0.2 : FL + (tfr - 1) * FW + FW / 2;
        const seqIdx = seq.findIndex(sn => sn.str === n.str && sn.fret === n.fret);
        const lastIdx = seq.findLastIndex(sn => sn.str === n.str && sn.fret === n.fret);
        let col, opacity;
        if (seqIdx <= currentIdx && lastIdx <= currentIdx) { col = '#4ECB71'; opacity = 0.4; }
        else if (seqIdx === currentIdx || lastIdx === currentIdx) { col = '#4ECB71'; opacity = 1.0; }
        else { col = '#58A6FF'; opacity = 0.7; }
        d += `<circle cx="${cx}" cy="${cy}" r="${DOT * 1.3}" fill="${col}" opacity="${opacity * 0.15}"/>`;
        d += `<circle cx="${cx}" cy="${cy}" r="${DOT}" fill="${col}" opacity="${opacity}"/>`;
        const fs = n.note.length > 1 ? DOT * 0.8 : DOT;
        d += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${fs}" font-weight="bold" font-family="JetBrains Mono">${n.note}</text>`;
      }
      return d;
    });
  }

  // --- Challenge preparation ---
  function nextChallenge() {
    holdStart = 0; phase = 'listening';
    showDetected(null);
    const item = engine.next();
    curItem = item;
    challengeType = item._type;
    recall = !!item._recall;
    const inner = item._inner;
    qStartTime = performance.now();

    switch (challengeType) {
      case 'nf': prepareNoteFind(inner); break;
      case 'iv': prepareInterval(inner); break;
      case 'cp': prepareChordPlayer(inner); break;
      case 'sr': prepareScaleRunner(inner); break;
      case 'mt': prepareModeTrainer(inner); break;
      case 'cx': prepareChordTransition(inner); break;
    }

  }

  // --- Per-type preparation ---
  function prepareNoteFind(inner) {
    nfTarget = inner;
    if (recall) {
      const _d = fbDims();
      nfFbHtml = `<svg viewBox="0 0 ${_d.W} ${_d.H}" xmlns="http://www.w3.org/2000/svg"><text x="${_d.W/2}" y="${_d.H/2}" text-anchor="middle" dominant-baseline="central" fill="#222" font-size="60" font-family="Outfit" font-weight="900">?</text></svg>`;
    } else {
      nfFbHtml = renderFB(inner, null, false);
    }
    nfFbSuccess = false; nfFbFlash = false;
    msgText = 'Listening...'; msgErr = false;
  }

  function prepareInterval(inner) {
    ivRef = inner.ref;
    ivInterval = inner.interval;
    ivTarget = inner.targetNote;
    if (recall) {
      ivTargetDisplay = '?'; ivTargetHidden = true;
      const _d = fbDims();
      ivFbHtml = `<svg viewBox="0 0 ${_d.W} ${_d.H}" xmlns="http://www.w3.org/2000/svg"><text x="${_d.W/2}" y="${_d.H/2}" text-anchor="middle" dominant-baseline="central" fill="#222" font-size="60" font-family="Outfit" font-weight="900">?</text></svg>`;
    } else {
      ivTargetDisplay = inner.targetNote; ivTargetHidden = false;
      ivFbHtml = renderFB(inner.ref, null, false);
    }
    ivFbSuccess = false; ivFbFlash = false;
    msgText = 'Listening...'; msgErr = false;
  }

  function prepareChordPlayer(inner) {
    const { shapeId, typeId, rootIdx } = inner;
    const sh = STD_SHAPES.find(s => s.id === shapeId);
    const ct = CFG.chordTypes.find(c => c.id === typeId);
    const root = NOTES[rootIdx];
    const adapted = adaptShape(sh);
    const r = resolve(adapted, rootIdx, ct.iv);
    if (r.voices.length < 3) { nextChallenge(); return; }
    const sortedVoices = [...r.voices].sort((a, b) => a.str - b.str);
    const color = STD_COLORS[sh.id] || '#58A6FF';
    const dHtml = renderDiagram(r, color);
    const chordName = root + (ct.sym || '');
    cpChallenge = { root, chordType: ct, shape: sh, resolved: r, sortedVoices, diagramHtml: recall ? '' : dHtml, chordName, color, shapeName: sh.label };
    cpVoiceIdx = 0;
    cpVoiceDone = sortedVoices.map(() => false);
    cpFbSuccess = false; cpFbFlash = false;
    const firstVoice = sortedVoices[0];
    msgText = `Play ${firstVoice.note} on ${NT_STR_NAMES[firstVoice.str]}`; msgErr = false;
  }

  function prepareScaleRunner(inner) {
    const ri = inner.rootIdx;
    const root = NOTES[ri];
    const scale = SCALES.find(sc => sc.id === inner.scaleId);
    const startFret = inner.startFret;
    let seq = scaleSequence(ri, scale.iv, startFret, startFret + 4);
    if (seq.length < 5) { nextChallenge(); return; }
    if (inner.dir === 'updown') {
      const desc = [...seq].reverse().slice(1);
      seq = [...seq, ...desc];
    }
    srChallenge = { root, scale, seq, startFret };
    srNoteIdx = 0;
    srFbVisible = !recall;
    srFbSuccess = false; srFbFlash = false;
    srFbHtml = renderSeqFB(seq, 0, startFret);
    const t = seq[0];
    msgText = `Play ${root} ${scale.name}: start with ${t.note} (${NT_STR_NAMES[t.str]} fret ${t.fret})`; msgErr = false;
  }

  function prepareModeTrainer(inner) {
    const ri = inner.rootIdx;
    const root = NOTES[ri];
    const mode = MODES.find(m => m.id === inner.modeId);
    const startFret = inner.startFret;
    let seq = scaleSequence(ri, mode.iv, startFret, startFret + 4);
    if (seq.length < 5) { nextChallenge(); return; }
    if (inner.dir === 'updown') {
      const desc = [...seq].reverse().slice(1);
      seq = [...seq, ...desc];
    }
    mtChallenge = { root, mode, seq, startFret };
    mtNoteIdx = 0;
    mtFbVisible = !recall;
    mtFbSuccess = false; mtFbFlash = false;
    mtFbHtml = renderSeqFB(seq, 0, startFret);
    const t = seq[0];
    msgText = `Play ${root} ${mode.name}: start with ${t.note} (${NT_STR_NAMES[t.str]} fret ${t.fret})`; msgErr = false;
  }

  function prepareChordTransition(inner) {
    const { fromShapeId, fromTypeId, fromRootIdx, toShapeId, toTypeId, toRootIdx } = inner;

    function resolveChord(shapeId, typeId, rootIdx) {
      const sh = STD_SHAPES.find(s => s.id === shapeId);
      const ct = CFG.chordTypes.find(c => c.id === typeId);
      const root = NOTES[rootIdx];
      const adapted = adaptShape(sh);
      const r = resolve(adapted, rootIdx, ct.iv);
      if (r.voices.length < 3) return null;
      const sortedVoices = [...r.voices].sort((a, b) => a.str - b.str);
      const color = STD_COLORS[sh.id] || '#58A6FF';
      const dHtml = recall ? '' : renderDiagram(r, color);
      const chordName = root + (ct.sym || '');
      return { root, chordType: ct, shape: sh, resolved: r, sortedVoices, diagramHtml: dHtml, chordName, color, shapeName: sh.label };
    }

    const from = resolveChord(fromShapeId, fromTypeId, fromRootIdx);
    const to = resolveChord(toShapeId, toTypeId, toRootIdx);
    if (!from || !to) { nextChallenge(); return; }

    cxFromChallenge = from;
    cxToChallenge = to;
    cxPhase = 'from';
    cxVoiceIdx = 0;
    cxVoiceDone = from.sortedVoices.map(() => false);
    cxFbSuccess = false; cxFbFlash = false;
    const firstVoice = from.sortedVoices[0];
    msgText = `Play ${from.chordName}: ${firstVoice.note} on ${NT_STR_NAMES[firstVoice.str]}`; msgErr = false;
  }

  // --- Detection dispatch ---
  function onDetect(note, cents, hz, semi) {
    lastDetected = note || '';
    switch (challengeType) {
      case 'nf': detectNoteFind(note, cents, hz, semi); break;
      case 'iv': detectInterval(note, cents, hz, semi); break;
      case 'cp': detectChordPlayer(note, cents, hz, semi); break;
      case 'sr': detectScaleRunner(note, cents, hz, semi); break;
      case 'mt': detectModeTrainer(note, cents, hz, semi); break;
      case 'cx': detectChordTransition(note, cents, hz, semi); break;
    }
  }

  // --- Per-type detection ---
  function detectNoteFind(note, cents, hz, semi) {
    const nm = nfTarget && note === nfTarget.note;
    const midiDiff = nfTarget ? Math.abs((semi+69) - nfTarget.midi) : 0;
    const octOk = !recall || !nfTarget || (midiDiff % 12) <= 1 || (midiDiff % 12) >= 11;
    const ok = nm && octOk;
    showDetected(note, cents, hz, ok);
    if (nm && !octOk && phase === 'listening') { msgText = 'Right note, wrong string!'; msgErr = true; }
    checkHold(ok, () => {
      const pts = scoreCorrect(10, 2);
      engine.report(curItem, true, performance.now() - qStartTime);
      nfFbHtml = renderFB(nfTarget, null, true);
      nfFbSuccess = true; nfFbFlash = true;
      msgText = `+${pts} points!`; msgErr = false;
      setTimeout(() => { nfFbSuccess = false; nfFbFlash = false; if (phase === 'success') nextChallenge(); }, recall ? 1200 : 800);
    });
  }

  function detectInterval(note, cents, hz, semi) {
    const ok = note === ivTarget;
    showDetected(note, cents, hz, ok);
    checkHold(ok, () => {
      const pts = scoreCorrect(10, 2);
      engine.report(curItem, true, performance.now() - qStartTime);
      ivTargetDisplay = ivTarget; ivTargetHidden = false;
      ivFbHtml = renderFB(ivRef, null, true);
      ivFbSuccess = true; ivFbFlash = true;
      msgText = `+${pts} points!`; msgErr = false;
      setTimeout(() => { ivFbSuccess = false; ivFbFlash = false; if (phase === 'success') nextChallenge(); }, recall ? 1200 : 800);
    });
  }

  function detectChordPlayer(note, cents, hz, semi) {
    if (!cpChallenge) return;
    const voice = cpChallenge.sortedVoices[cpVoiceIdx];
    if (!voice) return;
    const expMidi = BASE_MIDI[voice.str] + cpChallenge.resolved.bf + voice.fo;
    const nm = note === voice.note;
    const midiOk = Math.abs(semi + 69 - expMidi) <= 1;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);
    if (nm && !midiOk && phase === 'listening') { msgText = `Right note, play on ${NT_STR_NAMES[voice.str]} string!`; msgErr = true; }
    checkHold(ok, () => {
      cpVoiceDone[cpVoiceIdx] = true; cpVoiceDone = [...cpVoiceDone];
      cpFbSuccess = true; cpFbFlash = true;
      setTimeout(() => { cpFbSuccess = false; cpFbFlash = false; }, 600);
      cpVoiceIdx++; holdStart = 0;
      if (cpVoiceIdx >= cpChallenge.sortedVoices.length) {
        engine.report(curItem, true, performance.now() - qStartTime);
        const pts = scoreCorrect(30, 3);
        msgText = `+${pts} points! All voices complete!`; msgErr = false;
        setTimeout(() => { cpFbSuccess = false; cpFbFlash = false; if (phase === 'success') nextChallenge(); }, 1200);
      } else {
        const nextVoice = cpChallenge.sortedVoices[cpVoiceIdx];
        msgText = `Now play ${nextVoice.note} on ${NT_STR_NAMES[nextVoice.str]}`; msgErr = false;
      }
    });
  }

  function detectScaleRunner(note, cents, hz, semi) {
    if (!srChallenge || phase !== 'listening') return;
    const target = srChallenge.seq[srNoteIdx];
    const nm = note === target.note;
    const midiOk = Math.abs(semi + 69 - target.midi) <= 1;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);
    checkHold(ok, () => {
      srNoteIdx++; holdStart = 0;
      if (srNoteIdx >= srChallenge.seq.length) {
        engine.report(curItem, true, performance.now() - qStartTime);
        const pts = scoreCorrect(40, 3);
        msgText = `+${pts} points! Scale complete!`; msgErr = false;
        srFbHtml = renderSeqFB(srChallenge.seq, srNoteIdx, srChallenge.startFret);
        srFbSuccess = true; srFbFlash = true;
        setTimeout(() => { srFbSuccess = false; srFbFlash = false; if (phase === 'success') nextChallenge(); }, 1200);
      } else {
        const t = srChallenge.seq[srNoteIdx];
        msgText = `Next: ${t.note} (${NT_STR_NAMES[t.str]} fret ${t.fret})`; msgErr = false;
        srFbHtml = renderSeqFB(srChallenge.seq, srNoteIdx, srChallenge.startFret);
      }
    });
  }

  function detectModeTrainer(note, cents, hz, semi) {
    if (!mtChallenge || phase !== 'listening') return;
    const target = mtChallenge.seq[mtNoteIdx];
    const nm = note === target.note;
    const midiOk = Math.abs(semi + 69 - target.midi) <= 1;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);
    checkHold(ok, () => {
      mtNoteIdx++; holdStart = 0;
      if (mtNoteIdx >= mtChallenge.seq.length) {
        engine.report(curItem, true, performance.now() - qStartTime);
        const pts = scoreCorrect(40, 3);
        msgText = `+${pts} points! Mode complete!`; msgErr = false;
        mtFbHtml = renderSeqFB(mtChallenge.seq, mtNoteIdx, mtChallenge.startFret);
        mtFbSuccess = true; mtFbFlash = true;
        setTimeout(() => { mtFbSuccess = false; mtFbFlash = false; if (phase === 'success') nextChallenge(); }, 1200);
      } else {
        const t = mtChallenge.seq[mtNoteIdx];
        msgText = `Next: ${t.note} (${NT_STR_NAMES[t.str]} fret ${t.fret})`; msgErr = false;
        mtFbHtml = renderSeqFB(mtChallenge.seq, mtNoteIdx, mtChallenge.startFret);
      }
    });
  }

  function detectChordTransition(note, cents, hz, semi) {
    const activeChallenge = cxPhase === 'from' ? cxFromChallenge : cxToChallenge;
    if (!activeChallenge) return;
    const voice = activeChallenge.sortedVoices[cxVoiceIdx];
    if (!voice) return;
    const expMidi = BASE_MIDI[voice.str] + activeChallenge.resolved.bf + voice.fo;
    const nm = note === voice.note;
    const midiOk = Math.abs(semi + 69 - expMidi) <= 1;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);
    if (nm && !midiOk && phase === 'listening') { msgText = `Right note, play on ${NT_STR_NAMES[voice.str]} string!`; msgErr = true; }
    checkHold(ok, () => {
      cxVoiceDone[cxVoiceIdx] = true; cxVoiceDone = [...cxVoiceDone];
      cxFbSuccess = true; cxFbFlash = true;
      setTimeout(() => { cxFbSuccess = false; cxFbFlash = false; }, 600);
      cxVoiceIdx++; holdStart = 0;

      if (cxVoiceIdx >= activeChallenge.sortedVoices.length) {
        if (cxPhase === 'from') {
          // Move to second chord
          cxPhase = 'to';
          cxVoiceIdx = 0;
          cxVoiceDone = cxToChallenge.sortedVoices.map(() => false);
          cxFbSuccess = false; cxFbFlash = false;
          const firstVoice = cxToChallenge.sortedVoices[0];
          msgText = `Now play ${cxToChallenge.chordName}: ${firstVoice.note} on ${NT_STR_NAMES[firstVoice.str]}`; msgErr = false;
        } else {
          // Both chords complete
          engine.report(curItem, true, performance.now() - qStartTime);
          const pts = scoreCorrect(40, 3);
          msgText = `+${pts} points! Transition complete!`; msgErr = false;
          cxFbSuccess = true; cxFbFlash = true;
          setTimeout(() => { cxFbSuccess = false; cxFbFlash = false; if (phase === 'success') nextChallenge(); }, 1200);
        }
      } else {
        const nextVoice = activeChallenge.sortedVoices[cxVoiceIdx];
        msgText = `Now play ${nextVoice.note} on ${NT_STR_NAMES[nextVoice.str]}`; msgErr = false;
      }
    });
  }

  // --- Flow functions ---
  function onSilence() { showDetected(null); holdStart = 0; }

  async function onStart() {
    refreshMastery();
    refreshSessionMastery();
    const ok = await audio.start();
    if (!ok) { msgText = 'Mic access denied.'; msgErr = true; return; }
    phase = 'listening';
    nextChallenge();
    audio.startLoop(onDetect, onSilence);
  }

  function onSkip() {
    engine.report(curItem, false, undefined, { detected: lastDetected, skipped: true });
    streak = 0; attempts++;
    score = Math.max(0, score - 5);
    msgText = 'Skipped'; msgErr = true;
    setTimeout(() => nextChallenge(), 1000);
  }

  function onStop() {
    engine.save();
    saveExercise('practice', { bestScore: score, bestAccuracy: attempts > 0 ? Math.round(correct / attempts * 100) : 0 });
    phase = 'idle'; audio.stop();
    showDetected(null);
    refreshMastery();
    msgText = 'Stopped. Press Start to resume.'; msgErr = false;
  }

  function onReset() {
    onStop();
    score = 0; streak = 0; best = 0; correct = 0; attempts = 0;
    engine.reset();
    engine = new LearningEngine(unifiedConfig, 'practice');
    challengeType = null; curItem = null;
    refreshMastery();
    msgText = 'Press Start to begin'; msgErr = false;
  }

  // Init mastery on mount
  refreshMastery();

  onDestroy(() => { engine.save(); audio.stop(); });
</script>

<svelte:head>
  <title>Practice — Guitar Learning</title>
</svelte:head>

<div class="ex-layout">
<div class="nt-wrap">
  <header class="nt-hdr">
    <h1>Practice</h1>
    <nav class="nt-nav">
      <a href="{base}/" class="pill" style="font-size:13px">Home</a>
      <a href="{base}/tuner" class="pill" style="font-size:13px">Tuner</a>
    </nav>
  </header>

  {#if phase === 'idle'}
    <!-- Idle: mastery overview -->
    <div class="idle-panel">
      <div class="mastery-ring">
        {@html renderRing(mastery ? Math.round(mastery.overall.avgPL * 100) : 0, '#58A6FF', 120)}
        <div class="mastery-pct">{mastery ? Math.round(mastery.overall.avgPL * 100) : 0}%</div>
      </div>
      <div class="type-bars">
        {#each typeStats as ts}
          <div class="type-bar">
            <div class="type-bar-name">{ts.name}</div>
            <div class="type-bar-track">
              <div class="type-bar-fill" style="width:{Math.round(ts.avgPL * 100)}%"></div>
            </div>
            <div class="type-bar-pct">{ts.count > 0 ? Math.round(ts.avgPL * 100) + '%' : '\u2014'}</div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <!-- Active: stats-for-nerds bar -->
    <div class="sfn-bar">
      <!-- Session group -->
      <button class="sfn-group" class:sfn-active={sessionExpanded} onclick={() => { sessionExpanded = !sessionExpanded; engineExpanded = false; coverageExpanded = false; }}>
        <span class="sfn-group-label">SESSION</span>
        <span class="sfn-metric"><span class="sfn-val">{score}</span><span class="sfn-key">Score</span></span>
        <span class="sfn-sep">&middot;</span>
        <span class="sfn-metric"><span class="sfn-val">{streak}</span><span class="sfn-key">Streak</span>{#if best > 0}<span class="sfn-sub">({best})</span>{/if}</span>
        <span class="sfn-sep">&middot;</span>
        <span class="sfn-metric"><span class="sfn-val">{accuracy}</span><span class="sfn-key">Acc</span></span>
      </button>

      <!-- Engine group -->
      <button class="sfn-group" class:sfn-active={engineExpanded} onclick={() => { engineExpanded = !engineExpanded; sessionExpanded = false; coverageExpanded = false; }}>
        <span class="sfn-group-label">ENGINE</span>
        <span class="sfn-metric"><span class="sfn-val">{engine.theta.toFixed(2)}</span><span class="sfn-key">&theta;</span></span>
        <span class="sfn-sep">&middot;</span>
        <span class="sfn-metric">
          <span class="sfn-val" style="color:{curItemStats ? sfnPlColor(curItemStats.pL) : 'var(--mt)'}">
            {curItemStats ? sfnFmtPL(curItemStats.pL) : '\u2014'}
          </span>
          <span class="sfn-key">pL</span>
        </span>
      </button>

      <!-- Coverage button -->
      <button class="sfn-group sfn-coverage-btn" class:sfn-active={coverageExpanded} onclick={() => { coverageExpanded = !coverageExpanded; sessionExpanded = false; engineExpanded = false; }} title="Fretboard Coverage">
        <span class="sfn-grid-icon">&#9638;</span>
      </button>
    </div>

    <!-- Expandable panels -->
    {#if sessionExpanded}
      <div class="sfn-panel">
        <div class="sfn-panel-row">
          <div class="sfn-panel-metric"><span class="sfn-panel-label">Questions</span><span class="sfn-panel-value">{engine.qNum}</span></div>
          <div class="sfn-panel-metric"><span class="sfn-panel-label">Avg Time</span><span class="sfn-panel-value">{sessionMastery ? sfnFmtMs(sessionMastery.overall.avgResponseTime) : '\u2014'}</span></div>
          <div class="sfn-panel-metric">
            <span class="sfn-panel-label">Fatigue</span>
            <span class="sfn-panel-value" style="color:{sfnFatigueColor(engine.fatigued)}">
              <span class="sfn-dot" style="background:{sfnFatigueColor(engine.fatigued)}"></span>
              {sfnFatigueLabel(engine.fatigued)}
            </span>
          </div>
          <div class="sfn-panel-metric"><span class="sfn-panel-label">Streak Bonus</span><span class="sfn-panel-value">{streak >= 10 ? '+50' : streak >= 5 ? '+20' : '+' + streak * 2}</span></div>
        </div>
      </div>
    {/if}

    {#if engineExpanded}
      <div class="sfn-panel">
        <div class="sfn-panel-row">
          <div class="sfn-panel-metric sfn-wide">
            <span class="sfn-panel-label">&theta; History</span>
            <span class="sfn-panel-value sfn-sparkline">{@html renderThetaSparkline(engine.thetaHistory)}<span class="sfn-theta-val">{engine.theta.toFixed(3)}</span></span>
          </div>
        </div>
        {#if curItemStats}
          <div class="sfn-panel-divider"></div>
          <div class="sfn-panel-subtitle">Current Item: {curItemStats.key.length > 24 ? curItemStats.key.slice(0, 24) + '\u2026' : curItemStats.key}</div>
          <div class="sfn-panel-row">
            <div class="sfn-panel-metric"><span class="sfn-panel-label">pL</span><span class="sfn-panel-value" style="color:{sfnPlColor(curItemStats.pL)}">{sfnFmtPL(curItemStats.pL)}</span></div>
            <div class="sfn-panel-metric"><span class="sfn-panel-label">S</span><span class="sfn-panel-value">{sfnFmtS(curItemStats.S)}</span></div>
            <div class="sfn-panel-metric"><span class="sfn-panel-label">D</span><span class="sfn-panel-value">{curItemStats.D.toFixed(1)}</span></div>
            <div class="sfn-panel-metric"><span class="sfn-panel-label">R</span><span class="sfn-panel-value">{sfnFmtR(curItemStats.R)}</span></div>
          </div>
          <div class="sfn-panel-row">
            <div class="sfn-panel-metric">
              <span class="sfn-panel-label">Fluency</span>
              <span class="sfn-panel-value">
                <span class="sfn-fluency-bar"><span class="sfn-fluency-fill" style="width:{curItemStats.fluencyRatio > 0 ? Math.min(100, (1 / Math.max(0.3, curItemStats.fluencyRatio)) * 100) : 0}%;background:{sfnFluencyColor(curItemStats.fluencyRatio)}"></span></span>
                <span style="color:{sfnFluencyColor(curItemStats.fluencyRatio)}">{curItemStats.fluencyRatio > 0 ? curItemStats.fluencyRatio.toFixed(1) + 'x' : '\u2014'}</span>
              </span>
            </div>
            <div class="sfn-panel-metric"><span class="sfn-panel-label">Attempts</span><span class="sfn-panel-value">{curItemStats.attempts}</span></div>
            <div class="sfn-panel-metric"><span class="sfn-panel-label">Streak</span><span class="sfn-panel-value">{curItemStats.streak}</span></div>
            {#if curItemStats.topConfusion}
              <div class="sfn-panel-metric"><span class="sfn-panel-label">Confused</span><span class="sfn-panel-value sfn-confusion">&rarr;{curItemStats.topConfusion}</span></div>
            {/if}
          </div>
        {:else}
          <div class="sfn-panel-empty">No item data yet</div>
        {/if}
      </div>
    {/if}

    {#if coverageExpanded}
      <div class="sfn-panel sfn-coverage-panel">
        <div class="sfn-panel-subtitle">Fretboard Coverage</div>
        {#if sessionMastery}
          <div class="sfn-coverage-grid">{@html renderCoverageHeatmap(sessionMastery.coverage)}</div>
        {:else}
          <div class="sfn-panel-empty">No coverage data yet</div>
        {/if}
      </div>
    {/if}
  {/if}

  <div class="nt-main">
    {#if phase !== 'idle'}
      {#if challengeType}
        <div class="type-badge">{TYPES.find(t => t.id === challengeType)?.name ?? ''}</div>
      {/if}
      <!-- Challenge display: switch on type -->
      {#if challengeType === 'nf'}
        <NoteFind target={nfTarget} fbHtml={nfFbHtml} fbSuccess={nfFbSuccess} fbFlash={nfFbFlash} {recall} />
      {:else if challengeType === 'iv'}
        <IntervalTrainer ref={ivRef} interval={ivInterval} targetDisplay={ivTargetDisplay} targetHidden={ivTargetHidden} fbHtml={ivFbHtml} fbSuccess={ivFbSuccess} fbFlash={ivFbFlash} />
      {:else if challengeType === 'cp'}
        <ChordPlayer challenge={cpChallenge} voiceIdx={cpVoiceIdx} voiceDone={cpVoiceDone} fbSuccess={cpFbSuccess} fbFlash={cpFbFlash} {recall} />
      {:else if challengeType === 'sr'}
        <ScaleRunner challenge={srChallenge} noteIdx={srNoteIdx} fbHtml={srFbHtml} fbVisible={srFbVisible} fbSuccess={srFbSuccess} fbFlash={srFbFlash} />
      {:else if challengeType === 'mt'}
        <ModeTrainer challenge={mtChallenge} noteIdx={mtNoteIdx} fbHtml={mtFbHtml} fbVisible={mtFbVisible} fbSuccess={mtFbSuccess} fbFlash={mtFbFlash} />
      {:else if challengeType === 'cx'}
        <ChordTransition fromChallenge={cxFromChallenge} toChallenge={cxToChallenge} phase={cxPhase} voiceIdx={cxVoiceIdx} voiceDone={cxVoiceDone} fbSuccess={cxFbSuccess} fbFlash={cxFbFlash} {recall} />
      {/if}

      <PitchDisplay {detectedNote} {detectedClass} {centsLbl} {centsLeft} {hzText} />
    {/if}

    <div class="nt-msg" class:nt-err={msgErr}>{msgText}</div>
  </div>

  <div class="nt-controls">
    {#if showStart}
      <button class="nt-btn nt-primary" onclick={onStart}>Start</button>
    {/if}
    {#if showActive}
      <button class="nt-btn" onclick={onSkip}>Skip</button>
      <button class="nt-btn nt-danger" onclick={onStop}>Stop</button>
    {/if}
    {#if showReset}
      <button class="nt-btn" onclick={onReset}>Reset</button>
    {/if}
  </div>
</div>
<LearningDashboard {engine} />
</div>

<style>
  .nt-wrap{display:flex;flex-direction:column;height:100%;overflow-y:auto;flex:1;min-width:0;padding:.5rem 1rem;gap:.5rem;background:var(--bg);color:var(--tx);font-family:'Outfit',sans-serif}
  .nt-hdr{display:flex;justify-content:space-between;align-items:center;flex-shrink:0;flex-wrap:wrap;gap:.5rem}
  .nt-hdr h1{font-size:18px;font-weight:900;letter-spacing:-1px}
  .nt-nav{display:flex;gap:.4rem}
  .nt-nav a{text-decoration:none}
  /* Stats-for-nerds bar */
  .sfn-bar{display:flex;gap:4px;flex-wrap:wrap;justify-content:center;flex-shrink:0}
  .sfn-group{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:var(--sf);border:1px solid var(--bd);border-radius:8px;cursor:pointer;transition:all .15s;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--tx)}
  .sfn-group:hover{border-color:#555;background:var(--sf2)}
  .sfn-group.sfn-active{border-color:var(--ac);background:rgba(88,166,255,.06)}
  .sfn-group-label{font-size:8px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-right:2px}
  .sfn-metric{display:inline-flex;align-items:baseline;gap:3px}
  .sfn-val{font-weight:700;color:var(--ac);font-size:13px}
  .sfn-key{font-size:9px;color:var(--mt);text-transform:uppercase}
  .sfn-sub{font-size:9px;color:var(--mt);margin-left:1px}
  .sfn-sep{color:var(--bd);font-size:10px}
  .sfn-coverage-btn{padding:4px 8px}
  .sfn-grid-icon{font-size:16px;color:var(--mt);line-height:1}
  .sfn-group.sfn-active .sfn-grid-icon{color:var(--ac)}

  /* Expandable panels */
  .sfn-panel{background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:8px 12px;flex-shrink:0;animation:sfn-in .15s ease-out}
  @keyframes sfn-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
  .sfn-panel-row{display:flex;gap:12px;flex-wrap:wrap}
  .sfn-panel-metric{display:flex;flex-direction:column;gap:1px;min-width:60px}
  .sfn-panel-metric.sfn-wide{flex:1;min-width:150px}
  .sfn-panel-label{font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--mt);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
  .sfn-panel-value{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--tx);display:flex;align-items:center;gap:4px}
  .sfn-panel-divider{height:1px;background:var(--bd);margin:4px 0}
  .sfn-panel-subtitle{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--mt);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:4px}
  .sfn-panel-empty{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mt);text-align:center;padding:6px}
  .sfn-dot{width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0}
  .sfn-sparkline{display:flex;align-items:center;gap:6px}
  .sfn-theta-val{font-size:12px;color:var(--ac)}
  .sfn-confusion{color:#FF6B6B;font-size:11px}
  .sfn-fluency-bar{width:40px;height:4px;background:var(--sf2);border-radius:2px;overflow:hidden;display:inline-block}
  .sfn-fluency-fill{height:100%;border-radius:2px;transition:width .3s}
  .sfn-coverage-panel{text-align:center}
  .sfn-coverage-grid{display:flex;justify-content:center}
  .nt-main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8rem;min-height:0}
  .nt-controls{display:flex;gap:.4rem;flex-wrap:wrap;justify-content:center;flex-shrink:0;padding-bottom:.5rem}
  .nt-btn{padding:.4rem .9rem;border-radius:20px;border:1.5px solid var(--bd);background:var(--sf);color:var(--mt);font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s}
  .nt-btn:hover{border-color:#555;color:var(--tx)}
  .nt-btn.nt-primary{border-color:var(--ac);color:var(--ac);background:rgba(88,166,255,.1)}
  .nt-btn.nt-danger{border-color:#FF6B6B;color:#FF6B6B;background:rgba(255,107,107,.08)}
  .nt-msg{text-align:center;font-size:14px;color:var(--mt);min-height:20px}
  .nt-msg.nt-err{color:#FF6B6B}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}

  .idle-panel{display:flex;flex-direction:column;align-items:center;gap:1.5rem;padding:1rem}
  .mastery-ring{position:relative;width:120px;height:120px;display:flex;align-items:center;justify-content:center}
  .mastery-ring :global(svg){position:absolute;inset:0}
  .mastery-pct{font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;color:var(--ac);z-index:1}
  .type-bars{width:100%;max-width:400px;display:flex;flex-direction:column;gap:.5rem}
  .type-bar{display:flex;align-items:center;gap:.5rem}
  .type-bar-name{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--mt);width:110px;text-align:right;flex-shrink:0}
  .type-bar-track{flex:1;height:8px;background:var(--sf2);border-radius:4px;overflow:hidden}
  .type-bar-fill{height:100%;background:var(--ac);border-radius:4px;transition:width .3s}
  .type-bar-pct{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mt);width:36px;text-align:right}
  .type-badge{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mt);background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:.2rem .6rem;text-transform:uppercase;letter-spacing:.5px}

  @media(max-width:600px){
    .nt-wrap{padding:.5rem;gap:.4rem}
    .nt-hdr h1{font-size:15px}
    .sfn-val{font-size:11px}
    .sfn-panel-value{font-size:11px}
    .nt-btn{font-size:12px;padding:.3rem .6rem}
    .type-bar-name{width:80px;font-size:10px}
  }
</style>
