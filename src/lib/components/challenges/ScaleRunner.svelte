<script>
  import { NT_STR_NAMES } from '$lib/music/fretboard.js';
  let { challenge, noteIdx, fbHtml, fbVisible, fbSuccess, fbFlash } = $props();
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

{#if fbVisible}
  <div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
    <div>{@html fbHtml}</div>
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
