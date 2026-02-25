<script>
  import { STRING_NAMES } from '$lib/music/fretboard.js';

  let { startFret = 0, children } = $props();

  const VISIBLE_FRETS = 7;
  const FRET_WIDTH = 58;
  const STRING_HEIGHT = 36;
  const DOT_RADIUS = 16;

  const margin = DOT_RADIUS * 2.5;
  const fretLeft = margin;
  const fretRight = fretLeft + VISIBLE_FRETS * FRET_WIDTH;
  const topMargin = DOT_RADIUS * 1.8;
  const width = Math.ceil(fretRight + margin * 0.5);
  const height = Math.ceil(topMargin + 6 * STRING_HEIGHT + DOT_RADIUS * 1.5);
  const nutWidth = Math.max(4, DOT_RADIUS * 0.35);
  const fretLineWidth = Math.max(1, FRET_WIDTH * 0.035);
  const inlayRadius = Math.max(2, DOT_RADIUS * 0.2);

  const isOpen = $derived(startFret === 0);

  const fretLines = Array.from({ length: VISIBLE_FRETS + 1 }, (_, i) => ({
    index: i,
    x: fretLeft + i * FRET_WIDTH,
  }));

  const strings = Array.from({ length: 6 }, (_, i) => {
    const reverseIndex = 5 - i;
    const y = topMargin + i * STRING_HEIGHT + STRING_HEIGHT / 2;
    const strokeWidth = STRING_HEIGHT * 0.075 - reverseIndex * STRING_HEIGHT * 0.009;
    return { index: i, reverseIndex, y, strokeWidth, label: STRING_NAMES[reverseIndex] };
  });

  const fretNumbers = Array.from({ length: VISIBLE_FRETS }, (_, i) => ({
    x: fretLeft + i * FRET_WIDTH + FRET_WIDTH / 2,
    label: i, // offset by startFret in template
  }));

  const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
  const DOUBLE_INLAY = 12;

  const snippetParams = {
    fretLeft,
    topMargin,
    stringHeight: STRING_HEIGHT,
    fretWidth: FRET_WIDTH,
    dotRadius: DOT_RADIUS,
    visibleFrets: VISIBLE_FRETS,
  };
</script>

<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Board background -->
  <rect
    x={fretLeft - nutWidth}
    y={topMargin}
    width={fretRight - fretLeft + 2 * nutWidth}
    height={6 * STRING_HEIGHT}
    rx={nutWidth}
    fill="#1a1a2e"
  />

  <!-- Fret lines / nut -->
  {#each fretLines as fret}
    {#if fret.index === 0 && isOpen}
      <rect
        x={fret.x - nutWidth / 2}
        y={topMargin}
        width={nutWidth}
        height={6 * STRING_HEIGHT}
        rx={nutWidth / 2}
        fill="#ddd"
      />
    {:else}
      <line
        x1={fret.x}
        y1={topMargin}
        x2={fret.x}
        y2={topMargin + 6 * STRING_HEIGHT}
        stroke="#333"
        stroke-width={fretLineWidth}
      />
    {/if}
  {/each}

  <!-- Strings and labels -->
  {#each strings as s}
    <line
      x1={fretLeft}
      y1={s.y}
      x2={fretRight}
      y2={s.y}
      stroke="#444"
      stroke-width={s.strokeWidth}
    />
    <text
      x={margin * 0.4}
      y={s.y}
      text-anchor="middle"
      dominant-baseline="central"
      fill="#444"
      font-size={DOT_RADIUS}
      font-family="JetBrains Mono"
    >{s.label}</text>
  {/each}

  <!-- Fret numbers -->
  {#each fretNumbers as fn}
    <text
      x={fn.x}
      y={topMargin + 6 * STRING_HEIGHT + DOT_RADIUS * 1.1}
      text-anchor="middle"
      fill="#444"
      font-size={DOT_RADIUS * 0.85}
      font-family="JetBrains Mono"
    >{startFret + fn.label + 1}</text>
  {/each}

  <!-- Inlay markers -->
  {#each fretNumbers as fn}
    {@const fretNum = startFret + fn.label + 1}
    {#if SINGLE_INLAYS.includes(fretNum)}
      <circle
        cx={fn.x}
        cy={topMargin - inlayRadius * 2.5}
        r={inlayRadius}
        fill="#333"
      />
    {/if}
    {#if fretNum === DOUBLE_INLAY}
      <circle
        cx={fn.x - inlayRadius * 2}
        cy={topMargin - inlayRadius * 2.5}
        r={inlayRadius}
        fill="#333"
      />
      <circle
        cx={fn.x + inlayRadius * 2}
        cy={topMargin - inlayRadius * 2.5}
        r={inlayRadius}
        fill="#333"
      />
    {/if}
  {/each}

  <!-- Consumer-injected dots via snippet -->
  {#if children}
    {@render children({ ...snippetParams, startFret })}
  {/if}
</svg>
