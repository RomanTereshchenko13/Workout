# Home Workout PWA

An installable, offline-first workout app built around one specific set of equipment: **two adjustable dumbbells, 20 kg each**. The interface is entirely in Ukrainian; the code and docs are in English.

It plans the sessions, tells you exactly which plates to screw onto the bars, tracks every set, and keeps the fat-loss side of the goal (bodyweight trend, calorie and protein targets, cardio) in the same place.

- **[FEATURES.md](FEATURES.md)** — what the app does, screen by screen, plus the roadmap.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how it is put together and how to extend it.

---

## The equipment it is built for

| Item | Spec |
|---|---|
| Bars | 2 × 35 cm threaded, ~2 kg each including nuts |
| Plates | 4 × 2 kg, 4 × 3 kg, 4 × 4 kg — Ø160 mm, 26 mm bore, bare steel |
| Nuts | 4 |
| Total | 40 kg — two 20 kg dumbbells |

Because the plates come in 2/3/4 kg only, the reachable weights are not a smooth ladder. The app computes them exactly instead of guessing:

| Mode | Achievable per dumbbell (kg) |
|---|---|
| Both dumbbells loaded equally | 2, 6, 8, 10, 12, 14, 16, 20 |
| One dumbbell only | 2, 6, 8, 10, 12, 14, 16, **18**, 20 |

20 kg is `bar 2 kg + (4+3+2) × 2 sides`, which is also the physical limit of a 35 cm bar — three Ø160 plates per side. 4 kg and 18 kg are simply not buildable with two dumbbells at once; the app says so rather than prescribing them.

All of this is driven by the inventory stored in settings — add plates, and the ladder, the progression steps and the calculator all widen automatically. No code change needed.

---

## Quick start

```bash
npm run dev          # static server on http://localhost:5173
npm run icons        # regenerate PNG app icons
npm run check        # asset manifest + logic tests + headless render tests
```

There is no build step, no bundler and no dependencies — the browser loads ES modules directly. Node is used only for the dev server, icon generation and tests.

> Service workers only register over HTTPS or on `localhost`. Over `http://<lan-ip>` the app still runs, but offline caching and installation are disabled. For a real on-phone test, deploy to GitHub Pages.

---

## Deploying to GitHub Pages

Pushing to `main` (or `master`) deploys automatically via `.github/workflows/deploy.yml`.

**One-time setup:**

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push a commit. The workflow builds icons, stamps a build id, verifies the offline manifest, and publishes.
4. Open `https://<user>.github.io/<repo>/` on the phone and install it.

**How updates reach the phone.** Each deploy stamps a unique build id into `sw.js` and `index.html`, which changes the service worker's cache name. On the next launch — or when the app returns from the background — it notices the new version, downloads it, and shows an «Оновити» banner. Tapping it activates the new worker and reloads. Nothing is ever silently swapped out mid-workout.

The workflow fails the deploy if a `__BUILD__` placeholder was left unstamped or if a source file is missing from the service worker's asset list, so a broken offline build cannot ship.

---

## Installing on a phone

**Android (Chrome)** — open the page → menu ⋮ → *Install app*. It gets its own icon and runs without the address bar.

**iPhone (Safari)** — open in Safari, not Chrome → Share → *Add to Home Screen*. iOS only allows Safari to install web apps.

The app also works fine as a normal browser tab; installing mainly buys you the icon, full-screen mode and reliable offline access.

---

## Data and privacy

Everything lives in `localStorage` on the device. There is no server, no account and no analytics — nothing leaves the phone.

The trade-off: clearing browser data for the site erases the history. **Профіль → Дані → Експорт у файл** writes a JSON backup, and Import restores it, which is also how you move to a new phone.

---

## Project layout

```
index.html                 app shell
manifest.webmanifest       PWA manifest (icons, shortcuts, standalone mode)
sw.js                      service worker: offline cache + update flow
css/styles.css             the whole theme, mobile-first, dark

js/
  app.js                   router, tab bar, onboarding, update banner
  store.js                 localStorage state, migrations, backup
  ui.js                    DOM helpers, charts, sheets, toasts
  lib/plates.js            plate math for the specific inventory
  lib/nutrition.js         BMR/TDEE, deficit, macros, weight trend, 1RM
  lib/timer.js             rest and interval timers, wake lock, beeps
  data/exercises.js        exercise library (Ukrainian content)
  data/program.js          days, waves, progression, cardio plans
  views/                   one module per screen

scripts/
  dev-server.mjs           dependency-free static server
  make-icons.mjs           generates PNG icons from code
  smoke-test.mjs           pure-logic tests (plates, program, nutrition)
  render-test.mjs          headless DOM render tests for every screen
  check-assets.mjs         guards the offline asset manifest
```

---

## Tests

```bash
node scripts/smoke-test.mjs     # ~1050 assertions on the logic layer
node scripts/render-test.mjs    # builds every screen against a stubbed DOM
node scripts/check-assets.mjs   # every source file is cached for offline use
```

`smoke-test` covers the plate ladders, the progression rules, session generation across the whole 4-week wave, and the nutrition formulas. `render-test` imports the real view modules and renders each screen twice — empty and populated — catching broken imports and view crashes without a browser. Both run in CI on every deploy.

---

## Disclaimer

This is a personal training tool, not medical advice. If you have back, heart or blood-pressure issues, talk to a doctor before starting.
