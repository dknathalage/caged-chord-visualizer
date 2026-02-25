<script>
  import { NT_STR_NAMES } from '$lib/music/fretboard.js';
  let { target, fbHtml, fbSuccess, fbFlash, recall } = $props();
</script>

<div class="nt-challenge">
  <div class="nt-challenge-lbl">{recall ? 'Play this note' : 'Find this note'}</div>
  <div class="nt-challenge-note" class:nt-recall={recall && target}>{target ? target.note : '\u2014'}</div>
  {#if target}
    <div class="nt-challenge-pos">
      {#if recall}
        on string {NT_STR_NAMES[target.str]}
      {:else}
        String {NT_STR_NAMES[target.str]} &middot; Fret {target.fret}
      {/if}
    </div>
  {/if}
</div>

<div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
  <div>{@html fbHtml}</div>
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
