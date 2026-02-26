<script>
  import { rhythmTrainerConfig } from '$lib/learning/configs/rhythmTrainer.js';

  let { item = null, audio = null, onComplete, onWrong, setMsg, showDetected } = $props();

  let challenge = $state(null);
  let pattern = $state([]);
  let onsetResults = $state([]);
  let onsetIdx = $state(0);
  let started = $state(false);
  let countIn = $state(0);
  let fbSuccess = $state(false);
  let fbFlash = $state(false);
  let startTime = 0;

  export function prepare(inner, isRecall) {
    item = inner;
    const p = rhythmTrainerConfig.getPattern(inner);
    const beatMs = 60000 / inner.bpm;
    pattern = p.map(b => Math.round(b * beatMs));
    challenge = { bpm: inner.bpm, subdivision: inner.subdivision, beats: inner.beats, beatMs };
    onsetResults = pattern.map((t) => ({ expected: t, actual: null, error: null, status: 'pending' }));
    onsetIdx = 0;
    started = false;
    countIn = 4;
    fbSuccess = false;
    fbFlash = false;
    startTime = 0;
    setMsg(`${inner.bpm} BPM \u2014 ${inner.subdivision} notes. Listen for count-in...`, false);

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
    setTimeout(doCountIn, challenge.beatMs);
  }

  export function handleOnset(strength, timeMs) {
    if (!started || !challenge || onsetIdx >= pattern.length) return;

    const elapsed = performance.now() - startTime;
    const expected = pattern[onsetIdx];
    const error = Math.round(elapsed - expected);
    const absError = Math.abs(error);

    let status = 'on-time';
    if (absError > 100) status = error < 0 ? 'early' : 'late';
    else if (absError > 50) status = error < 0 ? 'slightly-early' : 'slightly-late';

    onsetResults[onsetIdx] = { expected, actual: Math.round(elapsed), error, status };
    onsetResults = [...onsetResults];
    onsetIdx++;

    if (onsetIdx >= pattern.length) {
      const errors = onsetResults.map(r => Math.abs(r.error));
      const avgError = Math.round(errors.reduce((a, b) => a + b, 0) / errors.length);
      const withinTolerance = errors.filter(e => e <= 75).length;
      const score = withinTolerance / pattern.length;

      if (score >= 0.5) {
        fbSuccess = true;
        fbFlash = true;
        onComplete(25, 2, { avgErrorMs: avgError, patternScore: Math.round(score * 100) / 100 });
        setTimeout(() => { fbSuccess = false; fbFlash = false; }, 1200);
      } else {
        onWrong();
      }
    }
  }

  export function handleSilence() {}
  export function handleDetection() {}
</script>

<div class="rt-section">
  <div class="rt-label">Rhythm: {challenge?.subdivision ?? ''} notes</div>
  <div class="rt-bpm">{challenge?.bpm ?? '\u2014'} BPM</div>
</div>

<div class="rt-timeline" class:rt-success={fbSuccess} class:rt-flash={fbFlash}>
  <div class="rt-track">
    {#each onsetResults as result, i}
      {@const pct = challenge ? (result.expected / (pattern[pattern.length - 1] || 1)) * 90 + 5 : 0}
      <div class="rt-marker rt-{result.status}" style="left:{pct}%">
        <div class="rt-dot"></div>
        {#if result.actual !== null}
          <div class="rt-error-lbl">{result.error > 0 ? '+' : ''}{result.error}ms</div>
        {/if}
      </div>
    {/each}
  </div>
</div>

{#if !started && countIn >= 0}
  <div class="rt-count">{countIn > 0 ? countIn : 'GO!'}</div>
{/if}

<style>
  .rt-section{text-align:center}
  .rt-label{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .rt-bpm{font-family:'JetBrains Mono',monospace;font-size:48px;font-weight:700;color:var(--ac);line-height:1}
  .rt-timeline{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:1.5rem 1rem;width:100%;max-width:600px;transition:border-color .3s,box-shadow .3s}
  .rt-timeline.rt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  .rt-track{position:relative;height:60px;background:var(--sf2);border-radius:6px}
  .rt-marker{position:absolute;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px}
  .rt-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--bd);background:var(--sf);transition:all .2s}
  .rt-marker.rt-on-time .rt-dot{border-color:#4ECB71;background:#4ECB71}
  .rt-marker.rt-slightly-early .rt-dot, .rt-marker.rt-slightly-late .rt-dot{border-color:#F0A030;background:#F0A030}
  .rt-marker.rt-early .rt-dot, .rt-marker.rt-late .rt-dot{border-color:#FF6B6B;background:#FF6B6B}
  .rt-error-lbl{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--mt);white-space:nowrap}
  .rt-count{font-family:'JetBrains Mono',monospace;font-size:72px;font-weight:900;color:var(--ac);text-align:center;margin-top:1rem}
  @keyframes rt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .rt-flash{animation:rt-glow .8s ease-out}
  @media(max-width:600px){
    .rt-bpm{font-size:36px}
    .rt-count{font-size:56px}
  }
</style>
