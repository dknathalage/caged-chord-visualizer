# CAGED Chord Visualizer

Interactive CAGED system visualizer for guitar — shows all 5 chord shapes (C, A, G, E, D) across the fretboard for any key and 12 chord types.

Live: https://dknathalage.github.io/caged-chord-visualizer/

## Tech Stack

Pure vanilla web — no build tools, no bundler, no package manager.

- **HTML/CSS/JS** — plain ES6, no frameworks
- **SVG** — chord diagrams and neck overview rendered via string concatenation
- **Fonts** — Google Fonts (JetBrains Mono, Outfit)
- **Deployment** — GitHub Pages from `main` branch

## Project Structure

```
index.html          # Entry point, semantic HTML, SEO meta tags
caged.js            # All application logic (config, algorithm, rendering, UI)
caged.css           # Styles — dark theme, responsive, CSS custom properties
CHORD_REFERENCE.md  # Ground truth voicing tables for all chord types
```

## Running Locally

No server required. Open `index.html` directly in a browser, or:

```bash
python3 -m http.server 8000
```

## Architecture

### State

Global variables: `curRoot` (note index 0-11), `curType` (chord type id), `curShape` (selected shape or null), `curLayer` (keyboard nav layer), `kbActive`.

### Core Algorithm (`caged.js`)

1. **`CFG`** — configuration object with notes, tuning, intervals, shape templates, chord type definitions
2. **`adaptShape(sh)`** — precomputes base interval for each voice in a shape
3. **`getBf(sh, ri)`** — calculates the base fret for a shape at a given root
4. **`resolve(sh, ri, iv)`** — maps shape template voices to actual chord tones (two-pass: greedy match, then reassign duplicates for missing intervals)
5. **`renderDiagram(r, color)`** — generates SVG for a single chord diagram
6. **`renderNeck(ri, ct)`** — generates SVG for full neck overview with all shape zones
7. **`U()`** — main render function, rebuilds all UI on every interaction

### Shape Definitions

Each shape has: `id`, `rootStr` (which strings carry the root), `muted` (default muted strings), `voices` (string + fret offset pairs), and optional `barreOffset` (for C and G shapes where the barre sits below the root).

## Code Conventions

- **Abbreviated names** throughout: `ri` = root index, `ct` = chord type, `sh` = shape, `bf` = base fret, `fo` = fret offset, `iv` = intervals, `v` = voice
- **ALL_CAPS** for constants: `CFG`, `MAX_FO`, `NF`, `FRET_L`, `FRET_R`
- **Short CSS classes**: `.ctr`, `.hdr`, `.ns`, `.nc`, `.li`, `.ld`
- **Single function names** where possible: `U()` for update/render
- Keep code compact — this is intentionally terse
- SVG built via string concatenation (not DOM APIs)

## Key Design Decisions

- No frameworks — keeps it zero-dependency and instant-loading
- All rendering is synchronous and rebuilds fully on each interaction (no diffing needed at this scale)
- Chord voicings are algorithmically generated from shape templates, not hardcoded
- `CHORD_REFERENCE.md` serves as a test oracle — voicings can be verified against it
