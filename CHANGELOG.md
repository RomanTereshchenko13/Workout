# Changelog

All notable changes to this app. Newest first.

---

## How to pick the next version

The version is `MAJOR.MINOR.PATCH`. It lives in three places that must always
agree — `package.json`, `APP_VERSION` in `js/app.js`, and a `## <version>`
heading in this file. `check-assets.mjs` fails the build if they drift.

Semantic versioning for a library is about API compatibility. This app has no
API and one user, so the question it answers instead is: **what does a person
who opens the app after this update have to deal with?**

| Bump | When | Examples |
|---|---|---|
| **MAJOR** `2.0.0` | Something the user has to relearn, or that changes the meaning of data they already have. Past history reads differently after the update. | Rewriting the progression rule or the calorie formula so old logs imply different numbers · a `SCHEMA` migration that is not a pure additive merge · removing or replacing a screen · restructuring the training program (different days, different wave length) |
| **MINOR** `1.1.0` | New user-visible capability. Nothing they knew before stops being true. | A new screen, tool, exercise, cardio option or setting · a new card on an existing screen · a backward-compatible field added to `DEFAULTS()` · a new diagnostic or export |
| **PATCH** `1.0.1` | Everything the user did not ask for and would not notice as *new*: it just works properly now. | Bug fixes · copy and wording · styling · docs, tests, CI · refactors with no behaviour change · dependency-free housekeeping |

Two rules of thumb when it is genuinely ambiguous:

- **Fixing a bug is a PATCH even if the fix is large.** Size of the diff is not
  the signal; whether the user gains something new is.
- **If a release mixes levels, take the highest one.** A release with four bug
  fixes and one new button is a MINOR.

### Version vs build id

`APP_VERSION` is the human-meaningful release number — it is what the Профіль
screen shows and what this file documents. It changes when a human decides it
does.

The **build id** (`__BUILD__`, stamped by CI as `<sha>-<timestamp>`) is a cache
key. It changes on *every* deploy, including a README-only commit, because that
is what gives the service worker a new cache name and makes the «Оновити» banner
appear. Do not conflate them: a deploy always gets a new build id, but not every
deploy needs a new version.

### Releasing

1. Decide the bump from the table above.
2. Update `package.json` `version` and `APP_VERSION` in `js/app.js`.
3. Add a `## <version>` section here.
4. `npm run check`.
5. Push to `master` — CI stamps the build id, runs the checks and deploys.

---

## 1.3.0

Two new capabilities plus the fix for a progression bug that had been quietly
undoing the 4-week wave, so MINOR by the table above.

The deload fix is the ambiguous one. It changes which weight the app suggests
next, so old logs do imply different numbers — but past history still *reads*
identically (tonnage, records and the history screen are untouched), the
schema-5 change is a pure additive merge, and the program now does what `WAVES`
always declared rather than something new to relearn. That keeps it below MAJOR.

### Added

- **Edit a finished workout.** The ✎ button on any history card opens the sets
  for editing — reps, weight, which sets counted, duration and note. A single
  mistyped set previously had exactly one remedy: delete the whole session, which
  also deleted the history that decides the next session's weights, so the fix
  cost more than the mistake. Edits feed straight back into progression.
- **The rest countdown follows you out of the session.** The rest deadline was
  already persisted so a backgrounded or reaped app could resume it, but the bar
  showing it belonged to the session screen. Stepping out to check an exercise
  made a running countdown vanish while it was still counting. The «Триває» tab
  now shows `mm:ss` while a rest is live.

### Fixed

- **The deload week prescribed the heaviest load of the block.** Week 4 declares
  `factor: 0.75` and a rep target of 8, but the "did they earn a step up?" branch
  never applied the factor, and it judged last week's reps against *this* week's
  target — so a peak-week set of 12 cleared the deload's target of 8 trivially
  and stepped the weight up going into the deload. Simulated over 8 weeks the app
  offered 12 kg in the deload against 10 kg at the peak, while telling the user
  «Легко й технічно». Progression now tracks a working weight (`baseKg`, logged
  from schema 5) that a deload cannot corrupt, judges each session against the
  target it was actually performed to, and never reports a deload as a step up.
- **Substituting an exercise could double its tonnage.** `perSide` lived on the
  program slot rather than the movement, so it survived a swap: replacing the
  one-arm row with a two-arm row kept counting reps per side and scored a
  12 kg × 10 set as 480 kg instead of 240 kg. It now lives on the `EXERCISES`
  entry and is re-derived on every substitution, permanent or for-today. Existing
  logs are deliberately left alone — they record what was actually performed.
- **A bad inventory bricked the app permanently.** A per-dumbbell cap below the
  bar weight made the weight ladder empty, and `nearestLoad()` then reduced over
  an empty array and threw. Every screen plans a session, so every screen threw,
  on every launch, with the bad value already in `localStorage` — the error card's
  own "На головну" button re-threw, and only wiping all data recovered. The ladder
  now always contains at least the bare bar, `normalizeInventory()` clamps
  anything stored or imported, and the inventory form explains the rejection
  instead of silently accepting it.
- **The service worker could cache a 404 as the app.** The navigation handler
  stored every response as the offline shell without checking `response.ok`, so
  one bad reply from Pages was served as the app itself for the life of that
  build's cache.
- **The tonnage chart hid training gaps.** Weeks with no workouts were dropped
  rather than drawn as empty, so a three-week break rendered as three adjacent
  bars — the chart read "steady" across exactly the period where nothing happened.
- **Pinch-zoom was disabled.** `maximum-scale=1` in the viewport tag fails
  WCAG 1.4.4 and nothing in the layout depended on it.

### Internal

- `finisherNode` was never cleared on session teardown, keeping a detached card
  alive and leaving a stale `replaceNode` target for the next workout.
- `macroTargets()` called `calorieTarget()` twice for one result.
- Dropped the dead `GET_BUILD` service-worker handler and the `build.txt` CI step
  that nothing ever read.
- The render-test DOM stub now gives elements a `value` property, so `h()`
  assigns to it as a browser would instead of falling through to `setAttribute`.
- New regression coverage for the whole wave cycle (the blind spot that let the
  deload bug through — the old suite never crossed a wave boundary), per-side
  scoring across every substitution the UI offers, degenerate inventories, chart
  gap-filling, workout editing and the tab-bar countdown.

---

## 1.2.0

New capability plus a batch of fixes, so MINOR by the table above. The tonnage
correction changes what past workouts are worth — but it makes old logs agree
with new ones rather than reinterpreting them, and the schema-4 migration is a
pure backfill, so it stops short of MAJOR.

### Added

- **Exercise substitution.** The ⇄ button on any exercise card in a session
  offers alternatives from the same muscle group — for today only, or
  permanently. Permanent swaps live in `state.substitutions`, are honoured by
  `buildSession()` from then on, and are listed and undoable in Профіль. The
  library held 45 exercises while the program could only ever reach 29; "my
  shoulder hurts on the overhead press" previously had no answer inside the app.
- **Supersets are real now.** The `ss` field had been sitting in the program data
  since the first release with nothing reading it, so exercises meant to be
  paired were shown — and rested — as unrelated. They now render as one block,
  and the rest timer only starts after the last exercise of a round.
- **Finisher rounds are logged.** One chip per round instead of a single
  all-or-nothing checkbox. The finisher is described in the app as the main
  calorie block and was the least-tracked thing in it. History shows `3/4`.
- **Backup reminder.** Everything lives in `localStorage`, which browsers evict
  without warning — iOS clears it for a non-installed site after about a week of
  disuse. Export has always existed; nothing ever suggested using it. A card
  appears on the home screen once there is history worth losing, and Профіль
  shows when the last backup was taken.
- **The session clock ticks.** Elapsed time on the session header and the home
  banner was sampled once per repaint and then sat frozen.

### Fixed

- **Tonnage counted unilateral work only once.** A set of "8 reverse lunges"
  means 8 per leg. Six of the program's exercises are per side, so the weekly
  tonnage chart — the app's headline "is the load going up?" metric — was
  understating them by half. Volume now comes from one shared `setVolume()`
  helper used by the session screen, the weekly chart and history alike, and the
  schema-4 migration backfills `perSide` onto older logs so past workouts are
  measured the same way as new ones.
- **The wake lock leaked when leaving a workout via the tab bar.** Only the ✕
  button and "finish" ever released it, so tapping «Прогрес» mid-session left the
  phone screen lit indefinitely. The router owns the exit path now.
- **Deleting one workout could delete two.** Log ids were built from
  `logs.length + 1`, so a delete returned a live number to the pool and the next
  workout could be issued an id that already existed. Ids now come from a
  monotonic sequence, and the migration re-keys any existing collisions.
- **A failed save reported success.** When `localStorage` is full or blocked the
  write error was logged to the console and then «Тренування записано 🎉» was
  shown anyway. Write failures are surfaced to the user.
- **Dates were computed through UTC.** Building a `YYYY-MM-DD` with
  `toISOString()` from a locally-constructed date lands on the previous day
  anywhere east of Greenwich — so opening the app before ~03:00 put the week
  planner's "today" marker on a different day than the workout just logged. All
  calendar arithmetic moved to `js/lib/dates.js`, which only reads local fields.
- **Collapsible cards snapped shut on every interaction.** Views are rebuilt
  wholesale on each state change, so the warm-up list closed itself every time a
  set was logged. `accordion()` keys its open state and survives a re-render.
- **Logging a set rebuilt the entire screen.** It now patches just the card that
  changed plus the header, which is what keeps scroll position, focus and open
  accordions intact.
- **The rest timer died with the app.** It lived only in memory, so locking the
  phone during a 100-second rest lost the count — and Android reaps backgrounded
  PWAs routinely. The deadline is stored as an absolute timestamp and picked back
  up on return.
- **The tab bar was reachable during onboarding**, letting you navigate out of a
  form the rest of the app depends on having been filled in.
- **A corrupt backup imported cleanly and failed later.** `importJSON` checked
  only that a `profile` key existed; a malformed `logs` array got through and
  threw somewhere inside a view long after the import reported success.
- **Two open tabs silently diverged**, last write winning. A `storage` listener
  adopts the other tab's state instead.
- **The weight chart stretched its own axis labels.** `preserveAspectRatio="none"`
  on a fixed 320-unit viewBox distorted the text along with the line at the
  620 px desktop width.

### Accessibility

The app previously contained no `aria-*` or `role` attributes at all.

- Bottom sheets are real dialogs: `role="dialog"`, `aria-modal`, labelled by
  their own title, focus moved in on open and returned to the opener on close,
  Escape to dismiss, and a Tab trap. Without the trap you could tab straight
  into the page behind the scrim and operate controls you could not see.
- Every icon-only button (✕, i, ⇄, −, +, ▶▶, ›) has a spoken name, enforced by a
  render test that walks each screen looking for unnamed glyph buttons.
- A visible `:focus-visible` ring. The input outline had been removed outright
  and buttons never had one, so keyboard focus was invisible.
- `aria-current` on the active tab, `role="img"` and a text summary on all three
  chart types, `role="progressbar"` on the session progress bar, `role="status"`
  on toasts and the update banner, `aria-pressed` on filter and round chips.

### Internal

- New `js/lib/dates.js` and `setVolume`/`exerciseVolume`/`totalVolume` in
  `plates.js` — single sources of truth for the two things that were being
  recomputed inconsistently across views.
- `migrate()` is version-gated rather than a plain defaults merge, and carries a
  frozen copy of the pre-v4 unilateral slot list: a migration describes history,
  so it must not change if the program later drops one of those exercises.
- Test suites grew from 1170 to ~1340 assertions. The date and log-id guards were
  each verified to fail against the previous implementation — and the date checks
  force `TZ=Europe/Kyiv`, since CI runs in UTC where that bug cannot reproduce.

---

## 1.1.0

### Added

- **Install diagnostics.** Профіль → Про застосунок → «Чому не встановлюється?»
  shows a checklist of the invisible preconditions for installation (https, an
  active service worker, a reachable manifest, whether the browser has offered a
  prompt at all). Installation failing used to leave nothing to look at.
  `installDiagnostics()` existed but had never been wired to a screen.

### Fixed

- **The install card no longer tells you to install the app you just installed.**
  `isStandalone()` stays false in the tab that triggered the install, so after a
  successful install the card fell through to the "зараз працює як сайт"
  instructions accordion. Install state is now tracked explicitly and the card
  shows a confirmation instead.
- **`app.js` was being evaluated twice.** `index.html` loaded
  `./js/app.js?v=<build>` while every view imported `../app.js`. ES modules are
  keyed by URL, so those were two module records with two copies of the router,
  the service-worker registration and the install state — meaning two SW
  registrations, two hourly update timers, and every navigation rendering the
  view twice. The entry script no longer carries a query string, and
  `check-assets.mjs` fails the build if one comes back.
- **An app launched in minimal-ui was treated as "not installed".** The manifest
  allows `minimal-ui` through `display_override`, but `isStandalone()` only
  matched `standalone` and `fullscreen`, so an installed app could show the
  install card. `minimal-ui` and `window-controls-overlay` now count too.
- **Double-tapping «Встановити» threw an unhandled rejection.** The button stayed
  live until `userChoice` resolved, and a second `prompt()` call on a spent event
  throws `InvalidStateError` per spec. The prompt is now guarded and wrapped, and
  a failure falls back to the manual instructions.
- **A repaint requested mid-render was silently dropped.** `render()` returns
  early while a render is in flight, and the first paint after a cold launch
  awaits a network import — which is exactly when `beforeinstallprompt` tends to
  land. The install card could stay hidden until the next navigation. Pending
  repaints are now re-run.
- **Dismissal toast contradicted what actually happened.** It said the button
  would stay; the prompt event is single-use, so it never did.

### Internal

- `npm run check` and the deploy workflow now run `render-test.mjs`. The
  segmented-control regression guard added in the previous release was never
  executed by CI.
- `check-assets.mjs` also verifies that `package.json`, `APP_VERSION` and this
  changelog agree on the version, and that the entry module is imported under
  exactly one URL.
- Render tests cover the whole install flow: prompt captured, declined,
  accepted, re-prompt refused, and the confirmation state on the home screen.

---

## 1.0.0

First release.

- Offline-first installable PWA for two 20 kg adjustable dumbbells, Ukrainian UI,
  no build step and no dependencies.
- Three-day full-body rotation on a 4-week wave, with progression driven by
  logged history and the actual plate inventory.
- Plate math that only ever prescribes weights the bars can physically build.
- Bodyweight trend, calorie and macro targets, cardio logging, exercise library,
  plate calculator.
- Everything in `localStorage`, with JSON export/import as the only backup.
- Service-worker update flow with a user-tapped «Оновити» banner — code is never
  swapped mid-workout.
