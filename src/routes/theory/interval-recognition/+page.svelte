<script>
  import { onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { saveExercise } from '$lib/progress.js';
  import { NOTES, INTERVALS } from '$lib/constants/music.js';
  import { TonePlayer } from '$lib/audio/TonePlayer.js';
  import { semiToFreq } from '$lib/audio/pitch.js';

  const IR_DIFF = {
    beginner:     { label: 'Beginner',     intervals: [3, 4, 5, 7, 12], dir: 'asc',  timer: 0,  tip: '5 common intervals \u00b7 Ascending' },
    intermediate: { label: 'Intermediate', intervals: 'all',            dir: 'asc',  timer: 15, tip: 'All intervals \u00b7 15s' },
    advanced:     { label: 'Advanced',     intervals: 'all',            dir: 'both', timer: 10, tip: 'Ascending+Descending \u00b7 10s' }
  };

  const tone = new TonePlayer();

  function irShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

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

  let promptHtml = $state('');
  let extraHtml = $state('');
  let choices = $state([]);
  let correctIdx = $state(-1);
  let answered = $state(false);
  let choiceStates = $state([]);
  let msgText = $state('Press Start to begin');
  let msgErr = $state(false);

  let currentRootFreq = $state(0);
  let currentIntervalFreq = $state(0);

  // --- Derived ---
  let accuracy = $derived(attempts > 0 ? Math.round(correct / attempts * 100) + '%' : '\u2014');
  let showStart = $derived(phase === 'idle');
  let showSkip = $derived(phase !== 'idle');
  let showStop = $derived(phase !== 'idle');
  let showReset = $derived(score > 0 || attempts > 0);

  // --- Difficulty ---
  function setDiff(d) {
    if (phase !== 'idle') return;
    diff = d;
  }

  // --- Timer ---
  function startTimer() {
    clearTimer();
    const d = IR_DIFF[diff];
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

  // --- Audio ---
  function playCurrentInterval() {
    tone.init();
    tone.playInterval(currentRootFreq, currentIntervalFreq, 0.9);
  }

  // --- Question generation ---
  function genQ() {
    const d = IR_DIFF[diff];
    const allowed = d.intervals === 'all' ? INTERVALS : INTERVALS.filter(iv => d.intervals.includes(iv.semi));
    const intv = allowed[Math.floor(Math.random() * allowed.length)];

    // Root semitone: -9 to +3 relative to A4 (C4 to Eb4 range)
    const rootSemi = Math.floor(Math.random() * 13) - 9;
    const rootFreq = semiToFreq(rootSemi);

    // Direction
    const asc = d.dir === 'both' ? Math.random() < 0.5 : true;
    const intervalFreq = semiToFreq(rootSemi + (asc ? intv.semi : -intv.semi));

    // Generate 4 choices (1 correct + 3 distractors)
    const correctLabel = intv.name + (d.dir === 'both' ? (asc ? ' \u2191' : ' \u2193') : '');
    let pool = allowed.filter(i => i.semi !== intv.semi);
    irShuffle(pool);
    const distractors = pool.slice(0, 3).map(i => i.name + (d.dir === 'both' ? (asc ? ' \u2191' : ' \u2193') : ''));
    const unique = [correctLabel];
    for (const d2 of distractors) { if (!unique.includes(d2)) unique.push(d2); }
    while (unique.length < 4) {
      const ri = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
      const label = ri.name + (d.dir === 'both' ? (Math.random() < 0.5 ? ' \u2191' : ' \u2193') : '');
      if (!unique.includes(label)) unique.push(label);
    }
    const ch = irShuffle([...unique]).slice(0, 4);

    return {
      prompt: '<div class="qz-prompt-sub">Name the interval</div>\ud83c\udfb5',
      choices: ch,
      correctIdx: ch.indexOf(correctLabel),
      rootFreq,
      intervalFreq,
      extra: ''
    };
  }

  // --- Flow ---
  function nextQ() {
    phase = 'active';
    const q = genQ();
    correctIdx = q.correctIdx;
    promptHtml = q.prompt;
    extraHtml = q.extra || '';
    choices = q.choices;
    choiceStates = q.choices.map(() => '');
    answered = false;
    msgText = '';
    msgErr = false;
    currentRootFreq = q.rootFreq;
    currentIntervalFreq = q.intervalFreq;
    setTimeout(() => playCurrentInterval(), 100);
    startTimer();
  }

  function onTap(idx) {
    if (answered || phase !== 'active') return;
    answered = true;
    clearTimer();
    const newStates = [...choiceStates];
    if (idx === correctIdx) {
      newStates[idx] = 'correct';
      choiceStates = newStates;
      correct++;
      attempts++;
      streak++;
      if (streak > best) best = streak;
      let pts = 10 + streak * 2;
      if (streak === 5) pts += 20;
      if (streak === 10) pts += 50;
      score += pts;
      msgText = `+${pts} points!`;
      msgErr = false;
      setTimeout(() => { if (phase === 'active') nextQ(); }, 800);
    } else {
      newStates[idx] = 'wrong';
      newStates[correctIdx] = 'correct';
      choiceStates = newStates;
      streak = 0;
      attempts++;
      const pen = Math.min(score, 5);
      score -= pen;
      msgText = pen > 0 ? '\u2212' + pen + ' points' : 'Wrong!';
      msgErr = true;
      setTimeout(() => { if (phase === 'active') nextQ(); }, 1200);
    }
  }

  function onTimeout() {
    if (answered || phase !== 'active') return;
    answered = true;
    const newStates = [...choiceStates];
    newStates[correctIdx] = 'correct';
    choiceStates = newStates;
    streak = 0;
    attempts++;
    const pen = Math.min(score, 5);
    score -= pen;
    msgText = `Time\u2019s up!` + (pen > 0 ? ` \u2212${pen}` : '');
    msgErr = true;
    setTimeout(() => { if (phase === 'active') nextQ(); }, 1500);
  }

  function onSkip() {
    if (answered || phase !== 'active') return;
    answered = true;
    clearTimer();
    const newStates = [...choiceStates];
    newStates[correctIdx] = 'correct';
    choiceStates = newStates;
    streak = 0;
    attempts++;
    const pen = Math.min(score, 5);
    score -= pen;
    msgText = 'Skipped.' + (pen > 0 ? ` \u2212${pen}` : '');
    msgErr = true;
    setTimeout(() => { if (phase === 'active') nextQ(); }, 1200);
  }

  function onStart() {
    phase = 'active';
    nextQ();
  }

  function onStop() {
    if (score > 0) saveExercise('interval-recognition', { bestScore: score, bestAccuracy: attempts > 0 ? Math.round(correct / attempts * 100) : 0 });
    phase = 'idle';
    clearTimer();
    tone.stop();
    choices = [];
    choiceStates = [];
    promptHtml = '';
    extraHtml = '';
    msgText = 'Stopped. Press Start to resume.';
    msgErr = false;
  }

  function onReset() {
    onStop();
    score = 0;
    streak = 0;
    best = 0;
    correct = 0;
    attempts = 0;
    msgText = 'Press Start to begin';
    msgErr = false;
  }

  onDestroy(() => { tone.stop(); clearTimer(); });
</script>

<svelte:head>
  <title>Interval Recognition — Ear Training</title>
  <meta name="description" content="Train your ear to recognize intervals between two notes.">
</svelte:head>

<div class="nt-wrap">
  <header class="nt-hdr">
    <h1>Interval Recognition</h1>
    <nav class="nt-nav">
      <a href="{base}/" class="pill" style="font-size:13px">Home</a>
      <a href="{base}/theory/chord-quality" class="pill" style="font-size:13px">Chord Quality</a>
      <a href="{base}/theory/interval-namer" class="pill" style="font-size:13px">Interval Namer</a>
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
      {#each Object.entries(IR_DIFF) as [key, cfg]}
        <button class="pill{diff === key ? ' on' : ''}" title={cfg.tip} onclick={() => setDiff(key)} disabled={phase !== 'idle'}>{cfg.label}</button>
      {/each}
    </div>
    <div class="nt-timer">{timerLeft > 0 ? timerLeft : ''}</div>
    <div class="qz-prompt">{@html promptHtml}</div>
    <div class="qz-extra">{@html extraHtml}</div>
    <div class="qz-choices">
      {#each choices as choice, i}
        <button
          class="qz-choice{choiceStates[i] === 'correct' ? ' qz-correct' : ''}{choiceStates[i] === 'wrong' ? ' qz-wrong' : ''}"
          onclick={() => onTap(i)}
        >{choice}</button>
      {/each}
    </div>
    <div class="nt-msg{msgErr ? ' nt-err' : ''}">{msgText}</div>
  </div>
  <div class="nt-controls">
    {#if showStart}
      <button class="nt-btn nt-primary" onclick={onStart}>Start</button>
    {/if}
    {#if phase === 'active'}
      <button class="nt-btn" onclick={playCurrentInterval}>Replay</button>
    {/if}
    {#if showSkip}
      <button class="nt-btn" onclick={onSkip}>Skip</button>
    {/if}
    {#if showStop}
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
  .nt-diff{display:flex;gap:.4rem;justify-content:center;margin-bottom:.2rem}
  .nt-timer{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;color:#FF6B6B;text-align:center;min-height:30px}
  .nt-msg{text-align:center;font-size:14px;color:var(--mt);min-height:20px}
  .nt-msg.nt-err{color:#FF6B6B}
  .nt-controls{display:flex;gap:.4rem;flex-wrap:wrap;justify-content:center;flex-shrink:0;padding-bottom:.5rem}
  .nt-btn{padding:.4rem .9rem;border-radius:20px;border:1.5px solid var(--bd);background:var(--sf);color:var(--mt);font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s}
  .nt-btn:hover{border-color:#555;color:var(--tx)}
  .nt-btn.nt-primary{border-color:var(--ac);color:var(--ac);background:rgba(88,166,255,.1)}
  .nt-btn.nt-danger{border-color:#FF6B6B;color:#FF6B6B;background:rgba(255,107,107,.08)}

  .qz-prompt{
    font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700;
    color:var(--ac);text-align:center;line-height:1.3;min-height:40px;
  }
  :global(.qz-prompt-sub){
    font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;
    color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.3rem;
  }
  .qz-choices{
    display:grid;grid-template-columns:1fr 1fr;gap:.8rem;
    max-width:360px;width:100%;margin:0 auto;
  }
  .qz-choice{
    padding:.8rem 1rem;border-radius:12px;border:1.5px solid var(--bd);
    background:var(--sf);color:var(--tx);
    font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:600;
    cursor:pointer;transition:all .2s;text-align:center;
  }
  .qz-choice:hover{border-color:#555;background:var(--sf2)}
  .qz-choice:active{transform:scale(.96)}
  .qz-choice.qz-correct{
    border-color:#4ECB71;color:#4ECB71;background:rgba(78,203,113,.15);
    box-shadow:0 0 15px rgba(78,203,113,.2);pointer-events:none;
  }
  .qz-choice.qz-wrong{
    border-color:#FF6B6B;color:#FF6B6B;background:rgba(255,107,107,.15);
    box-shadow:0 0 15px rgba(255,107,107,.2);pointer-events:none;
  }
  .qz-extra{text-align:center;min-height:0}
  .qz-extra :global(svg){max-width:700px;width:100%}

  @media(max-width:600px){
    .nt-wrap{padding:.5rem;gap:.4rem}
    .nt-hdr h1{font-size:15px}
    .nt-stat-val{font-size:16px}
    .nt-btn{font-size:12px;padding:.3rem .6rem}
    .qz-prompt{font-size:22px}
    .qz-choices{gap:.6rem;max-width:300px}
    .qz-choice{font-size:14px;padding:.6rem .8rem}
  }
</style>
