<script>
  import { onDestroy } from 'svelte';
  import { TYPES } from '$lib/learning/configs/unified.js';

  let { engine } = $props();
  let open = $state(false);
  let mastery = $state(null);
  let sortCol = $state('pL');
  let sortAsc = $state(true);
  let detailedOpen = $state(false);
  let itemsOpen = $state(false);

  // Which type is expanded in the Exercise Mastery section
  let expandedType = $state(null);

  // Resize state
  let panelWidth = $state(340);
  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartW = 0;

  // Pre-defined cluster definitions per type (known clusters for the full horizon view)
  const TYPE_CLUSTER_DEFS = {
    nf: ['str_0','str_1','str_2','str_3','str_4','str_5','zone_0','zone_3','zone_5','zone_7','zone_9','zone_12','natural','accidental'],

    iv: ['m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7','P8'],
    ct: ['R','3','5','b3','b7','7'],
    cp: ['C_shape','A_shape','G_shape','E_shape','D_shape'],
    sr: ['major_pent','minor_pent','major','minor'],
    mt: ['ionian','dorian','phrygian','lydian','mixolydian','aeolian','locrian'],
    cx: ['C_shape','A_shape','G_shape','E_shape','D_shape'],
  };

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

  // Per-type mastery stats (always all 8 types)
  let typeMasteryStats = $derived(() => {
    if (!mastery) return TYPES.map(t => ({ id: t.id, name: t.name, avgPL: 0, count: 0, mastered: 0 }));
    return TYPES.map(t => {
      const items = mastery.items.filter(i => i.key.startsWith(t.id + ':'));
      const avgPL = items.length > 0 ? items.reduce((s, i) => s + i.pL, 0) / items.length : 0;
      const mastered = items.filter(i => i.mastered).length;
      return { id: t.id, name: t.name, avgPL, count: items.length, mastered };
    });
  });

  // Get cluster stats for a specific type
  function getTypeClusters(typeId) {
    if (!mastery) return [];
    const defs = TYPE_CLUSTER_DEFS[typeId] || [];
    const typePrefix = 'type_' + typeId;
    // Get items for this type
    const typeItems = mastery.items.filter(i => i.key.startsWith(typeId + ':'));

    return defs.map(clId => {
      // Find matching cluster in mastery data
      const cl = mastery.clusters.find(c => c.id === clId);
      // Also compute from items that have this cluster
      const matchingItems = typeItems.filter(i => {
        const rec = engine.items.get(i.key);
        return rec && rec.cls.includes(clId);
      });
      const avgPL = matchingItems.length > 0 ? matchingItems.reduce((s, i) => s + i.pL, 0) / matchingItems.length : 0;
      return {
        id: clId,
        avgPL,
        count: matchingItems.length,
        total: cl ? cl.total : 0,
        correct: cl ? cl.correct : 0,
        encountered: matchingItems.length > 0,
      };
    });
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

  function plBarColor(pL) {
    if (pL >= 0.9) return '#4ECB71';
    if (pL >= 0.5) return '#F0A030';
    if (pL > 0) return '#FF6B6B';
    return 'var(--bd)';
  }

  function statusBadge(item) {
    if (item.mastered) return { label: 'Mastered', color: '#4ECB71' };
    if (item.pL > 0.7) return { label: 'Learning', color: '#F0A030' };
    return { label: 'New', color: '#FF6B6B' };
  }

  // Gauge arc geometry (upgraded rings)
  const RSZ = 72, RR = 31, RSW = 5;
  const CIRC = 2 * Math.PI * RR;
  function ringOffset(pct) { return CIRC * (1 - Math.max(0, Math.min(1, pct))); }
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
        <div class="ld-title-group">
          <span class="ld-title">Stats</span>
          <span class="ld-subtitle">for nerds</span>
        </div>
        <div class="ld-header-actions">
          <button class="ld-btn" onclick={refresh} title="Refresh">&#8635;</button>
          <button class="ld-btn ld-close-btn" onclick={() => open = false} title="Close">&times;</button>
        </div>
      </div>

      {#if mastery}
        <!-- Gauge arcs -->
        <div class="ld-rings">
          {#each [
            { pct: mastery.overall.pctMastered, color: '#4ECB71', label: 'Mastery', val: fmtPct(mastery.overall.pctMastered) },
            { pct: mastery.overall.sessionAccuracy, color: '#58A6FF', label: 'Accuracy', val: fmtPct(mastery.overall.sessionAccuracy) },
            { pct: mastery.overall.avgPL, color: plColor(mastery.overall.avgPL), label: 'Avg pL', val: fmtPL(mastery.overall.avgPL) },
          ] as r}
            <div class="ld-ring">
              <svg width={RSZ} height={RSZ} viewBox="0 0 {RSZ} {RSZ}">
                <defs>
                  <filter id="glow-{r.label}" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="blur"/>
                    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                  </filter>
                </defs>
                <circle cx="36" cy="36" r={RR} fill="none" stroke="var(--sf2)" stroke-width={RSW}/>
                <circle cx="36" cy="36" r={RR} fill="none" stroke={r.color} stroke-width={RSW}
                  stroke-dasharray={CIRC} stroke-dashoffset={ringOffset(r.pct)}
                  transform="rotate(-90 36 36)" stroke-linecap="round"
                  filter="url(#glow-{r.label})" style="transition:stroke-dashoffset .5s"/>
              </svg>
              <span class="ld-ring-val" style="color:{r.color}">{r.val}</span>
              <span class="ld-ring-lbl">{r.label}</span>
            </div>
          {/each}
        </div>

        <!-- Quick stats as metric cards -->
        <div class="ld-metrics">
          <div class="ld-metric-card">
            <span class="ld-metric-label">Questions</span>
            <span class="ld-metric-value">{mastery.overall.sessionQuestions}</span>
          </div>
          <div class="ld-metric-card">
            <span class="ld-metric-label">Avg Time</span>
            <span class="ld-metric-value">{fmtMs(mastery.overall.avgResponseTime)}</span>
          </div>
          <div class="ld-metric-card">
            <span class="ld-metric-label">Mastered</span>
            <span class="ld-metric-value">{mastery.overall.masteredCount}<span class="ld-metric-unit">/{mastery.overall.totalItems}</span></span>
          </div>
          <div class="ld-metric-card">
            <span class="ld-metric-label">Theta</span>
            <span class="ld-metric-value" style="color:var(--ac)">{mastery.overall.theta.toFixed(3)}</span>
          </div>
        </div>

        {#if mastery.overall.plateauDetected}
          <div class="ld-plateau-warn">
            <div class="ld-plateau-icon-wrap">
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1L15 14H1L8 1Z" fill="none" stroke="#F0A030" stroke-width="1.5" stroke-linejoin="round"/><line x1="8" y1="6" x2="8" y2="9.5" stroke="#F0A030" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.5" r="0.8" fill="#F0A030"/></svg>
            </div>
            <div class="ld-plateau-text">
              <span class="ld-plateau-title">Plateau Detected</span>
              <span class="ld-plateau-desc">Try varying exercises or difficulty</span>
            </div>
          </div>
        {/if}

        <!-- Exercise Mastery — always shows all 8 types -->
        <div class="ld-section">
          <div class="ld-section-hd">Exercise Mastery</div>
          <div class="ld-type-list">
            {#each typeMasteryStats() as ts}
              <div class="ld-type-row">
                <button class="ld-type-header" onclick={() => expandedType = expandedType === ts.id ? null : ts.id}>
                  <span class="ld-type-name">{ts.name}</span>
                  <div class="ld-type-bar-wrap">
                    <div class="ld-type-bar-track">
                      <div class="ld-type-bar-fill" style="width:{Math.round(ts.avgPL * 100)}%;background:{plBarColor(ts.avgPL)}"></div>
                    </div>
                  </div>
                  <span class="ld-type-pct" style="color:{ts.count > 0 ? plBarColor(ts.avgPL) : 'var(--bd)'}">{ts.count > 0 ? Math.round(ts.avgPL * 100) + '%' : '\u2014'}</span>
                  <span class="ld-type-count">{ts.count > 0 ? ts.mastered + '/' + ts.count : ''}</span>
                  <span class="ld-type-arrow">{expandedType === ts.id ? '\u25BE' : '\u25B8'}</span>
                </button>
                {#if expandedType === ts.id}
                  <div class="ld-type-clusters">
                    {#each getTypeClusters(ts.id) as cl}
                      <div class="ld-tcl-row" class:ld-tcl-unencountered={!cl.encountered}>
                        <span class="ld-tcl-name">{cl.id}</span>
                        <div class="ld-tcl-bar-track">
                          <div class="ld-tcl-bar-fill" style="width:{Math.round(cl.avgPL * 100)}%;background:{cl.encountered ? plBarColor(cl.avgPL) : 'var(--bd)'}"></div>
                        </div>
                        <span class="ld-tcl-pct" style="color:{cl.encountered ? plBarColor(cl.avgPL) : 'var(--bd)'}">{cl.encountered ? Math.round(cl.avgPL * 100) + '%' : '\u2014'}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <!-- Detailed Stats (collapsible) -->
        <div class="ld-section">
          <button class="ld-section-toggle" onclick={() => detailedOpen = !detailedOpen}>
            <span class="ld-toggle-text">Detailed Stats</span>
            <span class="ld-toggle-arrow">{detailedOpen ? '\u25BE' : '\u25B8'}</span>
          </button>
          {#if detailedOpen}
            <!-- Clusters -->
            {#if mastery.clusters.length > 0}
              <div class="ld-section-hd" style="margin-top:.4rem">Clusters</div>
              <div class="ld-cl-grid">
                {#each sortedClusters() as cl}
                  <div class="ld-cl-cell" title="{cl.id}: pL {fmtPL(cl.avgPL)} | {cl.correct}/{cl.total}">
                    <div class="ld-cl-mini-bar">
                      <div class="ld-cl-mini-fill" style="width:{Math.round(cl.avgPL * 100)}%;background:{plColor(cl.avgPL)}"></div>
                    </div>
                    <span class="ld-cl-lbl">{cl.id}</span>
                    <span class="ld-cl-pct">{fmtPct(cl.avgPL)}</span>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Items -->
            <button class="ld-section-toggle" style="margin-top:.4rem" onclick={() => itemsOpen = !itemsOpen}>
              <span class="ld-toggle-text">Items ({mastery.items.length})</span>
              <span class="ld-toggle-arrow">{itemsOpen ? '\u25BE' : '\u25B8'}</span>
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
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each sortedItems() as it, idx}
                      {@const badge = statusBadge(it)}
                      <tr class:ld-row-alt={idx % 2 === 1}>
                        <td class="ld-key">{it.key.length > 14 ? it.key.slice(0, 14) + '\u2026' : it.key}</td>
                        <td style="color:{plColor(it.pL)};font-weight:700">{fmtPL(it.pL)}</td>
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
                        <td><span class="ld-status-badge" style="color:{badge.color};border-color:{badge.color}">{badge.label}</span></td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
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

  /* Panel — glassmorphism */
  .ld-panel{height:100%;background:rgba(22,27,34,.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:.8rem;overflow-y:auto;display:flex;flex-direction:column;gap:.8rem;animation:ld-in .2s ease-out;border-left:1px solid rgba(48,54,61,.6)}
  @keyframes ld-in{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}

  /* Header */
  .ld-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:.4rem;border-bottom:2px solid var(--ac)}
  .ld-title-group{display:flex;align-items:baseline;gap:6px}
  .ld-title{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--tx)}
  .ld-subtitle{font-size:10px;color:var(--mt);font-weight:400;letter-spacing:.5px}
  .ld-header-actions{display:flex;align-items:center;gap:.2rem}
  .ld-btn{background:none;border:none;color:var(--mt);font-size:16px;cursor:pointer;padding:.15rem .25rem;line-height:1;border-radius:4px;transition:color .15s}
  .ld-btn:hover{color:var(--ac)}
  .ld-close-btn{font-size:20px}

  /* Gauge arcs */
  .ld-rings{display:flex;justify-content:space-around;flex-wrap:wrap;gap:.5rem}
  .ld-ring{display:flex;flex-direction:column;align-items:center;gap:.1rem;position:relative}
  .ld-ring svg{display:block}
  .ld-ring-val{font-size:15px;font-weight:700;position:absolute;top:50%;left:50%;transform:translate(-50%,-70%)}
  .ld-ring-lbl{font-size:9px;color:var(--mt);text-transform:uppercase;letter-spacing:.5px;font-weight:600}

  /* Quick stats — metric cards */
  .ld-metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .ld-metric-card{display:flex;flex-direction:column;gap:1px;padding:6px 8px;background:var(--sf2);border-radius:6px;border:1px solid rgba(48,54,61,.5);transition:border-color .15s}
  .ld-metric-card:hover{border-color:var(--ac)}
  .ld-metric-label{font-size:8px;color:var(--mt);text-transform:uppercase;letter-spacing:.5px;font-weight:600}
  .ld-metric-value{font-size:16px;font-weight:700;color:var(--tx)}
  .ld-metric-unit{font-size:11px;color:var(--mt);font-weight:400}

  /* Sections */
  .ld-section{display:flex;flex-direction:column;gap:.4rem}
  .ld-section-hd{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;font-weight:600;padding-left:6px;border-left:2px solid var(--ac)}
  .ld-section-toggle{display:flex;align-items:center;justify-content:space-between;background:none;border:none;color:var(--mt);font-family:inherit;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:600;cursor:pointer;text-align:left;padding:2px 0 2px 6px;border-left:2px solid var(--ac);transition:color .15s}
  .ld-section-toggle:hover{color:var(--ac)}
  .ld-toggle-text{flex:1}
  .ld-toggle-arrow{font-size:12px;margin-left:4px}

  /* Exercise Mastery — type list */
  .ld-type-list{display:flex;flex-direction:column;gap:2px}
  .ld-type-row{display:flex;flex-direction:column}
  .ld-type-header{display:flex;align-items:center;gap:6px;width:100%;background:none;border:none;color:var(--tx);font-family:inherit;font-size:10px;cursor:pointer;padding:4px 2px;border-radius:4px;transition:background .15s}
  .ld-type-header:hover{background:rgba(88,166,255,.04)}
  .ld-type-name{width:80px;text-align:right;flex-shrink:0;font-weight:600;font-size:9px;color:var(--mt);text-transform:uppercase;letter-spacing:.3px}
  .ld-type-bar-wrap{flex:1;min-width:0}
  .ld-type-bar-track{height:6px;background:var(--sf2);border-radius:3px;overflow:hidden}
  .ld-type-bar-fill{height:100%;border-radius:3px;transition:width .3s}
  .ld-type-pct{width:28px;text-align:right;font-weight:700;font-size:10px;flex-shrink:0}
  .ld-type-count{width:28px;text-align:right;font-size:8px;color:var(--mt);flex-shrink:0}
  .ld-type-arrow{font-size:10px;color:var(--mt);flex-shrink:0;width:12px;text-align:center}

  /* Type cluster breakdown */
  .ld-type-clusters{display:flex;flex-direction:column;gap:1px;padding:2px 0 4px 88px;animation:ld-in .15s ease-out}
  .ld-tcl-row{display:flex;align-items:center;gap:6px}
  .ld-tcl-row.ld-tcl-unencountered{opacity:.4}
  .ld-tcl-name{width:50px;text-align:right;font-size:8px;color:var(--mt);flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ld-tcl-bar-track{flex:1;height:4px;background:var(--sf2);border-radius:2px;overflow:hidden}
  .ld-tcl-bar-fill{height:100%;border-radius:2px;transition:width .3s}
  .ld-tcl-pct{width:28px;text-align:right;font-size:8px;font-weight:600;flex-shrink:0}

  /* Cluster grid */
  .ld-cl-grid{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:flex-start}
  .ld-cl-cell{display:flex;flex-direction:column;align-items:center;gap:.05rem;cursor:default;transition:transform .15s;min-width:40px}
  .ld-cl-cell:hover{transform:scale(1.08)}
  .ld-cl-mini-bar{width:100%;height:4px;background:var(--sf2);border-radius:2px;overflow:hidden}
  .ld-cl-mini-fill{height:100%;border-radius:2px;transition:width .3s}
  .ld-cl-lbl{font-size:8px;color:var(--mt);max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
  .ld-cl-pct{font-size:7px;color:var(--mt);opacity:.7}

  /* Items table */
  .ld-table-wrap{overflow-x:auto;max-height:300px;overflow-y:auto;border-radius:4px}
  .ld-table{width:100%;border-collapse:collapse;font-size:10px}
  .ld-table th{text-align:left;padding:.3rem .3rem;border-bottom:1px solid var(--bd);color:var(--mt);cursor:pointer;user-select:none;font-size:9px;text-transform:uppercase;letter-spacing:.5px;position:sticky;top:0;background:var(--sf);z-index:1}
  .ld-table th:hover{color:var(--ac)}
  .ld-table td{padding:.25rem .3rem;border-bottom:1px solid rgba(255,255,255,.03);transition:background .1s}
  .ld-table tr:hover td{background:rgba(88,166,255,.04)}
  .ld-row-alt td{background:rgba(255,255,255,.015)}
  .ld-row-alt:hover td{background:rgba(88,166,255,.06)}
  .ld-key{max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx);font-weight:600}
  .ld-conf{font-size:9px;color:var(--mt);white-space:nowrap}

  /* Status badge */
  .ld-status-badge{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:1px 5px;border-radius:3px;border:1px solid;background:rgba(0,0,0,.2);white-space:nowrap}

  /* Plateau warning — card style */
  .ld-plateau-warn{display:flex;align-items:flex-start;gap:.5rem;padding:.5rem .6rem;background:rgba(240,160,48,.06);border:1px solid rgba(240,160,48,.25);border-radius:8px;font-size:10px;color:#F0A030}
  .ld-plateau-icon-wrap{flex-shrink:0;margin-top:1px}
  .ld-plateau-text{display:flex;flex-direction:column;gap:1px}
  .ld-plateau-title{font-weight:700;font-size:11px}
  .ld-plateau-desc{color:var(--mt);font-size:9px}

  /* Fluency bar */
  .ld-fluency-cell{display:flex;flex-direction:column;gap:1px;min-width:40px}
  .ld-fluency-bar{width:100%;height:3px;background:var(--sf2);border-radius:2px;overflow:hidden}
  .ld-fluency-fill{height:100%;border-radius:2px;transition:width .3s}
  .ld-fluency-cell span{font-size:9px}

  .ld-empty{text-align:center;color:var(--mt);padding:1.5rem;font-size:12px}

  @media(max-width:600px){
    .ld-panel{padding:.5rem}
    .ld-metrics{grid-template-columns:1fr 1fr}
    .ld-metric-value{font-size:14px}
    .ld-type-name{width:60px;font-size:8px}
    .ld-type-clusters{padding-left:68px}
  }
</style>
