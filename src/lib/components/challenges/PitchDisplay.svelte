<script>
  let { detectedNote, detectedClass, centsLbl, centsLeft, hzText,
        rmsDb = null, articulation = null } = $props();

  const dbWidth = $derived(rmsDb !== null ? Math.max(0, Math.min(100, ((rmsDb + 60) / 60) * 100)) : 0);
  const dbColor = $derived(
    rmsDb === null ? '#888'
    : rmsDb > -6 ? '#FF6B6B'
    : rmsDb > -30 ? '#4ECB71'
    : '#F0C040'
  );
  const artLabel = $derived(
    articulation === null ? null
    : articulation.vibrato ? 'Vibrato'
    : articulation.bend ? 'Bend'
    : articulation.stable ? 'Stable'
    : null
  );
  const artColor = $derived(
    artLabel === 'Stable' ? '#4ECB71'
    : artLabel === 'Vibrato' ? '#A78BFA'
    : artLabel === 'Bend' ? '#F0C040'
    : '#888'
  );
</script>

<div class="nt-detect">
  <div class="nt-detect-note {detectedClass}">{detectedNote}</div>
  <div class="nt-cents-wrap">
    <span class="nt-cents-lbl">{centsLbl}</span>
    <div class="nt-cents-bar"><div class="nt-cents-ind" style="left:{centsLeft}"></div></div>
  </div>
  <div class="nt-hz">{hzText}</div>
  {#if rmsDb !== null}
    <div class="nt-dyn-wrap">
      <span class="nt-dyn-lbl">dB</span>
      <div class="nt-dyn-bar"><div class="nt-dyn-fill" style="width:{dbWidth}%;background:{dbColor}"></div></div>
    </div>
  {/if}
  {#if artLabel}
    <span class="nt-art-badge" style="color:{artColor};border-color:{artColor}">{artLabel}</span>
  {/if}
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
  .nt-dyn-wrap{display:flex;align-items:center;justify-content:center;gap:.4rem;margin-top:.25rem}
  .nt-dyn-lbl{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mt);min-width:20px}
  .nt-dyn-bar{width:120px;height:4px;background:var(--sf2);border-radius:2px;overflow:hidden}
  .nt-dyn-fill{height:100%;border-radius:2px;transition:width .1s,background .15s}
  .nt-art-badge{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:9px;border:1px solid;border-radius:3px;padding:0 4px;margin-top:.2rem;line-height:1.4}
  @media(max-width:600px){
    .nt-detect-note{font-size:28px}
  }
</style>
