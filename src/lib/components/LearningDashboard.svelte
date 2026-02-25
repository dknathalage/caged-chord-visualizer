<script>
  import { onDestroy } from 'svelte';

  let { engine } = $props();
  let open = $state(false);
  let mastery = $state(null);
  let sortCol = $state('pL');
  let sortAsc = $state(true);
  let itemsOpen = $state(false);

  // Resize state
  let panelWidth = $state(320);
  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartW = 0;

  function refresh() {
    if (engine) mastery = engine.getMastery();
  }

  refresh();
  const _ivl = setInterval(refresh, 1000);
  onDestroy(() => clearInterval(_ivl));

  // Drag resize — attach window listeners while dragging
  $effect(() => {
    if (!dragging) return;
    function onMove(e) {
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      panelWidth = Math.max(220, Math.min(600, dragStartW + (dragStartX - cx)));
    }
    function onUp() { dragging = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  });

  function startDrag(e) {
    dragging = true;
    dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
    dragStartW = panelWidth;
    e.preventDefault();
  }

  // Clusters sorted by avgPL descending (weakest first)
  let sortedClusters = $derived(() => {
    if (!mastery) return [];
    return [...mastery.clusters].sort((a, b) => a.avgPL - b.avgPL);
  });

  let sortedItems = $derived(() => {
    if (!mastery) return [];
    const items = [...mastery.items];
    items.sort((a, b) => {
      const av = a[sortCol] ?? 0;
      const bv = b[sortCol] ?? 0;
      return sortAsc ? av - bv : bv - av;
    });
    return items;
  });

  function setSort(col) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = false; }
  }

  function fmtPct(v) { return (v * 100).toFixed(0) + '%'; }
  function fmtMs(v) { return v > 0 ? (v / 1000).toFixed(1) + 's' : '\u2014'; }
  function fmtPL(v) { return v.toFixed(2); }
  function fmtS(v) { return v >= 1 ? v.toFixed(0) + 'd' : v > 0 ? '<1d' : '\u2014'; }
  function fmtR(v) { return v > 0 ? (v * 100).toFixed(0) + '%' : '\u2014'; }
  function fmtFluency(v) { return v > 0 ? v.toFixed(1) + 'x' : '\u2014'; }

  function fluencyColor(ratio) {
    if (ratio <= 0) return 'var(--mt)';
    if (ratio < 1.0) return '#4ECB71';
    if (ratio <= 1.3) return '#F0A030';
    return '#FF6B6B';
  }

  function fluencyPct(ratio) {
    if (ratio <= 0) return 0;
    return Math.min(100, (1 / Math.max(0.3, ratio)) * 100);
  }

  function plColor(pL) {
    if (pL >= 0.95) return '#4ECB71';
    if (pL >= 0.5) return '#F0A030';
    return '#FF6B6B';
  }

  // Big ring geometry (top 3 rings)
  const RR = 29.5, RSZ = 64, RSW = 5;
  const CIRC = 2 * Math.PI * RR;
  function ringOffset(pct) { return CIRC * (1 - Math.max(0, Math.min(1, pct))); }

  // Small cluster pie geometry
  const CSZ = 44, CPR = 19;
  function pieArc(pct) {
    const p = Math.max(0, Math.min(1, pct));
    if (p <= 0) return '';
    if (p >= 1) return `<circle cx="22" cy="22" r="${CPR}"/>`;
    const a = p * 2 * Math.PI;
    const x = 22 + CPR * Math.sin(a);
    const y = 22 - CPR * Math.cos(a);
    const lg = p > 0.5 ? 1 : 0;
    return `<path d="M22,22 L22,${22 - CPR} A${CPR},${CPR} 0 ${lg} 1 ${x},${y} Z"/>`;
  }
</script>

<div class="ld-drawer" class:ld-open={open} class:ld-dragging={dragging}>
  {#if !open}
    <button class="ld-tab-handle" onclick={() => open = true} title="Open stats panel">
      <span class="ld-tab-text">Stats</span>
    </button>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ld-resize-handle" onmousedown={startDrag} ontouchstart={startDrag}></div>
    <div class="ld-panel" style="width:{panelWidth}px">
      <div class="ld-header">
        <span class="ld-title">Stats</span>
        <div class="ld-header-actions">
          <button class="ld-btn" onclick={refresh} title="Refresh">&#8635;</button>
          <button class="ld-btn ld-close-btn" onclick={() => open = false} title="Close">&times;</button>
        </div>
      </div>

      {#if mastery}
        <!-- Radial rings -->
        <div class="ld-rings">
          {#each [
            { pct: mastery.overall.pctMastered, color: '#4ECB71', label: 'Mastery', val: fmtPct(mastery.overall.pctMastered) },
            { pct: mastery.overall.sessionAccuracy, color: '#58A6FF', label: 'Accuracy', val: fmtPct(mastery.overall.sessionAccuracy) },
            { pct: mastery.overall.avgPL, color: plColor(mastery.overall.avgPL), label: 'Avg pL', val: fmtPL(mastery.overall.avgPL) },
          ] as r}
            <div class="ld-ring">
              <svg width={RSZ} height={RSZ} viewBox="0 0 {RSZ} {RSZ}">
                <circle cx="32" cy="32" r={RR} fill="none" stroke="var(--sf2)" stroke-width={RSW}/>
                <circle cx="32" cy="32" r={RR} fill="none" stroke={r.color} stroke-width={RSW}
                  stroke-dasharray={CIRC} stroke-dashoffset={ringOffset(r.pct)}
                  transform="rotate(-90 32 32)" stroke-linecap="round"/>
                <text x="32" y="32" text-anchor="middle" dominant-baseline="central"
                  fill={r.color} font-size="13" font-weight="700" font-family="JetBrains Mono,monospace">{r.val}</text>
              </svg>
              <span class="ld-ring-lbl">{r.label}</span>
            </div>
          {/each}
        </div>

        <!-- Quick stats row -->
        <div class="ld-quick">
          <span>{mastery.overall.sessionQuestions} Qs</span>
          <span class="ld-dot">&middot;</span>
          <span>{fmtMs(mastery.overall.avgResponseTime)} avg</span>
          <span class="ld-dot">&middot;</span>
          <span>{mastery.overall.masteredCount}/{mastery.overall.totalItems} mastered</span>
        </div>

        {#if mastery.overall.plateauDetected}
          <div class="ld-plateau-warn">
            <span class="ld-plateau-icon">&#9650;</span>
            <span>Plateau detected — try varying exercises or difficulty</span>
          </div>
        {/if}

        <!-- Clusters as radial grid -->
        {#if mastery.clusters.length > 0}
          <div class="ld-section">
            <div class="ld-section-hd">Clusters</div>
            <div class="ld-cl-grid">
              {#each sortedClusters() as cl}
                <div class="ld-cl-cell" title="{cl.id}: {fmtPL(cl.avgPL)}">
                  <svg width={CSZ} height={CSZ} viewBox="0 0 {CSZ} {CSZ}">
                    <circle cx="22" cy="22" r={CPR} fill="var(--sf2)"/>
                    <g fill={plColor(cl.avgPL)} opacity=".85">{@html pieArc(cl.avgPL)}</g>
                    <circle cx="22" cy="22" r={CPR} fill="none" stroke="var(--bd)" stroke-width="1"/>
                    <text x="22" y="22" text-anchor="middle" dominant-baseline="central"
                      fill="#fff" font-size="12" font-weight="700" font-family="JetBrains Mono,monospace">{Math.round(cl.avgPL * 99)}</text>
                  </svg>
                  <span class="ld-cl-lbl">{cl.id}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Items (collapsible) -->
        <div class="ld-section">
          <button class="ld-section-toggle" onclick={() => itemsOpen = !itemsOpen}>
            Items {itemsOpen ? '\u25BE' : '\u25B8'}
          </button>
          {#if itemsOpen}
            <div class="ld-table-wrap">
              <table class="ld-table">
                <thead>
                  <tr>
                    <th onclick={() => setSort('key')}>Key</th>
                    <th onclick={() => setSort('pL')}>pL</th>
                    <th onclick={() => setSort('fluencyRatio')}>Flu</th>
                    <th onclick={() => setSort('S')}>S</th>
                    <th onclick={() => setSort('R')}>R</th>
                    <th onclick={() => setSort('avgTime')}>Time</th>
                    <th onclick={() => setSort('attempts')}>Att</th>
                    <th>Conf</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {#each sortedItems() as it}
                    <tr>
                      <td class="ld-key">{it.key.length > 14 ? it.key.slice(0, 14) + '\u2026' : it.key}</td>
                      <td style="color:{plColor(it.pL)}">{fmtPL(it.pL)}</td>
                      <td class="ld-fluency-cell">
                        <div class="ld-fluency-bar">
                          <div class="ld-fluency-fill" style="width:{fluencyPct(it.fluencyRatio)}%;background:{fluencyColor(it.fluencyRatio)}"></div>
                        </div>
                        <span style="color:{fluencyColor(it.fluencyRatio)}">{fmtFluency(it.fluencyRatio)}</span>
                      </td>
                      <td>{fmtS(it.S)}</td>
                      <td>{fmtR(it.R)}</td>
                      <td>{fmtMs(it.avgTime)}</td>
                      <td>{it.attempts}</td>
                      <td class="ld-conf">{it.topConfusion ? '\u2192' + it.topConfusion : '\u2014'}</td>
                      <td>{it.mastered ? '\u2705' : it.pL > 0.7 ? '\ud83d\udfe1' : '\ud83d\udd34'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {:else}
        <div class="ld-empty">No data yet</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ld-drawer{flex-shrink:0;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--tx);display:flex}
  .ld-dragging{user-select:none}

  /* Collapsed tab */
  .ld-tab-handle{display:flex;align-items:center;justify-content:center;width:28px;height:100%;background:var(--sf);border:none;border-left:1px solid var(--bd);cursor:pointer;padding:0;transition:background .15s}
  .ld-tab-handle:hover{background:var(--sf2)}
  .ld-tab-text{writing-mode:vertical-rl;text-orientation:mixed;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mt);letter-spacing:2px;text-transform:uppercase;font-weight:600;user-select:none}
  .ld-tab-handle:hover .ld-tab-text{color:var(--ac)}

  /* Resize handle */
  .ld-resize-handle{width:6px;flex-shrink:0;cursor:col-resize;background:var(--bd);transition:background .15s}
  .ld-resize-handle:hover,.ld-dragging .ld-resize-handle{background:var(--ac)}

  /* Panel */
  .ld-panel{height:100%;background:var(--sf);padding:.8rem;overflow-y:auto;display:flex;flex-direction:column;gap:.7rem;animation:ld-in .2s ease-out}
  @keyframes ld-in{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}

  /* Header */
  .ld-header{display:flex;justify-content:space-between;align-items:center}
  .ld-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--mt)}
  .ld-header-actions{display:flex;align-items:center;gap:.2rem}
  .ld-btn{background:none;border:none;color:var(--mt);font-size:16px;cursor:pointer;padding:.15rem .25rem;line-height:1;border-radius:4px;transition:color .15s}
  .ld-btn:hover{color:var(--ac)}
  .ld-close-btn{font-size:20px}

  /* Rings */
  .ld-rings{display:flex;justify-content:space-around;flex-wrap:wrap;gap:.4rem}
  .ld-ring{display:flex;flex-direction:column;align-items:center;gap:.15rem}
  .ld-ring-lbl{font-size:9px;color:var(--mt);text-transform:uppercase;letter-spacing:.5px;font-weight:600}

  /* Quick stats */
  .ld-quick{display:flex;justify-content:center;gap:.3rem;font-size:10px;color:var(--mt);flex-wrap:wrap}
  .ld-dot{opacity:.4}

  /* Sections */
  .ld-section{display:flex;flex-direction:column;gap:.3rem}
  .ld-section-hd{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;font-weight:600;padding-bottom:.1rem;border-bottom:1px solid var(--bd)}
  .ld-section-toggle{background:none;border:none;border-bottom:1px solid var(--bd);color:var(--mt);font-family:inherit;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:600;cursor:pointer;text-align:left;padding:0 0 .15rem;transition:color .15s}
  .ld-section-toggle:hover{color:var(--ac)}
  /* Cluster grid of small radial rings */
  .ld-cl-grid{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:flex-start}
  .ld-cl-cell{display:flex;flex-direction:column;align-items:center;gap:.1rem;cursor:default}
  .ld-cl-lbl{font-size:8px;color:var(--mt);max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}

  /* Items table */
  .ld-table-wrap{overflow-x:auto;max-height:300px;overflow-y:auto}
  .ld-table{width:100%;border-collapse:collapse;font-size:10px}
  .ld-table th{text-align:left;padding:.25rem .3rem;border-bottom:1px solid var(--bd);color:var(--mt);cursor:pointer;user-select:none;font-size:9px;text-transform:uppercase;letter-spacing:.5px;position:sticky;top:0;background:var(--sf)}
  .ld-table th:hover{color:var(--ac)}
  .ld-table td{padding:.2rem .3rem;border-bottom:1px solid rgba(255,255,255,.04)}
  .ld-key{max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mt)}
  .ld-conf{font-size:9px;color:var(--mt);white-space:nowrap}

  /* Plateau warning */
  .ld-plateau-warn{display:flex;align-items:center;gap:.4rem;padding:.35rem .5rem;background:rgba(240,160,48,.1);border:1px solid rgba(240,160,48,.3);border-radius:6px;font-size:10px;color:#F0A030}
  .ld-plateau-icon{font-size:11px}

  /* Fluency bar */
  .ld-fluency-cell{display:flex;flex-direction:column;gap:1px;min-width:40px}
  .ld-fluency-bar{width:100%;height:3px;background:var(--sf2);border-radius:2px;overflow:hidden}
  .ld-fluency-fill{height:100%;border-radius:2px;transition:width .3s}
  .ld-fluency-cell span{font-size:9px}

  .ld-empty{text-align:center;color:var(--mt);padding:1rem;font-size:12px}

  @media(max-width:600px){
    .ld-panel{padding:.5rem}
  }
</style>
