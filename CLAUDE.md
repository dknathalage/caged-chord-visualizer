## Codebase

SvelteKit SPA with static adapter for GitHub Pages deployment.

```
src/lib/
  constants/music.js          # NOTES, A4, TUNINGS, INTERVALS, CHORD_TYPES
  audio/                      # YIN pitch detection, mic lifecycle, tone synthesis
  music/                      # Fretboard math, CAGED chord resolution, SVG rendering
  learning/                   # Adaptive engine — see learning/CLAUDE.md for algorithm details
  components/challenges/      # Hold detection state machine for mic exercises
src/routes/
  caged/        # CAGED Chord Visualizer
  tuner/        # Guitar Tuner
  exercises/    # Mic-based: note-find, string-traversal, interval
  theory/       # Tap-based: fretboard-quiz, interval-namer, chord-speller
```

Algorithm documentation: `src/lib/learning/CLAUDE.md` and `README.md`

### Code Conventions

- Svelte 5 runes: `$state()`, `$derived()`, `$effect()`, `$props()`
- Abbreviated names: `ri` = root index, `ct` = chord type, `sh` = shape, `bf` = base fret
- ALL_CAPS for constants: `CFG`, `MAX_FO`, `NF`
- SVG rendering via pure functions, scoped `<style>` blocks
- `{ base }` from `$app/paths` for all internal links
- `AudioManager` class for mic lifecycle; `onDestroy` cleanup on navigation
- Exercise configs are self-contained — all domain logic lives in the config, not the engine

### Agent Coordination Rules

- The **main agent** coordinates only — it must never read, write, or edit source code directly
- All code work is delegated to teammate agents via the Task tool
- Main agent responsibilities: task creation, assignment, review, and user communication
- Teammate agents own specific files and must not modify files outside their scope
