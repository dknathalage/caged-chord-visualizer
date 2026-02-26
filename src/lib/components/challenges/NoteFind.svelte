<script>
  import { STRING_NAMES, computeStartFret, getFretboardDimensions } from '$lib/music/fretboard.js';
  import Fretboard from '$lib/components/svg/Fretboard.svelte';
  import NoteDot from '$lib/components/svg/NoteDot.svelte';
  import { createHoldDetector } from './holdDetection.js';

  let { item = null, recall = false, onComplete, onWrong, setMsg, showDetected } = $props();

  let showRecallPlaceholder = $state(false);
  let dotColor = $state('#58A6FF');
  let fbSuccess = $state(false);
  let fbFlash = $state(false);
  let boardStartFret = $state(0);

  const hold = createHoldDetector();
  let centsBuffer = [];

  export function prepare(inner, isRecall) {
    item = inner;
    recall = isRecall;
    hold.reset();
    centsBuffer = [];
    boardStartFret = computeStartFret(inner.fret);
    if (isRecall) {
      showRecallPlaceholder = true;
    } else {
      showRecallPlaceholder = false;
    }
    dotColor = '#58A6FF';
    fbSuccess = false;
    fbFlash = false;
    setMsg('Listening...', false);
  }

  export function handleDetection(note, cents, hz, semi) {
    if (!item) return;
    const nm = note === item.note;
    const detectedMidi = semi + 69;
    const midiDiff = Math.abs(detectedMidi - item.midi);
    const octRem = midiDiff % 12;
    const octOk = midiDiff <= 1 || octRem <= 1 || octRem >= 11;
    const ok = nm && octOk;
    showDetected(note, cents, hz, ok);
    if (nm && !octOk) { setMsg('Right note, wrong string!', true); }
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

<div class="nt-challenge">
  <div class="nt-challenge-lbl">{recall ? 'Play this note' : 'Find this note'}</div>
  <div class="nt-challenge-note" class:nt-recall={recall && item}>{item ? item.note : '\u2014'}</div>
  {#if item}
    <div class="nt-challenge-pos">
      {#if recall}
        on string {STRING_NAMES[item.str]}
      {:else}
        String {STRING_NAMES[item.str]} &middot; Fret {item.fret}
      {/if}
    </div>
  {/if}
</div>

<div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
  {#if showRecallPlaceholder}
    {@const d = getFretboardDimensions()}
    <svg viewBox="0 0 {d.W} {d.H}" xmlns="http://www.w3.org/2000/svg">
      <text x={d.W/2} y={d.H/2} text-anchor="middle" dominant-baseline="central" fill="#222" font-size="60" font-family="Outfit" font-weight="900">?</text>
    </svg>
  {:else if item}
    <Fretboard startFret={boardStartFret}>
      {#snippet children({ fretLeft, topMargin, stringHeight, fretWidth, dotRadius, startFret })}
        {@const tfr = item.fret - startFret}
        {#if tfr >= 0 && tfr <= 7}
          {@const cx = dotCx(item.fret, fretLeft, fretWidth, dotRadius, startFret)}
          {@const cy = dotCy(item.str, topMargin, stringHeight)}
          <circle {cx} {cy} r={dotRadius * 1.3} fill={dotColor} opacity=".15"/>
          <NoteDot {cx} {cy} r={dotRadius} fill={dotColor} label={item.note} />
        {/if}
      {/snippet}
    </Fretboard>
  {/if}
</div>

<style>
  .nt-challenge{text-align:center}
  .nt-challenge-lbl{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .nt-challenge-note{font-family:'JetBrains Mono',monospace;font-size:56px;font-weight:700;color:var(--ac);line-height:1}
  .nt-challenge-pos{font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--mt);margin-top:.2rem}
  .nt-challenge-note.nt-recall{font-size:80px}
  .nt-fb-wrap{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;width:100%;max-width:700px;transition:border-color .3s,box-shadow .3s}
  .nt-fb-wrap.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .nt-challenge-note{font-size:40px}
    .nt-challenge-note.nt-recall{font-size:56px}
  }
</style>
