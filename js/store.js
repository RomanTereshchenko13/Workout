/**
 * State container backed by localStorage. Fully local — no server, no account.
 * Data survives app updates; JSON export/import covers device migration.
 */

import { DEFAULT_INVENTORY } from './lib/plates.js';

const KEY = 'workout.v1';
const SCHEMA = 3;

const DEFAULTS = () => ({
  v: SCHEMA,
  profile: {
    name: '',
    sex: 'm',
    age: 30,
    heightCm: 178,
    weightKg: 85,
    goalWeightKg: 78,
    activity: 'light',
    experience: 'beginner',
    onboarded: false,
  },
  inventory: structuredClone(DEFAULT_INVENTORY),
  settings: { sound: true, vibrate: true, restDefault: 90, autoRest: true },
  state: { rotation: 0, week: 1, blockStart: today() },
  logs: [],
  weights: [],
  cardio: [],
  active: null,
});

let data = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.warn('Saved data could not be read — starting from a clean state', e);
    return DEFAULTS();
  }
}

function migrate(parsed) {
  const base = DEFAULTS();
  const merged = {
    ...base,
    ...parsed,
    profile: { ...base.profile, ...(parsed.profile || {}) },
    inventory: { ...base.inventory, ...(parsed.inventory || {}) },
    settings: { ...base.settings, ...(parsed.settings || {}) },
    state: { ...base.state, ...(parsed.state || {}) },
  };
  merged.v = SCHEMA;
  return merged;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('localStorage is full or unavailable', e);
  }
  listeners.forEach((fn) => fn(data));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function get() {
  return data;
}

export function update(mutator) {
  mutator(data);
  persist();
  return data;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─────────────── Profile ─────────────── */

export function saveProfile(patch) {
  return update((d) => {
    Object.assign(d.profile, patch);
    if (patch.weightKg) addWeightSilently(d, today(), patch.weightKg);
  });
}

export function saveInventory(inv) {
  return update((d) => {
    d.inventory = inv;
  });
}

export function saveSettings(patch) {
  return update((d) => Object.assign(d.settings, patch));
}

/* ─────────────── Bodyweight ─────────────── */

function addWeightSilently(d, date, kg) {
  const existing = d.weights.find((w) => w.d === date);
  if (existing) existing.kg = kg;
  else d.weights.push({ d: date, kg });
  d.weights.sort((a, b) => a.d.localeCompare(b.d));
}

export function logWeight(kg, date = today()) {
  return update((d) => {
    addWeightSilently(d, date, kg);
    d.profile.weightKg = d.weights[d.weights.length - 1].kg;
  });
}

export function deleteWeight(date) {
  return update((d) => {
    d.weights = d.weights.filter((w) => w.d !== date);
  });
}

/* ─────────────── Cardio ─────────────── */

export function logCardio(key, minutes, date = today()) {
  return update((d) => {
    d.cardio.push({ d: date, key, minutes });
  });
}

/* ─────────────── Active session ─────────────── */

export function startSession(plan) {
  return update((d) => {
    d.active = {
      startedAt: Date.now(),
      date: today(),
      dayKey: plan.day.key,
      week: d.state.week,
      exercises: plan.exercises.map((e) => ({
        id: e.id,
        name: e.name,
        mode: e.mode,
        isTime: e.isTime,
        perSide: !!e.perSide,
        target: { sets: e.sets, low: e.reps.low, high: e.reps.high },
        rest: e.rest,
        sets: Array.from({ length: e.sets }, () => ({
          kg: e.suggested.kg,
          reps: e.isTime ? e.reps.low : e.reps.low,
          done: false,
        })),
      })),
      finisherDone: false,
      note: '',
    };
  });
}

export function updateActive(mutator) {
  return update((d) => {
    if (d.active) mutator(d.active);
  });
}

export function discardSession() {
  return update((d) => {
    d.active = null;
  });
}

/** Finish a workout: append to history, advance rotation and wave week. */
export function finishSession() {
  return update((d) => {
    const a = d.active;
    if (!a) return;
    const durationSec = Math.round((Date.now() - a.startedAt) / 1000);
    d.logs.push({
      id: `${a.date}-${a.dayKey}-${d.logs.length + 1}`,
      date: a.date,
      dayKey: a.dayKey,
      week: a.week,
      durationSec,
      finisherDone: a.finisherDone,
      note: a.note || '',
      exercises: a.exercises.map((e) => ({
        id: e.id,
        mode: e.mode,
        isTime: e.isTime,
        sets: e.sets.map((s) => ({ kg: s.kg, reps: s.reps, done: !!s.done })),
      })),
    });
    d.active = null;
    d.state.rotation += 1;
    // A new wave week starts after every 3 workouts (one full A→B→C cycle).
    if (d.state.rotation % 3 === 0) d.state.week += 1;
  });
}

export function deleteLog(id) {
  return update((d) => {
    d.logs = d.logs.filter((l) => l.id !== id);
  });
}

/* ─────────────── Backup ─────────────── */

export function exportJSON() {
  return JSON.stringify(data, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('profile' in parsed)) {
    throw new Error('Файл не схожий на бекап цього застосунку');
  }
  data = migrate(parsed);
  persist();
  return data;
}

export function resetAll() {
  data = DEFAULTS();
  persist();
}
