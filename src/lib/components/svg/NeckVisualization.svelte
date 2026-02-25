<script>
  import { CHORD_CONFIG, adaptShapeToTuning, getBaseFret, resolve } from '$lib/music/chords.js';

  let { rootIndex, chordType, currentShape = null } = $props();

  const NUM_FRETS = 15;
  const WIDTH = 700;
  const HEIGHT = 155;
  const NECK_LEFT = 35;
  const NECK_RIGHT = 680;
  const NECK_TOP = 25;
  const NECK_HEIGHT = 85;
  const FRET_WIDTH = (NECK_RIGHT - NECK_LEFT) / (NUM_FRETS + 1);
  const SINGLE_DOT_FRETS = [3, 5, 7, 9, 15];
  const DOUBLE_DOT_FRET = 12;

  function stringY(stringIndex) {
    return NECK_TOP + 10 + (5 - stringIndex) * (NECK_HEIGHT - 20) / 5;
  }

  // Memoize adapted shapes: recompute only when CHORD_CONFIG.shapes changes
  let cachedShapesRef = null;
  let cachedAdapted = null;
  function getAdaptedShapes() {
    if (cachedShapesRef !== CHORD_CONFIG.shapes) {
      cachedShapesRef = CHORD_CONFIG.shapes;
      cachedAdapted = CHORD_CONFIG.shapes.map(adaptShapeToTuning);
    }
    return cachedAdapted;
  }

  let adapted = $derived(getAdaptedShapes());

  let shapes = $derived(
    adapted
      .map(sh => ({
        id: sh.id,
        label: sh.label,
        color: CHORD_CONFIG.shapeColors[sh.id],
        baseFret: getBaseFret(sh, rootIndex)
      }))
      .sort((a, b) => a.baseFret - b.baseFret)
  );

  let filteredShapes = $derived(
    currentShape ? shapes.filter(sh => sh.id === currentShape) : shapes
  );

  let filteredAdapted = $derived(
    currentShape ? adapted.filter(sh => sh.id === currentShape) : adapted
  );

  let shapeZones = $derived(
    filteredShapes.map(sh => {
      let x = NECK_LEFT + (sh.baseFret - 1) * FRET_WIDTH;
      let zoneWidth = 3.5 * FRET_WIDTH;
      const xEnd = Math.min(x + zoneWidth, NECK_RIGHT);
      x = Math.max(x, NECK_LEFT);
      zoneWidth = xEnd - x;
      return { ...sh, x, zoneWidth, fretLabel: sh.baseFret === 0 ? 'open' : 'fr' + sh.baseFret };
    })
  );

  let resolvedShapes = $derived(
    filteredAdapted.map(shapeDefinition => {
      const shapeColor = CHORD_CONFIG.shapeColors[shapeDefinition.id];
      const resolved = resolve(shapeDefinition, rootIndex, chordType.iv);
      const barreVoices = resolved.voices.filter(v => v.fretOffset === 0);
      let barre = null;

      if (barreVoices.length >= 2) {
        const barreStrings = barreVoices.map(v => v.str);
        const minStr = Math.min(...barreStrings);
        const maxStr = Math.max(...barreStrings);
        const barreX = NECK_LEFT + (resolved.baseFret - 0.5) * FRET_WIDTH;
        const barreY1 = stringY(maxStr);
        const barreY2 = stringY(minStr);
        if (resolved.baseFret >= 1 && resolved.baseFret <= NUM_FRETS) {
          barre = {
            x: barreX - 2.5,
            y: Math.min(barreY1, barreY2) - 3.5,
            width: 5,
            height: Math.abs(barreY2 - barreY1) + 7
          };
        }
      }

      const voiceDots = resolved.voices
        .filter(v => {
          const absoluteFret = resolved.baseFret + v.fretOffset;
          return absoluteFret >= 0 && absoluteFret <= NUM_FRETS;
        })
        .map(v => {
          const absoluteFret = resolved.baseFret + v.fretOffset;
          const cx = absoluteFret === 0 ? NECK_LEFT + 2 : NECK_LEFT + (absoluteFret - 0.5) * FRET_WIDTH;
          const cy = stringY(v.str);
          const fontSize = v.note.length > 1 ? 7 : 9;
          const radius = v.isRoot ? 6.5 : 6;
          return { ...v, cx, cy, fontSize, radius };
        });

      return { id: shapeDefinition.id, color: shapeColor, barre, voiceDots };
    })
  );

  let fretLines = $derived(
    Array.from({ length: NUM_FRETS }, (_, i) => ({
      x: NECK_LEFT + (i + 1) * FRET_WIDTH,
      y1: NECK_TOP,
      y2: NECK_TOP + NECK_HEIGHT
    }))
  );

  let strings = $derived(
    Array.from({ length: 6 }, (_, i) => ({
      y: stringY(i),
      width: 0.6 + i * 0.12,
      name: CHORD_CONFIG.stringNames[i]
    }))
  );

  let fretNumbers = $derived(
    Array.from({ length: NUM_FRETS }, (_, i) => ({
      x: NECK_LEFT + (i + 0.5) * FRET_WIDTH,
      label: i + 1
    }))
  );

  let singleDots = $derived(
    SINGLE_DOT_FRETS.filter(f => f <= NUM_FRETS).map(f => ({
      cx: NECK_LEFT + (f - 0.5) * FRET_WIDTH,
      cy: NECK_TOP + NECK_HEIGHT + 26
    }))
  );

  let hasDoubleDot = $derived(NUM_FRETS >= DOUBLE_DOT_FRET);
  let doubleDotX = $derived(NECK_LEFT + 11.5 * FRET_WIDTH);
</script>

<svg viewBox="0 0 {WIDTH} {HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <!-- Neck background -->
  <rect x={NECK_LEFT} y={NECK_TOP} width={NECK_RIGHT - NECK_LEFT} height={NECK_HEIGHT} rx="4" fill="#1a1a2e" />

  <!-- Nut -->
  <rect x={NECK_LEFT} y={NECK_TOP} width="4" height={NECK_HEIGHT} rx="2" fill="#ddd" />

  <!-- Fret lines -->
  {#each fretLines as fl}
    <line x1={fl.x} y1={fl.y1} x2={fl.x} y2={fl.y2} stroke="#333" stroke-width="1.2" />
  {/each}

  <!-- Strings and string labels -->
  {#each strings as s, i}
    <line x1={NECK_LEFT} y1={s.y} x2={NECK_RIGHT} y2={s.y} stroke="#444" stroke-width={s.width} />
    <text x={NECK_LEFT - 12} y={s.y + 3} text-anchor="middle" fill="#444" font-size="9" font-family="JetBrains Mono">{s.name}</text>
  {/each}

  <!-- Fret numbers -->
  {#each fretNumbers as fn}
    <text x={fn.x} y={NECK_TOP + NECK_HEIGHT + 16} text-anchor="middle" fill="#444" font-size="9" font-family="JetBrains Mono">{fn.label}</text>
  {/each}

  <!-- Single position dots -->
  {#each singleDots as dot}
    <circle cx={dot.cx} cy={dot.cy} r="2" fill="#333" />
  {/each}

  <!-- Double dot at fret 12 -->
  {#if hasDoubleDot}
    <circle cx={doubleDotX - 4} cy={NECK_TOP + NECK_HEIGHT + 26} r="2" fill="#333" />
    <circle cx={doubleDotX + 4} cy={NECK_TOP + NECK_HEIGHT + 26} r="2" fill="#333" />
  {/if}

  <!-- Shape zones (colored backgrounds, labels) -->
  {#each shapeZones as zone}
    <rect x={zone.x} y={NECK_TOP} width={zone.zoneWidth} height={NECK_HEIGHT} fill={zone.color} opacity=".18" rx="3" />
    <rect x={zone.x} y={NECK_TOP} width={zone.zoneWidth} height="3" fill={zone.color} opacity=".8" rx="1" />
    <text x={zone.x + zone.zoneWidth / 2} y={NECK_TOP - 4} text-anchor="middle" fill={zone.color} font-size="9" font-weight="bold" font-family="Outfit">{zone.label}</text>
    <text x={zone.x + zone.zoneWidth / 2} y={NECK_TOP + NECK_HEIGHT / 2 + 3} text-anchor="middle" fill={zone.color} font-size="9" font-weight="bold" font-family="JetBrains Mono" opacity=".5">{zone.fretLabel}</text>
  {/each}

  <!-- Resolved chord voices per shape -->
  {#each resolvedShapes as shape}
    <!-- Barre indicator -->
    {#if shape.barre}
      <rect
        x={shape.barre.x}
        y={shape.barre.y}
        width={shape.barre.width}
        height={shape.barre.height}
        rx="2.5"
        fill={shape.color}
        opacity=".6"
      />
    {/if}

    <!-- Voice dots -->
    {#each shape.voiceDots as dot}
      <circle cx={dot.cx} cy={dot.cy} r={dot.radius} fill={shape.color} />
      <text
        x={dot.cx}
        y={dot.cy}
        text-anchor="middle"
        dominant-baseline="central"
        fill="#fff"
        font-size={dot.fontSize}
        font-weight="bold"
        font-family="JetBrains Mono"
      >{dot.note}</text>
    {/each}
  {/each}
</svg>
