<script>
  import { NOTES } from '$lib/constants/music.js';
  import { strumPatternConfig } from '$lib/learning/configs/strumPattern.js';

  let { item = null, audio = null, onComplete, onWrong, setMsg, showDetected } = $props();

  let challenge = $state(null);
  let patternSteps = $state([]);
  let stepResults = $state([]);
  let currentStep = $state(0);
  let started = $state(false);
  let countIn = $state(0);
  let fbSuccess = $state(false);
  let fbFlash = $state(false);
  let startTime = 0;

  export function prepare(inner, isRecall) {
    item = inner;
    const patternObj = strumPatternConfig.getPattern(inner.patternId);
    if (!patternObj) return;

    const beatMs = 60000 / inner.bpm;
    const steps = patternObj.pattern;
    const stepMs = beatMs / 2;
    patternSteps = steps.map((dir, i) => ({
      direction: dir,
      timeMs: Math.round(i * stepMs),
    }));

    const chordName = NOTES[inner.rootIdx];
    challenge = { patternObj, chordName, bpm: inner.bpm, stepMs };
    stepResults = steps.map(() => ({ status: 'pending' }));
    currentStep = 0;
    started = false;
    countIn = 4;
    fbSuccess = false;
    fbFlash = false;
    startTime = 0;
    setMsg(`${patternObj.name} on ${chordName} — ${inner.bpm} BPM`, false);

    doCountIn();
  }

  function doCountIn() {
    if (countIn <= 0) {
      started = true;
      startTime = performance.now();
      setMsg('Play!', false);
      return;
    }
    setMsg(`Count: ${5 - countIn}...`, false);
    countIn--;
    const beatMs = challenge?.stepMs ? challenge.stepMs * 2 : 750;
    setTimeout(doCountIn, beatMs);
  }

  export function handleOnset(strength, timeMs) {
    if (!started || !challenge || currentStep >= patternSteps.length) return;

    while (currentStep < patternSteps.length && patternSteps[currentStep].direction === '_') {
      stepResults[currentStep] = { status: 'rest-ok' };
      currentStep++;
    }
    if (currentStep >= patternSteps.length) return;

    const elapsed = performance.now() - startTime;
    const expected = patternSteps[currentStep].timeMs;
    const error = Math.round(elapsed - expected);
    const absError = Math.abs(error);

    let status = 'on-time';
    if (absError > 100) status = 'off';
    else if (absError > 60) status = 'close';

    stepResults[currentStep] = { status, error, direction: patternSteps[currentStep].direction };
    stepResults = [...stepResults];
    currentStep++;

    while (currentStep < patternSteps.length && patternSteps[currentStep].direction === '_') {
      stepResults[currentStep] = { status: 'rest-ok' };
      currentStep++;
    }

    if (currentStep >= patternSteps.length) {
      const playableSteps = stepResults.filter(r => r.status !== 'rest-ok' && r.status !== 'pending');
      const goodSteps = playableSteps.filter(r => r.status === 'on-time' || r.status === 'close');
      const timingScore = playableSteps.length > 0 ? goodSteps.length / playableSteps.length : 0;
      const errors = playableSteps.map(r => Math.abs(r.error || 0));
      const avgError = errors.length > 0 ? Math.round(errors.reduce((a, b) => a + b, 0) / errors.length) : 0;

      if (timingScore >= 0.5) {
        fbSuccess = true;
        fbFlash = true;
        onComplete(30, 2, { timingScore: Math.round(timingScore * 100) / 100, patternScore: Math.round(timingScore * 100) / 100, avgErrorMs: avgError });
        setTimeout(() => { fbSuccess = false; fbFlash = false; }, 1200);
      } else {
        onWrong();
      }
    }
  }

  export function handleSilence() {}
  export function handleDetection() {}
</script>

<div class="sp-section">
  <div class="sp-label">{challenge?.patternObj?.name ?? 'Strum Pattern'}</div>
  <div class="sp-chord">{challenge?.chordName ?? '\u2014'}</div>
  <div class="sp-bpm">{challenge?.bpm ?? '\u2014'} BPM</div>
</div>

<div class="sp-pattern" class:sp-success={fbSuccess} class:sp-flash={fbFlash}>
  {#each patternSteps as step, i}
    <div class="sp-step sp-{stepResults[i]?.status ?? 'pending'}" class:sp-current={i === currentStep && started}>
      <div class="sp-arrow">{step.direction === 'D' ? '\u2193' : step.direction === 'U' ? '\u2191' : '\u00B7'}</div>
      <div class="sp-dir-lbl">{step.direction}</div>
      {#if stepResults[i]?.error != null}
        <div class="sp-err-lbl">{stepResults[i].error > 0 ? '+' : ''}{stepResults[i].error}ms</div>
      {/if}
    </div>
  {/each}
</div>

{#if !started && countIn >= 0}
  <div class="sp-count">{countIn > 0 ? countIn : 'GO!'}</div>
{/if}

<style>
  .sp-section{text-align:center}
  .sp-label{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .sp-chord{font-family:'JetBrains Mono',monospace;font-size:42px;font-weight:700;color:var(--ac);line-height:1}
  .sp-bpm{font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--mt);margin-top:.2rem}
  .sp-pattern{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:1rem;width:100%;max-width:600px;transition:border-color .3s,box-shadow .3s}
  .sp-pattern.sp-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  .sp-step{display:flex;flex-direction:column;align-items:center;gap:2px;padding:.3rem .5rem;border-radius:8px;border:2px solid var(--bd);background:var(--sf);min-width:40px;transition:all .2s}
  .sp-step.sp-current{border-color:var(--ac);background:rgba(88,166,255,.1)}
  .sp-step.sp-on-time{border-color:#4ECB71;background:rgba(78,203,113,.1)}
  .sp-step.sp-close{border-color:#F0A030;background:rgba(240,160,48,.1)}
  .sp-step.sp-off{border-color:#FF6B6B;background:rgba(255,107,107,.1)}
  .sp-step.sp-rest-ok{border-color:var(--bd);opacity:.5}
  .sp-arrow{font-size:24px;line-height:1}
  .sp-dir-lbl{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:var(--mt)}
  .sp-err-lbl{font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--mt)}
  .sp-count{font-family:'JetBrains Mono',monospace;font-size:72px;font-weight:900;color:var(--ac);text-align:center;margin-top:1rem}
  @keyframes sp-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .sp-flash{animation:sp-glow .8s ease-out}
  @media(max-width:600px){
    .sp-chord{font-size:32px}
    .sp-arrow{font-size:20px}
    .sp-count{font-size:56px}
    .sp-step{min-width:34px;padding:.2rem .4rem}
  }
</style>
