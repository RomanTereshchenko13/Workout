/**
 * Smoke tests for the pure logic layer (no DOM needed): plate math, program
 * generation, progression rules and nutrition formulas.
 *
 * Run: node scripts/smoke-test.mjs
 *
 * Keep this green when adding exercises, days or progression rules — it is the
 * cheapest guard against a program that silently prescribes impossible weights.
 */

import {
  achievableLoads, nearestLoad, nextLoadUp, nextLoadDown, maxLoad,
  describeLoad, fitsInventory, plateUsage, DEFAULT_INVENTORY,
  setVolume, exerciseVolume, totalVolume,
} from '../js/lib/plates.js';
import { EXERCISES, WARMUP, COOLDOWN, GROUPS } from '../js/data/exercises.js';
import {
  DAYS, buildSession, waveOf, suggestWeight, WAVES,
  resolveSlot, alternativesFor, groupExercises,
} from '../js/data/program.js';
import { bmr, tdee, calorieTarget, macroTargets, weightTrend, changeOverDays, e1rm, forecast } from '../js/lib/nutrition.js';
import { isoDate, parseISO, daysAgoISO, addDaysISO, mondayOfISO, daysBetween } from '../js/lib/dates.js';

let failed = 0;
let passed = 0;

function ok(cond, label, extra = '') {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

function group(name, fn) {
  console.log(`\n${name}`);
  fn();
}

/* ─────────── Plate math ─────────── */

group('Plate math (bar 2 kg, 4×2 + 4×3 + 4×4 kg, cap 20 kg/dumbbell)', () => {
  const pair = achievableLoads(DEFAULT_INVENTORY, 'pair').map((l) => l.kg);
  const single = achievableLoads(DEFAULT_INVENTORY, 'single').map((l) => l.kg);

  ok(JSON.stringify(pair) === JSON.stringify([2, 6, 8, 10, 12, 14, 16, 20]), 'pair ladder is 2/6/8/10/12/14/16/20', pair.join(','));
  ok(JSON.stringify(single) === JSON.stringify([2, 6, 8, 10, 12, 14, 16, 18, 20]), 'single ladder adds 18 kg', single.join(','));
  ok(maxLoad(DEFAULT_INVENTORY, 'pair') === 20, 'max per dumbbell is 20 kg');
  ok(!pair.includes(4) && !pair.includes(18), 'known gaps (4, 18) are absent in pair mode');

  // Every combination must be physically buildable from the inventory.
  for (const mode of ['pair', 'single']) {
    for (const load of achievableLoads(DEFAULT_INVENTORY, mode)) {
      ok(fitsInventory(load, DEFAULT_INVENTORY, mode), `${load.kg} kg (${mode}) fits inventory`, JSON.stringify(plateUsage(load, mode)));
      ok(load.plates <= DEFAULT_INVENTORY.maxPlatesPerSide, `${load.kg} kg (${mode}) respects 3-plates-per-side limit`);
      const sum = Object.entries(load.side).reduce((a, [d, n]) => a + Number(d) * n, 0);
      ok(Math.abs(DEFAULT_INVENTORY.barKg + sum * 2 - load.kg) < 0.01, `${load.kg} kg (${mode}) arithmetic is consistent`);
    }
  }

  ok(nearestLoad(13, DEFAULT_INVENTORY, 'pair').kg === 12, 'nearest to 13 kg is 12 kg');
  ok(nearestLoad(9, DEFAULT_INVENTORY, 'pair', 'up').kg === 10, 'nearest-up from 9 kg is 10 kg');
  ok(nearestLoad(9, DEFAULT_INVENTORY, 'pair', 'down').kg === 8, 'nearest-down from 9 kg is 8 kg');
  ok(nextLoadUp(16, DEFAULT_INVENTORY, 'pair').kg === 20, 'step up from 16 kg is 20 kg (pair)');
  ok(nextLoadUp(16, DEFAULT_INVENTORY, 'single').kg === 18, 'step up from 16 kg is 18 kg (single)');
  ok(nextLoadUp(20, DEFAULT_INVENTORY, 'pair').kg === 20, 'step up at the ceiling stays at 20 kg');
  ok(nextLoadDown(2, DEFAULT_INVENTORY, 'pair') === null, 'no step below the bare bar');
  ok(describeLoad(nearestLoad(20, DEFAULT_INVENTORY, 'pair'), DEFAULT_INVENTORY, 'pair').includes('4+3+2'), '20 kg is described as 4+3+2 per side');

  // A bigger inventory must widen the ladder without code changes.
  const bigger = { barKg: 2, plates: { 1: 4, 2: 4, 3: 4, 4: 4 }, maxPerDumbbellKg: 24, maxPlatesPerSide: 4 };
  const wider = achievableLoads(bigger, 'pair').map((l) => l.kg);
  ok(wider.includes(4) && wider.includes(18), 'adding 1 kg plates fills the 4 and 18 kg gaps', wider.join(','));
});

/* ─────────── Exercise library ─────────── */

group('Exercise library', () => {
  const ids = Object.keys(EXERCISES);
  ok(ids.length >= 40, `library has ${ids.length} exercises`);

  for (const [id, e] of Object.entries(EXERCISES)) {
    ok(!!e.name && !!e.muscles, `${id} has name and muscles`);
    ok(['legs', 'push', 'pull', 'core', 'full'].includes(e.group), `${id} has a known group`, e.group);
    ok(['pair', 'single', 'bw', 'plate'].includes(e.mode), `${id} has a known mode`, e.mode);
    ok(Array.isArray(e.cues) && e.cues.length >= 1, `${id} has technique cues`);
    if (e.mode === 'bw') {
      ok(e.start === null, `${id} (bodyweight) has no starting weight`);
    } else {
      ok(e.start && ['beginner', 'inter', 'adv'].every((k) => typeof e.start[k] === 'number'), `${id} has start weights for all levels`);
      const cap = DEFAULT_INVENTORY.maxPerDumbbellKg;
      ok(Object.values(e.start).every((v) => v >= 2 && v <= cap), `${id} start weights are within 2–${cap} kg`, JSON.stringify(e.start));
    }
  }
  ok(Object.keys(GROUPS).length === 5, 'five muscle groups are defined');
  ok(WARMUP.length >= 5 && COOLDOWN.length >= 3, 'warm-up and cool-down are filled in');
});

/* ─────────── Program structure ─────────── */

group('Program structure', () => {
  ok(DAYS.length === 3, 'three training days (A/B/C)');
  for (const day of DAYS) {
    ok(day.main.length >= 5, `day ${day.key} has at least 5 main exercises`);
    for (const slot of day.main) {
      ok(!!EXERCISES[slot.id], `day ${day.key} references a real exercise: ${slot.id}`);
      ok(slot.sets >= 2 && slot.rest >= 30, `day ${day.key} / ${slot.id} has sane sets and rest`);
    }
    for (const item of day.finisher?.items || []) {
      ok(!!EXERCISES[item.id], `day ${day.key} finisher references a real exercise: ${item.id}`);
      ok(!!(item.reps || item.time), `day ${day.key} finisher item ${item.id} has reps or time`);
    }
  }
  // Balance check: across a full A→B→C cycle every muscle group is trained.
  const groupsHit = new Set(DAYS.flatMap((d) => d.main.map((s) => EXERCISES[s.id].group)));
  ok(['legs', 'push', 'pull', 'core'].every((g) => groupsHit.has(g)), 'a full cycle covers legs, push, pull and core', [...groupsHit].join(','));

  for (let w = 1; w <= 8; w++) {
    const wave = waveOf(w);
    ok(wave.n >= 1 && wave.n <= 4 && !!WAVES[wave.n], `week ${w} maps into the 4-week wave (${wave.n})`);
    ok(wave.reps[0] <= wave.reps[1], `week ${w} rep range is ordered`);
  }
  ok(waveOf(4).factor < 1, 'week 4 is a deload (lighter)');
  ok(waveOf(5).n === 1, 'week 5 restarts the wave');
});

/* ─────────── Session generation & progression ─────────── */

group('Session generation', () => {
  const ladderPair = achievableLoads(DEFAULT_INVENTORY, 'pair').map((l) => l.kg);
  const ladderSingle = achievableLoads(DEFAULT_INVENTORY, 'single').map((l) => l.kg);

  for (let rotation = 0; rotation < 6; rotation++) {
    for (const week of [1, 2, 3, 4]) {
      const s = buildSession({ rotation, week, history: [], inventory: DEFAULT_INVENTORY, experience: 'beginner' });
      ok(s.exercises.length >= 5, `rotation ${rotation}, week ${week}: session is populated`);
      ok(s.estMinutes > 20 && s.estMinutes < 120, `rotation ${rotation}, week ${week}: duration estimate is sane (${s.estMinutes} min)`);
      for (const e of s.exercises) {
        if (e.mode === 'bw') {
          ok(e.suggested.kg === null, `${e.id}: bodyweight exercise has no weight`);
        } else {
          const ladder = e.mode === 'pair' ? ladderPair : ladderSingle;
          ok(ladder.includes(e.suggested.kg), `${e.id}: suggested ${e.suggested.kg} kg exists on the ladder`);
        }
        ok(e.sets >= 2, `${e.id}: at least 2 sets`);
        ok(e.reps.low > 0 && e.reps.high >= e.reps.low, `${e.id}: rep target is valid`);
      }
    }
  }
});

group('Progression rules', () => {
  const wave = waveOf(1); // top of range = 10
  const meta = { id: 'floor-press', ...EXERCISES['floor-press'] };

  const hitAll = [{
    date: '2026-07-20',
    exercises: [{ id: 'floor-press', mode: 'pair', sets: [{ kg: 10, reps: 10, done: true }, { kg: 10, reps: 10, done: true }, { kg: 10, reps: 10, done: true }] }],
  }];
  const up = suggestWeight(meta, { history: hitAll, inventory: DEFAULT_INVENTORY, experience: 'beginner', wave });
  ok(up.kg === 12 && up.progressed, 'hitting the top of the rep range steps the weight up', `${up.kg} kg`);

  const missed = [{
    date: '2026-07-20',
    exercises: [{ id: 'floor-press', mode: 'pair', sets: [{ kg: 10, reps: 8, done: true }, { kg: 10, reps: 7, done: true }, { kg: 10, reps: 6, done: true }] }],
  }];
  const hold = suggestWeight(meta, { history: missed, inventory: DEFAULT_INVENTORY, experience: 'beginner', wave });
  ok(hold.kg === 10 && !hold.progressed, 'missing the target keeps the same weight', `${hold.kg} kg`);

  const atCeiling = [{
    date: '2026-07-20',
    exercises: [{ id: 'floor-press', mode: 'pair', sets: [{ kg: 20, reps: 12, done: true }, { kg: 20, reps: 12, done: true }] }],
  }];
  const capped = suggestWeight(meta, { history: atCeiling, inventory: DEFAULT_INVENTORY, experience: 'beginner', wave });
  ok(capped.kg === 20 && !capped.progressed && /максимум/i.test(capped.reason), 'at the inventory ceiling it advises reps/tempo instead of weight');

  const fresh = suggestWeight(meta, { history: [], inventory: DEFAULT_INVENTORY, experience: 'adv', wave });
  ok(fresh.kg >= 12, 'an advanced lifter starts heavier than a beginner', `${fresh.kg} kg`);

  const bw = suggestWeight({ id: 'pushup', ...EXERCISES.pushup }, { history: [], inventory: DEFAULT_INVENTORY, experience: 'beginner', wave });
  ok(bw.kg === null, 'bodyweight exercises never get a weight');
});

/* ─────────── Nutrition ─────────── */

group('Nutrition math', () => {
  const p = { sex: 'm', age: 30, heightCm: 178, weightKg: 85, goalWeightKg: 78, activity: 'light', experience: 'beginner' };
  // Mifflin–St Jeor: 10*85 + 6.25*178 - 5*30 + 5 = 1817.5 → 1818
  ok(bmr(p) === 1818, 'BMR matches Mifflin–St Jeor by hand', String(bmr(p)));
  ok(tdee(p) === Math.round(1818 * 1.375), 'TDEE applies the activity factor', String(tdee(p)));

  const cal = calorieTarget(p);
  ok(cal.mode === 'cut' && cal.deficit > 0, 'a lower goal weight produces a deficit');
  ok(cal.kcal >= bmr(p), 'the target never drops below BMR');

  const m = macroTargets(p);
  ok(m.proteinG >= 140 && m.proteinG <= 200, `protein target is high but sane (${m.proteinG} g)`);
  ok(m.carbsG > 0 && m.fatG > 0, 'fat and carbs stay positive');
  const kcalFromMacros = m.proteinG * 4 + m.fatG * 9 + m.carbsG * 4;
  ok(Math.abs(kcalFromMacros - m.kcal) < 60, 'macros add up to the calorie target', `${kcalFromMacros} vs ${m.kcal}`);

  // A very light person must not be pushed into a dangerous deficit.
  const light = { ...p, weightKg: 58, goalWeightKg: 50, heightCm: 165, sex: 'f', age: 25 };
  ok(calorieTarget(light).kcal >= 1300, 'the floor protects small deficits', String(calorieTarget(light).kcal));

  const maintain = { ...p, goalWeightKg: 85 };
  ok(calorieTarget(maintain).mode === 'maintain', 'equal goal weight means maintenance');

  const entries = [
    { d: '2026-07-01', kg: 86 }, { d: '2026-07-02', kg: 85.4 }, { d: '2026-07-03', kg: 86.2 },
    { d: '2026-07-10', kg: 85 }, { d: '2026-07-20', kg: 84.1 },
  ];
  const trend = weightTrend(entries);
  ok(trend.length === entries.length && trend.every((t) => typeof t.trend === 'number'), 'the trend line covers every entry');
  ok(trend[trend.length - 1].trend > 84 && trend[trend.length - 1].trend < 86, 'smoothing lags the raw value (as intended)');
  ok(changeOverDays(entries, 3650).delta < 0, 'a long window shows the downward change');
  ok(changeOverDays([{ d: '2026-07-01', kg: 86 }], 7) === null, 'a single measurement yields no change');

  ok(e1rm(20, 10) === 26.7, 'Epley 1RM for 20 kg × 10 = 26.7 kg', String(e1rm(20, 10)));
  ok(e1rm(0, 10) === 0 && e1rm(20, 0) === 0, 'incomplete input gives 0 rather than NaN');

  const f = forecast(p);
  ok(f && f.weeks > 0 && f.kgPerWeek > 0 && /^\d{4}-\d{2}-\d{2}$/.test(f.dateISO), 'forecast returns weeks, rate and a date');
  ok(forecast({ ...p, goalWeightKg: 85 }) === null, 'no forecast without a deficit');
});

/* ─────────── Calendar dates ─────────── */

group('Local calendar dates', () => {
  // Forced to the app's actual timezone. CI runs in UTC, where the bug this
  // module fixes cannot reproduce at all — an assertion that only holds in UTC
  // would be a guard that never guards anything.
  process.env.TZ = 'Europe/Kyiv';
  const offsetMin = -new Date(2026, 6, 27, 12).getTimezoneOffset();
  ok(offsetMin === 180, 'the suite runs the date checks in Europe/Kyiv (UTC+3 in July)', `${offsetMin} min`);

  ok(isoDate(new Date(2026, 6, 27, 13, 30)) === '2026-07-27', 'isoDate reads local calendar fields');
  // The regression this module exists for: a Date at local midnight converted
  // through UTC lands on the previous day anywhere east of Greenwich.
  const earlyMorning = new Date(2026, 6, 27, 0, 30);
  ok(isoDate(earlyMorning) === '2026-07-27', 'a time just after local midnight still reports today');
  ok(earlyMorning.toISOString().slice(0, 10) === '2026-07-26',
    'and toISOString really would have reported yesterday — this is the bug being guarded',
    earlyMorning.toISOString());
  ok(isoDate(new Date(2026, 6, 27, 23, 59)) === '2026-07-27', 'a time just before local midnight still reports today');
  ok(isoDate(new Date(2026, 0, 1, 2, 0)) === '2026-01-01', 'new year at 02:00 local is 1 January, not 31 December');

  const p = parseISO('2026-07-27');
  ok(p.getFullYear() === 2026 && p.getMonth() === 6 && p.getDate() === 27, 'parseISO round-trips through local fields');
  ok(p.getHours() === 12, 'parseISO anchors at noon so DST cannot shift the day');
  ok(isoDate(parseISO('2026-03-29')) === '2026-03-29', 'a DST spring-forward date survives the round trip');
  ok(isoDate(parseISO('2026-10-25')) === '2026-10-25', 'a DST fall-back date survives the round trip');

  ok(addDaysISO('2026-07-27', 5) === '2026-08-01', 'addDaysISO crosses a month boundary');
  ok(addDaysISO('2026-12-30', 3) === '2027-01-02', 'addDaysISO crosses a year boundary');
  ok(addDaysISO('2026-03-01', -1) === '2026-02-28', 'addDaysISO steps backwards');

  ok(mondayOfISO('2026-07-27') === '2026-07-27', 'Monday maps to itself');
  ok(mondayOfISO('2026-07-26') === '2026-07-20', 'Sunday belongs to the week that started six days earlier');
  ok(mondayOfISO('2026-08-01') === '2026-07-27', 'Saturday maps back to its Monday');
  for (let i = 0; i < 7; i++) {
    const day = addDaysISO('2026-07-27', i);
    ok(mondayOfISO(day) === '2026-07-27', `every day of the week resolves to the same Monday (${day})`);
  }

  ok(daysBetween('2026-07-20', '2026-07-27') === 7, 'daysBetween counts forward');
  ok(daysBetween('2026-07-27', '2026-07-20') === -7, 'daysBetween counts backward');
  ok(daysBetween('2026-03-28', '2026-03-30') === 2, 'daysBetween is unaffected by a DST change');
  ok(daysAgoISO(0) === isoDate(), 'daysAgoISO(0) is today');
  ok(daysBetween(daysAgoISO(14), isoDate()) === 14, 'daysAgoISO(14) really is fourteen days back');
  ok(daysBetween(isoDate(), daysAgoISO(-30)) === 30, 'a negative argument looks forward');
});

/* ─────────── Tonnage ─────────── */

group('Tonnage', () => {
  const pair = { mode: 'pair' };
  const single = { mode: 'single' };

  ok(setVolume({ done: true, kg: 10, reps: 8 }, pair) === 160, 'a pair of dumbbells counts both hands (10×2×8)');
  ok(setVolume({ done: true, kg: 10, reps: 8 }, single) === 80, 'a single dumbbell counts once');
  ok(setVolume({ done: false, kg: 10, reps: 8 }, pair) === 0, 'an unlogged set contributes nothing');
  ok(setVolume({ done: true, kg: 0, reps: 8 }, pair) === 0, 'bodyweight work contributes no tonnage');
  ok(setVolume({ done: true, kg: 12, reps: 0 }, { mode: 'single', isTime: true }) === 12, 'a timed hold counts its load once');

  // The bug this replaced: "8 reverse lunges" means 8 per leg, and counting it
  // once halved the tonnage of every unilateral exercise in the program.
  ok(setVolume({ done: true, kg: 10, reps: 8 }, { mode: 'single', perSide: true }) === 160,
    'a per-side set counts both sides');
  ok(setVolume({ done: true, kg: 10, reps: 8 }, { mode: 'single', perSide: true })
    === 2 * setVolume({ done: true, kg: 10, reps: 8 }, single), 'per-side is exactly double the bilateral figure');

  const ex = { mode: 'pair', sets: [{ done: true, kg: 10, reps: 8 }, { done: true, kg: 12, reps: 6 }, { done: false, kg: 12, reps: 6 }] };
  ok(exerciseVolume(ex) === 160 + 144, 'exerciseVolume sums only completed sets');
  ok(totalVolume([ex, ex]) === 2 * exerciseVolume(ex), 'totalVolume adds exercises up');
  ok(totalVolume([]) === 0 && exerciseVolume({}) === 0, 'empty input is 0, not NaN');

  // Every exercise the program prescribes must produce a finite, non-negative figure.
  for (const day of DAYS) {
    for (const slot of day.main) {
      const meta = EXERCISES[slot.id];
      const v = setVolume({ done: true, kg: 10, reps: 10 }, { mode: meta.mode, perSide: slot.perSide, isTime: slot.time });
      ok(Number.isFinite(v) && v >= 0, `${slot.id}: tonnage is a sane number`, String(v));
    }
  }
});

/* ─────────── Supersets ─────────── */

group('Superset grouping', () => {
  const blocks = groupExercises([
    { id: 'a', ss: null }, { id: 'b', ss: 1 }, { id: 'c', ss: 1 }, { id: 'd', ss: null },
  ]);
  ok(blocks.length === 3, 'consecutive slots sharing an ss value collapse into one block', String(blocks.length));
  ok(blocks[1].items.length === 2 && blocks[1].ss === 1, 'the superset block holds both exercises');
  ok(blocks[1].items.map((it) => it.i).join(',') === '1,2', 'original indexes survive grouping');
  ok(blocks[0].ss === null && blocks[0].items.length === 1, 'ungrouped exercises stay alone');

  // Same ss value but not adjacent must not be merged across the gap.
  const split = groupExercises([{ ss: 1 }, { ss: null }, { ss: 1 }]);
  ok(split.length === 3, 'non-adjacent slots with the same ss are not merged', String(split.length));
  ok(groupExercises([]).length === 0, 'an empty session groups to nothing');

  // Every day that declares supersets must actually produce one.
  for (const day of DAYS) {
    if (!day.main.some((s) => s.ss)) continue;
    const session = buildSession({ rotation: DAYS.indexOf(day), week: 1, history: [], inventory: DEFAULT_INVENTORY, experience: 'beginner' });
    const supersets = groupExercises(session.exercises).filter((b) => b.ss !== null);
    ok(supersets.length >= 1, `day ${day.key} renders at least one superset`);
    ok(supersets.every((b) => b.items.length >= 2), `day ${day.key} supersets pair at least two exercises`);
  }
});

/* ─────────── Substitutions ─────────── */

group('Exercise substitution', () => {
  ok(resolveSlot('ohp', {}) === 'ohp', 'no substitution resolves to the original slot');
  ok(resolveSlot('ohp', { ohp: 'arnold' }) === 'arnold', 'a substitution resolves to the replacement');
  ok(resolveSlot('ohp', { ohp: 'not-a-real-exercise' }) === 'ohp', 'a bogus replacement falls back to the original');
  ok(resolveSlot('ohp', { ohp: '' }) === 'ohp', 'an empty replacement falls back to the original');

  const alts = alternativesFor('ohp');
  ok(alts.length >= 3, `the overhead press has alternatives (${alts.length})`);
  ok(alts.every((a) => a.id !== 'ohp'), 'an exercise is never its own alternative');
  ok(alts.every((a) => EXERCISES[a.id].group === EXERCISES.ohp.group), 'alternatives share the muscle group');
  ok(alts[0].sameMode, 'alternatives that load the same way are offered first');
  ok(alternativesFor('nope').length === 0, 'an unknown exercise has no alternatives');

  // Every slot in the program must have something to swap to, or the button lies.
  for (const day of DAYS) {
    for (const slot of day.main) {
      ok(alternativesFor(slot.id).length >= 1, `${slot.id} has at least one alternative`);
    }
  }

  const swapped = buildSession({
    rotation: 0, week: 1, history: [], inventory: DEFAULT_INVENTORY,
    experience: 'beginner', substitutions: { ohp: 'arnold' },
  });
  const slot = swapped.exercises.find((e) => e.slotId === 'ohp');
  ok(slot && slot.id === 'arnold' && slot.substituted, 'buildSession honours a permanent substitution');
  ok(slot.name === EXERCISES.arnold.name, 'the substituted exercise carries its own name');
  ok(achievableLoads(DEFAULT_INVENTORY, slot.mode === 'pair' ? 'pair' : 'single').some((l) => l.kg === slot.suggested.kg),
    'the substitute gets a weight that exists on the ladder', String(slot.suggested.kg));

  const plain = buildSession({ rotation: 0, week: 1, history: [], inventory: DEFAULT_INVENTORY, experience: 'beginner' });
  ok(plain.exercises.every((e) => e.slotId === e.id && !e.substituted), 'an unsubstituted session marks nothing as swapped');
  ok(plain.exercises.length === swapped.exercises.length, 'substituting does not change the session shape');
});

/* ─────────── Result ─────────── */

console.log(`\n${failed ? '✗' : '✓'} ${passed} checks passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
