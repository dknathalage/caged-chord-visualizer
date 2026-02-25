<script>
  import { NT_STR_NAMES } from '$lib/music/fretboard.js';
  let { fromChallenge, toChallenge, phase, voiceIdx, voiceDone, fbSuccess, fbFlash, recall = false } = $props();
</script>

<div class="cx-section">
  <div class="cx-label">{recall ? 'Transition from memory' : 'Chord Transition'}</div>
  <div class="cx-names">
    <span class="cx-name" class:cx-active={phase === 'from'}>{fromChallenge?.chordName ?? '—'}</span>
    <span class="cx-arrow">→</span>
    <span class="cx-name" class:cx-active={phase === 'to'}>{toChallenge?.chordName ?? '—'}</span>
  </div>
  <div class="cx-shapes">
    <span class="cx-shape-lbl">{phase === 'from' ? fromChallenge?.shapeName : toChallenge?.shapeName}</span>
  </div>
</div>

<div class="nt-trav-dots">
  {#each voiceDone as done, i}
    {@const activeChallenge = phase === 'from' ? fromChallenge : toChallenge}
    <div class="nt-trav-dot{done ? ' done' : (i === voiceIdx && activeChallenge ? ' active' : '')}">
      <span class="nt-trav-dot-lbl">{activeChallenge ? NT_STR_NAMES[activeChallenge.sortedVoices[i]?.str] : ''}</span>
    </div>
  {/each}
</div>

<div class="cx-diagrams">
  {#if fromChallenge}
    {#if recall && !fromChallenge.diagramHtml}
      <div class="cx-recall-placeholder" class:cx-diagram-active={phase === 'from'}>
        <span class="cx-recall-icon">?</span>
      </div>
    {:else}
      <div class="cx-diagram" class:cx-diagram-active={phase === 'from'} class:nt-success={phase === 'from' && fbSuccess} class:nt-flash={phase === 'from' && fbFlash}>
        {@html fromChallenge.diagramHtml}
      </div>
    {/if}
  {/if}
  {#if toChallenge}
    {#if recall && !toChallenge.diagramHtml}
      <div class="cx-recall-placeholder" class:cx-diagram-active={phase === 'to'}>
        <span class="cx-recall-icon">?</span>
      </div>
    {:else}
      <div class="cx-diagram" class:cx-diagram-active={phase === 'to'} class:nt-success={phase === 'to' && fbSuccess} class:nt-flash={phase === 'to' && fbFlash}>
        {@html toChallenge.diagramHtml}
      </div>
    {/if}
  {/if}
</div>

<style>
  .cx-section{text-align:center}
  .cx-label{font-size:13px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:.2rem}
  .cx-names{display:flex;align-items:center;justify-content:center;gap:.5rem;font-family:'JetBrains Mono',monospace}
  .cx-name{font-size:32px;font-weight:700;color:var(--mt);transition:color .3s}
  .cx-name.cx-active{color:var(--ac)}
  .cx-arrow{font-size:24px;color:var(--mt);opacity:.5}
  .cx-shapes{font-size:14px;color:var(--mt);font-family:'JetBrains Mono',monospace;margin-top:.3rem}
  .cx-diagrams{display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin-top:.5rem}
  .cx-diagram{background:var(--sf);border:2px solid var(--bd);border-radius:10px;padding:.5rem;max-width:340px;flex:1;opacity:.5;transition:all .3s}
  .cx-diagram.cx-diagram-active{opacity:1;border-color:var(--ac)}
  .cx-diagram.nt-success{border-color:#4ECB71;box-shadow:0 0 20px rgba(78,203,113,.25)}
  .cx-recall-placeholder{display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--sf);border:2px dashed var(--bd);border-radius:10px;max-width:340px;flex:1;opacity:.5;transition:all .3s}
  .cx-recall-placeholder.cx-diagram-active{opacity:1;border-color:var(--ac)}
  .cx-recall-icon{font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:900;color:var(--bd);line-height:1}
  .nt-trav-dots{display:flex;gap:.6rem;justify-content:center;margin-top:.5rem}
  .nt-trav-dot{width:40px;height:40px;border-radius:50%;border:2px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;transition:all .3s}
  .nt-trav-dot.active{border-color:var(--ac);background:rgba(88,166,255,.15);box-shadow:0 0 10px rgba(88,166,255,.3)}
  .nt-trav-dot.done{border-color:#4ECB71;background:rgba(78,203,113,.15)}
  .nt-trav-dot-lbl{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;color:var(--mt)}
  .nt-trav-dot.active .nt-trav-dot-lbl{color:var(--ac)}
  .nt-trav-dot.done .nt-trav-dot-lbl{color:#4ECB71}
  @keyframes nt-glow{0%{box-shadow:0 0 20px rgba(78,203,113,.4)}100%{box-shadow:none}}
  .nt-flash{animation:nt-glow .8s ease-out}
  @media(max-width:600px){
    .cx-name{font-size:24px}
    .cx-arrow{font-size:18px}
    .nt-trav-dot{width:34px;height:34px}
    .nt-trav-dot-lbl{font-size:11px}
  }
</style>
