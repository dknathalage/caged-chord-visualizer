# UI Components

Svelte 5 components for challenges (mic/tap exercises), SVG visualization, and UI widgets.

## Module Map

```
challenges/
  NoteFind.svelte           # Play the note shown on fretboard (mic)
  StringTraversal.svelte    # Navigate notes across strings (mic)
  IntervalTrainer.svelte    # Play intervals by ear (mic)
  ChordPlayer.svelte        # Play chord voicings (mic)
  ChordToneFind.svelte      # Find individual chord tones (mic)
  ChordRecognition.svelte   # Identify strummed chords via audio analysis (mic)
  ChordTransition.svelte    # Smooth chord transitions (mic)
  ScaleRunner.svelte        # Play scale sequences in order (mic)
  ModeTrainer.svelte        # Play modal sequences (mic)
  RhythmTrainer.svelte      # Match rhythm patterns (mic)
  StrumPatternTrainer.svelte # Master strum patterns (mic)
  PitchDisplay.svelte       # Real-time pitch detection readout
  holdDetection.js          # Hold detection state machine
  seqFretboard.js           # Sequence fretboard renderer for scales/modes
svg/
  Fretboard.svelte          # Generic fretboard template with slot for dots
  ChordDiagram.svelte       # 4-fret chord diagram (wraps chords.renderDiagram)
  NeckVisualization.svelte  # 15-fret CAGED neck overlay (wraps chords.renderNeck)
  NoteDot.svelte            # Reusable circle + label component
  ProgressRing.svelte       # Circular progress indicator
  ThetaSparkline.svelte     # Theta history mini line chart
  CoverageHeatmap.svelte    # 6×6 string/zone heatmap
LearningDashboard.svelte    # Side-drawer stats panel with gauges and tables
Toast.svelte                # Toast notification container
```

## Challenge Components

All mic-based challenges follow a common pattern:

1. Receive `AudioManager` events (`'detect'`, `'silence'`, `'chord'`, `'onset'`)
2. Use `holdDetection.js` state machine for sustained-note exercises
3. Report results to the learning engine via callbacks
4. Render fretboard/diagram SVG with current target and detected state

### Hold Detection — `holdDetection.js`

`createHoldDetector(params)` returns a state machine:
- `check(note, cents)` — feed detected note, returns `{held, progress}` when correct note sustained
- `reset()` — clear state for new target
- `resetAfterVoice()` — partial reset between voices in multi-note exercises
- `setTheta(theta)` — adapts hold duration based on skill level (easier = shorter hold)

Parameters from `DEFAULTS.holdDetection`: base hold time, theta scaling, cent tolerance.

### Sequence Fretboard — `seqFretboard.js`

`renderSeqFB(seq, currentIdx, startFret)` — renders a fretboard showing a scale/mode sequence with color coding:
- Green: already played
- Bright/pulsing: current target
- Blue: upcoming notes

### PitchDisplay — `PitchDisplay.svelte`

Real-time pitch detection readout:
- Detected note name (color-coded: green=correct, red=wrong, blue=neutral)
- Cents offset bar with moving indicator
- Frequency in Hz
- Optional RMS dB level meter
- Articulation badges (Vibrato, Bend, Stable) when features enabled

## SVG Components

All SVG components use Svelte 5 `$props()` and render inline SVG.

### Fretboard.svelte

Generic fretboard template — renders board structure (strings, frets, nut, inlays, string labels, fret numbers). Uses a Svelte `{@render}` snippet slot for note dots, passing layout params.

### Visualization Components

| Component | Props | Description |
|-----------|-------|-------------|
| `ProgressRing` | `pct, color, size` | Circular arc showing percent complete |
| `ThetaSparkline` | `history` | Mini line chart of theta over time |
| `CoverageHeatmap` | `coverage` | 6×6 grid, color by avgPL, opacity by count |

## LearningDashboard.svelte

Resizable side-drawer showing:
- Gauge arcs: mastery %, accuracy %, average pL
- Per-exercise-type mastery with cluster breakdowns
- Sortable items table (key, pL, attempts, streak, etc.)
- Real-time polling when drawer is open
- Drag handle for resizing
