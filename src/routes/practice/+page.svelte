<script>
  import { onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { saveExercise } from '$lib/progress.js';
  import { AudioManager } from '$lib/audio/AudioManager.js';
  import { LearningEngine } from '$lib/learning/engine.js';
  import { unifiedConfig, TYPES } from '$lib/learning/configs/unified.js';
  import { migrateToUnified } from '$lib/learning/migration.js';
  import { addToast } from '$lib/stores/notifications.svelte.js';
  import ProgressRing from '$lib/components/svg/ProgressRing.svelte';
  import CoverageHeatmap from '$lib/components/svg/CoverageHeatmap.svelte';
  import ThetaSparkline from '$lib/components/svg/ThetaSparkline.svelte';
  import LearningDashboard from '$lib/components/LearningDashboard.svelte';
  import PitchDisplay from '$lib/components/challenges/PitchDisplay.svelte';
  import NoteFind from '$lib/components/challenges/NoteFind.svelte';
  import IntervalTrainer from '$lib/components/challenges/IntervalTrainer.svelte';
  import ChordPlayer from '$lib/components/challenges/ChordPlayer.svelte';
  import ScaleRunner from '$lib/components/challenges/ScaleRunner.svelte';
  import ModeTrainer from '$lib/components/challenges/ModeTrainer.svelte';
  import ChordTransition from '$lib/components/challenges/ChordTransition.svelte';

  migrateToUnified();

  let qStartTime = 0;

  // --- Core state ---
  let phase = $state('idle');
  let score = $state(0);
  let streak = $state(0);
  let best = $state(0);
  let correct = $state(0);
  let attempts = $state(0);
  let challengeType = $state(null);
  let curItem = $state(null);
  let recall = $state(false);
  let lastDetected = '';

  // Pitch display state
  let detectedNote = $state('\u2014');
  let detectedClass = $state('');
  let centsLbl = $state('');
  let centsLeft = $state('50%');
  let hzText = $state('');

  // Message state
  let msgText = $state('Press Start to begin');
  let msgErr = $state(false);

  // Challenge component ref (whichever is currently active)
  let challengeRef = $state(null);

  // Audio & Engine
  const audio = new AudioManager();
  let engine = new LearningEngine(unifiedConfig, 'practice', { onError: (msg) => addToast(msg) });

  // Mastery state for idle view
  let mastery = $state(null);

  function refreshMastery() {
    mastery = engine.getMastery();
  }

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
  let showReset = $derived(score > 0 || attempts > 0 || engine.totalAttempts > 0);

  // --- Stats-for-nerds ---
  let curItemKey = $derived(curItem ? engine.config.itemKey(curItem) : null);
  let curItemStats = $derived(curItemKey ? engine.getItemStats(curItemKey) : null);

  let sessionExpanded = $state(false);
  let engineExpanded = $state(false);
  let coverageExpanded = $state(false);

  let sessionMastery = $state(null);
  function refreshSessionMastery() {
    sessionMastery = engine.getMastery();
  }

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
  function sfnFatigueColor(f) { return f ? '#FF6B6B' : '#4ECB71'; }
  function sfnFatigueLabel(f) { return f ? 'Fatigued' : 'Fresh'; }

  // --- Shared callbacks passed to challenge components ---
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

  function setMsg(text, isErr) {
    msgText = text;
    msgErr = isErr;
  }

  function onChallengeComplete(basePts, mult) {
    phase = 'success'; correct++; attempts++; streak++;
    if (streak > best) best = streak;
    let pts = basePts + streak * mult;
    if (streak === 5) pts += 20;
    if (streak === 10) pts += 50;
    score += pts;
    engine.report(curItem, true, performance.now() - qStartTime);
    msgText = `+${pts} points!`; msgErr = false;
    refreshSessionMastery();
    setTimeout(() => { if (phase === 'success') nextChallenge(); }, 1200);
  }

  function onChallengeWrong() {
    streak = 0; attempts++;
    const pen = Math.min(score, 5);
    score -= pen;
    engine.report(curItem, false, undefined, { detected: lastDetected });
    msgText = pen > 0 ? '\u2212' + pen + ' points' : 'Wrong!';
    msgErr = true;
    refreshSessionMastery();
  }

  function onChallengeInvalid() {
    nextChallenge();
  }

  // --- Challenge lifecycle ---
  function nextChallenge() {
    phase = 'listening';
    showDetected(null);
    const item = engine.next();
    curItem = item;
    challengeType = item._type;
    recall = !!item._recall;
    qStartTime = performance.now();
    // The component will be mounted/updated by Svelte reactivity.
    // We need to call prepare on the next tick after the component ref is set.
    requestAnimationFrame(() => {
      challengeRef?.prepare(item._inner, recall);
    });
  }

  // --- AudioManager event handlers ---
  function handleDetect(e) {
    const { note, cents, hz, semitones } = e.detail;
    lastDetected = note || '';
    if (phase !== 'listening') return;
    challengeRef?.handleDetection(note, cents, hz, semitones);
  }

  function handleSilence() {
    if (phase !== 'listening') return;
    challengeRef?.handleSilence();
  }

  // --- Flow functions ---
  async function onStart() {
    refreshMastery();
    refreshSessionMastery();
    const result = await audio.start();
    if (!result.ok) {
      addToast(result.message);
      msgText = result.message; msgErr = true;
      return;
    }
    audio.addEventListener('detect', handleDetect);
    audio.addEventListener('silence', handleSilence);
    phase = 'listening';
    nextChallenge();
    audio.startLoop();
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
    audio.removeEventListener('detect', handleDetect);
    audio.removeEventListener('silence', handleSilence);
    phase = 'idle'; audio.stop();
    showDetected(null);
    refreshMastery();
    msgText = 'Stopped. Press Start to resume.'; msgErr = false;
  }

  function onReset() {
    onStop();
    score = 0; streak = 0; best = 0; correct = 0; attempts = 0;
    engine.reset();
    engine = new LearningEngine(unifiedConfig, 'practice', { onError: (msg) => addToast(msg) });
    challengeType = null; curItem = null;
    refreshMastery();
    msgText = 'Press Start to begin'; msgErr = false;
  }

  refreshMastery();

  onDestroy(() => {
    audio.removeEventListener('detect', handleDetect);
    audio.removeEventListener('silence', handleSilence);
    engine.save();
    audio.stop();
  });
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
    <div class="idle-panel">
      <div class="mastery-ring">
        <ProgressRing percent={mastery ? Math.round(mastery.overall.avgPL * 100) : 0} color="#58A6FF" size={120} />
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
    <div class="sfn-bar">
      <button class="sfn-group" class:sfn-active={sessionExpanded} onclick={() => { sessionExpanded = !sessionExpanded; engineExpanded = false; coverageExpanded = false; }}>
        <span class="sfn-group-label">SESSION</span>
        <span class="sfn-metric"><span class="sfn-val">{score}</span><span class="sfn-key">Score</span></span>
        <span class="sfn-sep">&middot;</span>
        <span class="sfn-metric"><span class="sfn-val">{streak}</span><span class="sfn-key">Streak</span>{#if best > 0}<span class="sfn-sub">({best})</span>{/if}</span>
        <span class="sfn-sep">&middot;</span>
        <span class="sfn-metric"><span class="sfn-val">{accuracy}</span><span class="sfn-key">Acc</span></span>
      </button>

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

      <button class="sfn-group sfn-coverage-btn" class:sfn-active={coverageExpanded} onclick={() => { coverageExpanded = !coverageExpanded; sessionExpanded = false; engineExpanded = false; }} title="Fretboard Coverage">
        <span class="sfn-grid-icon">&#9638;</span>
      </button>
    </div>

    {#if sessionExpanded}
      <div class="sfn-panel">
        <div class="sfn-panel-row">
          <div class="sfn-panel-metric"><span class="sfn-panel-label">Questions</span><span class="sfn-panel-value">{engine.questionNumber}</span></div>
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
            <span class="sfn-panel-value sfn-sparkline"><ThetaSparkline history={engine.thetaHistory} /><span class="sfn-theta-val">{engine.theta.toFixed(3)}</span></span>
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
          <div class="sfn-coverage-grid"><CoverageHeatmap coverage={sessionMastery.coverage} /></div>
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
      {#if challengeType === 'nf'}
        <NoteFind bind:this={challengeRef} onComplete={onChallengeComplete} onWrong={onChallengeWrong} {setMsg} {showDetected} />
      {:else if challengeType === 'iv'}
        <IntervalTrainer bind:this={challengeRef} onComplete={onChallengeComplete} onWrong={onChallengeWrong} {setMsg} {showDetected} />
      {:else if challengeType === 'cp'}
        <ChordPlayer bind:this={challengeRef} onComplete={onChallengeComplete} onWrong={onChallengeWrong} onInvalid={onChallengeInvalid} {setMsg} {showDetected} />
      {:else if challengeType === 'sr'}
        <ScaleRunner bind:this={challengeRef} onComplete={onChallengeComplete} onWrong={onChallengeWrong} onInvalid={onChallengeInvalid} {setMsg} {showDetected} />
      {:else if challengeType === 'mt'}
        <ModeTrainer bind:this={challengeRef} onComplete={onChallengeComplete} onWrong={onChallengeWrong} onInvalid={onChallengeInvalid} {setMsg} {showDetected} />
      {:else if challengeType === 'cx'}
        <ChordTransition bind:this={challengeRef} onComplete={onChallengeComplete} onWrong={onChallengeWrong} onInvalid={onChallengeInvalid} {setMsg} {showDetected} />
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
