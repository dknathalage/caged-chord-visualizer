<script>
  import { onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { saveExercise } from '$lib/progress.js';
  import { NOTES, INTERVALS } from '$lib/constants/music.js';
  import { AudioManager } from '$lib/audio/AudioManager.js';
  import { NT_NATURAL, NT_TUNING, NT_STR_NAMES, BASE_MIDI, noteAt, fretForNote, renderFB, fbDims } from '$lib/music/fretboard.js';
  import { LearningEngine } from '$lib/learning/engine.js';
  import { intervalTrainerConfig } from '$lib/learning/configs/intervalTrainer.js';

  // --- Reactive state ---
  let phase = $state('idle');
  let recall = $state(false);
  let score = $state(0);
  let streak = $state(0);
  let best = $state(0);
  let correct = $state(0);
  let attempts = $state(0);
  let timerLeft = $state(0);
  let timerRef = $state(null);

  let intvRef = $state(null);
  let intvInterval = $state(null);
  let intvTarget = $state(null);

  let fbHtml = $state('');
  let fbSuccess = $state(false);
  let fbFlash = $state(false);

  let targetDisplay = $state('\u2014');
  let targetHidden = $state(false);

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
  let engine = new LearningEngine(intervalTrainerConfig);

  // --- Derived ---
  let accuracy = $derived(attempts > 0 ? Math.round(correct / attempts * 100) + '%' : '\u2014');
  let showStart = $derived(phase === 'idle');
  let showActive = $derived(phase !== 'idle');
  let showReset = $derived(score > 0 || attempts > 0);

  // --- Mode ---
  function setMode(r) {
    if (phase !== 'idle') return;
    recall = r;
  }

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
    streak = 0; attempts++;
    const pen = Math.min(score, 5);
    score -= pen;
    wrongCd = performance.now(); wrongHold = 0;
    msgText = pen > 0 ? '\u2212' + pen + ' points' : 'Wrong!';
    msgErr = true;
    engine.report({ref: intvRef, interval: intvInterval, targetNote: intvTarget}, false);
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

  // --- Interval picking ---
  function pickInterval() {
    return engine.next();
  }

  // --- Show interval ---
  function showInterval() {
    if (!intvRef) {
      targetDisplay = '\u2014';
      targetHidden = false;
      fbHtml = '';
      return;
    }
    if (recall) {
      targetDisplay = '?';
      targetHidden = true;
      const _d = fbDims(); fbHtml = `<svg viewBox="0 0 ${_d.W} ${_d.H}" xmlns="http://www.w3.org/2000/svg"><text x="${_d.W/2}" y="${_d.H/2}" text-anchor="middle" dominant-baseline="central" fill="#222" font-size="60" font-family="Outfit" font-weight="900">?</text></svg>`;
    } else {
      targetDisplay = intvTarget;
      targetHidden = false;
      fbHtml = renderFB(intvRef, null, false);
    }
  }

  // --- Detection ---
  function onDetect(note, cents, hz, semi) {
    const ok = note === intvTarget;
    showDetected(note, cents, hz, ok);

    checkHold(ok, () => {
      const pts = scoreCorrect(10, 2);
      engine.report({ref: intvRef, interval: intvInterval, targetNote: intvTarget}, true);
      targetDisplay = intvTarget;
      targetHidden = false;
      fbHtml = renderFB(intvRef, null, true);
      fbSuccess = true;
      fbFlash = true;
      msgText = `+${pts} points!`;
      msgErr = false;
      setTimeout(() => {
        fbSuccess = false;
        fbFlash = false;
        if (phase === 'success') nextChallenge();
      }, recall ? 1200 : 800);
    });
  }

  function onSilence() {
    showDetected(null);
    holdStart = 0;
  }

  // --- Flow ---
  function nextChallenge() {
    holdStart = 0; phase = 'listening';
    showDetected(null);
    const pick = pickInterval();
    intvRef = pick.ref;
    intvInterval = pick.interval;
    intvTarget = pick.targetNote;
    showInterval();
    msgText = 'Listening...';
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
    streak = 0; attempts++;
    score = Math.max(0, score - 5);
    clearTimer();
    engine.report({ref: intvRef, interval: intvInterval, targetNote: intvTarget}, false);
    targetDisplay = intvTarget;
    targetHidden = false;
    fbHtml = renderFB(intvRef, null, false);
    msgText = `Was: ${intvTarget}`;
    msgErr = true;
    setTimeout(() => nextChallenge(), 1500);
  }

  function onTimeout() {
    streak = 0; attempts++;
    score = Math.max(0, score - 5);
    engine.report({ref: intvRef, interval: intvInterval, targetNote: intvTarget}, false);
    targetDisplay = intvTarget;
    targetHidden = false;
    fbHtml = renderFB(intvRef, null, false);
    msgText = `Time's up! Was: ${intvTarget}`;
    msgErr = true;
    setTimeout(() => { if (phase === 'listening') nextChallenge(); }, recall ? 1500 : 800);
  }

  function onStop() {
    if (score > 0) saveExercise('interval-trainer', { bestScore: score, bestAccuracy: attempts > 0 ? Math.round(correct / attempts * 100) : 0 });
    phase = 'idle'; audio.stop(); clearTimer();
    showDetected(null);
    msgText = 'Stopped. Press Start to resume.';
    msgErr = false;
  }

  function onReset() {
    onStop();
    score = 0; streak = 0; best = 0; correct = 0; attempts = 0;
    intvRef = null;
    intvInterval = null;
    intvTarget = null;
    showInterval();
    msgText = 'Press Start to begin';
    msgErr = false;
    engine = new LearningEngine(intervalTrainerConfig);
  }

  onDestroy(() => { audio.stop(); clearTimer(); });
</script>

<svelte:head>
  <title>Interval Trainer — Practice Intervals on Guitar</title>
  <meta name="description" content="Practice identifying and playing intervals on the guitar fretboard with real-time pitch detection.">
</svelte:head>

<div class="nt-wrap">
  <header class="nt-hdr">
    <h1>Interval Trainer</h1>
    <nav class="nt-nav">
      <a href="{base}/" class="pill" style="font-size:13px">Home</a>
      <a href="{base}/exercises/note-find" class="pill" style="font-size:13px">Note Find</a>
      <a href="{base}/exercises/string-traversal" class="pill" style="font-size:13px">Traversal</a>
    </nav>
  </header>

  <div class="nt-stats">
    <div class="nt-stat"><div class="nt-stat-val">{score}</div><div class="nt-stat-lbl">Score</div></div>
    <div class="nt-stat"><div class="nt-stat-val">{streak}</div><div class="nt-stat-lbl">Streak</div></div>
    <div class="nt-stat"><div class="nt-stat-val">{accuracy}</div><div class="nt-stat-lbl">Accuracy</div></div>
    <div class="nt-stat"><div class="nt-stat-val">{best}</div><div class="nt-stat-lbl">Best</div></div>
  </div>

  <div class="nt-main">
    <div class="nt-mode">
      <button class="pill{recall ? '' : ' on'}" title="Shows target note & fretboard" onclick={() => setMode(false)} disabled={phase !== 'idle'}>Guided</button>
      <button class="pill{recall ? ' on' : ''}" title="Hides target — you recall it" onclick={() => setMode(true)} disabled={phase !== 'idle'}>Recall</button>
    </div>

    <div class="nt-timer">{timerLeft > 0 ? timerLeft : ''}</div>

    <div class="nt-intv-section">
      <div class="nt-challenge-lbl">Play the interval</div>
      <div class="nt-intv-row">
        <div class="nt-intv-note">{intvRef ? intvRef.note : '\u2014'}</div>
        <div class="nt-intv-arrow">&rarr;</div>
        <div class="nt-intv-label">{intvInterval ? intvInterval.name : ''}</div>
        <div class="nt-intv-arrow">&rarr;</div>
        <div class="nt-intv-note" class:nt-intv-hidden={targetHidden}>{targetDisplay}</div>
      </div>
    </div>

    <div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
      <div>{@html fbHtml}</div>
    </div>

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
  .nt-mode{display:flex;gap:.4rem;justify-content:center;margin-bottom:.2rem}
  .nt-timer{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;color:#FF6B6B;text-align:center;min-height:30px}
  .nt-msg{text-align:center;font-size:14px;color:var(--mt);min-height:20px}
  .nt-msg.nt-err{color:#FF6B6B}
  .nt-intv-section{text-align:center}
  .nt-intv-row{display:flex;align-items:center;justify-content:center;gap:.6rem;margin-top:.3rem;flex-wrap:wrap}
  .nt-intv-note{font-family:'JetBrains Mono',monospace;font-size:42px;font-weight:700;color:var(--ac);line-height:1}
  .nt-intv-note.nt-intv-hidden{color:var(--mt);opacity:.4}
  .nt-intv-arrow{font-size:24px;color:var(--mt)}
  .nt-intv-label{font-family:'JetBrains Mono',monospace;font-size:16px;color:var(--mt);background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:.3rem .6rem}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .nt-wrap{padding:.5rem;gap:.4rem}
    .nt-hdr h1{font-size:15px}
    .nt-detect-note{font-size:28px}
    .nt-stat-val{font-size:16px}
    .nt-btn{font-size:12px;padding:.3rem .6rem}
    .nt-intv-note{font-size:32px}
    .nt-intv-arrow{font-size:18px}
    .nt-intv-label{font-size:13px}
  }
</style>
