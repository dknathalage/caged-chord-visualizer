# Learning Engine

Adaptive practice engine that selects items, tracks knowledge, and schedules reviews. Exercise-agnostic — all domain logic lives in config callbacks.

## Module Map

```
engine.js              # Orchestrator: next(), report(), getMastery()
item-manager.js        # Item record CRUD, cluster bookkeeping
math-utils.js          # Shared math (sigmoid, clamp, gaussian)
migration.js           # Legacy state migration
constants.js           # Tier 1: fixed constants (FSRS weights, audio, history limits)
defaults.js            # Tier 2: overridable defaults (BKT, scoring, drills, fatigue)
params.js              # Tier 3: parameter resolution (adaptive > config > defaults)
scheduling/
  fsrs.js              # Free Spaced Repetition Schedule (memory model)
knowledge/
  bkt.js               # Bayesian Knowledge Tracing (learning model)
  theta.js             # Item Response Theory (ability estimate)
selection/
  drills.js            # Micro-drill and confusion drill generators
  scorer.js            # UCB1-inspired candidate scoring
tracking/
  fatigue.js           # Sliding window fatigue detection
  coverage.js          # String x fret-zone coverage matrix
  confusion.js         # Per-item confusion frequency tracking
adaptive/
  estimators.js        # Per-student BKT parameter estimation (pG, pS, pT)
  drill-tracker.js     # Drill effectiveness measurement
  difficulty.js        # Per-feature difficulty re-estimation
persistence/
  serializer.js        # Versioned localStorage save/load (v4)
  storage.js           # LocalStorage adapter
configs/
  noteFind.js          # Note Find exercise config
  stringTraversal.js   # String Traversal exercise config
  interval.js          # Interval Trainer exercise config
  fretboardQuiz.js     # Fretboard Quiz exercise config
  intervalNamer.js     # Interval Namer exercise config
  chordSpeller.js      # Chord Speller exercise config
```

## Three-Tier Parameter Architecture

All tunable values follow a strict three-tier hierarchy. Higher tiers override lower ones.

### Tier 1: Constants — `constants.js`

Fixed values that must never be overridden. Physics, math, and structural constants baked into algorithms.

- `CONSTANTS.fsrs` — FSRS weight matrix W[0-18], FACTOR (19/81), DECAY (-0.5), MS_PER_DAY
- `CONSTANTS.audio` — FFT_SIZE, FREQ_MIN, FREQ_MAX
- `CONSTANTS.history` — MAX_HIST (5), MAX_TIMES (10), MAX_CORRECT_TIMES (200), MAX_CONFUSIONS (10), SESSION_WINDOW (20)

### Tier 2: Defaults — `defaults.js`

Overridable defaults organized by subsystem. These are the baseline values used when no per-exercise or per-student overrides exist.

Key subsystems:
- `bkt` — pG (0.05), pS (0.15), pT (0.20)
- `theta` — initial (0.05), alpha (10), lr (0.04), skipLr (0.12)
- `scoring` — exploitationCap, explorationC, reviewUrgency, confusionBoost, etc.
- `drills` — microDrill (failureCount, windowSize, cooldown), confusionDrill (minOccurrences, cooldown)
- `fatigue` — accDropThreshold, rtIncreaseThreshold, recoveryThreshold
- `mastery` — pLThreshold (0.80), minAttempts (3)
- `fsrs` — desiredRetention (0.90), gradeThresholds
- `sigma`, `offset`, `plateau` — theta adaptation parameters
- `audio`, `holdDetection` — mic and hold detection thresholds
- `transfer`, `unified`, `coldStart` — cross-exercise and cold-start settings

### Tier 3: Resolution — `params.js`

`resolveParams(configOverrides, adaptiveOverrides)` merges three layers:

```
adaptive (per-student, highest priority)
  > configOverrides (per-exercise)
    > DEFAULTS (tier 2, lowest priority)
```

Returns `{ params, constants }` — both frozen. Constants are always returned unchanged.

The engine stores `this.params` and `this.constants`. All modules receive params as function arguments rather than importing defaults directly.

### Resolution Flow in Practice

1. **Constructor**: `resolveParams(configOverrides)` — uses exercise config + defaults
2. **On load**: if saved adaptive state has non-null pG/pS/pT, re-resolves with adaptive overrides
3. **Every 20 attempts**: `_updateAdaptiveEstimates()` re-runs estimators; if values changed, re-resolves params so updated BKT values take effect immediately

## Knowledge Models

Three models run in parallel per item. Each captures a different aspect of learning:

### BKT (Bayesian Knowledge Tracing) — `knowledge/bkt.js`

Models probability of *learning* (`pL`) via Bayes' rule.

```
After correct:  posterior = (1-pS)*pL / [(1-pS)*pL + pG*(1-pL)]
After wrong:    posterior = pS*pL / [pS*pL + (1-pG)*(1-pL)]
Then:           pL = posterior + (1-posterior) * pT_effective
```

- Parameters: `pG` (guess), `pS` (slip), `pT` (learn) — from `params.bkt`
- Speed modulation: fast correct -> `pT * 1.5`, slow correct -> `pT * 0.5`
- Mastery threshold: `pL >= params.mastery.pLThreshold && attempts >= params.mastery.minAttempts`
- No forgetting — pL only increases. Forgetting is handled by FSRS.
- **Adaptive**: pG, pS, pT are re-estimated per-student from observed data (see Adaptive Estimation below)

### FSRS (Free Spaced Repetition Schedule) — `scheduling/fsrs.js`

Models *memory stability* (S) and *retrievability* (R) over time.

```
R(elapsed, S) = (1 + FACTOR * elapsed/S) ^ -0.5    where FACTOR = 19/81
```

- 4-level grading: 1 (fail), 2 (hard/slow), 3 (good), 4 (easy/fast)
- Grade assignment via `gradeFromResponse`: compares response time to median
- 19 preset weight parameters (W[0]–W[18]) in `CONSTANTS.fsrs.W`
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
- Plateau detection: theta range < 0.03 over last 5 snapshots -> triggers higher exploration coefficient

### BKT-FSRS Reconciliation — `knowledge/bkt.js`

Prevents the models from contradicting each other:

| BKT says | FSRS says | Action |
|----------|-----------|--------|
| Learned (pL > 0.8) | Forgotten (R < 0.5) | `pL = pL*0.8 + R*0.2` |
| Unsure (pL < 0.4) | Stable (S > 5, R > 0.85) | `pL = pL*0.7 + R*0.3` |
| Learned (pL > 0.8) | Unstable (S < 0.5, attempts < 5) | Cap pL at 0.7 |

## Adaptive Estimation — `adaptive/`

Per-student parameter estimation that runs inside the engine. All functions are pure — they take item records and return values without side effects.

### Phase 1: Guess Probability (pG) — `estimators.js`

`estimatePG(items)` — estimates per-exercise guess rate from unlearned items.

- Filters items where `pL < 0.1` (not yet learned)
- Requires 20+ total attempts across those items
- Returns `correct / total`, clamped [0.01, 0.20], or null if insufficient data

### Phase 2: Slip Probability (pS) — `estimators.js`

`estimatePS(items)` — estimates per-student slip rate from mastered items.

- Filters items where `pL > 0.9` AND `attempts >= 5` (solidly mastered)
- Requires 5+ such items
- Returns `errors / total`, clamped [0.02, 0.30], or null if insufficient data

### Phase 3: Transition Probability (pT) — `estimators.js`

`estimatePT(items, defaultPT)` — adjusts learning rate based on student speed.

- Tracks items that crossed `pL >= 0.8` (mastery threshold)
- Computes average attempts-to-mastery across those items
- Fast learner (avg < 5 attempts): `defaultPT * 1.3`
- Slow learner (avg > 12 attempts): `defaultPT * 0.7`
- Average learner (5-12): returns null (use default)
- Clamped [0.05, 0.40]

### Phase 4: Drill Effectiveness — `drill-tracker.js`

`createDrillTracker()` — factory returning a stateful tracker.

- `markDrillFired(itemKey, drillType, recentHist)` — captures pre-drill accuracy
- `checkImprovement(itemKey, correct)` — after 3 post-drill attempts, compares post-drill accuracy to pre-drill
- `getEffectiveness(drillType)` — `helped / total` ratio (null if < 3 evaluations)
- `adjustCooldown(baseCooldown, drillType)`:
  - Effective (> 0.6): reduce cooldown by 25%
  - Ineffective (< 0.3): increase cooldown by 50%
  - Otherwise: use base cooldown

Drill types: `microDrill`, `confusionDrill`. State persisted in `adaptive.drillEffectiveness`.

### Phase 5: Feature Difficulty — `difficulty.js`

Per-feature error rate tracking for difficulty re-estimation.

- `updateFeatureErrors(featureErrorRates, item, correct, features)` — tracks `{correct, total}` per feature key (e.g., `string_2`, `zone_zone_5`, `accidental_true`)
- `getFeatureDifficulty(featureErrorRates, features, minAttempts=50)` — after 50+ total attempts, computes per-feature difficulty weight = `featureErrorRate / globalErrorRate`. Returns average weight across features (> 1 = harder than average, < 1 = easier).
- Features come from `config.itemFeatures(item)` if the exercise config provides it

### Wiring in `engine.js`

- **Constructor**: creates `_drillTracker`, links its state to `adaptive.drillEffectiveness`
- **`report()`**: calls `checkImprovement` on every attempt; calls `updateFeatureErrors` if config provides `itemFeatures`; runs all estimators every 20 attempts via `_updateAdaptiveEstimates()`
- **`next()`**: calls `markDrillFired` when micro-drill or confusion-drill queues are populated
- **`_updateAdaptiveEstimates()`**: runs `estimatePG`, `estimatePS`, `estimatePT`; syncs drill tracker state; re-resolves params if BKT values changed
- **`_applyLoadedState()`**: rebuilds drill tracker from persisted state; re-resolves params with loaded adaptive overrides
- **`reset()`**: resets adaptive state and drill tracker to defaults
- **`getMastery()`**: exposes `adaptive: { pG, pS, pT, drillEffectiveness }` in output

## Item Selection — `engine.js`, `selection/`

### Priority Queue

`next()` checks queues in order — first non-empty queue wins:

1. **Cold start** (questions 1-N): cycle through exercise types sorted by difficulty
2. **Overdue queue**: FSRS items past due date, sorted by overdueness, max 10 per session
3. **Micro-drill queue**: generated from `config.microDrill()` after repeated failures
4. **Confusion drill queue**: alternation pairs from confusion tracking
5. **Scored candidates**: UCB1-style multi-objective scoring

### Scoring Formula — `selection/scorer.js`

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

All weights come from `params.scoring`.

## Drill Systems — `selection/drills.js`

### Micro-Drill

- **Trigger**: `params.drills.microDrill.failureCount` (3) failures in last `windowSize` (5) attempts
- **Cooldown**: `params.drills.microDrill.cooldown` (8) questions since last micro-drill
- **Generation**: `config.microDrill(failedItem)` — typically nearest fretboard landmark + next-nearest
- Landmarks: frets 0, 3, 5, 7, 9, 12 (inlay positions on real guitars)
- **Effectiveness**: tracked by drill-tracker, adjusts cooldown based on observed help rate

### Confusion Drill

- **Trigger**: wrong answer where detected value matches a previous confusion `params.drills.confusionDrill.minOccurrences` (2) times
- **Cooldown**: `params.drills.confusionDrill.cooldown` (10) questions since last confusion drill
- **Generation**: alternation `[target, confused, target, confused]`
- **Effectiveness**: tracked by drill-tracker, adjusts cooldown based on observed help rate

## Tracking — `tracking/`

### Fatigue — `fatigue.js`

Sliding window of last 20 responses, split into older (first 10) and newer (last 10):

- **Onset**: accuracy drops > 20% OR response time increases > 40%
- **Recovery**: newer accuracy within 90% of pre-fatigue level
- **Effect**: sets `fatigued` flag -> scoring adds fatigue bias toward easier items
- Thresholds come from `params.fatigue`

### Coverage — `coverage.js`

2D matrix: 6 strings x 6 fret zones (zone_0, zone_3, zone_5, zone_7, zone_9, zone_12).

Each cell tracks `{count, avgPL}`. Under-visited or low-mastery cells get scoring bonuses.

### Confusion — `confusion.js`

Per-item array of `{detected, ts}` (max 10). Frequency analysis finds most-confused value for drill generation.

## Exercise Configs — `configs/`

Each exercise provides a config object with callbacks:

```js
{
  itemDifficulty(item),       // 0-1 difficulty score
  itemKey(item),              // unique string key for persistence
  itemClusters(item),         // per-item cluster IDs (string, zone, note)
  globalClusters(item),       // global cluster IDs
  itemFromKey(key),           // reconstruct item from persisted key
  genRandom(lastItem),        // generate random new item
  genFromCluster(id, last),   // generate item in specific cluster
  genFromType(typeId, last),  // generate item of specific type
  microDrill(failedItem),     // generate drill items for failure
  pickScaffold(item, weak),   // generate scaffolding items
  itemFeatures(item),         // (optional) feature dict for difficulty tracking
}
```

The engine is exercise-agnostic. All domain-specific logic (what makes an item hard, how to cluster items, what to drill on failure) lives in the config.

## Persistence — `persistence/serializer.js`

Versioned localStorage (current: v4). Per-item state:

- FSRS: `S`, `D`, `lastReviewTs`, `due`
- BKT: `pL`
- History: `attempts`, `correct`, `hist` (last 5 booleans), `streak`
- Timing: `times` (last 10), `avgTime`
- Confusion: `confusions` array
- Clusters: per-cluster `{correct, total}`

Global state: `questionNumber`, `totalAttempts`, `allCorrectTimes`, `theta`, `thetaHistory`, `recentKeys`.

Adaptive state (v4): `adaptive` object containing:
- `pG`, `pS`, `pT` — estimated BKT params (null until sufficient data)
- `drillEffectiveness` — `{ microDrill: { helped, total }, confusionDrill: { helped, total } }`
- `featureErrorRates` — per-feature `{ correct, total }` counts

Migration path: v1 -> v4 (SM-2 to FSRS + default adaptive), v3 -> v4 (add default adaptive).

## Known Limitations

- FSRS uses default weights — scheduling accuracy degrades without personalization after ~100+ reviews
- Cold start is simplistic — a placement test would bootstrap theta faster
- No cross-exercise knowledge transfer — mastery in one exercise doesn't inform another
- BKT has no forgetting — relies entirely on FSRS reconciliation for decay
- Adaptive pT estimation uses attempts-to-mastery as a proxy for learning speed, which is noisy for items with high guess rates
- Feature difficulty requires `config.itemFeatures()` — not all exercise configs provide it yet
