<script>
  import { computeStartFret, getFretboardDimensions } from '$lib/music/fretboard.js';
  import Fretboard from '$lib/components/svg/Fretboard.svelte';
  import NoteDot from '$lib/components/svg/NoteDot.svelte';
  import { createHoldDetector } from './holdDetection.js';

  let { item = null, recall = false, onComplete, onWrong, setMsg, showDetected } = $props();

  let ref = $state(null);
  let interval = $state(null);
  let target = $state(null);
  let targetDisplay = $state('\u2014');
  let targetHidden = $state(false);
  let showRecallPlaceholder = $state(false);
  let dotColor = $state('#58A6FF');
  let boardStartFret = $state(0);
  let fbSuccess = $state(false);
  let fbFlash = $state(false);

  const hold = createHoldDetector();
  let centsBuffer = [];

  export function prepare(inner, isRecall) {
    item = inner;
    recall = isRecall;
    hold.reset();
    centsBuffer = [];
    ref = inner.ref;
    interval = inner.interval;
    target = inner.targetNote;
    boardStartFret = computeStartFret(inner.ref.fret);
    if (isRecall) {
      targetDisplay = '?';
      targetHidden = true;
      showRecallPlaceholder = true;
    } else {
      targetDisplay = inner.targetNote;
      targetHidden = false;
      showRecallPlaceholder = false;
    }
    dotColor = '#58A6FF';
    fbSuccess = false;
    fbFlash = false;
    setMsg('Listening...', false);
  }

  export function handleDetection(note, cents, hz, semi) {
    if (!target) return;
    const ok = note === target;
    showDetected(note, cents, hz, ok);
    if (ok) centsBuffer.push(cents);
    else centsBuffer = [];
    hold.check(ok, true, () => {
      const extraMeta = {};
      if (centsBuffer.length > 0) {
        const avg = centsBuffer.reduce((a, b) => a + b, 0) / centsBuffer.length;
        const variance = centsBuffer.reduce((s, v) => s + (v - avg) ** 2, 0) / centsBuffer.length;
        extraMeta.avgCents = Math.round(avg * 10) / 10;
        extraMeta.stdCents = Math.round(Math.sqrt(variance) * 10) / 10;
      }
      centsBuffer = [];
      targetDisplay = target;
      targetHidden = false;
      showRecallPlaceholder = false;
      dotColor = '#4ECB71';
      fbSuccess = true;
      fbFlash = true;
      onComplete(10, 2, extraMeta);
      setTimeout(() => { fbSuccess = false; fbFlash = false; }, recall ? 1200 : 800);
    }, onWrong);
  }

  export function handleSilence() {
    showDetected(null, 0, 0, false);
    hold.reset();
    centsBuffer = [];
  }

  function dotCx(fret, fretLeft, fretWidth, dotRadius, startFret) {
    return fret === 0 ? fretLeft + dotRadius * 0.2 : fretLeft + (fret - startFret - 1) * fretWidth + fretWidth / 2;
  }

  function dotCy(str, topMargin, stringHeight) {
    return topMargin + (5 - str) * stringHeight + stringHeight / 2;
  }
</script>

<div class="nt-intv-section">
  <div class="nt-challenge-lbl">Play the interval</div>
  <div class="nt-intv-row">
    <div class="nt-intv-note">{ref ? ref.note : '\u2014'}</div>
    <div class="nt-intv-arrow">&rarr;</div>
    <div class="nt-intv-label">{interval ? interval.name : ''}</div>
    <div class="nt-intv-arrow">&rarr;</div>
    <div class="nt-intv-note" class:nt-intv-hidden={targetHidden}>{targetDisplay}</div>
  </div>
</div>

<div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
  {#if showRecallPlaceholder}
    {@const d = getFretboardDimensions()}
    <svg viewBox="0 0 {d.W} {d.H}" xmlns="http://www.w3.org/2000/svg">
      <text x={d.W/2} y={d.H/2} text-anchor="middle" dominant-baseline="central" fill="#222" font-size="60" font-family="Outfit" font-weight="900">?</text>
    </svg>
  {:else if ref}
    <Fretboard startFret={boardStartFret}>
      {#snippet children({ fretLeft, topMargin, stringHeight, fretWidth, dotRadius, startFret })}
        {@const tfr = ref.fret - startFret}
        {#if tfr >= 0 && tfr <= 7}
          {@const cx = dotCx(ref.fret, fretLeft, fretWidth, dotRadius, startFret)}
          {@const cy = dotCy(ref.str, topMargin, stringHeight)}
          <circle {cx} {cy} r={dotRadius * 1.3} fill={dotColor} opacity=".15"/>
          <NoteDot {cx} {cy} r={dotRadius} fill={dotColor} label={ref.note} />
        {/if}
      {/snippet}
    </Fretboard>
  {/if}
</div>

<style>
  .nt-challenge-lbl{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .nt-intv-section{text-align:center}
  .nt-intv-row{display:flex;align-items:center;justify-content:center;gap:.6rem;margin-top:.3rem;flex-wrap:wrap}
  .nt-intv-note{font-family:'JetBrains Mono',monospace;font-size:42px;font-weight:700;color:var(--ac);line-height:1}
  .nt-intv-note.nt-intv-hidden{color:var(--mt);opacity:.4}
  .nt-intv-arrow{font-size:24px;color:var(--mt)}
  .nt-intv-label{font-family:'JetBrains Mono',monospace;font-size:16px;color:var(--mt);background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:.3rem .6rem}
  .nt-fb-wrap{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;width:100%;max-width:700px;transition:border-color .3s,box-shadow .3s}
  .nt-fb-wrap.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .nt-intv-note{font-size:32px}
    .nt-intv-arrow{font-size:18px}
    .nt-intv-label{font-size:13px}
  }
</style>
