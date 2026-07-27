/**
 * Fat-loss math: BMR, TDEE, deficit, protein, safe rate, forecast.
 * Mifflin–St Jeor is the standard estimator for resting metabolism.
 */

import { daysAgoISO } from './dates.js';

export const ACTIVITY = {
  sed: { label: 'Сидяча робота, мало руху', factor: 1.2 },
  light: { label: 'Легка активність, 1–3 тренування', factor: 1.375 },
  moderate: { label: 'Помірна, 3–5 тренувань', factor: 1.55 },
  high: { label: 'Висока, фізична робота або 6+', factor: 1.725 },
};

export function bmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === 'f' ? base - 161 : base + 5);
}

export function tdee(profile) {
  const f = ACTIVITY[profile.activity]?.factor ?? 1.375;
  return Math.round(bmr(profile) * f);
}

/**
 * Calorie target: 20% under TDEE, but never below BMR×1.05 nor below a hard
 * floor — a deeper cut costs muscle and disrupts hormones.
 */
export function calorieTarget(profile) {
  const t = tdee(profile);
  const b = bmr(profile);
  const wantsLoss = profile.goalWeightKg && profile.goalWeightKg < profile.weightKg - 0.5;
  if (!wantsLoss) return { kcal: t, deficit: 0, floored: false, mode: 'maintain' };

  const raw = Math.round(t * 0.8);
  const floor = Math.max(Math.round(b * 1.05), profile.sex === 'f' ? 1300 : 1600);
  const kcal = Math.max(raw, floor);
  return {
    kcal,
    deficit: t - kcal,
    floored: kcal > raw,
    mode: 'cut',
  };
}

/** Protein 1.8–2.2 g/kg: the high end preserves muscle in a deficit and blunts hunger. */
export function macroTargets(profile) {
  const { kcal, mode } = calorieTarget(profile);
  const refWeight = Math.max(profile.goalWeightKg || profile.weightKg, profile.weightKg * 0.85);
  const proteinG = Math.round(refWeight * (mode === 'cut' ? 2.0 : 1.7));
  const fatG = Math.round((kcal * 0.27) / 9);
  const carbsG = Math.max(50, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, fatG, carbsG, waterMl: Math.round(profile.weightKg * 33) };
}

export function bmi(profile) {
  const h = profile.heightCm / 100;
  const v = profile.weightKg / (h * h);
  return Math.round(v * 10) / 10;
}

export function bmiLabel(v) {
  if (v < 18.5) return { text: 'Недостатня вага', tone: 'warn' };
  if (v < 25) return { text: 'Норма', tone: 'good' };
  if (v < 30) return { text: 'Надлишкова вага', tone: 'warn' };
  if (v < 35) return { text: 'Ожиріння I ст.', tone: 'bad' };
  if (v < 40) return { text: 'Ожиріння II ст.', tone: 'bad' };
  return { text: 'Ожиріння III ст.', tone: 'bad' };
}

/** Safe rate of loss: 0.5–0.9% of bodyweight per week. */
export function weeklyRate(profile) {
  const lo = Math.round(profile.weightKg * 0.005 * 100) / 100;
  const hi = Math.round(profile.weightKg * 0.009 * 100) / 100;
  return { lo, hi };
}

/** Time to goal at the current deficit (7,700 kcal ≈ 1 kg of fat). */
export function forecast(profile) {
  const { deficit } = calorieTarget(profile);
  const toLose = profile.weightKg - (profile.goalWeightKg || profile.weightKg);
  if (toLose <= 0 || deficit <= 0) return null;
  const kgPerWeek = (deficit * 7) / 7700;
  const weeks = Math.ceil(toLose / kgPerWeek);
  return {
    toLose: Math.round(toLose * 10) / 10,
    kgPerWeek: Math.round(kgPerWeek * 100) / 100,
    weeks,
    dateISO: daysAgoISO(-weeks * 7),
  };
}

/**
 * Weight trend via exponential smoothing — strips the daily noise (water,
 * salt, gut content) that masks real progress.
 */
export function weightTrend(entries, alpha = 0.25) {
  const sorted = [...entries].sort((a, b) => a.d.localeCompare(b.d));
  let ema = null;
  return sorted.map((e) => {
    ema = ema === null ? e.kg : alpha * e.kg + (1 - alpha) * ema;
    return { d: e.d, kg: e.kg, trend: Math.round(ema * 100) / 100 };
  });
}

/** Change over N days measured on the trend line — steadier than today-minus-then. */
export function changeOverDays(entries, days) {
  const t = weightTrend(entries);
  if (t.length < 2) return null;
  const last = t[t.length - 1];
  const cutoff = daysAgoISO(days);
  const from = t.find((e) => e.d >= cutoff) || t[0];
  if (from === last) return null;
  return {
    delta: Math.round((last.trend - from.trend) * 100) / 100,
    fromDate: from.d,
    days,
  };
}

/** Rough burn for a strength session (MET ≈ 6 for dumbbell circuits). */
export function sessionKcal(weightKg, minutes, intense = true) {
  const met = intense ? 6 : 4.5;
  return Math.round((met * 3.5 * weightKg * minutes) / 200);
}

/** Epley 1RM estimate — tracks strength without ever testing a true max. */
export function e1rm(kg, reps) {
  if (!kg || !reps) return 0;
  return Math.round(kg * (1 + reps / 30) * 10) / 10;
}

/** Practical nutrition rules — shown in place of a food database. */
export const NUTRITION_RULES = [
  {
    t: 'Білок у кожен прийом їжі',
    d: 'Долоня м’яса/риби, 3 яйця, 200 г сиру або 30 г протеїну. Білок найсильніше насичує і зберігає м’язи в дефіциті.',
  },
  {
    t: 'Половина тарілки — овочі',
    d: 'Об’єм і клітковина за майже нульові калорії. Це головний трюк проти голоду на дефіциті.',
  },
  {
    t: 'Рідкі калорії — головний злодій',
    d: 'Соки, кава з сиропом, пиво. Легко з’їдають половину дефіциту й не насичують.',
  },
  {
    t: 'Зважуйся щодня в один час',
    d: 'Зранку після туалету, до їжі. Дивись на тренд за тиждень, не на окремий день: ±1,5 кг — це вода.',
  },
  {
    t: 'Сон 7,5–9 годин',
    d: 'Недосип піднімає грелін (голод) і знижує лептин (сите відчуття). Це не «бонус», а частина плану.',
  },
  {
    t: 'Крок за тиждень, не за день',
    d: 'Плато 2+ тижні за чіткого виконання → мінус 150–200 ккал або +1500 кроків. Не ріж калорії різко.',
  },
];
