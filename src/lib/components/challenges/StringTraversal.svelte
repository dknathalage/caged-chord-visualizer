<script>
  import { NT_STR_NAMES } from '$lib/music/fretboard.js';
  let { travNote, travIdx, travDone, fbVisible, fbHtml, fbSuccess, fbFlash, allPosData } = $props();
</script>

<div class="nt-trav-section">
  <div class="nt-challenge-lbl">Play on every string</div>
  <div class="nt-challenge-note">{travNote ? travNote : '\u2014'}</div>
  <div class="nt-trav-dots">
    {#each NT_STR_NAMES as name, s}
      <div class="nt-trav-dot{travDone[s] ? ' done' : (s === travIdx && travNote ? ' active' : '')}">
        <span class="nt-trav-dot-lbl">{name}</span>
      </div>
    {/each}
  </div>
</div>

{#if fbVisible}
  <div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
    {#if allPosData && allPosData.length > 0}
      <div class="nt-allpos">
        <div class="nt-allpos-title">{travNote} on every string:</div>
        <div class="nt-allpos-items">
          {#each allPosData as pos}
            <span class="nt-allpos-item" class:nt-allpos-done={pos.done} class:nt-allpos-missed={!pos.done}>{pos.label}</span>
          {/each}
        </div>
      </div>
    {:else}
      <div>{@html fbHtml}</div>
    {/if}
  </div>
{/if}

<style>
  .nt-challenge-lbl{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .nt-challenge-note{font-family:'JetBrains Mono',monospace;font-size:56px;font-weight:700;color:var(--ac);line-height:1}
  .nt-trav-section{text-align:center}
  .nt-trav-dots{display:flex;gap:.6rem;justify-content:center;margin-top:.5rem}
  .nt-trav-dot{width:40px;height:40px;border-radius:50%;border:2px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;transition:all .3s}
  .nt-trav-dot.active{border-color:var(--ac);background:rgba(88,166,255,.15);box-shadow:0 0 10px rgba(88,166,255,.3)}
  .nt-trav-dot.done{border-color:#4ECB71;background:rgba(78,203,113,.15)}
  .nt-trav-dot-lbl{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--mt)}
  .nt-trav-dot.active .nt-trav-dot-lbl{color:var(--ac)}
  .nt-trav-dot.done .nt-trav-dot-lbl{color:#4ECB71}
  .nt-fb-wrap{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;width:100%;max-width:700px;transition:border-color .3s,box-shadow .3s}
  .nt-fb-wrap.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  .nt-allpos{text-align:center;padding:1rem;font-family:'JetBrains Mono',monospace;color:var(--mt);font-size:14px}
  .nt-allpos-title{margin-bottom:.5rem;color:var(--ac)}
  .nt-allpos-items{display:flex;flex-wrap:wrap;justify-content:center;gap:.2rem .4rem}
  .nt-allpos-item{display:inline-block;padding:.2rem .5rem;background:var(--sf2);border-radius:6px}
  .nt-allpos-done{color:#4ECB71}
  .nt-allpos-missed{color:#FF6B6B}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .nt-challenge-note{font-size:40px}
    .nt-trav-dot{width:34px;height:34px}
    .nt-trav-dot-lbl{font-size:11px}
  }
</style>
