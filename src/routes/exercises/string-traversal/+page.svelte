<script>
  import { onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { saveExercise } from '$lib/progress.js';
  import { NOTES } from '$lib/constants/music.js';
  import { AudioManager } from '$lib/audio/AudioManager.js';
  import { NT_NATURAL, NT_TUNING, NT_STR_NAMES, BASE_MIDI, noteAt, fretForNote, renderFB } from '$lib/music/fretboard.js';
  import { LearningEngine } from '$lib/learning/engine.js';
  import { stringTraversalConfig } from '$lib/learning/configs/stringTraversal.js';

  // --- Reactive state ---
  let phase = $state('idle');
  let score = $state(0);
  let streak = $state(0);
  let best = $state(0);
  let correct = $state(0);
  let attempts = $state(0);
  let timerLeft = $state(0);
  let timerRef = $state(null);

  let travNote = $state(null);
  let travFrets = $state(null);
  let travIdx = $state(0);
  let travDone = $state([false,false,false,false,false,false]);

  let fbHtml = $state('');
  let fbVisible = $state(false);
  let fbSuccess = $state(false);
  let fbFlash = $state(false);
  let allPosHtml = $state('');

  let detectedNote = $state('\u2014');
  let detectedClass = $state('');
  let centsLbl = $state('');
  let centsLeft = $state('50%');
  let hzText = $state('');

  let msgText = $state('Press Start to begin');
  let msgErr = $state(false);

  // Hold detection state
  let holdStart = 0;
  let wrongHold = 0;
  let wrongCd = 0;

  // Audio
  const audio = new AudioManager();
  let engine = new LearningEngine(stringTraversalConfig);

  // --- Derived ---
  let accuracy = $derived(attempts > 0 ? Math.round(correct / attempts * 100) + '%' : '\u2014');
  let showStart = $derived(phase === 'idle');
  let showActive = $derived(phase !== 'idle');
  let showReset = $derived(score > 0 || attempts > 0);

  // --- Timer ---
  function startTimer() {
    clearTimer();
    const d = engine.getParams();
    if (!d.timer) { timerLeft = 0; return; }
    timerLeft = d.timer;
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
      detectedNote = '\u2014';
      detectedClass = '';
      centsLbl = '';
      centsLeft = '50%';
      hzText = '';
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
    engine.report({note: travNote, frets: travFrets}, false);
    streak = 0; attempts++;
    const pen = Math.min(score, 5);
    score -= pen;
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

  // --- Traversal picking ---
  function pickTraversal() {
    return engine.next();
  }

  // --- Show traversal fret reveal ---
  function showTravFretReveal(str, fret, isOk) {
    const tgt = {note:travNote, str, fret, midi:BASE_MIDI[str]+fret};
    fbVisible = true;
    fbHtml = renderFB(tgt, null, isOk);
    allPosHtml = '';
    if (isOk) { fbSuccess = true; fbFlash = true; }
    setTimeout(() => {
      fbSuccess = false;
      fbFlash = false;
      if (phase === 'listening') fbVisible = false;
    }, 600);
  }

  // --- Show all positions ---
  function showTravAllPositions() {
    const pos = [];
    for (let s = 0; s < 6; s++) pos.push({label:`${NT_STR_NAMES[s]}:${travFrets[s]}`, done:travDone[s]});
    fbVisible = true;
    fbHtml = '';
    allPosHtml = travNote;
    // We'll render this in the template with the pos data stored
    allPosData = pos;
  }

  let allPosData = $state([]);

  // --- On correct string ---
  function onTravStringCorrect() {
    travDone[travIdx] = true;
    travDone = [...travDone]; // trigger reactivity
    showTravFretReveal(travIdx, travFrets[travIdx], true);
    travIdx++;
    holdStart = 0;
    if (travIdx >= 6) {
      engine.report({note: travNote, frets: travFrets}, true);
      const pts = scoreCorrect(30, 3);
      msgText = `+${pts} points! All strings complete!`;
      msgErr = false;
      setTimeout(() => {
        fbSuccess = false;
        fbFlash = false;
        if (phase === 'success') nextChallenge();
      }, 1200);
    } else {
      msgText = `Now play ${travNote} on ${NT_STR_NAMES[travIdx]}`;
      msgErr = false;
    }
  }

  // --- Detection ---
  function onDetect(note, cents, hz, semi) {
    const nm = note === travNote;
    const expMidi = BASE_MIDI[travIdx] + travFrets[travIdx];
    const midiDiff = Math.abs(semi + 69 - expMidi);
    const midiOk = (midiDiff % 12) <= 1 || (midiDiff % 12) >= 11;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);

    if (nm && !midiOk && phase === 'listening') {
      msgText = `Right note, play on ${NT_STR_NAMES[travIdx]} string!`;
      msgErr = true;
    }

    checkHold(ok, onTravStringCorrect);
  }

  function onSilence() {
    showDetected(null);
    holdStart = 0;
  }

  // --- Flow ---
  function nextChallenge() {
    holdStart = 0; phase = 'listening';
    showDetected(null);
    const pick = pickTraversal();
    travNote = pick.note;
    travFrets = pick.frets;
    travIdx = 0;
    travDone = [false,false,false,false,false,false];
    fbVisible = false;
    fbHtml = '';
    allPosHtml = '';
    allPosData = [];
    msgText = `Play ${travNote} on ${NT_STR_NAMES[0]}`;
    msgErr = false;
    startTimer();
  }

  async function onStart() {
    const ok = await audio.start();
    if (!ok) {
      msgText = 'Mic access denied. Please allow microphone and try again.';
      msgErr = true;
      return;
    }
    phase = 'listening';
    nextChallenge();
    audio.startLoop(onDetect, onSilence);
  }

  function onSkip() {
    engine.report({note: travNote, frets: travFrets}, false);
    streak = 0; attempts++;
    score = Math.max(0, score - 10);
    clearTimer();
    showTravAllPositions();
    msgText = 'Skipped \u2014 positions revealed';
    msgErr = true;
    setTimeout(() => nextChallenge(), 2500);
  }

  function onTimeout() {
    engine.report({note: travNote, frets: travFrets}, false);
    streak = 0; attempts++;
    score = Math.max(0, score - 10);
    showTravAllPositions();
    msgText = "Time's up! Positions revealed";
    msgErr = true;
    setTimeout(() => { if (phase === 'listening') nextChallenge(); }, 2500);
  }

  function onStop() {
    if (score > 0) saveExercise('string-traversal', { bestScore: score, bestAccuracy: attempts > 0 ? Math.round(correct / attempts * 100) : 0 });
    phase = 'idle'; audio.stop(); clearTimer();
    showDetected(null);
    msgText = 'Stopped. Press Start to resume.';
    msgErr = false;
  }

  function onReset() {
    onStop();
    engine = new LearningEngine(stringTraversalConfig);
    score = 0; streak = 0; best = 0; correct = 0; attempts = 0;
    travNote = null;
    travFrets = null;
    travIdx = 0;
    travDone = [false,false,false,false,false,false];
    fbVisible = false;
    fbHtml = '';
    allPosHtml = '';
    allPosData = [];
    msgText = 'Press Start to begin';
    msgErr = false;
  }

  onDestroy(() => { audio.stop(); clearTimer(); });
</script>

<svelte:head>
  <title>String Traversal — Play Notes Across All Strings</title>
  <meta name="description" content="Practice playing notes across all 6 guitar strings with real-time pitch detection.">
</svelte:head>

<div class="nt-wrap">
  <header class="nt-hdr">
    <h1>String Traversal</h1>
    <nav class="nt-nav">
      <a href="{base}/" class="pill" style="font-size:13px">Home</a>
      <a href="{base}/exercises/note-find" class="pill" style="font-size:13px">Note Find</a>
      <a href="{base}/exercises/interval" class="pill" style="font-size:13px">Interval</a>
    </nav>
  </header>

  <div class="nt-stats">
    <div class="nt-stat"><div class="nt-stat-val">{score}</div><div class="nt-stat-lbl">Score</div></div>
    <div class="nt-stat"><div class="nt-stat-val">{streak}</div><div class="nt-stat-lbl">Streak</div></div>
    <div class="nt-stat"><div class="nt-stat-val">{accuracy}</div><div class="nt-stat-lbl">Accuracy</div></div>
    <div class="nt-stat"><div class="nt-stat-val">{best}</div><div class="nt-stat-lbl">Best</div></div>
  </div>

  <div class="nt-main">
    <div class="nt-timer">{timerLeft > 0 ? timerLeft : ''}</div>

    <div class="nt-trav-section">
      <div class="nt-challenge-lbl">Play on every string</div>
      <div class="nt-challenge-note">{travNote ? travNote : '\u2014'}</div>
      <div class="nt-trav-dots">
        {#each NT_STR_NAMES as name, s}
          <div class="nt-trav-dot{travDone[s] ? ' done' : (s === travIdx && travNote ? ' active' : '')}">
            <span class="nt-trav-dot-lbl">{name}</span>
          </div>
        {/each}
      </div>
    </div>

    {#if fbVisible}
      <div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
        {#if allPosData.length > 0}
          <div class="nt-allpos">
            <div class="nt-allpos-title">{allPosHtml} on every string:</div>
            <div class="nt-allpos-items">
              {#each allPosData as pos}
                <span class="nt-allpos-item" class:nt-allpos-done={pos.done} class:nt-allpos-missed={!pos.done}>{pos.label}</span>
              {/each}
            </div>
          </div>
        {:else}
          <div>{@html fbHtml}</div>
        {/if}
      </div>
    {/if}

    <div class="nt-detect">
      <div class="nt-detect-note {detectedClass}">{detectedNote}</div>
      <div class="nt-cents-wrap">
        <span class="nt-cents-lbl">{centsLbl}</span>
        <div class="nt-cents-bar"><div class="nt-cents-ind" style="left:{centsLeft}"></div></div>
      </div>
      <div class="nt-hz">{hzText}</div>
    </div>

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

<style>
  .nt-wrap{display:flex;flex-direction:column;min-height:100vh;width:100%;padding:.5rem 1rem;gap:.5rem;background:var(--bg);color:var(--tx);font-family:'Outfit',sans-serif}
  .nt-hdr{display:flex;justify-content:space-between;align-items:center;flex-shrink:0;flex-wrap:wrap;gap:.5rem}
  .nt-hdr h1{font-size:18px;font-weight:900;letter-spacing:-1px}
  .nt-nav{display:flex;gap:.4rem}
  .nt-nav a{text-decoration:none}
  .nt-stats{display:flex;gap:1rem;background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:.4rem .8rem;flex-wrap:wrap;justify-content:center;flex-shrink:0}
  .nt-stat{text-align:center;font-family:'JetBrains Mono',monospace}
  .nt-stat-val{font-size:20px;font-weight:700;color:var(--ac)}
  .nt-stat-lbl{font-size:11px;color:var(--mt);text-transform:uppercase;letter-spacing:.5px}
  .nt-main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8rem;min-height:0}
  .nt-challenge-lbl{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .nt-challenge-note{font-family:'JetBrains Mono',monospace;font-size:56px;font-weight:700;color:var(--ac);line-height:1}
  .nt-fb-wrap{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;width:100%;max-width:700px;transition:border-color .3s,box-shadow .3s}
  .nt-fb-wrap.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  .nt-detect{text-align:center;margin-top:.3rem}
  .nt-detect-note{font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:700;color:var(--mt);line-height:1;transition:color .15s}
  .nt-detect-note.nt-correct{color:#4ECB71}
  .nt-detect-note.nt-wrong{color:#FF6B6B}
  .nt-cents-wrap{display:flex;align-items:center;justify-content:center;gap:.4rem;margin-top:.3rem}
  .nt-cents-bar{width:160px;height:6px;background:var(--sf2);border-radius:3px;position:relative;overflow:hidden}
  .nt-cents-ind{position:absolute;top:0;width:8px;height:6px;border-radius:3px;background:var(--ac);left:50%;transform:translateX(-50%);transition:left .1s}
  .nt-cents-lbl{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mt);min-width:50px}
  .nt-hz{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mt);text-align:center;margin-top:.1rem}
  .nt-controls{display:flex;gap:.4rem;flex-wrap:wrap;justify-content:center;flex-shrink:0;padding-bottom:.5rem}
  .nt-btn{padding:.4rem .9rem;border-radius:20px;border:1.5px solid var(--bd);background:var(--sf);color:var(--mt);font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s}
  .nt-btn:hover{border-color:#555;color:var(--tx)}
  .nt-btn.nt-primary{border-color:var(--ac);color:var(--ac);background:rgba(88,166,255,.1)}
  .nt-btn.nt-danger{border-color:#FF6B6B;color:#FF6B6B;background:rgba(255,107,107,.08)}
  .nt-timer{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;color:#FF6B6B;text-align:center;min-height:30px}
  .nt-msg{text-align:center;font-size:14px;color:var(--mt);min-height:20px}
  .nt-msg.nt-err{color:#FF6B6B}
  .nt-trav-section{text-align:center}
  .nt-trav-dots{display:flex;gap:.6rem;justify-content:center;margin-top:.5rem}
  .nt-trav-dot{width:40px;height:40px;border-radius:50%;border:2px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;transition:all .3s}
  .nt-trav-dot.active{border-color:var(--ac);background:rgba(88,166,255,.15);box-shadow:0 0 10px rgba(88,166,255,.3)}
  .nt-trav-dot.done{border-color:#4ECB71;background:rgba(78,203,113,.15)}
  .nt-trav-dot-lbl{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--mt)}
  .nt-trav-dot.active .nt-trav-dot-lbl{color:var(--ac)}
  .nt-trav-dot.done .nt-trav-dot-lbl{color:#4ECB71}
  .nt-allpos{text-align:center;padding:1rem;font-family:'JetBrains Mono',monospace;color:var(--mt);font-size:14px}
  .nt-allpos-title{margin-bottom:.5rem;color:var(--ac)}
  .nt-allpos-items{display:flex;flex-wrap:wrap;justify-content:center;gap:.2rem .4rem}
  .nt-allpos-item{display:inline-block;padding:.2rem .5rem;background:var(--sf2);border-radius:6px}
  .nt-allpos-done{color:#4ECB71}
  .nt-allpos-missed{color:#FF6B6B}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .nt-wrap{padding:.5rem;gap:.4rem}
    .nt-hdr h1{font-size:15px}
    .nt-challenge-note{font-size:40px}
    .nt-detect-note{font-size:28px}
    .nt-stat-val{font-size:16px}
    .nt-btn{font-size:12px;padding:.3rem .6rem}
    .nt-trav-dot{width:34px;height:34px}
    .nt-trav-dot-lbl{font-size:11px}
  }
</style>
