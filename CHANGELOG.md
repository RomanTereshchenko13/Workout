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
