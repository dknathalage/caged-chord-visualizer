<script>
  import { CHORD_CONFIG } from '$lib/music/chords.js';

  let { chord, color } = $props();

  const FRET_LEFT = 42;
  const FRET_RIGHT = 210;
  const TOP = 28;
  const FRET_HEIGHT = 34;
  const NUM_FRETS = 4;
  const STRING_SPACING = (FRET_RIGHT - FRET_LEFT) / 5;
  const DOT_RADIUS = 11;
  const WIDTH = FRET_RIGHT + 16;
  const HEIGHT = TOP + NUM_FRETS * FRET_HEIGHT + 20;

  let isOpen = $derived(chord.baseFret === 0);
  let voiceMap = $derived(new Map(chord.voices.map(v => [v.str, v])));

  function stringX(stringIndex) {
    return FRET_LEFT + stringIndex * STRING_SPACING;
  }

  function fretY(fretIndex) {
    return TOP + fretIndex * FRET_HEIGHT;
  }

  function stringWidth(stringIndex) {
    return 2.2 - stringIndex * 0.25;
  }

  function fretNumbers() {
    const nums = [];
    for (let i = 0; i < NUM_FRETS; i++) {
      nums.push({
        x: FRET_LEFT - 16,
        y: TOP + i * FRET_HEIGHT + FRET_HEIGHT / 2,
        label: (isOpen ? 1 : chord.baseFret) + i
      });
    }
    return nums;
  }

  let barreInfo = $derived.by(() => {
    if (chord.barreStrs.length < 2 || isOpen) return null;
    const minStr = Math.min(...chord.barreStrs);
    const maxStr = Math.max(...chord.barreStrs);
    return {
      x: stringX(minStr) - 4,
      y: TOP + FRET_HEIGHT / 2 - 5,
      width: stringX(maxStr) - stringX(minStr) + 8,
      height: 10
    };
  });

  let visibleVoices = $derived.by(() => {
    return chord.voices
      .filter(v => !(isOpen && v.fretOffset === 0))
      .map(v => {
        const adjustedOffset = isOpen ? v.fretOffset - 1 : v.fretOffset;
        const x = stringX(v.str);
        const y = TOP + adjustedOffset * FRET_HEIGHT + FRET_HEIGHT / 2;
        const isRootOnRootString = v.isRoot && chord.rootStrs.includes(v.str);
        const fontSize = v.note.length > 1 ? 11 : 16;
        const radius = isRootOnRootString ? DOT_RADIUS + 1 : DOT_RADIUS;
        return { ...v, x, y, isRootOnRootString, fontSize, radius };
      });
  });
</script>

<svg viewBox="0 0 {WIDTH} {HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect
    x={FRET_LEFT - 4}
    y={TOP}
    width={FRET_RIGHT - FRET_LEFT + 8}
    height={NUM_FRETS * FRET_HEIGHT}
    rx="3"
    fill="#1a1a2e"
  />

  <!-- Top annotations: muted strings and interval names -->
  {#each { length: 6 } as _, i}
    {#if chord.muted.includes(i)}
      <text
        x={stringX(i)}
        y={TOP - 12}
        text-anchor="middle"
        dominant-baseline="central"
        fill="#444"
        font-size="14"
        font-weight="bold"
        font-family="JetBrains Mono"
      >&times;</text>
    {:else if voiceMap.has(i)}
      <text
        x={stringX(i)}
        y={TOP - 12}
        text-anchor="middle"
        dominant-baseline="central"
        fill={color}
        font-size="14"
        font-weight="bold"
        font-family="JetBrains Mono"
      >{voiceMap.get(i).interval}</text>
    {/if}
  {/each}

  <!-- Fret lines -->
  {#each { length: NUM_FRETS + 1 } as _, i}
    {#if i === 0}
      <rect
        x={FRET_LEFT - 2}
        y={fretY(i) - 2}
        width={FRET_RIGHT - FRET_LEFT + 4}
        height="4"
        rx="2"
        fill="#ddd"
      />
    {:else}
      <line
        x1={FRET_LEFT}
        y1={fretY(i)}
        x2={FRET_RIGHT}
        y2={fretY(i)}
        stroke="#333"
        stroke-width="1.2"
      />
    {/if}
  {/each}

  <!-- String lines and string names -->
  {#each { length: 6 } as _, i}
    <line
      x1={stringX(i)}
      y1={TOP}
      x2={stringX(i)}
      y2={TOP + NUM_FRETS * FRET_HEIGHT}
      stroke="#444"
      stroke-width={stringWidth(i)}
    />
    <text
      x={stringX(i)}
      y={TOP + NUM_FRETS * FRET_HEIGHT + 12}
      text-anchor="middle"
      dominant-baseline="central"
      fill="#444"
      font-size="16"
      font-family="JetBrains Mono"
    >{CHORD_CONFIG.stringNames[i]}</text>
  {/each}

  <!-- Fret numbers -->
  {#each fretNumbers() as fn}
    <text
      x={fn.x}
      y={fn.y}
      text-anchor="middle"
      dominant-baseline="central"
      fill="#444"
      font-size="16"
      font-family="JetBrains Mono"
    >{fn.label}</text>
  {/each}

  <!-- Barre indicator -->
  {#if barreInfo}
    <rect
      x={barreInfo.x}
      y={barreInfo.y}
      width={barreInfo.width}
      height={barreInfo.height}
      rx="5"
      fill={color}
      opacity="0.75"
    />
  {/if}

  <!-- Voice dots -->
  {#each visibleVoices as v}
    <circle cx={v.x} cy={v.y} r={v.radius} fill={color} />
    <text
      x={v.x}
      y={v.y}
      text-anchor="middle"
      dominant-baseline="central"
      fill="#fff"
      font-size={v.fontSize}
      font-weight="bold"
      font-family="JetBrains Mono"
    >{v.note}</text>
  {/each}
</svg>
