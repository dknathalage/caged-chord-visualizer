# Learning Engine

Adaptive practice engine that selects items, tracks knowledge, and schedules reviews. Exercise-agnostic — all domain logic lives in config callbacks.

## Module Map

```
engine.js              # Orchestrator: next(), report(), getMastery()
item-manager.js        # Item record CRUD, cluster bookkeeping
math-utils.js          # Shared math (sigmoid, clamp, gaussian)
migration.js           # Legacy state migration
scheduling/
  fsrs.js              # Free Spaced Repetition Schedule (memory model)
knowledge/
  bkt.js               # Bayesian Knowledge Tracing (learning model)
  theta.js             # Item Response Theory (ability estimate)
selection/
  drills.js            # Micro-drill and confusion drill generators
  scoring.js           # UCB1-inspired candidate scoring
tracking/
  fatigue.js           # Sliding window fatigue detection
  coverage.js          # String x fret-zone coverage matrix
  confusion.js         # Per-item confusion frequency tracking
persistence/
  serializer.js        # Versioned localStorage save/load (v3)
configs/
  noteFind.js          # Note Find exercise config
  stringTraversal.js   # String Traversal exercise config
  interval.js          # Interval Trainer exercise config
  fretboardQuiz.js     # Fretboard Quiz exercise config
  intervalNamer.js     # Interval Namer exercise config
  chordSpeller.js      # Chord Speller exercise config
```

## Knowledge Models

Three models run in parallel per item. Each captures a different aspect of learning:

### BKT (Bayesian Knowledge Tracing) — `knowledge/bkt.js`

Models probability of *learning* (`pL`) via Bayes' rule.

```
After correct:  posterior = (1-pS)*pL / [(1-pS)*pL + pG*(1-pL)]
After wrong:    posterior = pS*pL / [pS*pL + (1-pG)*(1-pL)]
Then:           pL = posterior + (1-posterior) * pT_effective
```

- Parameters: `pG=0.05` (guess), `pS=0.15` (slip), `pT=0.20` (learn)
- Speed modulation: fast correct → `pT * 1.5`, slow correct → `pT * 0.5`
- Mastery threshold: `pL >= 0.80 && attempts >= 3`
- No forgetting — pL only increases. Forgetting is handled by FSRS.

### FSRS (Free Spaced Repetition Schedule) — `scheduling/fsrs.js`

Models *memory stability* (S) and *retrievability* (R) over time.

```
R(elapsed, S) = (1 + FACTOR * elapsed/S) ^ -0.5    where FACTOR = 19/81
```

- 4-level grading: 1 (fail), 2 (hard/slow), 3 (good), 4 (easy/fast)
- Grade assignment via `gradeFromResponse`: compares response time to median
- 19 preset weight parameters (W[0]–W[18]) — not yet personalized
- Schedules next review: `interval = (S/FACTOR) * (R_target^(-2) - 1)` days, target R = 0.90
- On success: stability grows proportional to `(11-D) * S^(-W[9])` with grade bonuses
- On failure: stability shrinks via `W[11] * D^(-W[12]) * ((S+1)^W[13] - 1)`
- Difficulty updates toward grade-adjusted mean, clamped [1, 10]

### Theta (Item Response Theory) — `knowledge/theta.js`

Single continuous ability estimate on [0, 1].

```
p(success) = sigmoid(alpha * (theta - difficulty))    alpha = 10
theta += lr * (outcome - p(success))                  lr = 0.04 (normal), 0.12 (skip)
```

- Adaptive sigma: widens when high accuracy (explore harder items), tightens when struggling
- Plateau detection: theta range < 0.03 over last 5 snapshots → triggers higher exploration coefficient

### BKT-FSRS Reconciliation — `engine.js`

Prevents the models from contradicting each other:

| BKT says | FSRS says | Action |
|----------|-----------|--------|
| Learned (pL > 0.8) | Forgotten (R < 0.5) | `pL = pL*0.8 + R*0.2` |
| Unsure (pL < 0.4) | Stable (S > 5, R > 0.85) | `pL = pL*0.7 + R*0.3` |
| Learned (pL > 0.8) | Unstable (S < 0.5, attempts < 5) | Cap pL at 0.7 |

## Item Selection — `engine.js`, `selection/`

### Priority Queue

`next()` checks queues in order — first non-empty queue wins:

1. **Cold start** (questions 1–7): cycle through exercise types sorted by difficulty
2. **Overdue queue**: FSRS items past due date, sorted by overdueness, max 10 per session
3. **Micro-drill queue**: generated from `config.microDrill()` after repeated failures
4. **Confusion drill queue**: alternation pairs from confusion tracking
5. **Scored candidates**: UCB1-style multi-objective scoring

### Scoring Formula — `selection/scoring.js`

```
score = exploitation        # min(0.6, 1 - pL)
      + exploration         # C * sqrt(log(N) / n)           C=1.2, or 1.8 if plateau
      + reviewUrgency       # (1-R) * (0.3 if mastered, 0.5 otherwise)
      + confusionBoost      # 0.3 if matches recent confusion 2+ times
      + difficultyMatch     # Gaussian(diff, theta, sigma) * 0.3
      + interleave          # -0.3 if same cluster as recent item
      + fatigueBias         # pL * 0.3 if fatigued
      + coverageBonus       # 0.2 if < 3 items in cell, 0.15 if low pL
      + stuckPenalty        # -1.5 if repeated 2+ with pL < 0.5
```

All weights are hand-tuned.

## Drill Systems — `selection/drills.js`

### Micro-Drill

- **Trigger**: 3+ failures in last 5 attempts for an item
- **Cooldown**: 8 questions since last micro-drill
- **Generation**: `config.microDrill(failedItem)` — typically nearest fretboard landmark + next-nearest
- Landmarks: frets 0, 3, 5, 7, 9, 12 (inlay positions on real guitars)

### Confusion Drill

- **Trigger**: wrong answer where detected value matches a previous confusion 2+ times
- **Cooldown**: 10 questions since last confusion drill
- **Generation**: alternation `[target, confused, target, confused]`

## Tracking — `tracking/`

### Fatigue — `fatigue.js`

Sliding window of last 20 responses, split into older (first 10) and newer (last 10):

- **Onset**: accuracy drops > 20% OR response time increases > 40%
- **Recovery**: newer accuracy within 90% of pre-fatigue level
- **Effect**: sets `fatigued` flag → scoring adds fatigue bias toward easier items

### Coverage — `coverage.js`

2D matrix: 6 strings x 6 fret zones (zone_0, zone_3, zone_5, zone_7, zone_9, zone_12).

Each cell tracks `{count, avgPL}`. Under-visited or low-mastery cells get scoring bonuses.

### Confusion — `confusion.js`

Per-item array of `{detected, ts}` (max 10). Frequency analysis finds most-confused value for drill generation.

## Exercise Configs — `configs/`

Each exercise provides a config object with callbacks:

```js
{
  itemDifficulty(item),       // 0–1 difficulty score
  itemKey(item),              // unique string key for persistence
  itemClusters(item),         // per-item cluster IDs (string, zone, note)
  globalClusters(item),       // global cluster IDs
  itemFromKey(key),           // reconstruct item from persisted key
  genRandom(lastItem),        // generate random new item
  genFromCluster(id, last),   // generate item in specific cluster
  genFromType(typeId, last),  // generate item of specific type
  microDrill(failedItem),     // generate drill items for failure
  pickScaffold(item, weak),   // generate scaffolding items
}
```

The engine is exercise-agnostic. All domain-specific logic (what makes an item hard, how to cluster items, what to drill on failure) lives in the config.

## Persistence — `persistence/serializer.js`

Versioned localStorage (current: v3). Per-item state:

- FSRS: `S`, `D`, `lastReviewTs`, `due`
- BKT: `pL`
- History: `attempts`, `correct`, `hist` (last 5 booleans), `streak`
- Timing: `times` (last 10), `avgTime`
- Confusion: `confusions` array
- Clusters: per-cluster `{correct, total}`

Global state: `questionNumber`, `totalAttempts`, `allCorrectTimes`, `theta`, `thetaHistory`, `recentKeys`.

Includes v1→v3 migration (converts SM-2 easiness factor + interval to FSRS stability + difficulty).

## Known Limitations

- BKT parameters are hardcoded — should be fit per exercise or per student
- FSRS uses default weights — scheduling accuracy degrades without personalization after ~100+ reviews
- Scoring weights are hand-tuned with no feedback loop
- Cold start is simplistic — a placement test would bootstrap theta faster
- No cross-exercise knowledge transfer — mastery in one exercise doesn't inform another
- BKT has no forgetting — relies entirely on FSRS reconciliation for decay
