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
} from '../js/lib/plates.js';
import { EXERCISES, WARMUP, COOLDOWN, GROUPS } from '../js/data/exercises.js';
import { DAYS, buildSession, waveOf, suggestWeight, WAVES } from '../js/data/program.js';
import { bmr, tdee, calorieTarget, macroTargets, weightTrend, changeOverDays, e1rm, forecast } from '../js/lib/nutrition.js';

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

/* ─────────── Result ─────────── */

console.log(`\n${failed ? '✗' : '✓'} ${passed} checks passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
