# Routes

SvelteKit SPA routes. Static adapter (`prerender = true`) for GitHub Pages deployment.

## Route Map

```
+layout.js            # prerender = true (static export)
+layout.svelte        # Root layout: Toast container + children
+page.svelte          # Home — mastery overview, nav to Practice/Tuner
caged/
  +page.svelte        # CAGED Chord Visualizer
practice/
  +layout.js          # prerender = true
  +page.svelte        # Main practice interface (unified learning engine)
tuner/
  +page.svelte        # Chromatic guitar tuner
```

## Pages

### Home (`+page.svelte`)

Landing page with:
- Overall mastery ring (from `loadUnifiedMastery()`)
- Per-exercise-type progress bars
- Navigation to Practice and Tuner
- Floating Tuner FAB button

### Practice (`practice/+page.svelte`)

Main adaptive practice interface. Two states:

**Idle:** mastery display, exercise type progress bars, start button

**Active:** challenge component + pitch display + controls. Renders the appropriate challenge component based on the learning engine's selected exercise type.

Stats panels (expandable):
- SESSION: question count, accuracy, streak
- ENGINE: theta, pL distribution, exploration/exploitation balance
- COVERAGE: string × zone heatmap

Side panel: `LearningDashboard` with full stats.

### CAGED Visualizer (`caged/+page.svelte`)

Interactive chord shape explorer:
- Root note selector (12 chromatic pills)
- Chord type selector (12 types)
- Tuning selector (6 presets + custom)
- Per-shape cards with `ChordDiagram` SVG
- Full `NeckVisualization` showing all shapes across 15 frets
- Optional shape filtering (click to isolate)

### Tuner (`tuner/+page.svelte`)

Chromatic guitar tuner:
- Real-time detected note + cents deviation indicator
- 6 string displays with color-coded tuning status (sharp/flat/in-tune)
- Custom tuning editor (click string to change target note)
- Preset management with localStorage persistence
- Supports all 6 built-in tunings + user-created custom presets

## Shared Patterns

- All routes use `{ base }` from `$app/paths` for internal links (required for GitHub Pages subpath)
- Mic-based pages create `AudioManager` in `onMount` and clean up in `onDestroy`
- Learning engine state persists in `localStorage` via `gl_learn_practice` key
- Exercise progress persists via `gl_progress` key
