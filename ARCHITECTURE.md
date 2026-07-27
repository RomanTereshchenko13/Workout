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
            │ lib/timer.js   lib/dates.js      │
            └──────────────────────────────────┘
```

The rule that keeps this testable: **`lib/` and `data/` never touch the DOM**, which is why `smoke-test.mjs` can import them straight into Node. (`lib/timer.js` is the one exception — it registers a `visibilitychange` listener to re-acquire the wake lock, so it is exercised from `render-test.mjs` instead.) Views may import anything; nothing imports views except the router.

Two helpers exist specifically because the same calculation was being done inconsistently in several views:

- **`lib/dates.js`** — every date in the app is a bare `YYYY-MM-DD` meaning "the day the user was living in", never an instant. `toISOString()` converts to UTC first, so it is never the right tool here.
- **`plates.js` `setVolume()`** — one definition of tonnage, including the doubling for `perSide` work, shared by the session screen, the weekly chart and history.

### `js/app.js` — shell

Hash router (`#/`, `#/session`, `#/progress`, `#/library`, `#/tools`, `#/profile`), lazily importing one view module per route. Owns the tab bar, the onboarding gate, and the service-worker update flow. Views trigger a re-render by dispatching `app:render` on `window`; `store.subscribe` only repaints the tab bar, so a state write never yanks the DOM out from under a focused input.

The router also owns **leaving** a route, via `onLeaveSession()`. The session screen turns on a wake lock and a body flag, and the tab bar is an exit the screen itself never observes — so cleanup cannot live in its own dismiss handlers.

### `js/store.js` — state

A single object in `localStorage` under one key, with a `SCHEMA` version. Every read goes through `migrate()`, which merges the persisted object over `DEFAULTS()` — so adding a new field is backward compatible for free — and then runs any version-gated steps that have to *change* data the user already owns.

A migration describes history, so it should not read live constants: the v4 `perSide` backfill carries a frozen copy of the unilateral slot list, because if the program later drops one of those exercises, workouts logged back then were still done per side.

Mutations go through `update(fn)`, which persists and notifies. Domain helpers (`logWeight`, `startSession`, `finishSession`, …) are the intended API; reach for raw `update()` only for genuinely new concepts. `writeError()` reports whether the last write actually reached storage — a full quota must never be reported to the user as a saved workout.

Shape:

```js
{
  v, profile, inventory, settings,
  state:         { rotation, week, blockStart },
  substitutions: { [slotId]: exerciseId },       // permanent exercise swaps
  meta:          { lastBackupAt, lastBackupLogs, nextLogSeq },
  logs: [ { id, date, dayKey, week, durationSec,
            finisherRounds, finisherTarget, finisherDone, note,
            exercises: [ { id, slotId, mode, isTime, perSide, sets } ] } ],
  weights: [ { d, kg } ],
  cardio:  [ { d, key, minutes } ],
  active:  null | { startedAt, date, dayKey, week, exercises: [...],
                    finisherRounds, finisherTarget, rest, note }
}
```

`active` is the in-progress workout, written on every set. That is what makes the app survivable: the phone can die mid-session and nothing is lost. `active.rest` holds the rest timer's **absolute deadline** for the same reason — Android reaps backgrounded PWAs, and a countdown that lives only in memory dies with the process.

Log ids come from `meta.nextLogSeq`, never from `logs.length`: a length-derived id returns a live number to the pool after a delete, and two logs sharing an id means one delete removes both.

### `js/lib/plates.js` — the interesting one

Enumerates every buildable weight by walking plate denominations under three constraints: how many plates the mode consumes per denomination (4 for a matched pair, 2 for a single dumbbell), the per-dumbbell weight ceiling, and how many plates physically fit on one side of a 35 cm bar. It keeps the variant with the fewest plates per achievable weight.

Everything downstream — progression steps, the `± ` buttons, the calculator, starting weights — asks this module rather than doing arithmetic. That is the single reason the app never prescribes a weight you cannot build.

### `js/data/program.js` — the plan

`DAYS` describes three full-body days as slot lists (`{ id, sets, rest, perSide?, time?, ss? }`). `WAVES` describes the 4-week cycle (rep ranges, set delta, intensity factor). `buildSession()` combines a rotation index, a wave week, the history, the inventory and the user's substitutions into a concrete session. `suggestWeight()` holds the progression rule and returns both a weight and a human explanation.

Two distinctions matter when reading a session:

- **`slotId` vs `id`** — the slot is the position in the program; the id is what is actually being performed there. They differ when a substitution is in play, and keeping both is what lets a swap persist across sessions and still be undone later.
- **`ss`** — consecutive slots sharing an `ss` value are one superset. `groupExercises()` folds them into blocks for rendering, and the session screen suppresses the rest timer until the last exercise of a round.

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

Add it to `DEFAULTS()` in `store.js`. Existing saves inherit the default through `migrate()`. Only bump `SCHEMA` and write explicit migration code when an existing field changes *meaning* or shape — and when you do, gate it on the stored `v` and freeze whatever constants it depends on inside the migration.

### Substitute an exercise

`state.substitutions` maps a program slot id to a replacement exercise id; `resolveSlot()` applies it inside `buildSession()` and falls back to the original if the replacement is not a real exercise. The swap UI is the ⇄ button on any session exercise card; `alternativesFor()` supplies the candidates (same muscle group, same loading mode first).

### Change the equipment

Nothing in code. **Інструменти → Налаштування інвентарю** — bar weight, plate counts, per-dumbbell ceiling, plates per side. To change the shipped defaults for a fresh install, edit `DEFAULT_INVENTORY` in `lib/plates.js`.

---

## Testing

Three scripts, all dependency-free, all run in CI before a deploy:

| Script | Covers |
|---|---|
| `smoke-test.mjs` | Plate ladders and their gaps, inventory feasibility of every combination, nearest/next-step selection, exercise data shape, program structure and muscle coverage, session generation across the whole wave, progression rules including the ceiling case, the nutrition formulas against hand-computed values, local-date arithmetic, tonnage (including the per-side doubling), superset grouping and substitution resolution. |
| `render-test.mjs` | Imports every real view module against a stubbed DOM and renders each screen empty and populated. Catches broken imports, renamed helpers, crashes on empty state, and `undefined`/`NaN` leaking into the UI. Also drives full workouts through the store to verify rotation, wave advance, progression, log-id uniqueness across deletes, schema migration, rest-timer persistence, the backup reminder, accordion state, dialog semantics and accessible names on icon-only buttons. |
| `check-assets.mjs` | Every source file is listed in the service worker cache and every listed asset exists; the entry `<script type="module">` carries no query string; `package.json`, `APP_VERSION` and `CHANGELOG.md` agree on the version. |

`render-test.mjs` matters more than it looks: it is the reason a view refactor cannot silently ship a blank screen without a browser in the loop.

Two conventions worth keeping:

- **A guard should be verified to fail against the bug it guards.** The log-id and date checks were both confirmed to go red against the previous implementation before being kept.
- **Pin the timezone for date assertions.** CI runs in UTC, where the bug `lib/dates.js` exists to fix cannot reproduce — so the date group forces `TZ=Europe/Kyiv` and asserts the contrast explicitly.

---

## Update flow

CI stamps a build id into `sw.js` and `index.html` on every deploy. The cache name embeds it, so a new deploy is a new cache. The client checks for updates on launch, on return from background, and hourly; when a new worker is waiting it shows a banner, and only the user's tap calls `SKIP_WAITING` and reloads.

Navigation requests are network-first (a fresh deploy is picked up immediately when online); static assets are cache-first with `ignoreSearch`, so `?v=<build>` query strings still hit the cache.

**The entry module must be loaded under exactly one URL.** `index.html` loads `./js/app.js` with no query string, because the views import `../app.js` and ES modules are keyed by URL — a `?v=` on one of them makes the browser evaluate `app.js` twice, producing two routers, two service-worker registrations and two copies of every piece of module state. Cache-busting is not lost: the service worker fetches each asset with `cache: 'reload'` into a build-scoped cache. `check-assets.mjs` fails the build if a query string reappears.

The deliberate choice here: updates are never applied silently. Swapping code mid-workout would be a great way to lose a session.

### Versions

`APP_VERSION` in `app.js` is the release number a human chooses; the build id is a per-deploy cache key. They are not the same thing and change on different schedules. [CHANGELOG.md](CHANGELOG.md) holds the rule for picking the next version and the release checklist.

---

## Known limits

- **Storage is per-origin.** Clearing site data wipes everything; the JSON export is the only backup. iOS evicts storage for a non-installed site after roughly a week of disuse. The app now nags for a backup once there is history worth losing, but it cannot prevent the eviction. A future sync would be file-based and user-controlled, not a server.
- **Audio needs a gesture.** The rest timer's beep only works after the first tap in a session. `primeAudio()` handles this on first interaction, but the very first beep of a cold launch can be silent.
- **Wake lock is Chromium-only.** iOS Safari ignores it; the screen will sleep during long rests.
- **A backgrounded rest timer cannot make a sound.** The deadline survives (see `active.rest`), so the countdown is correct on return — but if the tab is suspended the end-of-rest beep never fires. Fixing that properly needs the Notifications API and a permission prompt.
- **The service worker has no runtime test.** `check-assets.mjs` verifies the asset manifest, but the fetch and update logic is only exercised by hand in a browser.
- **The 20 kg ceiling is real.** For strong single-arm work the plan advises reps and tempo once the ceiling is hit. The structural fix is more plates — the inventory setting is already there, which is why the ceiling is a setting and not a constant.
