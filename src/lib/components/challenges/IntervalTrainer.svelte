<script>
  let { ref, interval, targetDisplay, targetHidden, fbHtml, fbSuccess, fbFlash } = $props();
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
  <div>{@html fbHtml}</div>
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
