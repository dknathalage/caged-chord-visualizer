<script>
  import { base } from '$app/paths';
  import { renderRing } from '$lib/skilltree.js';
  import { loadUnifiedMastery } from '$lib/progress.js';
  import { TYPES } from '$lib/learning/configs/unified.js';
  import { migrateToUnified } from '$lib/learning/migration.js';

  migrateToUnified();

  let um = $state(loadUnifiedMastery());

  let overallPct = $derived(um ? Math.round(um.overall * 100) : 0);

  let perType = $derived.by(() => {
    if (!um) return TYPES.map(t => ({ ...t, avgPL: 0, count: 0 }));
    return TYPES.map(t => {
      const typeItems = um.items.filter(i => i.key.startsWith(t.id + ':'));
      const avgPL = typeItems.length > 0 ? typeItems.reduce((s, i) => s + i.pL, 0) / typeItems.length : 0;
      return { ...t, avgPL, count: typeItems.length };
    });
  });
</script>

<svelte:head>
  <title>Guitar Learning Tools</title>
  <meta name="description" content="Interactive guitar learning — master the fretboard through adaptive mic-based exercises.">
</svelte:head>

<div class="landing">
  <header class="landing-header">
    <h1 class="landing-title">Guitar Learning Tools</h1>
    <p class="landing-sub">Adaptive practice for fretboard mastery</p>
  </header>

  <div class="mastery-section">
    <div class="mastery-ring">
      {@html renderRing(overallPct, '#58A6FF', 140)}
      <div class="mastery-pct">{overallPct}%</div>
    </div>
    {#if um && um.totalItems > 0}
      <div class="mastery-label">{um.totalItems} items practiced</div>
    {:else}
      <div class="mastery-label">Start practicing to track progress</div>
    {/if}
  </div>

  <div class="type-bars">
    {#each perType as ts}
      <div class="type-bar">
        <div class="type-bar-name">{ts.name}</div>
        <div class="type-bar-track">
          <div class="type-bar-fill" style="width:{Math.round(ts.avgPL * 100)}%"></div>
        </div>
        <div class="type-bar-pct">{ts.count > 0 ? Math.round(ts.avgPL * 100) + '%' : '\u2014'}</div>
      </div>
    {/each}
  </div>

  <a href="{base}/practice" class="practice-btn">Practice</a>

  <div class="secondary-links">
    <a href="{base}/tuner" class="sec-link">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
      Tuner
    </a>
    <a href="{base}/caged" class="sec-link">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="9" y1="3" x2="9" y2="21"/>
      </svg>
      CAGED Visualizer
    </a>
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
  .landing {
    min-height: 100vh;
    padding: 3rem 1.5rem 5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    background:
      radial-gradient(ellipse 80% 50% at 50% 0%, rgba(88,166,255,.04) 0%, transparent 60%),
      var(--bg);
  }

  .landing-header {
    text-align: center;
    margin-bottom: 2rem;
    opacity: 0;
    animation: fadeUp .6s ease forwards;
  }
  .landing-title {
    font-size: clamp(1.6rem, 4.5vw, 2.6rem);
    font-weight: 900;
    letter-spacing: -1.5px;
    background: linear-gradient(135deg, var(--ac) 0%, #C084FC 50%, #F472B6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: .5rem;
  }
  .landing-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: .8rem;
    color: var(--mt);
    letter-spacing: .5px;
  }

  .mastery-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .75rem;
    margin-bottom: 1.5rem;
    opacity: 0;
    animation: fadeUp .6s ease forwards;
    animation-delay: .1s;
  }
  .mastery-ring {
    position: relative;
    width: 140px;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mastery-ring :global(svg) {
    position: absolute;
    inset: 0;
  }
  .mastery-pct {
    font-family: 'JetBrains Mono', monospace;
    font-size: 32px;
    font-weight: 700;
    color: var(--ac);
    z-index: 1;
  }
  .mastery-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: .7rem;
    color: var(--mt);
    letter-spacing: .5px;
  }

  .type-bars {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: .5rem;
    margin-bottom: 2rem;
    opacity: 0;
    animation: fadeUp .6s ease forwards;
    animation-delay: .2s;
  }
  .type-bar {
    display: flex;
    align-items: center;
    gap: .5rem;
  }
  .type-bar-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--mt);
    width: 110px;
    text-align: right;
    flex-shrink: 0;
  }
  .type-bar-track {
    flex: 1;
    height: 8px;
    background: var(--sf2);
    border-radius: 4px;
    overflow: hidden;
  }
  .type-bar-fill {
    height: 100%;
    background: var(--ac);
    border-radius: 4px;
    transition: width .3s;
  }
  .type-bar-pct {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--mt);
    width: 36px;
    text-align: right;
  }

  .practice-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: .8rem 3rem;
    border-radius: 28px;
    border: 2px solid var(--ac);
    background: rgba(88,166,255,.1);
    color: var(--ac);
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    text-decoration: none;
    cursor: pointer;
    transition: all .2s;
    margin-bottom: 1.5rem;
    opacity: 0;
    animation: fadeUp .6s ease forwards;
    animation-delay: .3s;
  }
  .practice-btn:hover {
    background: rgba(88,166,255,.2);
    box-shadow: 0 4px 24px rgba(88,166,255,.2);
    transform: translateY(-2px);
  }

  .secondary-links {
    display: flex;
    gap: 1rem;
    opacity: 0;
    animation: fadeUp .6s ease forwards;
    animation-delay: .4s;
  }
  .sec-link {
    display: flex;
    align-items: center;
    gap: .4rem;
    padding: .5rem 1rem;
    background: var(--sf);
    border: 1px solid var(--bd);
    border-radius: 12px;
    text-decoration: none;
    color: var(--mt);
    font-family: 'JetBrains Mono', monospace;
    font-size: .8rem;
    font-weight: 600;
    transition: all .15s;
  }
  .sec-link:hover {
    border-color: var(--ac);
    color: var(--ac);
    transform: translateY(-1px);
  }

  /* Tuner FAB */
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

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: none; }
  }

  @media (max-width: 580px) {
    .landing { padding: 2rem .75rem 5rem; }
    .type-bar-name { width: 80px; font-size: 10px; }
    .practice-btn { padding: .6rem 2rem; font-size: .95rem; }
    .tuner-fab { bottom: 1rem; right: 1rem; }
  }
</style>
