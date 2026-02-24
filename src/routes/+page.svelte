<script>
  import { base } from '$app/paths';
  import { CHAPTERS, renderRing } from '$lib/skilltree.js';
  import { loadProgress, getChapterProgress, THRESHOLD } from '$lib/progress.js';

  let progress = $state(loadProgress());

  let displayChapters = $derived(CHAPTERS.filter(ch => ch.id <= 7));

  let chapProgress = $derived(
    Object.fromEntries(displayChapters.map(ch => [
      ch.id,
      ch.exercises.length > 0 ? getChapterProgress(ch.id, CHAPTERS) : { total: 0, completed: 0, pct: 0 }
    ]))
  );

  let totalExercises = $derived(displayChapters.reduce((s, c) => s + c.exercises.length, 0));
  let totalCompleted = $derived(Object.values(chapProgress).reduce((s, p) => s + p.completed, 0));

  function isCompleted(exId) {
    const rec = progress.exercises[exId];
    return rec && (rec.bestScore >= THRESHOLD || rec.visited);
  }

  function refreshProgress() {
    progress = loadProgress();
  }
</script>

<svelte:head>
  <title>Guitar Learning Tools</title>
  <meta name="description" content="Interactive guitar learning pathway — master the fretboard through 9 chapters of theory and exercises.">
</svelte:head>

<div class="tree-page">
  <header class="tree-header">
    <h1 class="tree-title">Guitar Learning Tools</h1>
    <div class="tree-sub">
      <span class="tree-sub-track">{totalCompleted}/{totalExercises} exercises</span>
      <span class="tree-sub-sep">&middot;</span>
      <span>7 chapters</span>
    </div>
  </header>

  <div class="chapter-grid">
    {#each displayChapters as ch, i}
      {@const prog = chapProgress[ch.id]}
      <div class="chapter-card" style="--ch-color:{ch.color}; --delay:{i * 0.04}s">
        <div class="card-header">
          <div class="card-node">
            <div class="card-ring">{@html renderRing(prog.pct, ch.color, 44)}</div>
            <div class="card-num">{ch.id}</div>
            {#if prog.pct === 100}
              <div class="card-check">&#10003;</div>
            {/if}
          </div>
          <div class="card-title-area">
            <div class="card-title">{ch.title}</div>
            {#if prog.total > 0}
              <div class="card-progress">{prog.completed}/{prog.total} completed</div>
            {:else}
              <div class="card-progress">Theory</div>
            {/if}
          </div>
        </div>

        {#if ch.exercises.length > 0}
          <div class="exercise-list">
            {#each ch.exercises as ex}
              <a href="{base}{ex.path}" class="exercise-link" onclick={refreshProgress}>
                <span class="ex-name">{ex.name}</span>
                <span class="ex-badges">
                  {#if ex.mic}<span class="ex-mic" title="Uses microphone">&#127908;</span>{/if}
                  {#if isCompleted(ex.id)}<span class="ex-done">&#10003;</span>{/if}
                </span>
              </a>
            {/each}
          </div>
        {:else}
          <div class="card-placeholder">
            <span>Exercises coming soon</span>
            <a href="https://github.com/dknathalage/guitar-learning/blob/main/{ch.docsPath}" class="docs-link" target="_blank" rel="noopener">Read notes &rarr;</a>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Tuner FAB -->
  <a href="{base}/tuner" class="tuner-fab" title="Guitar Tuner">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
    <span class="fab-label">Tuner</span>
  </a>
</div>

<style>
  .tree-page {
    min-height: 100vh;
    padding: 2.5rem 1.5rem 5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(88,166,255,.04) 0%, transparent 60%),
      var(--bg);
  }

  /* ── Header ── */
  .tree-header {
    text-align: center;
    margin-bottom: 2.5rem;
    opacity: 0;
    animation: fadeUp .6s ease forwards;
  }
  .tree-title {
    font-size: clamp(1.6rem, 4.5vw, 2.6rem);
    font-weight: 900;
    letter-spacing: -1.5px;
    background: linear-gradient(135deg, var(--ac) 0%, #C084FC 50%, #F472B6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: .5rem;
  }
  .tree-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: .75rem;
    color: var(--mt);
    letter-spacing: .5px;
    display: flex;
    gap: .5rem;
    justify-content: center;
    align-items: center;
  }
  .tree-sub-track {
    color: var(--ac);
    font-weight: 600;
  }
  .tree-sub-sep {
    opacity: .4;
  }

  /* ── Chapter Grid ── */
  .chapter-grid {
    width: 100%;
    max-width: 1100px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  /* ── Chapter Card ── */
  .chapter-card {
    position: relative;
    background: var(--sf);
    border: 1px solid var(--bd);
    border-top: 3px solid var(--ch-color);
    border-radius: 14px;
    padding: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: .8rem;
    opacity: 0;
    animation: fadeUp .5s ease forwards;
    animation-delay: var(--delay, 0s);
    transition: border-color .2s, box-shadow .2s;
  }
  .chapter-card:hover {
    border-color: var(--ch-color);
    box-shadow: 0 4px 20px color-mix(in srgb, var(--ch-color) 10%, transparent);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: .7rem;
  }

  .card-node {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--sf);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .card-ring {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card-ring :global(svg) {
    display: block;
  }
  .card-num {
    position: relative;
    z-index: 2;
    font-family: 'JetBrains Mono', monospace;
    font-size: 1rem;
    font-weight: 800;
    color: var(--ch-color);
    text-shadow: 0 0 12px color-mix(in srgb, var(--ch-color) 30%, transparent);
  }
  .card-check {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #4ECB71;
    color: #0D1117;
    font-size: 9px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3;
    box-shadow: 0 0 8px rgba(78,203,113,.5);
  }

  .card-title-area {
    min-width: 0;
  }
  .card-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--ch-color);
  }
  .card-progress {
    font-family: 'JetBrains Mono', monospace;
    font-size: .7rem;
    color: var(--mt);
    margin-top: .15rem;
  }

  /* ── Exercises ── */
  .exercise-list {
    display: flex;
    flex-direction: column;
    gap: .4rem;
    flex: 1;
  }
  .exercise-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .5rem .75rem;
    background: var(--sf2);
    border: 1px solid var(--bd);
    border-radius: 8px;
    text-decoration: none;
    color: var(--tx);
    transition: all .15s;
    gap: .4rem;
  }
  .exercise-link:hover {
    border-color: var(--ch-color);
    background: color-mix(in srgb, var(--ch-color) 6%, var(--sf2));
    transform: translateY(-1px);
  }
  .ex-name {
    font-size: .85rem;
    font-weight: 600;
  }
  .ex-badges {
    display: flex;
    align-items: center;
    gap: .35rem;
    flex-shrink: 0;
  }
  .ex-mic {
    font-size: .7rem;
    opacity: .5;
  }
  .ex-done {
    color: #4ECB71;
    font-size: .8rem;
    font-weight: 700;
    text-shadow: 0 0 6px rgba(78,203,113,.4);
  }

  .card-placeholder {
    display: flex;
    flex-direction: column;
    gap: .4rem;
    padding: .7rem;
    background: var(--sf2);
    border: 1px dashed var(--bd);
    border-radius: 8px;
    font-size: .8rem;
    color: var(--mt);
    flex: 1;
  }
  .docs-link {
    color: var(--ch-color);
    text-decoration: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: .75rem;
    font-weight: 600;
    transition: opacity .15s;
  }
  .docs-link:hover {
    opacity: .7;
  }

  /* ── Tuner FAB ── */
  .tuner-fab {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    width: auto;
    height: 44px;
    border-radius: 22px;
    background: var(--sf);
    border: 1.5px solid var(--bd);
    color: var(--mt);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: .4rem;
    padding: 0 1rem 0 .8rem;
    text-decoration: none;
    box-shadow: 0 4px 20px rgba(0,0,0,.4);
    transition: all .2s;
    z-index: 100;
    font-family: 'JetBrains Mono', monospace;
    font-size: .7rem;
    font-weight: 600;
    letter-spacing: .5px;
    text-transform: uppercase;
  }
  .tuner-fab:hover {
    border-color: var(--ac);
    color: var(--ac);
    box-shadow: 0 4px 24px rgba(88,166,255,.15);
    transform: translateY(-2px);
  }
  .fab-label {
    line-height: 1;
  }

  /* ── Animations ── */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: none; }
  }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .chapter-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 580px) {
    .tree-page { padding: 1.5rem .75rem 5rem; }
    .tree-header { margin-bottom: 1.5rem; }
    .chapter-grid { grid-template-columns: 1fr; max-width: 400px; }
    .chapter-card { padding: 1rem; }
    .tuner-fab { bottom: 1rem; right: 1rem; }
  }
</style>
