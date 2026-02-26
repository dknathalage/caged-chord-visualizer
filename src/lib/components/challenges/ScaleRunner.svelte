<script>
  import { NOTES, SCALES } from '$lib/constants/music.js';
  import { STRING_NAMES, scaleSequence, FRETBOARD_LAYOUT } from '$lib/music/fretboard.js';
  import Fretboard from '$lib/components/svg/Fretboard.svelte';
  import { createHoldDetector } from './holdDetection.js';

  let { item = null, recall = false, onComplete, onWrong, onInvalid, setMsg, showDetected } = $props();

  let challenge = $state(null);
  let noteIdx = $state(0);
  let fbVisible = $state(false);
  let fbSuccess = $state(false);
  let fbFlash = $state(false);
  let boardStartFret = $state(0);

  const hold = createHoldDetector();
  let centsBuffer = [];

  function computeSeqStartFret(startFret) {
    const center = startFret + 2;
    let sf = Math.max(0, center - Math.floor(FRETBOARD_LAYOUT.VISIBLE_FRETS / 2));
    if (sf + FRETBOARD_LAYOUT.VISIBLE_FRETS > 22) sf = Math.max(0, 22 - FRETBOARD_LAYOUT.VISIBLE_FRETS);
    return sf;
  }

  function uniqueNotes(seq) {
    return [...new Map(seq.map(n => [`${n.str}-${n.fret}`, n])).values()];
  }

  function dotState(n, seq, currentIdx) {
    const seqIdx = seq.findIndex(sn => sn.str === n.str && sn.fret === n.fret);
    const lastIdx = seq.findLastIndex(sn => sn.str === n.str && sn.fret === n.fret);
    if (seqIdx <= currentIdx && lastIdx <= currentIdx) return { col: '#4ECB71', opacity: 0.4 };
    if (seqIdx === currentIdx || lastIdx === currentIdx) return { col: '#4ECB71', opacity: 1.0 };
    return { col: '#58A6FF', opacity: 0.7 };
  }

  export function prepare(inner, isRecall) {
    recall = isRecall;
    hold.reset();
    centsBuffer = [];
    const ri = inner.rootIdx;
    const root = NOTES[ri];
    const scale = SCALES.find(sc => sc.id === inner.scaleId);
    const startFret = inner.startFret;
    let seq = scaleSequence(ri, scale.iv, startFret, startFret + 4);
    if (seq.length < 5) { onInvalid(); return; }
    if (inner.dir === 'updown') {
      const desc = [...seq].reverse().slice(1);
      seq = [...seq, ...desc];
    }
    challenge = { root, scale, seq, startFret };
    noteIdx = 0;
    fbVisible = !isRecall;
    fbSuccess = false;
    fbFlash = false;
    boardStartFret = computeSeqStartFret(startFret);
    const t = seq[0];
    setMsg(`Play ${root} ${scale.name}: start with ${t.note} (${STRING_NAMES[t.str]} fret ${t.fret})`, false);
  }

  export function handleDetection(note, cents, hz, semi) {
    if (!challenge) return;
    const target = challenge.seq[noteIdx];
    const nm = note === target.note;
    const midiOk = Math.abs(semi + 69 - target.midi) <= 1;
    const ok = nm && midiOk;
    showDetected(note, cents, hz, ok);
    if (ok) centsBuffer.push(cents);
    else centsBuffer = [];
    hold.check(ok, true, () => {
      noteIdx++;
      hold.resetAfterVoice();
      if (noteIdx >= challenge.seq.length) {
        const extraMeta = {};
        if (centsBuffer.length > 0) {
          const avg = centsBuffer.reduce((a, b) => a + b, 0) / centsBuffer.length;
          const variance = centsBuffer.reduce((s, v) => s + (v - avg) ** 2, 0) / centsBuffer.length;
          extraMeta.avgCents = Math.round(avg * 10) / 10;
          extraMeta.stdCents = Math.round(Math.sqrt(variance) * 10) / 10;
        }
        centsBuffer = [];
        fbSuccess = true;
        fbFlash = true;
        onComplete(40, 3, extraMeta);
        setTimeout(() => { fbSuccess = false; fbFlash = false; }, 1200);
      } else {
        const t = challenge.seq[noteIdx];
        setMsg(`Next: ${t.note} (${STRING_NAMES[t.str]} fret ${t.fret})`, false);
      }
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

<div class="nt-scale-section">
  <div class="nt-challenge-lbl">{challenge ? `${challenge.root} ${challenge.scale.name}` : 'Scale'}</div>
  <div class="nt-challenge-note">{challenge ? challenge.seq[noteIdx]?.note ?? '\u2714' : '\u2014'}</div>
  {#if challenge}
    <div class="nt-seq-dots">
      {#each challenge.seq as n, i}
        <div class="nt-seq-dot{i < noteIdx ? ' done' : (i === noteIdx ? ' active' : '')}"></div>
      {/each}
    </div>
  {/if}
</div>

{#if fbVisible && challenge}
  <div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
    <Fretboard startFret={boardStartFret}>
      {#snippet children({ fretLeft, topMargin, stringHeight, fretWidth, dotRadius, visibleFrets, startFret })}
        {#each uniqueNotes(challenge.seq) as n}
          {@const tfr = n.fret - startFret}
          {#if tfr >= 0 && tfr <= visibleFrets}
            {@const cx = dotCx(n.fret, fretLeft, fretWidth, dotRadius, startFret)}
            {@const cy = dotCy(n.str, topMargin, stringHeight)}
            {@const ds = dotState(n, challenge.seq, noteIdx)}
            {@const fs = n.note.length > 1 ? dotRadius * 0.8 : dotRadius}
            <circle {cx} {cy} r={dotRadius * 1.3} fill={ds.col} opacity={ds.opacity * 0.15}/>
            <circle {cx} {cy} r={dotRadius} fill={ds.col} opacity={ds.opacity}/>
            <text x={cx} y={cy} text-anchor="middle" dominant-baseline="central" fill="#fff" font-size={fs} font-weight="bold" font-family="JetBrains Mono">{n.note}</text>
          {/if}
        {/each}
      {/snippet}
    </Fretboard>
  </div>
{/if}

<style>
  .nt-challenge-lbl{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .nt-challenge-note{font-family:'JetBrains Mono',monospace;font-size:56px;font-weight:700;color:var(--ac);line-height:1}
  .nt-scale-section{text-align:center}
  .nt-seq-dots{display:flex;gap:4px;justify-content:center;margin-top:.5rem;flex-wrap:wrap}
  .nt-seq-dot{width:10px;height:10px;border-radius:50%;border:2px solid var(--bd);background:var(--sf);transition:all .3s}
  .nt-seq-dot.active{border-color:var(--ac);background:rgba(88,166,255,.3);box-shadow:0 0 6px rgba(88,166,255,.4)}
  .nt-seq-dot.done{border-color:#4ECB71;background:#4ECB71}
  .nt-fb-wrap{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;width:100%;max-width:700px;transition:border-color .3s,box-shadow .3s}
  .nt-fb-wrap.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .nt-challenge-note{font-size:40px}
  }
</style>
