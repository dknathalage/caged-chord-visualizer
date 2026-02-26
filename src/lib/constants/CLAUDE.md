# Music Constants

Immutable music theory data shared across the app. Single source of truth for note names, tunings, intervals, chords, scales, and modes.

## Module: `music.js`

### Note Data

| Export | Type | Description |
|--------|------|-------------|
| `NOTES` | `string[12]` | `['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']` — chromatic scale |
| `NOTE_DISPLAY` | `string[12]` | Enharmonic display names: `'C#/Db'`, `'D#/Eb'`, etc. |
| `A4` | `number` | 440 Hz reference pitch |
| `BASE_MIDI` | `number[6]` | MIDI note numbers for open strings in standard tuning: `[40, 45, 50, 55, 59, 64]` (E2–E4) |
| `INTERVAL_NAMES` | `object` | Semitone → symbol map: `{0:'R', 1:'♭2', 2:'2', ..., 11:'7'}` |

### Tunings

`TUNINGS` — 6 guitar tunings, each with:
- `id`, `name`, `label` — identifiers
- `tuning: number[6]` — pitch class per string (0=C through 11=B)
- `stringNames: string[6]` — display names

| ID | Name | Notes |
|----|------|-------|
| `std` | Standard | E A D G B E |
| `halfDown` | Half Step Down | E♭ A♭ D♭ G♭ B♭ e♭ |
| `dropD` | Drop D | D A D G B E |
| `openG` | Open G | D G D G B D |
| `openD` | Open D | D A D F# A D |
| `dadgad` | DADGAD | D A D G A D |

### Intervals

`INTERVALS` — 12 intervals within one octave:

Each entry: `{ semi, name, abbr }` — e.g. `{ semi: 7, name: 'Perfect 5th', abbr: 'P5' }`

### Chord Types

`CHORD_TYPES` — 12 chord types:

Each entry: `{ id, name, sym, iv, fm }` where:
- `iv: number[]` — interval semitones from root (e.g. major = `[0, 4, 7]`)
- `fm: string[]` — formula display (e.g. `['R', '3', '5']`)

Types: maj, min, 7, maj7, m7, sus2, sus4, dim, dim7, aug, add9, 5 (power)

### Scales & Modes

`SCALES` — 4 common scales: major, natural minor, major pentatonic, minor pentatonic

`MODES` — 7 modes of the major scale: Ionian through Locrian. Each includes `degree` (scale degree) and `chars` (characteristic intervals).
