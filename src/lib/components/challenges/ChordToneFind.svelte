<script>
  let { chordName, toneLabel, targetDisplay, targetHidden, fbHtml, fbSuccess, fbFlash } = $props();
</script>

<div class="nt-chord-section">
  <div class="nt-challenge-lbl">Find the chord tone</div>
  <div class="nt-chord-name">{chordName}</div>
  <div class="nt-chord-tone" class:nt-intv-hidden={targetHidden}>
    {toneLabel} &rarr; {targetDisplay}
  </div>
</div>

<div class="nt-fb-wrap" class:nt-success={fbSuccess} class:nt-flash={fbFlash}>
  <div>{@html fbHtml}</div>
</div>

<style>
  .nt-challenge-lbl{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .nt-chord-section{text-align:center}
  .nt-chord-name{font-family:'JetBrains Mono',monospace;font-size:42px;font-weight:700;color:var(--ac);line-height:1}
  .nt-chord-tone{font-family:'JetBrains Mono',monospace;font-size:20px;color:var(--mt);margin-top:.3rem}
  .nt-chord-tone.nt-intv-hidden{color:var(--mt);opacity:.4}
  .nt-fb-wrap{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;width:100%;max-width:700px;transition:border-color .3s,box-shadow .3s}
  .nt-fb-wrap.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .nt-chord-name{font-size:32px}
    .nt-chord-tone{font-size:16px}
  }
</style>
