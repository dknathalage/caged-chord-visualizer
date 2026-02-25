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
  import StringTraversal from '$lib/components/challenges/StringTraversal.svelte';
  import IntervalTrainer from '$lib/components/challenges/IntervalTrainer.svelte';
  import ChordToneFind from '$lib/components/challenges/ChordToneFind.svelte';
  import ChordPlayer from '$lib/components/challenges/ChordPlayer.svelte';
  import ScaleRunner from '$lib/components/challenges/ScaleRunner.svelte';
  import ModeTrainer from '$lib/components/challenges/ModeTrainer.svelte';

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
  let timerLeft = $state(0);
  let timerRef = $state(null);

  // Current challenge
  let challengeType = $state(null);
  let curItem = $state(null);
  let recall = $state(false);

  // NoteFind state
  let nfTarget = $state(null);
  let nfFbHtml = $state('');
  let nfFbSuccess = $state(false);
  let nfFbFlash = $state(false);

  // StringTraversal state
  let stNote = $state(null);
  let stFrets = $state(null);
  let stIdx = $state(0);
  let stDone = $state([false,false,false,false,false,false]);
  let stFbVisible = $state(false);
  let stFbHtml = $state('');
  let stFbSuccess = $state(false);
  let stFbFlash = $state(false);
  let stAllPosData = $state([]);

  // IntervalTrainer state
  let ivRef = $state(null);
  let ivInterval = $state(null);
  let ivTarget = $state(null);
  let ivTargetDisplay = $state('\u2014');
  let ivTargetHidden = $state(false);
  let ivFbHtml = $state('');
  let ivFbSuccess = $state(false);
  let ivFbFlash = $state(false);

  // ChordToneFind state
  let ctChallenge = $state(null);
  let ctChordName = $state('\u2014');
  let ctToneLabel = $state('');
  let ctTargetDisplay = $state('\u2014');
  let ctTargetHidden = $state(false);
  let ctFbHtml = $state('');
  let ctFbSuccess = $state(false);
  let ctFbFlash = $state(false);

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
  let showStart = $derived(phase === 'idle');
  let showActive = $derived(phase !== 'idle');
  let showReset = $derived(score > 0 || attempts > 0);

  // --- Timer ---
  function startTimer() {
    clearTimer();
    const d = engine.getParams();
    const typeParams = d._perType?.[challengeType];
    if (!typeParams?.timer) { timerLeft = 0; return; }
    timerLeft = typeParams.timer;
    timerRef = setInterval(() => {
      timerLeft--;
      if (timerLeft <= 0) { clearTimer(); onTimeout(); }
    }, 1000);
  }

  function clearTimer() {
    if (timerRef) { clearInterval(timerRef); timerRef = null; }
    timerLeft = 0;
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
    clearTimer();
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
    const inner = item._inner;
    qStartTime = performance.now();

    switch (challengeType) {
      case 'nf': prepareNoteFind(inner); break;
      case 'st': prepareStringTraversal(inner); break;
      case 'iv': prepareInterval(inner); break;
      case 'ct': prepareChordTone(inner); break;
      case 'cp': prepareChordPlayer(inner); break;
      case 'sr': prepareScaleRunner(inner); break;
      case 'mt': prepareModeTrainer(inner); break;
    }

    startTimer();
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

  function prepareStringTraversal(inner) {
    stNote = inner.note;
    stFrets = inner.frets;
    stIdx = 0;
    stDone = [false,false,false,false,false,false];
    stFbVisible = false; stFbHtml = ''; stAllPosData = [];
    stFbSuccess = false; stFbFlash = false;
    msgText = `Play ${inner.note} on ${NT_STR_NAMES[0]}`; msgErr = false;
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

  function prepareChordTone(inner) {
    const ct = CHORD_TYPES.find(c => c.id === inner.ctId);
    ctChallenge = { root: inner.root, chordType: ct, toneLabel: inner.toneLabel, targetNote: inner.targetNote, pos: inner.pos };
    ctChordName = inner.root + (ct?.sym || '');
    ctToneLabel = inner.toneLabel;
    if (recall) {
      ctTargetDisplay = '?'; ctTargetHidden = true;
      const _d = fbDims();
      ctFbHtml = `<svg viewBox="0 0 ${_d.W} ${_d.H}" xmlns="http://www.w3.org/2000/svg"><text x="${_d.W/2}" y="${_d.H/2}" text-anchor="middle" dominant-baseline="central" fill="#222" font-size="60" font-family="Outfit" font-weight="900">?</text></svg>`;
    } else {
      ctTargetDisplay = inner.targetNote; ctTargetHidden = false;
      ctFbHtml = renderFB(inner.pos, null, false);
    }
    ctFbSuccess = false; ctFbFlash = false;
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
    cpChallenge = { root, chordType: ct, shape: sh, resolved: r, sortedVoices, diagramHtml: dHtml, chordName, color, shapeName: sh.label };
    cpVoiceIdx = 0;
    cpVoiceDone = sortedVoices.map(() => false);
    cpFbSuccess = false; cpFbFlash = false;
    const firstVoice = sortedVoices[0];
    msgText = `Play ${firstVoice.note} on ${NT_STR_NAMES[firstVoice.str]}`; msgErr = false;
  }

  function prepareScaleRunner(inner) {
    const d = engine.getParams();
    const ri = inner.rootIdx;
    const root = NOTES[ri];
    const scale = SCALES.find(sc => sc.id === inner.scaleId);
    const startFret = inner.startFret;
    let seq = scaleSequence(ri, scale.iv, startFret, startFret + 4);
    if (seq.length < 5) { nextChallenge(); return; }
    const typeDir = d._perType?.sr?.dir;
    if (typeDir === 'updown') {
      const desc = [...seq].reverse().slice(1);
      seq = [...seq, ...desc];
    }
    srChallenge = { root, scale, seq, startFret };
    srNoteIdx = 0;
    srFbVisible = true;
    srFbSuccess = false; srFbFlash = false;
    srFbHtml = renderSeqFB(seq, 0, startFret);
    const t = seq[0];
    msgText = `Play ${root} ${scale.name}: start with ${t.note} (${NT_STR_NAMES[t.str]} fret ${t.fret})`; msgErr = false;
  }

  function prepareModeTrainer(inner) {
    const d = engine.getParams();
    const ri = inner.rootIdx;
    const root = NOTES[ri];
    const mode = MODES.find(m => m.id === inner.modeId);
    const startFret = inner.startFret;
    let seq = scaleSequence(ri, mode.iv, startFret, startFret + 4);
    if (seq.length < 5) { nextChallenge(); return; }
    const typeDir = d._perType?.mt?.dir;
    if (typeDir === 'updown') {
      const desc = [...seq].reverse().slice(1);
      seq = [...seq, ...desc];
    }
    mtChallenge = { root, mode, seq, startFret };
    mtNoteIdx = 0;
    mtFbVisible = true;
    mtFbSuccess = false; mtFbFlash = false;
    mtFbHtml = renderSeqFB(seq, 0, startFret);
    const t = seq[0];
    msgText = `Play ${root} ${mode.name}: start with ${t.note} (${NT_STR_NAMES[t.str]} fret ${t.fret})`; msgErr = false;
  }

  // --- Detection dispatch ---
  function onDetect(note, cents, hz, semi) {
    lastDetected = note || '';
    switch (challengeType) {
      case 'nf': detectNoteFind(note, cents, hz, semi); break;
      case 'st': detectStringTraversal(note, cents, hz, semi); break;
      case 'iv': detectInterval(note, cents, hz, semi); break;
      case 'ct': detectChordTone(note, cents, hz, semi); break;
      case 'cp': detectChordPlayer(note, cents, hz, semi); break;
      case 'sr': detectScaleRunner(note, cents, hz, semi); break;
      case 'mt': detectModeTrainer(note, cents, hz, semi); break;
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

  function detectStringTraversal(note, cents, hz, semi) {
    const nm = note === stNote;
    const expMidi = BASE_MIDI[stIdx] + stFrets[stIdx];
    const midiDiff = Math.abs(semi + 69 - expMidi);
    const midiOk = (midiDiff % 12) <= 1 || (midiDiff % 12) >= 11;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);
    if (nm && !midiOk && phase === 'listening') { msgText = `Right note, play on ${NT_STR_NAMES[stIdx]} string!`; msgErr = true; }
    checkHold(ok, () => {
      stDone[stIdx] = true; stDone = [...stDone];
      const tgt = {note: stNote, str: stIdx, fret: stFrets[stIdx], midi: BASE_MIDI[stIdx] + stFrets[stIdx]};
      stFbVisible = true; stFbHtml = renderFB(tgt, null, true); stFbSuccess = true; stFbFlash = true;
      setTimeout(() => { stFbSuccess = false; stFbFlash = false; if (phase === 'listening') stFbVisible = false; }, 600);
      stIdx++; holdStart = 0;
      if (stIdx >= 6) {
        engine.report(curItem, true, performance.now() - qStartTime);
        const pts = scoreCorrect(30, 3);
        msgText = `+${pts} points! All strings complete!`; msgErr = false;
        setTimeout(() => { stFbSuccess = false; stFbFlash = false; if (phase === 'success') nextChallenge(); }, 1200);
      } else {
        msgText = `Now play ${stNote} on ${NT_STR_NAMES[stIdx]}`; msgErr = false;
      }
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

  function detectChordTone(note, cents, hz, semi) {
    const ok = ctChallenge && note === ctChallenge.targetNote;
    showDetected(note, cents, hz, ok);
    checkHold(ok, () => {
      const pts = scoreCorrect(10, 2);
      engine.report(curItem, true, performance.now() - qStartTime);
      ctTargetDisplay = ctChallenge.targetNote; ctTargetHidden = false;
      ctFbHtml = renderFB(ctChallenge.pos, null, true);
      ctFbSuccess = true; ctFbFlash = true;
      msgText = `+${pts} points!`; msgErr = false;
      setTimeout(() => { ctFbSuccess = false; ctFbFlash = false; if (phase === 'success') nextChallenge(); }, recall ? 1200 : 800);
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

  // --- Flow functions ---
  function onSilence() { showDetected(null); holdStart = 0; }

  async function onStart() {
    refreshMastery();
    const ok = await audio.start();
    if (!ok) { msgText = 'Mic access denied.'; msgErr = true; return; }
    phase = 'listening';
    nextChallenge();
    audio.startLoop(onDetect, onSilence);
  }

  function onSkip() {
    engine.report(curItem, false, undefined, { detected: lastDetected });
    streak = 0; attempts++;
    score = Math.max(0, score - 5);
    clearTimer();
    msgText = 'Skipped'; msgErr = true;
    setTimeout(() => nextChallenge(), 1000);
  }

  function onTimeout() {
    engine.report(curItem, false, undefined, { detected: lastDetected });
    streak = 0; attempts++;
    score = Math.max(0, score - 5);
    msgText = "Time's up!"; msgErr = true;
    setTimeout(() => { if (phase === 'listening') nextChallenge(); }, 1000);
  }

  function onStop() {
    engine.save();
    saveExercise('practice', { bestScore: score, bestAccuracy: attempts > 0 ? Math.round(correct / attempts * 100) : 0 });
    phase = 'idle'; audio.stop(); clearTimer();
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

  onDestroy(() => { engine.save(); audio.stop(); clearTimer(); });
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
    <!-- Active: stats bar -->
    <div class="nt-stats">
      <div class="nt-stat"><div class="nt-stat-val">{score}</div><div class="nt-stat-lbl">Score</div></div>
      <div class="nt-stat"><div class="nt-stat-val">{streak}</div><div class="nt-stat-lbl">Streak</div></div>
      <div class="nt-stat"><div class="nt-stat-val">{accuracy}</div><div class="nt-stat-lbl">Accuracy</div></div>
      <div class="nt-stat"><div class="nt-stat-val">{best}</div><div class="nt-stat-lbl">Best</div></div>
    </div>
  {/if}

  <div class="nt-main">
    {#if phase !== 'idle'}
      {#if challengeType}
        <div class="type-badge">{TYPES.find(t => t.id === challengeType)?.name ?? ''}</div>
      {/if}
      <div class="nt-timer">{timerLeft > 0 ? timerLeft : ''}</div>

      <!-- Challenge display: switch on type -->
      {#if challengeType === 'nf'}
        <NoteFind target={nfTarget} fbHtml={nfFbHtml} fbSuccess={nfFbSuccess} fbFlash={nfFbFlash} {recall} />
      {:else if challengeType === 'st'}
        <StringTraversal travNote={stNote} travIdx={stIdx} travDone={stDone} fbVisible={stFbVisible} fbHtml={stFbHtml} fbSuccess={stFbSuccess} fbFlash={stFbFlash} allPosData={stAllPosData} />
      {:else if challengeType === 'iv'}
        <IntervalTrainer ref={ivRef} interval={ivInterval} targetDisplay={ivTargetDisplay} targetHidden={ivTargetHidden} fbHtml={ivFbHtml} fbSuccess={ivFbSuccess} fbFlash={ivFbFlash} />
      {:else if challengeType === 'ct'}
        <ChordToneFind chordName={ctChordName} toneLabel={ctToneLabel} targetDisplay={ctTargetDisplay} targetHidden={ctTargetHidden} fbHtml={ctFbHtml} fbSuccess={ctFbSuccess} fbFlash={ctFbFlash} />
      {:else if challengeType === 'cp'}
        <ChordPlayer challenge={cpChallenge} voiceIdx={cpVoiceIdx} voiceDone={cpVoiceDone} fbSuccess={cpFbSuccess} fbFlash={cpFbFlash} />
      {:else if challengeType === 'sr'}
        <ScaleRunner challenge={srChallenge} noteIdx={srNoteIdx} fbHtml={srFbHtml} fbVisible={srFbVisible} fbSuccess={srFbSuccess} fbFlash={srFbFlash} />
      {:else if challengeType === 'mt'}
        <ModeTrainer challenge={mtChallenge} noteIdx={mtNoteIdx} fbHtml={mtFbHtml} fbVisible={mtFbVisible} fbSuccess={mtFbSuccess} fbFlash={mtFbFlash} />
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
  .nt-wrap{display:flex;flex-direction:column;min-height:100vh;flex:1;min-width:0;padding:.5rem 1rem;gap:.5rem;background:var(--bg);color:var(--tx);font-family:'Outfit',sans-serif}
  .nt-hdr{display:flex;justify-content:space-between;align-items:center;flex-shrink:0;flex-wrap:wrap;gap:.5rem}
  .nt-hdr h1{font-size:18px;font-weight:900;letter-spacing:-1px}
  .nt-nav{display:flex;gap:.4rem}
  .nt-nav a{text-decoration:none}
  .nt-stats{display:flex;gap:1rem;background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:.4rem .8rem;flex-wrap:wrap;justify-content:center;flex-shrink:0}
  .nt-stat{text-align:center;font-family:'JetBrains Mono',monospace}
  .nt-stat-val{font-size:20px;font-weight:700;color:var(--ac)}
  .nt-stat-lbl{font-size:11px;color:var(--mt);text-transform:uppercase;letter-spacing:.5px}
  .nt-main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8rem;min-height:0}
  .nt-controls{display:flex;gap:.4rem;flex-wrap:wrap;justify-content:center;flex-shrink:0;padding-bottom:.5rem}
  .nt-btn{padding:.4rem .9rem;border-radius:20px;border:1.5px solid var(--bd);background:var(--sf);color:var(--mt);font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s}
  .nt-btn:hover{border-color:#555;color:var(--tx)}
  .nt-btn.nt-primary{border-color:var(--ac);color:var(--ac);background:rgba(88,166,255,.1)}
  .nt-btn.nt-danger{border-color:#FF6B6B;color:#FF6B6B;background:rgba(255,107,107,.08)}
  .nt-timer{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;color:#FF6B6B;text-align:center;min-height:30px}
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
    .nt-stat-val{font-size:16px}
    .nt-btn{font-size:12px;padding:.3rem .6rem}
    .type-bar-name{width:80px;font-size:10px}
  }
</style>
