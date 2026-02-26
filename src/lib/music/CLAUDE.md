# Music Theory & Rendering

Fretboard math, CAGED chord resolution, and SVG rendering for fretboard and chord diagrams.

## Module Map

```
fretboard.js     # Fretboard geometry, note math, SVG rendering, scale sequences
fretboard.test.js
chords.js        # CAGED shapes, chord resolution, diagram/neck SVG rendering
chords.test.js
```

## Fretboard — `fretboard.js`

### Note Math

| Function | Signature | Description |
|----------|-----------|-------------|
| `noteAt` | `(s, f) → string` | Note name at string `s`, fret `f` in standard tuning |
| `fretForNote` | `(s, n, max) → number[]` | All fret positions for note `n` on string `s` up to `max` |
| `nearestLandmark` | `(fret) → number` | Closest inlay fret: 0, 3, 5, 7, 9, or 12 |
| `landmarkZone` | `(fret) → string` | Zone ID: `'zone_0'` through `'zone_12'` |
| `scaleSequence` | `(rootIndex, intervals, startFret, maxFret) → Note[]` | Generate scale notes across 6 strings in a 5-fret span, sorted by MIDI pitch |

### Layout Constants

`FRETBOARD_LAYOUT` — configurable dimensions:
- `VISIBLE_FRETS: 7` — frets shown in sliding window
- `FRET_WIDTH: 58` — pixels per fret
- `STRING_HEIGHT: 36` — pixels between strings
- `DOT_RADIUS: 16` — note dot size

`LANDMARKS = [0, 3, 5, 7, 9, 12]` — frets with inlay markers (kinesthetic reference points)

### SVG Renderers

| Function | Description |
|----------|-------------|
| `drawBoard(startFret, dotsFn)` | Shared fretboard SVG: board, strings, fret numbers, inlays. Calls `dotsFn(layout)` for note markers. |
| `computeStartFret(targetFret)` | Center a 7-fret window on target fret |
| `renderNoteFretboard(target, detected, isCorrect)` | Fretboard with a single highlighted note (blue or green) |
| `renderMiniFretboard(str, fret)` | Fretboard with a purple "?" dot (for quizzes) |
| `getFretboardDimensions()` | Returns `{W, H}` viewBox dimensions |

### Other Exports

- `NATURAL_NOTES` — `['C','D','E','F','G','A','B']`
- `STANDARD_TUNING` — standard tuning pitch classes from `TUNINGS.std`
- `STRING_NAMES` — `['E','A','D','G','B','e']`
- `BASE_MIDI` — re-exported from constants
- `shuffle(arr)` — Fisher-Yates in-place shuffle

## Chords — `chords.js`

### CAGED System

5 standard shapes (E, A, D, C, G) that tile the entire fretboard. Each shape defines:
- `rootStr` — strings where the root note sits
- `muted` — strings to mute
- `voices` — `{str, fretOffset}` per sounding string
- `barreOffset` — shift for barre positioning (C and G shapes)

`SHAPE_COLORS` — consistent colors: E=blue, A=orange, D=purple, C=red, G=green

### Multi-Tuning Support

`CHORD_CONFIG` — mutable config object with shapes, tuning, and colors per tuning. Contains tuning-specific shape definitions for all 6 supported tunings (standard shapes adapted for Drop D, Open G, Open D, DADGAD).

| Function | Description |
|----------|-------------|
| `setTuning(id)` | Switch `CHORD_CONFIG` to a different tuning |
| `adaptShapeToTuning(sh)` | Compute `rootBase` and voice base intervals for current tuning |
| `getBaseFret(sh, ri)` | Base fret for shape `sh` at root index `ri` |

### Chord Resolution — `resolve(sh, ri, iv)`

Resolves a chord type in a CAGED shape at any root:

1. Calculate base fret for the shape at root `ri`
2. For each voice, find the closest chord interval within ±3 fret offset
3. If an interval is missing, reassign duplicate voices to fill gaps
4. Output: `{ baseFret, voices[], muted[], barreStrs[], rootStrs[] }`

Each voice: `{ str, fretOffset, note, semi, interval, isRoot }`

### SVG Renderers

| Function | Description |
|----------|-------------|
| `renderDiagram(resolved, color)` | 4-fret chord diagram with muted strings (×), interval labels, barre bars, root highlights |
| `renderNeck(ri, ct, curShape?)` | 15-fret neck overview with all CAGED shapes, zone overlays, optional shape filtering |

### Abbreviated Names

- `ri` — root index (0–11, C=0)
- `ct` — chord type object (from `CHORD_TYPES`)
- `sh` — shape object (from `STANDARD_SHAPES`)
- `bf` — base fret
- `NF` — number of frets
- `SP` — string spacing (pixels)
- `FH` — fret height (pixels)
- `DR` — dot radius (pixels)
