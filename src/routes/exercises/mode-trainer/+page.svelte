<script>
  import { onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { saveExercise } from '$lib/progress.js';
  import { NOTES, MODES } from '$lib/constants/music.js';
  import { AudioManager } from '$lib/audio/AudioManager.js';
  import { NT_NATURAL, NT_TUNING, NT_STR_NAMES, BASE_MIDI, noteAt, scaleSequence, FB, drawBoard } from '$lib/music/fretboard.js';

  const MT_DIFF = {
    beginner:    {label:'Beginner',    modes:['ionian','aeolian'], naturalsOnly:true,  dir:'up',   timer:0,  tip:'Ionian+Aeolian \u00b7 Naturals'},
    intermediate:{label:'Intermediate',modes:['ionian','dorian','phrygian','lydian','mixolydian','aeolian','locrian'], naturalsOnly:true, dir:'up', timer:0, tip:'All 7 modes \u00b7 Naturals'},
    advanced:    {label:'Advanced',    modes:['ionian','dorian','phrygian','lydian','mixolydian','aeolian','locrian'], naturalsOnly:false, dir:'updown', timer:45, tip:'All modes \u00b7 All keys \u00b7 45s'}
  };

  // --- Reactive state ---
  let phase = $state('idle');
  let diff = $state('beginner');
  let score = $state(0);
  let streak = $state(0);
  let best = $state(0);
  let correct = $state(0);
  let attempts = $state(0);
  let timerLeft = $state(0);
  let timerRef = $state(null);

  let challenge = $state(null);
  let noteIdx = $state(0);

  let fbHtml = $state('');
  let fbVisible = $state(false);
  let fbSuccess = $state(false);
  let fbFlash = $state(false);

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

  // --- Derived ---
  let accuracy = $derived(attempts > 0 ? Math.round(correct / attempts * 100) + '%' : '\u2014');
  let showStart = $derived(phase === 'idle');
  let showActive = $derived(phase !== 'idle');
  let showReset = $derived(score > 0 || attempts > 0);

  // --- Difficulty ---
  function setDiff(d) {
    if (phase !== 'idle') return;
    diff = d;
  }

  // --- Timer ---
  function startTimer() {
    clearTimer();
    const d = MT_DIFF[diff];
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

  // --- Mode fretboard renderer (uses shared drawBoard) ---
  function renderModeFB(seq, currentIdx) {
    if (!challenge) return '';
    const center = challenge.startFret + 2;
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
        if (seqIdx <= currentIdx && lastIdx <= currentIdx) {
          col = '#4ECB71'; opacity = 0.4;
        } else if (seqIdx === currentIdx || lastIdx === currentIdx) {
          col = '#4ECB71'; opacity = 1.0;
        } else {
          col = '#58A6FF'; opacity = 0.7;
        }
        d += `<circle cx="${cx}" cy="${cy}" r="${DOT * 1.3}" fill="${col}" opacity="${opacity * 0.15}"/>`;
        d += `<circle cx="${cx}" cy="${cy}" r="${DOT}" fill="${col}" opacity="${opacity}"/>`;
        const fs = n.note.length > 1 ? DOT * 0.8 : DOT;
        d += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${fs}" font-weight="bold" font-family="JetBrains Mono">${n.note}</text>`;
      }
      return d;
    });
  }

  // --- Challenge picking ---
  function pickChallenge() {
    const d = MT_DIFF[diff];
    const allowedModes = MODES.filter(m => d.modes.includes(m.id));
    const mode = allowedModes[Math.floor(Math.random() * allowedModes.length)];
    const roots = d.naturalsOnly ? NT_NATURAL : NOTES;
    const root = roots[Math.floor(Math.random() * roots.length)];
    const ri = NOTES.indexOf(root);
    const startFret = Math.floor(Math.random() * 8) + 1;
    let seq = scaleSequence(ri, mode.iv, startFret, startFret + 4);
    if (seq.length < 5) return pickChallenge();
    if (d.dir === 'updown') {
      const desc = [...seq].reverse().slice(1);
      seq = [...seq, ...desc];
    }
    return { root, mode, seq, startFret };
  }

  // --- On note correct ---
  function onNoteCorrect() {
    noteIdx++;
    holdStart = 0;
    if (noteIdx >= challenge.seq.length) {
      const pts = scoreCorrect(40, 3);
      msgText = `+${pts} points! Mode complete!`;
      msgErr = false;
      fbHtml = renderModeFB(challenge.seq, noteIdx);
      fbSuccess = true;
      fbFlash = true;
      setTimeout(() => {
        fbSuccess = false;
        fbFlash = false;
        if (phase === 'success') nextChallenge();
      }, 1200);
    } else {
      const t = challenge.seq[noteIdx];
      msgText = `Next: ${t.note} (${NT_STR_NAMES[t.str]} fret ${t.fret})`;
      msgErr = false;
      fbHtml = renderModeFB(challenge.seq, noteIdx);
    }
  }

  // --- Detection ---
  function onDetect(note, cents, hz, semi) {
    if (!challenge || phase !== 'listening') return;
    const target = challenge.seq[noteIdx];
    const nm = note === target.note;
    const midiOk = Math.abs(semi + 69 - target.midi) <= 1;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);
    checkHold(ok, onNoteCorrect);
  }

  function onSilence() {
    showDetected(null);
    holdStart = 0;
  }

  // --- Flow ---
  function nextChallenge() {
    holdStart = 0; phase = 'listening';
    showDetected(null);
    const pick = pickChallenge();
    challenge = pick;
    noteIdx = 0;
    fbVisible = true;
    fbSuccess = false;
    fbFlash = false;
    fbHtml = renderModeFB(pick.seq, 0);
    const t = pick.seq[0];
    msgText = `Play ${pick.root} ${pick.mode.name}: start with ${t.note} (${NT_STR_NAMES[t.str]} fret ${t.fret})`;
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
    score = Math.max(0, score - 10);
    clearTimer();
    msgText = 'Skipped \u2014 mode revealed';
    msgErr = true;
    if (challenge) {
      fbHtml = renderModeFB(challenge.seq, challenge.seq.length);
      fbVisible = true;
    }
    setTimeout(() => nextChallenge(), 2500);
  }

  function onTimeout() {
    streak = 0; attempts++;
    score = Math.max(0, score - 10);
    msgText = "Time's up! Mode revealed";
    msgErr = true;
    if (challenge) {
      fbHtml = renderModeFB(challenge.seq, challenge.seq.length);
      fbVisible = true;
    }
    setTimeout(() => { if (phase === 'listening') nextChallenge(); }, 2500);
  }

  function onStop() {
    if (score > 0) saveExercise('mode-trainer', { bestScore: score, bestAccuracy: attempts > 0 ? Math.round(correct / attempts * 100) : 0 });
    phase = 'idle'; audio.stop(); clearTimer();
    showDetected(null);
    msgText = 'Stopped. Press Start to resume.';
    msgErr = false;
  }

  function onReset() {
    onStop();
    score = 0; streak = 0; best = 0; correct = 0; attempts = 0;
    challenge = null;
    noteIdx = 0;
    fbVisible = false;
    fbHtml = '';
    fbSuccess = false;
    fbFlash = false;
    msgText = 'Press Start to begin';
    msgErr = false;
  }

  onDestroy(() => { audio.stop(); clearTimer(); });
</script>

<svelte:head>
  <title>Mode Trainer — Practice Guitar Modes</title>
  <meta name="description" content="Practice playing modes on guitar with real-time pitch detection.">
</svelte:head>

<div class="nt-wrap">
  <header class="nt-hdr">
    <h1>Mode Trainer</h1>
    <nav class="nt-nav">
      <a href="{base}/" class="pill" style="font-size:13px">Home</a>
      <a href="{base}/exercises/scale-runner" class="pill" style="font-size:13px">Scale Runner</a>
      <a href="{base}/exercises/note-find" class="pill" style="font-size:13px">Note Find</a>
    </nav>
  </header>

  <div class="nt-stats">
    <div class="nt-stat"><div class="nt-stat-val">{score}</div><div class="nt-stat-lbl">Score</div></div>
    <div class="nt-stat"><div class="nt-stat-val">{streak}</div><div class="nt-stat-lbl">Streak</div></div>
    <div class="nt-stat"><div class="nt-stat-val">{accuracy}</div><div class="nt-stat-lbl">Accuracy</div></div>
    <div class="nt-stat"><div class="nt-stat-val">{best}</div><div class="nt-stat-lbl">Best</div></div>
  </div>

  <div class="nt-main">
    <div class="nt-diff">
      {#each Object.entries(MT_DIFF) as [key, cfg]}
        <button class="pill{diff === key ? ' on' : ''}" title={cfg.tip} onclick={() => setDiff(key)} disabled={phase !== 'idle'}>{cfg.label}</button>
      {/each}
    </div>

    <div class="nt-timer">{timerLeft > 0 ? timerLeft : ''}</div>

    <div class="nt-mode-section">
      <div class="nt-challenge-lbl">{challenge ? `${challenge.root} ${challenge.mode.name}` : 'Mode'}</div>
      <div class="nt-challenge-note">{challenge ? challenge.seq[noteIdx]?.note ?? '\u2714' : '\u2014'}</div>
      {#if challenge && challenge.mode.chars}
        <div class="nt-mode-chars">Characteristic: {challenge.mode.chars}</div>
      {/if}
      {#if challenge}
        <div class="nt-seq-dots">
          {#each challenge.seq as n, i}
            <div class="nt-seq-dot{i < noteIdx ? ' done' : (i === noteIdx ? ' active' : '')}"></div>
          {/each}
        </div>
      {/if}
    </div>

    {#if fbVisible}
      <div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
        <div>{@html fbHtml}</div>
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
  .nt-diff{display:flex;gap:.4rem;justify-content:center;margin-bottom:.2rem}
  .nt-timer{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;color:#FF6B6B;text-align:center;min-height:30px}
  .nt-msg{text-align:center;font-size:14px;color:var(--mt);min-height:20px}
  .nt-msg.nt-err{color:#FF6B6B}
  .nt-mode-section{text-align:center}
  .nt-mode-chars{font-family:'JetBrains Mono',monospace;font-size:13px;color:#F0A030;margin-top:.2rem}
  .nt-seq-dots{display:flex;gap:4px;justify-content:center;margin-top:.5rem;flex-wrap:wrap}
  .nt-seq-dot{width:10px;height:10px;border-radius:50%;border:2px solid var(--bd);background:var(--sf);transition:all .3s}
  .nt-seq-dot.active{border-color:var(--ac);background:rgba(88,166,255,.3);box-shadow:0 0 6px rgba(88,166,255,.4)}
  .nt-seq-dot.done{border-color:#4ECB71;background:#4ECB71}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .nt-wrap{padding:.5rem;gap:.4rem}
    .nt-hdr h1{font-size:15px}
    .nt-challenge-note{font-size:40px}
    .nt-detect-note{font-size:28px}
    .nt-stat-val{font-size:16px}
    .nt-btn{font-size:12px;padding:.3rem .6rem}
  }
</style>
