<script>
  import { NOTES, CHORD_TYPES } from '$lib/constants/music.js';

  let { item = null, audio = null, onComplete, onWrong, onInvalid, setMsg, showDetected } = $props();

  let targetChord = $state(null);
  let detectedChordName = $state('\u2014');
  let detectedScore = $state(0);
  let matchClass = $state('');
  let fbSuccess = $state(false);
  let fbFlash = $state(false);

  let holdStart = 0;
  const HOLD_MS = 150;

  export function prepare(inner, isRecall) {
    item = inner;
    const ct = CHORD_TYPES.find(c => c.id === inner.typeId);
    const rootName = NOTES[inner.rootIdx];
    targetChord = {
      rootIdx: inner.rootIdx,
      rootName,
      typeId: inner.typeId,
      typeName: ct?.name ?? inner.typeId,
      chordName: rootName + (ct?.sym ?? ''),
    };
    detectedChordName = '\u2014';
    detectedScore = 0;
    matchClass = '';
    fbSuccess = false;
    fbFlash = false;
    holdStart = 0;
    setMsg('Strum ' + targetChord.chordName, false);
  }

  export function handleChord(chordName, rootName, typeId, score) {
    if (!targetChord) return;
    detectedChordName = chordName;
    detectedScore = score;

    const ok = rootName === targetChord.rootName && typeId === targetChord.typeId;
    matchClass = ok ? 'cr-match' : 'cr-mismatch';

    if (ok) {
      if (!holdStart) holdStart = performance.now();
      if (performance.now() - holdStart >= HOLD_MS) {
        fbSuccess = true;
        fbFlash = true;
        const extraMeta = { detectedChord: chordName, chordScore: score };
        onComplete(20, 2, extraMeta);
        setTimeout(() => { fbSuccess = false; fbFlash = false; }, 1200);
      }
    } else {
      holdStart = 0;
    }
  }

  export function handleSilence() {
    detectedChordName = '\u2014';
    detectedScore = 0;
    matchClass = '';
    holdStart = 0;
  }

  export function handleDetection() {}
</script>

<div class="cr-section">
  <div class="cr-label">Strum the chord</div>
  <div class="cr-target">{targetChord?.chordName ?? '\u2014'}</div>
  <div class="cr-type-name">{targetChord?.typeName ?? ''}</div>
</div>

<div class="cr-detected-wrap" class:cr-success={fbSuccess} class:cr-flash={fbFlash}>
  <div class="cr-detected-label">Detected</div>
  <div class="cr-detected-chord {matchClass}">{detectedChordName}</div>
  {#if detectedScore > 0}
    <div class="cr-score-bar">
      <div class="cr-score-fill" style="width:{Math.round(detectedScore * 100)}%"></div>
    </div>
    <div class="cr-score-pct">{Math.round(detectedScore * 100)}% match</div>
  {/if}
</div>

<style>
  .cr-section{text-align:center}
  .cr-label{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .cr-target{font-family:'JetBrains Mono',monospace;font-size:56px;font-weight:700;color:var(--ac);line-height:1}
  .cr-type-name{font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--mt);margin-top:.3rem}
  .cr-detected-wrap{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:1rem;width:100%;max-width:400px;text-align:center;transition:border-color .3s,box-shadow .3s}
  .cr-detected-wrap.cr-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  .cr-detected-label{font-size:11px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.3rem}
  .cr-detected-chord{font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:700;color:var(--mt);line-height:1;transition:color .15s}
  .cr-detected-chord.cr-match{color:#4ECB71}
  .cr-detected-chord.cr-mismatch{color:#FF6B6B}
  .cr-score-bar{width:100%;height:6px;background:var(--sf2);border-radius:3px;margin-top:.5rem;overflow:hidden}
  .cr-score-fill{height:100%;background:var(--ac);border-radius:3px;transition:width .2s}
  .cr-score-pct{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mt);margin-top:.2rem}
  @keyframes cr-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .cr-flash{animation:cr-glow .8s ease-out}
  @media(max-width:600px){
    .cr-target{font-size:40px}
    .cr-detected-chord{font-size:28px}
  }
</style>
