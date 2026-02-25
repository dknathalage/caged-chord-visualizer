<script>
  let { detectedNote, detectedClass, centsLbl, centsLeft, hzText } = $props();
</script>

<div class="nt-detect">
  <div class="nt-detect-note {detectedClass}">{detectedNote}</div>
  <div class="nt-cents-wrap">
    <span class="nt-cents-lbl">{centsLbl}</span>
    <div class="nt-cents-bar"><div class="nt-cents-ind" style="left:{centsLeft}"></div></div>
  </div>
  <div class="nt-hz">{hzText}</div>
</div>

<style>
  .nt-detect{text-align:center;margin-top:.3rem}
  .nt-detect-note{font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:700;color:var(--mt);line-height:1;transition:color .15s}
  :global(.nt-detect-note.nt-correct){color:#4ECB71}
  :global(.nt-detect-note.nt-wrong){color:#FF6B6B}
  .nt-cents-wrap{display:flex;align-items:center;justify-content:center;gap:.4rem;margin-top:.3rem}
  .nt-cents-bar{width:160px;height:6px;background:var(--sf2);border-radius:3px;position:relative;overflow:hidden}
  .nt-cents-ind{position:absolute;top:0;width:8px;height:6px;border-radius:3px;background:var(--ac);left:50%;transform:translateX(-50%);transition:left .1s}
  .nt-cents-lbl{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mt);min-width:50px}
  .nt-hz{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mt);text-align:center;margin-top:.1rem}
  @media(max-width:600px){
    .nt-detect-note{font-size:28px}
  }
</style>
