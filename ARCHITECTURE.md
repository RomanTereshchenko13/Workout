# Architecture

How the app is put together, why it is shaped this way, and how to grow it without breaking what works.

---

## Principles

**No build step.** The browser loads ES modules directly. There is nothing to compile, no lockfile to rot, no toolchain to upgrade. In two years you can still open a file, edit it, push, and the phone updates. Node appears only in `scripts/` — dev server, icon generation, tests.

**Content is data, logic is code.** Exercises, program days, cardio options and nutrition rules live in `js/data/` as plain objects. Adding an exercise or a training day means editing data, not writing behaviour.

**The inventory is a parameter, never a constant.** Nothing hardcodes "20 kg" or "2/3/4 kg plates" outside `DEFAULT_INVENTORY`. Buy more plates, change one setting, and the ladders, progression steps, calculator and starting weights all follow.

**Ukrainian in strings, English in code.** All user-facing text is a literal in a view or in `js/data/`. Identifiers, comments and docs are English. This keeps the door open for a second locale without a refactor.

---

## Layers

```
                    ┌──────────────────────────┐
                    │  views/  (one per screen)│  builds DOM, owns copy
                    └────────────┬─────────────┘
                                 │ reads/writes
            ┌────────────────────┼────────────────────┐
            │                    │                    │
      ┌─────▼─────┐        ┌─────▼─────┐        ┌─────▼─────┐
      │  store.js │        │   data/   │        │    ui.js  │
      │  state    │        │  content  │        │  DOM,     │
      │  storage  │        │  program  │        │  charts   │
      └─────┬─────┘        └─────┬─────┘        └───────────┘
            │                    │
            └────────┬───────────┘
                     │ pure functions, no DOM
            ┌────────▼─────────────────────────┐
            │ lib/plates.js  lib/nutrition.js  │
            │ lib/timer.js                     │
            └──────────────────────────────────┘
```

The rule that keeps this testable: **`lib/` and `data/` never touch the DOM**, which is why `smoke-test.mjs` can import them straight into Node. Views may import anything; nothing imports views except the router.

### `js/app.js` — shell

Hash router (`#/`, `#/session`, `#/progress`, `#/library`, `#/tools`, `#/profile`), lazily importing one view module per route. Owns the tab bar, the onboarding gate, and the service-worker update flow. Views trigger a re-render by dispatching `app:render` on `window`; `store.subscribe` only repaints the tab bar, so a state write never yanks the DOM out from under a focused input.

### `js/store.js` — state

A single object in `localStorage` under one key, with a `SCHEMA` version. Every read goes through `migrate()`, which deep-merges the persisted object over `DEFAULTS()` — so adding a new field is backward compatible for free: old saves simply pick up the default.

Mutations go through `update(fn)`, which persists and notifies. Domain helpers (`logWeight`, `startSession`, `finishSession`, …) are the intended API; reach for raw `update()` only for genuinely new concepts.

Shape:

```js
{
  v, profile, inventory, settings,
  state: { rotation, week, blockStart },
  logs: [ { id, date, dayKey, week, durationSec, finisherDone, note, exercises: [...] } ],
  weights: [ { d, kg } ],
  cardio:  [ { d, key, minutes } ],
  active:  null | { startedAt, date, dayKey, week, exercises: [...], finisherDone, note }
}
```

`active` is the in-progress workout, written on every set. That is what makes the app survivable: the phone can die mid-session and nothing is lost.

### `js/lib/plates.js` — the interesting one

Enumerates every buildable weight by walking plate denominations under three constraints: how many plates the mode consumes per denomination (4 for a matched pair, 2 for a single dumbbell), the per-dumbbell weight ceiling, and how many plates physically fit on one side of a 35 cm bar. It keeps the variant with the fewest plates per achievable weight.

Everything downstream — progression steps, the `± ` buttons, the calculator, starting weights — asks this module rather than doing arithmetic. That is the single reason the app never prescribes a weight you cannot build.

### `js/data/program.js` — the plan

`DAYS` describes three full-body days as slot lists (`{ id, sets, rest, perSide?, time?, ss? }`). `WAVES` describes the 4-week cycle (rep ranges, set delta, intensity factor). `buildSession()` combines a rotation index, a wave week, the history and the inventory into a concrete session. `suggestWeight()` holds the progression rule and returns both a weight and a human explanation.

---

## How to extend it

### Add an exercise

Append to `EXERCISES` in `js/data/exercises.js`:

```js
'my-exercise': {
  name: 'Українська назва',
  group: 'legs',              // legs | push | pull | core | full
  mode: 'pair',               // pair | single | bw | plate
  muscles: 'Що працює',
  start: { beginner: 6, inter: 10, adv: 14 },  // null for bodyweight
  cues: ['Перша підказка.', 'Друга.'],
},
```

It appears in the library immediately. `smoke-test.mjs` validates the shape — run `npm run check`.

### Add or change a training day

Edit `DAYS` in `js/data/program.js`. A day needs a `key`, `title`, `focus`, `color`, a `main` array of slots and optionally a `finisher`. The rotation length adapts automatically — a fourth day changes `dayByRotation` behaviour with no other edits, though `finishSession()` in `store.js` advances the wave every 3 workouts and would need that constant changed to match.

### Change the progression rule

`suggestWeight()` in `program.js` is the only place it lives. It receives history, inventory, experience and the current wave, and returns `{ kg, load, reason, progressed }`. Keep returning a `reason` — the UI shows it, and an unexplained weight change reads like a bug.

### Add a screen

1. Create `js/views/thing.js` exporting `thingView()` that returns a DOM node.
2. Register it in `ROUTES` in `app.js` (add `hidden: true` to keep it out of the tab bar).
3. Add the file to `ASSETS` in `sw.js` — otherwise it breaks offline. `check-assets.mjs` fails CI if you forget.
4. Add it to `SCREENS` in `scripts/render-test.mjs`.

### Add a persisted field

Add it to `DEFAULTS()` in `store.js`. Existing saves inherit the default through `migrate()`. Only bump `SCHEMA` and write explicit migration code when an existing field changes *meaning* or shape.

### Change the equipment

Nothing in code. **Інструменти → Налаштування інвентарю** — bar weight, plate counts, per-dumbbell ceiling, plates per side. To change the shipped defaults for a fresh install, edit `DEFAULT_INVENTORY` in `lib/plates.js`.

---

## Testing

Three scripts, all dependency-free, all run in CI before a deploy:

| Script | Covers |
|---|---|
| `smoke-test.mjs` | Plate ladders and their gaps, inventory feasibility of every combination, nearest/next-step selection, exercise data shape, program structure and muscle coverage, session generation across the whole wave, progression rules including the ceiling case, and the nutrition formulas against hand-computed values. |
| `render-test.mjs` | Imports every real view module against a stubbed DOM and renders each screen empty and populated. Catches broken imports, renamed helpers, crashes on empty state, and `undefined`/`NaN` leaking into the UI. Also drives four full workouts through the store to verify rotation, wave advance, progression and backup round-trip. |
| `check-assets.mjs` | Every source file is listed in the service worker cache and every listed asset exists. |

`render-test.mjs` matters more than it looks: it is the reason a view refactor cannot silently ship a blank screen without a browser in the loop.

---

## Update flow

CI stamps a build id into `sw.js` and `index.html` on every deploy. The cache name embeds it, so a new deploy is a new cache. The client checks for updates on launch, on return from background, and hourly; when a new worker is waiting it shows a banner, and only the user's tap calls `SKIP_WAITING` and reloads.

Navigation requests are network-first (a fresh deploy is picked up immediately when online); static assets are cache-first with `ignoreSearch`, so `?v=<build>` query strings still hit the cache.

The deliberate choice here: updates are never applied silently. Swapping code mid-workout would be a great way to lose a session.

---

## Known limits

- **Storage is per-origin.** Clearing site data wipes everything; the JSON export is the only backup. A future sync would be file-based and user-controlled, not a server.
- **Audio needs a gesture.** The rest timer's beep only works after the first tap in a session. `primeAudio()` handles this on first interaction, but the very first beep of a cold launch can be silent.
- **Wake lock is Chromium-only.** iOS Safari ignores it; the screen will sleep during long rests.
- **The 20 kg ceiling is real.** For strong single-arm work the plan advises reps and tempo once the ceiling is hit. The structural fix is more plates — the inventory setting is already there, which is why the ceiling is a setting and not a constant.
