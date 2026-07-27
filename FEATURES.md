# Features

What the app does today, screen by screen, and what is queued next. UI copy is Ukrainian; this document describes it in English.

---

## 1. Onboarding

Runs once, on first launch. Collects sex, age, height, current weight, goal weight, non-training activity level and lifting experience.

Those inputs feed three things: the calorie and protein targets, the starting weights of every exercise, and the fat-loss forecast. Everything is editable later in **Профіль**, and nothing is mandatory beyond plausible numbers — the form rejects impossible values rather than accepting them silently.

---

## 2. Головна (Home)

The screen you open before a workout.

**Next session card.** Shows which day of the rotation comes next (A, B or C), the wave week, an estimated duration, and a preview of the first exercises with the exact weight the app is prescribing. One tap starts it.

**Bodyweight card.** A progress ring from starting weight toward goal weight, trend-based change over 7 and 30 days, and the smoothed trend value. A single tap opens the weigh-in sheet.

**Daily targets.** Calories, protein, fat and carbohydrates, plus water. Explains the deficit rather than just printing a number, and notes when the deficit was clamped to the safe floor.

**Consistency.** Weeks trained in a row, total sessions, total time under load.

**Week planner.** A 7-day strip — strength / cardio / rest — with completed days ticked and today highlighted. Below it, tappable cardio options that log in one tap.

**Equipment note.** Available weights at a glance and the two safety rules that matter most with threaded bars: tighten the nuts, don't drop bare steel.

---

## 3. Тренування (Session)

The screen you actually use while training, designed for sweaty hands and a phone on the floor.

- **Sticky header** with a progress bar, sets completed, running tonnage and elapsed time.
- **Warm-up and cool-down** as collapsible checklists.
- **Per exercise:** name, muscles worked, an info button with technique cues, and a large weight strip. The `−` and `+` buttons step only through weights the inventory can actually build — never a number you cannot load. Under the weight sits the plate recipe (`2 + 4+3 ×2`).
- **Set chips.** Tap an empty chip to log it: reps (or seconds for timed work) and weight, with `−1` / `+1` quick buttons. Logging a set carries the weight forward to the remaining sets and starts the rest timer automatically. Tap a completed chip to undo it. `+` adds an extra set.
- **Rest timer** as a floating bar: countdown, a filling progress background, `+15 s`, pause and skip. Beeps and vibrates at three seconds and at zero. It counts from an absolute timestamp, so locking the screen or switching apps does not drift it.
- **Screen wake lock** while a session is open, re-acquired when you come back to the app.
- **Finisher block** — the metabolic circuit or intervals, with its own timers and a "done" checkbox.
- **Session note** for sleep, soreness or anything that explains a bad day later.
- **Finish** shows a summary and writes the session to history; **quit** either minimises it (a live entry stays in the tab bar) or discards it.

Everything is written to storage as it happens, so closing the app mid-workout loses nothing.

---

## 4. Прогрес (Progress)

Three tabs.

**Вага.** A chart with daily weigh-ins as dots, the smoothed trend as a line, and the goal as a dashed line. Trend-based change over 7 / 14 / 30 days. A forecast card — kg per week, weeks remaining, projected date. If two weeks pass without movement, a plateau card appears with concrete next steps instead of a generic "keep going". Cardio of the last two weeks and the full weigh-in log with per-entry deletion.

**Сила.** Weekly tonnage bars (weight × reps × sets, counting both dumbbells), and per-exercise records ranked by estimated 1RM (Epley). Tapping a record opens that exercise's full history.

**Історія.** Every session: date, wave week, sets, duration, tonnage, whether the finisher was done, expandable per-exercise detail, and your note. Individual sessions can be deleted.

---

## 5. Вправи (Exercise library)

Around 50 exercises, all performable with two adjustable dumbbells and bodyweight, filterable by muscle group. Each entry carries the muscles worked, technique cues written for someone training alone without a spotter, the loading mode (two dumbbells / one / bodyweight / single plate), a suggested starting weight for your level with the exact plate recipe, and which program days it appears in.

Also here: the full program structure (what each of the A/B/C days contains and how the 4-week wave works), the warm-up and cool-down protocols, and a safety card specific to threaded, uncoated plates.

---

## 6. Інструменти (Tools)

**Plate calculator.** Pick a target weight with a slider or `±`; get the exact loading, how many plates of each size it consumes out of what you own, and a warning when a weight is not buildable, with the closest one that is. Separate modes for a matched pair and a single dumbbell.

**Weight ladder.** Every achievable weight in both modes, with the gaps named explicitly — plus the cheapest way to close them (1 kg and 1.5 kg plates).

**Inventory settings.** Bar weight, plate counts per denomination, the per-dumbbell ceiling and the plates-per-side limit. Change these and every weight suggestion in the app adapts.

**Body metrics.** BMI with an interpretation, BMR, TDEE, and the safe weekly rate of loss for your bodyweight.

**Nutrition.** Calorie and macro targets plus six practical rules that do the work of a food database: protein at every meal, half the plate vegetables, liquid calories, weighing yourself consistently, sleep, and adjusting per week rather than per day.

**Cardio guide.** Zone 2, step days, intervals and full rest — what each is for, how long, and the rough burn.

---

## 7. Профіль (Profile)

Personal data, goal weight with a live recalculation of targets, training settings (default rest, auto-timer, sound, vibration), and program state — which day comes next and which wave week you are in, with manual overrides for when you trained away from the app.

Data section: JSON export, import, and a full reset behind a confirmation. Plus the app version, an update check, and install instructions for Android and iOS.

---

## Cross-cutting behaviour

**Progression.** Double progression: hit the top of the rep range on every set and the next session steps the weight up to the next buildable load; fall short and the weight holds while you chase the reps. At the inventory ceiling it stops asking for more weight and advises reps and tempo instead. Each suggestion shows its reason ("last time 10/10/9 — chase the reps").

**Periodisation.** Weeks cycle base → volume → peak → deload. Week 4 deliberately drops sets and load; the app explains that this is part of the plan, not a lost week.

**Rotation.** Days advance A → B → C per completed session; a full cycle advances the wave week. Skipping a day costs nothing — you simply do the next one.

**Offline.** Everything works with no connection. Updates arrive from GitHub Pages when online, gated behind a banner you tap.

**Installable.** Standalone display, maskable icons, app shortcuts to "start a workout", "weigh in" and the plate calculator.

---

## Roadmap

Ordered roughly by value per unit of work. See ARCHITECTURE.md for where each would slot in.

**Near-term**
- Exercise substitution — swap a prescribed exercise for another from the same group, remembered per slot.
- Custom program editor — build your own day from the library instead of only A/B/C.
- Plate-hint on the lock screen level: a notification when the rest timer ends, so the phone can sleep.
- Body measurements (waist, chest, hips) alongside weight — waist is often the better fat-loss signal.
- Per-exercise notes that persist across sessions ("left shoulder — go light on the negative").

**Medium-term**
- A second program template for when the 20 kg ceiling stops being enough: unilateral emphasis, tempo work, higher rep ranges.
- Photo progress log stored locally as blobs.
- Weekly review screen: adherence, tonnage trend, weight trend and one concrete suggestion.
- Deload auto-detection from missed reps and session notes rather than a fixed calendar.
- Ukrainian voice cues during the finisher (Web Speech API), so you don't look at the screen.

**Longer-term**
- Optional encrypted sync via a file the user controls (e.g. their own cloud folder) — never a server we run.
- Apple Health / Google Fit export as a standard file.
- A second locale, if the app is ever shared beyond one user; the content is already isolated in `data/`.
