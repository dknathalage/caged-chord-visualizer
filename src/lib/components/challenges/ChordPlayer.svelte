<script>
  import { NT_STR_NAMES } from '$lib/music/fretboard.js';
  let { challenge, voiceIdx, voiceDone, fbSuccess, fbFlash } = $props();
</script>

<div class="nt-chord-section">
  <div class="nt-challenge-lbl">Play the chord</div>
  <div class="nt-chord-name">{challenge ? challenge.chordName : '\u2014'}</div>
  <div class="nt-shape-lbl">{challenge ? challenge.shapeName : ''}</div>
</div>

<div class="nt-trav-dots">
  {#each voiceDone as done, i}
    <div class="nt-trav-dot{done ? ' done' : (i === voiceIdx && challenge ? ' active' : '')}">
      <span class="nt-trav-dot-lbl">{challenge ? NT_STR_NAMES[challenge.sortedVoices[i].str] : ''}</span>
    </div>
  {/each}
</div>

{#if challenge}
  <div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
    <div>{@html challenge.diagramHtml}</div>
  </div>
{/if}

<style>
  .nt-challenge-lbl{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .nt-chord-section{text-align:center}
  .nt-chord-name{font-family:'JetBrains Mono',monospace;font-size:42px;font-weight:700;color:var(--ac);line-height:1}
  .nt-shape-lbl{font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--mt);margin-top:.3rem}
  .nt-trav-dots{display:flex;gap:.6rem;justify-content:center;margin-top:.5rem}
  .nt-trav-dot{width:40px;height:40px;border-radius:50%;border:2px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;transition:all .3s}
  .nt-trav-dot.active{border-color:var(--ac);background:rgba(88,166,255,.15);box-shadow:0 0 10px rgba(88,166,255,.3)}
  .nt-trav-dot.done{border-color:#4ECB71;background:rgba(78,203,113,.15)}
  .nt-trav-dot-lbl{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--mt)}
  .nt-trav-dot.active .nt-trav-dot-lbl{color:var(--ac)}
  .nt-trav-dot.done .nt-trav-dot-lbl{color:#4ECB71}
  .nt-fb-wrap{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;width:100%;max-width:700px;transition:border-color .3s,box-shadow .3s}
  .nt-fb-wrap.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .nt-chord-name{font-size:32px}
    .nt-trav-dot{width:34px;height:34px}
    .nt-trav-dot-lbl{font-size:11px}
  }
</style>
