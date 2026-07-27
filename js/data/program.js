/**
 * The program: three full-body sessions per week (A / B / C) in rotation,
 * 4-week waves ending in a deload, and double progression (reps first, then load).
 * Metabolic finishers and rest-day cardio serve the fat-loss goal.
 */

import { nearestLoad, nextLoadUp, achievableLoads } from '../lib/plates.js';
import { EXERCISES } from './exercises.js';

/** Load wave within the 4-week block. */
export const WAVES = {
  1: { label: 'Тиждень 1 — база', setsDelta: 0, reps: [8, 10], factor: 1, hint: 'Знайди робочу вагу. Останнє повторення має бути важким, але чистим.' },
  2: { label: 'Тиждень 2 — об’єм', setsDelta: 0, reps: [10, 12], factor: 1, hint: 'Та сама вага, більше повторень. Тримай техніку.' },
  3: { label: 'Тиждень 3 — пік', setsDelta: 1, reps: [8, 12], factor: 1, hint: 'Найважчий тиждень: +1 підхід, пробуй крок ваги вгору.' },
  4: { label: 'Тиждень 4 — розгрузка', setsDelta: -1, reps: [8, 8], factor: 0.75, hint: 'Легко й технічно. Це частина плану — тіло відновлюється й росте.' },
};

/**
 * Training days. Exercises sharing an `ss` value are performed as a superset.
 * Rep targets come from the wave — a day only declares base sets and rest.
 */
export const DAYS = [
  {
    key: 'A',
    title: 'День A — Жим + ноги',
    focus: 'Груди, плечі, трицепс, квадрицепси',
    color: '#ff6b4a',
    main: [
      { id: 'goblet-squat', sets: 3, rest: 100 },
      { id: 'floor-press', sets: 3, rest: 100 },
      { id: 'reverse-lunge', sets: 3, rest: 80, perSide: true },
      { id: 'ohp', sets: 3, rest: 80 },
      { id: 'lateral-raise', sets: 3, rest: 50, ss: 1 },
      { id: 'narrow-floor-press', sets: 3, rest: 50, ss: 1 },
      { id: 'plank', sets: 3, rest: 45, time: true },
    ],
    finisher: {
      title: 'Фінішер: 4 кола',
      type: 'circuit',
      rounds: 4,
      rest: 60,
      items: [
        { id: 'thruster', reps: 10 },
        { id: 'mountain-climber', time: 30 },
        { id: 'jump-squat', reps: 12 },
      ],
    },
  },
  {
    key: 'B',
    title: 'День B — Тяга + задній ланцюг',
    focus: 'Спина, біцепс, задня поверхня стегна, сідниці',
    color: '#4a9eff',
    main: [
      { id: 'rdl', sets: 4, rest: 100 },
      { id: 'bent-row', sets: 4, rest: 100 },
      { id: 'hip-thrust', sets: 3, rest: 80 },
      { id: 'one-arm-row', sets: 3, rest: 70, perSide: true },
      { id: 'hammer-curl', sets: 3, rest: 50, ss: 1 },
      { id: 'reverse-fly', sets: 3, rest: 50, ss: 1 },
      { id: 'suitcase-carry', sets: 2, rest: 45, time: true, perSide: true },
    ],
    finisher: {
      title: 'Фінішер: махи + берпі',
      type: 'circuit',
      rounds: 4,
      rest: 60,
      items: [
        { id: 'db-swing', reps: 15 },
        { id: 'burpee', reps: 8 },
        { id: 'high-knees', time: 30 },
      ],
    },
  },
  {
    key: 'C',
    title: 'День C — Ноги + все тіло',
    focus: 'Сідниці, стегна, кор, витривалість',
    color: '#3ddc84',
    main: [
      { id: 'bulgarian-split', sets: 3, rest: 90, perSide: true },
      { id: 'push-press', sets: 3, rest: 90 },
      { id: 'sumo-dl', sets: 3, rest: 90 },
      { id: 'renegade-row', sets: 3, rest: 70, perSide: true },
      { id: 'calf-raise', sets: 3, rest: 45, ss: 1 },
      { id: 'russian-twist', sets: 3, rest: 45, ss: 1, perSide: true },
      { id: 'farmer-walk', sets: 3, rest: 60, time: true },
    ],
    finisher: {
      title: 'Фінішер: інтервали 30/30',
      type: 'intervals',
      rounds: 3,
      work: 30,
      rest: 30,
      items: [
        { id: 'db-snatch', time: 30 },
        { id: 'jump-squat', time: 30 },
        { id: 'man-maker', time: 30 },
        { id: 'mountain-climber', time: 30 },
      ],
    },
  },
];

export function dayByKey(key) {
  return DAYS.find((d) => d.key === key) || DAYS[0];
}

/** Rotation index → training day. */
export function dayByRotation(rotation) {
  return DAYS[((rotation % DAYS.length) + DAYS.length) % DAYS.length];
}

/** Position inside the 4-week block (1..4). */
export function waveOf(weekNumber) {
  const w = ((weekNumber - 1) % 4) + 1;
  return { n: w, ...WAVES[w] };
}

const LEVEL_KEY = { beginner: 'beginner', inter: 'inter', adv: 'adv' };

/**
 * Pick the working weight: derive it from history, or estimate a start.
 * @param {object} exercise an EXERCISES entry plus its id
 * @param {object} ctx {history, inventory, experience, wave}
 * @returns {{kg:number|null, load:object|null, reason:string, progressed:boolean}}
 */
export function suggestWeight(exercise, ctx) {
  const { inventory, experience = 'beginner', wave } = ctx;
  const mode = exercise.mode;
  if (mode === 'bw') return { kg: null, load: null, reason: 'Вага тіла', progressed: false };

  const loadMode = mode === 'pair' ? 'pair' : 'single';
  const last = lastPerformance(ctx.history, exercise.id);

  // No history yet — estimate from the declared experience level.
  if (!last) {
    const base = (exercise.start && exercise.start[LEVEL_KEY[experience]]) || 6;
    const load = nearestLoad(base * (wave?.factor ?? 1), inventory, loadMode, 'down');
    return { kg: load.kg, load, reason: 'Стартова оцінка — підкоригуй по відчуттях', progressed: false };
  }

  const done = last.sets.filter((s) => s.done && s.reps > 0);
  if (!done.length) {
    const load = nearestLoad(last.topWeight, inventory, loadMode, 'down');
    return { kg: load.kg, load, reason: 'Як минулого разу', progressed: false };
  }

  const target = wave?.reps?.[1] ?? 12;
  const allHitTop = done.every((s) => s.reps >= target);
  const weight = last.topWeight;

  if (allHitTop) {
    const up = nextLoadUp(weight, inventory, loadMode);
    if (up.kg > weight) {
      return {
        kg: up.kg,
        load: up,
        reason: `Минулого разу закрив усі підходи по ${target} — крок вгору`,
        progressed: true,
      };
    }
    return {
      kg: weight,
      load: nearestLoad(weight, inventory, loadMode),
      reason: 'Максимум інвентарю — додавай повторення або уповільнюй темп (3 с вниз)',
      progressed: false,
    };
  }

  const load = nearestLoad(weight * (wave?.factor ?? 1), inventory, loadMode, 'down');
  return {
    kg: load.kg,
    load,
    reason: `Минулого разу: ${done.map((s) => s.reps).join('/')} — добери повторення`,
    progressed: false,
  };
}

/** Most recent performance of an exercise, taken from history. */
export function lastPerformance(history = [], exerciseId) {
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = (history[i].exercises || []).find((e) => e.id === exerciseId);
    if (entry) {
      const sets = entry.sets || [];
      const weights = sets.filter((s) => s.done).map((s) => s.kg || 0);
      return {
        date: history[i].date,
        sets,
        topWeight: weights.length ? Math.max(...weights) : 0,
      };
    }
  }
  return null;
}

/**
 * Build the full session plan.
 * @returns {{day, wave, exercises:Array, finisher, estMinutes:number}}
 */
export function buildSession({ rotation, week, history, inventory, experience }) {
  const day = dayByRotation(rotation);
  const wave = waveOf(week);

  const exercises = day.main.map((slot) => {
    const meta = EXERCISES[slot.id];
    const sets = Math.max(2, slot.sets + wave.setsDelta);
    const sug = suggestWeight({ id: slot.id, ...meta }, { history, inventory, experience, wave });
    const isTime = !!slot.time;
    const reps = isTime
      ? timeTarget(slot.id, wave)
      : { low: wave.reps[0], high: wave.reps[1] };
    return {
      ...slot,
      name: meta.name,
      muscles: meta.muscles,
      mode: meta.mode,
      cues: meta.cues,
      sets,
      isTime,
      reps,
      suggested: sug,
    };
  });

  const estMinutes = Math.round(
    exercises.reduce((acc, e) => acc + e.sets * ((e.isTime ? 40 : 35) + e.rest) / 60, 0) +
      (day.finisher ? 9 : 0) +
      8, // warm-up
  );

  return { day, wave, exercises, finisher: day.finisher, estMinutes };
}

function timeTarget(id, wave) {
  const base = { plank: 45, 'side-plank': 30, 'farmer-walk': 45, 'suitcase-carry': 30, 'wall-sit': 45, 'hollow-hold': 30 }[id] || 40;
  const bump = { 1: 0, 2: 10, 3: 15, 4: -10 }[wave.n] || 0;
  const v = Math.max(20, base + bump);
  return { low: v, high: v };
}

/** Cardio options for the days between strength sessions. */
export const CARDIO = [
  {
    key: 'zone2',
    title: 'Зона 2 — спокійне кардіо',
    detail: '40–55 хв швидкої ходьби або велосипеда. Пульс такий, що можеш говорити реченнями.',
    why: 'Найкращий інструмент для витрати жиру без втоми, яка зіпсує силове тренування.',
    kcal: (kg) => Math.round(kg * 3.5),
  },
  {
    key: 'steps',
    title: 'День кроків',
    detail: 'Ціль 9 000–12 000 кроків. Розбий на 3 прогулянки по 20 хв, зокрема одну після вечері.',
    why: 'NEAT (побутова активність) дає більше витрат за тиждень, ніж будь-яке тренування.',
    kcal: (kg) => Math.round(kg * 2.2),
  },
  {
    key: 'intervals',
    title: 'Інтервали (1 раз на тиждень, не поспіль із днем C)',
    detail: '5 хв розминка → 8× (30 с швидко / 90 с спокійно) → 5 хв заминка.',
    why: 'Піднімає VO2max і апетитний контроль. Більше одного разу — заважає відновленню.',
    kcal: (kg) => Math.round(kg * 3.2),
  },
  {
    key: 'rest',
    title: 'Повний відпочинок',
    detail: 'Розтяжка 10 хв, сон 7,5–9 год. Один такий день на тиждень обов’язковий.',
    why: 'М’язи ростуть у відпочинку, а недосип напряму піднімає тягу до їжі.',
    kcal: () => 0,
  },
];

/** Suggested weekly layout for three strength days. */
export const WEEK_TEMPLATE = [
  { day: 'Пн', kind: 'strength', label: 'Силове (A)' },
  { day: 'Вт', kind: 'cardio', label: 'Зона 2' },
  { day: 'Ср', kind: 'strength', label: 'Силове (B)' },
  { day: 'Чт', kind: 'cardio', label: 'Кроки' },
  { day: 'Пт', kind: 'strength', label: 'Силове (C)' },
  { day: 'Сб', kind: 'cardio', label: 'Інтервали або довга прогулянка' },
  { day: 'Нд', kind: 'rest', label: 'Відпочинок + розтяжка' },
];

/** Full ladder of available weights — surfaced in the UI as a reference. */
export function loadLadder(inventory) {
  return {
    pair: achievableLoads(inventory, 'pair').map((l) => l.kg),
    single: achievableLoads(inventory, 'single').map((l) => l.kg),
  };
}
