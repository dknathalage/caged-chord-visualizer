<script>
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { markVisited } from '$lib/progress.js';
  import { NOTES } from '$lib/constants/music.js';

  onMount(() => markVisited('caged-visualizer'));
  import { CHORD_CONFIG, setTuning, adaptShapeToTuning, getBaseFret, resolve } from '$lib/music/chords.js';
  import ChordDiagram from '$lib/components/svg/ChordDiagram.svelte';
  import NeckVisualization from '$lib/components/svg/NeckVisualization.svelte';

  let curType = $state('maj');
  let curRoot = $state(0);
  let curShape = $state(null);
  let curTuning = $state('std');
  let curLayer = $state(0);
  let kbActive = $state(false);

  let chordType = $derived(CHORD_CONFIG.chordTypes.find(c => c.id === curType));
  let rootName = $derived(CHORD_CONFIG.noteDisplay[curRoot]);
  let adapted = $derived(CHORD_CONFIG.shapes.map(adaptShapeToTuning));
  let sortedShapes = $derived([...adapted].sort((a, b) => getBaseFret(a, curRoot) - getBaseFret(b, curRoot)));
  let sortedShapeIds = $derived(sortedShapes.map(s => s.id));

  let chordName = $derived(`${rootName}${chordType.sym}`);
  let tuningDef = $derived(CHORD_CONFIG.tunings[curTuning]);
  let shapeLabel = $derived(curShape ? CHORD_CONFIG.shapes.find(s => s.id === curShape)?.label : 'All Shapes');
  let tuningLabel = $derived(curTuning !== 'std' ? ` (${tuningDef.name})` : '');
  let pageTitle = $derived(`${rootName} ${chordType.name} \u2014 ${shapeLabel}${tuningLabel}`);

  function changeTuning(id) {
    setTuning(id);
    curTuning = id;
    curShape = null;
  }

  function setRoot(i) {
    curRoot = i;
  }

  function pickShape(id) {
    curShape = curShape === id ? null : id;
  }

  function handleKeydown(e) {
    const key = e.key;
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) return;
    e.preventDefault();
    kbActive = true;
    const delta = (key === 'ArrowRight' || key === 'ArrowDown') ? 1 : -1;

    if (key === 'ArrowDown') {
      curLayer = Math.min(curLayer + 1, 2);
    } else if (key === 'ArrowUp') {
      curLayer = Math.max(curLayer - 1, 0);
    } else if (curLayer === 0) {
      curRoot = (curRoot + delta + 12) % 12;
    } else if (curLayer === 1) {
      const idx = CHORD_CONFIG.chordTypes.findIndex(c => c.id === curType);
      const ni = (idx + delta + CHORD_CONFIG.chordTypes.length) % CHORD_CONFIG.chordTypes.length;
      curType = CHORD_CONFIG.chordTypes[ni].id;
    } else if (curLayer === 2) {
      const cycle = [null, ...sortedShapeIds];
      const ci = cycle.indexOf(curShape);
      const ni = (ci + delta + cycle.length) % cycle.length;
      curShape = cycle[ni];
    }
  }

  function handleMousemove() {
    if (!kbActive) return;
    kbActive = false;
  }
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} onmousemove={handleMousemove} />

<div class="ctr">
  <header class="hdr">
    <div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
      <h1><span>{rootName} {chordType.name}</span><br><span>{shapeLabel}{tuningLabel}</span></h1>
      <a href="{base}/" class="pill" style="font-size:13px;text-decoration:none">Home</a>
      <a href="{base}/tuner" class="pill" style="font-size:13px;text-decoration:none">Tuner</a>
    </div>
    <nav class="pill-group" aria-label="Chord selection">
      <div class="row">
        <select
          class="tun-dd"
          aria-label="Tuning"
          value={curTuning}
          onchange={(e) => changeTuning(e.target.value)}
        >
          {#each Object.values(CHORD_CONFIG.tunings) as t}
            <option value={t.id}>{t.name} ({t.label})</option>
          {/each}
        </select>
        <div class="k-pills {kbActive && curLayer === 0 ? 'focus-row' : ''}" role="group" aria-label="Root note">
          {#each CHORD_CONFIG.noteDisplay as n, i}
            <div
              class="pill {i === curRoot ? 'on' : ''}"
              onclick={() => setRoot(i)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRoot(i); } }}
              role="button"
              tabindex="0"
            >{n}</div>
          {/each}
        </div>
      </div>
      <div class="row {kbActive && curLayer === 1 ? 'focus-row' : ''}" role="group" aria-label="Chord type">
        {#each CHORD_CONFIG.chordTypes as c}
          <div
            class="pill {c.id === curType ? 'on' : ''}"
            onclick={() => { curType = c.id; }}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); curType = c.id; } }}
            role="button"
            tabindex="0"
          >{c.name}</div>
        {/each}
      </div>
    </nav>
  </header>
  <main>
    <section
      class="shapes-grid {kbActive && curLayer === 2 ? 'focus-row' : ''}"
      style="grid-template-columns: repeat({CHORD_CONFIG.shapes.length}, 1fr)"
      aria-label="Chord shapes"
    >
      {#each sortedShapes as sh (sh.id)}
        {@const col = CHORD_CONFIG.shapeColors[sh.id]}
        {@const r = resolve(sh, curRoot, chordType.iv)}
        {@const sel = curShape === sh.id}
        <div
          class="shape-card {sel ? 'sel' : ''}"
          style={sel ? `--sel-color:${col}` : ''}
          onclick={() => pickShape(sh.id)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickShape(sh.id); } }}
          role="button"
          tabindex="0"
        >
          <div class="sh-title" style="color:{col}">{sh.label}</div>
          <div class="sh-sub">{r.baseFret === 0 ? 'Open' : 'Fret ' + r.baseFret} &middot; {chordName}</div>
          <div class="fb"><ChordDiagram chord={r} color={col} /></div>
        </div>
      {/each}
    </section>
    <section class="ns" aria-label="Full neck overview">
      <div class="nc"><NeckVisualization rootIndex={curRoot} {chordType} currentShape={curShape} /></div>
      <div class="leg">
        {#each CHORD_CONFIG.shapes as sh}
          <div class="li">
            <div class="ld" style="background:{CHORD_CONFIG.shapeColors[sh.id]}"></div>
            {sh.label}
          </div>
        {/each}
      </div>
    </section>
  </main>
</div>

<style>
  .ctr{display:flex;flex-direction:column;height:100vh;width:100%;padding:.5rem 1rem;gap:.4rem}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;flex-shrink:0;flex-wrap:wrap}
  .pill-group{display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;gap:.4rem}
  .tun-dd{background:var(--sf);color:var(--ac);border:1.5px solid var(--bd);border-radius:20px;padding:.3rem .65rem;font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:600;cursor:pointer;outline:none;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238B949E'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right .6rem center;padding-right:1.6rem}
  .tun-dd:hover{border-color:#555}
  .tun-dd:focus{border-color:var(--ac)}
  .k-pills{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
  .shapes-grid{display:grid;gap:.6rem;flex:1;min-height:0}
  .shape-card{background:var(--sf);border-radius:10px;padding:.5rem .4rem .4rem;border:2px solid var(--bd);text-align:center;cursor:pointer;transition:border-color .15s,box-shadow .15s;display:flex;flex-direction:column;min-height:0;overflow:hidden}
  .shape-card:hover{border-color:#555}
  .shape-card.sel{border-color:var(--sel-color,var(--ac));box-shadow:0 0 12px rgba(255,255,255,.08)}
  .shape-card .sh-title{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;margin-bottom:.1rem;flex-shrink:0}
  .shape-card .sh-sub{font-family:'JetBrains Mono',monospace;font-size:18px;color:var(--mt);margin-bottom:.2rem;flex-shrink:0}
  .shape-card .fb{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
  .shape-card .fb :global(svg){width:100%;height:100%;display:block}
  .ns{flex-shrink:0;margin-top:.3rem}
  .nc{background:var(--sf);border-radius:10px;padding:.5rem;border:1px solid var(--bd);overflow-x:auto}
  .nc :global(svg){display:block;margin:0 auto;min-width:660px}
  .leg{display:flex;justify-content:center;gap:.75rem;margin-top:.3rem;flex-wrap:wrap}
  .li{display:flex;align-items:center;gap:.25rem;font-family:'JetBrains Mono',monospace;font-size:18px;color:var(--mt)}
  .ld{width:10px;height:10px;border-radius:50%}
  .focus-row{outline:1.5px solid var(--ac);outline-offset:2px;border-radius:24px}
  @media(max-width:1000px){.shapes-grid{grid-template-columns:repeat(3,1fr)!important}}
  @media(max-width:600px){
    :global(html),:global(body){height:auto;overflow:visible;overflow-y:scroll;-webkit-overflow-scrolling:touch}
    .ctr{height:auto;min-height:100vh;overflow:visible;padding:.5rem}
    .shapes-grid{grid-template-columns:repeat(2,1fr)!important;flex:none}
    .shape-card{min-height:180px}
    .hdr{flex-direction:column;align-items:flex-start}
    .pill-group{align-items:flex-start}
    .ctr :global(.row){justify-content:flex-start}
    .tun-dd{font-size:13px;padding:.25rem .5rem;padding-right:1.3rem}
    .shape-card .sh-title{font-size:13px}
    .shape-card .sh-sub{font-size:12px}
    .li{font-size:12px}
    .ns{display:none}
  }
</style>
