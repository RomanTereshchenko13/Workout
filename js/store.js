/**
 * State container backed by localStorage. Fully local — no server, no account.
 * Data survives app updates; JSON export/import covers device migration.
 */

import { DEFAULT_INVENTORY } from './lib/plates.js';
import { isoDate, daysBetween } from './lib/dates.js';

const KEY = 'workout.v1';
const SCHEMA = 4;

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
  /** Permanent exercise swaps: program slot id → replacement exercise id. */
  substitutions: {},
  /** Bookkeeping that is about the app rather than the training. */
  meta: { lastBackupAt: null, lastBackupLogs: 0, nextLogSeq: 1 },
  logs: [],
  weights: [],
  cardio: [],
  active: null,
});

let data = load();
const listeners = new Set();
const externalListeners = new Set();

/**
 * Set when the last write to localStorage failed. The UI reads this so a
 * finished workout cannot report success while the data never left memory.
 */
let lastWriteError = null;

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

/* ─────────────── Migration ─────────────── */

const isArray = Array.isArray;

/**
 * Bring a stored (or imported) blob up to the current schema.
 *
 * The merge is additive: unknown keys survive, missing ones get defaults. On top
 * of that sit the version-gated steps — the parts that have to change data the
 * user already owns rather than just fill in blanks.
 */
function migrate(parsed) {
  const base = DEFAULTS();
  const from = Number(parsed?.v) || 1;
  const merged = {
    ...base,
    ...parsed,
    profile: { ...base.profile, ...(parsed.profile || {}) },
    inventory: { ...base.inventory, ...(parsed.inventory || {}) },
    settings: { ...base.settings, ...(parsed.settings || {}) },
    state: { ...base.state, ...(parsed.state || {}) },
    substitutions: { ...(parsed.substitutions || {}) },
    meta: { ...base.meta, ...(parsed.meta || {}) },
    logs: isArray(parsed.logs) ? parsed.logs.filter(isPlainObject) : [],
    weights: isArray(parsed.weights) ? parsed.weights.filter((w) => isPlainObject(w) && w.d && Number.isFinite(w.kg)) : [],
    cardio: isArray(parsed.cardio) ? parsed.cardio.filter((c) => isPlainObject(c) && c.d) : [],
    active: isPlainObject(parsed.active) && isArray(parsed.active.exercises) ? parsed.active : null,
  };

  // v4: unilateral exercises are logged with `perSide` so tonnage can count both
  // sides. Older logs predate the flag — take it from the program definition, so
  // historical charts stop disagreeing with new ones.
  if (from < 4) backfillPerSide(merged);

  // Log ids used to be derived from `logs.length`, which repeats after a delete
  // and made one tap remove two workouts. Re-key everything onto a sequence.
  if (from < 4) renumberLogs(merged);

  // A workout already in progress when the update lands: the finisher was a
  // boolean then and is a round count now.
  if (from < 4 && merged.active) {
    merged.active.finisherRounds ??= merged.active.finisherDone ? 1 : 0;
    merged.active.rest ??= null;
  }

  merged.meta.nextLogSeq = Math.max(
    Number(merged.meta.nextLogSeq) || 1,
    merged.logs.length + 1,
  );
  merged.v = SCHEMA;
  return merged;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * The unilateral slots as the program defined them up to schema 3 — deliberately
 * a frozen copy rather than a read of `DAYS`. A migration describes history: if
 * the program later drops one of these, workouts logged back then were still
 * done per side and their tonnage must not change retroactively.
 */
const PER_SIDE_BEFORE_V4 = new Set([
  'reverse-lunge', 'one-arm-row', 'suitcase-carry',
  'bulgarian-split', 'renegade-row', 'russian-twist',
]);

function backfillPerSide(d) {
  for (const log of d.logs) {
    for (const e of log.exercises || []) {
      if (e.perSide === undefined) e.perSide = PER_SIDE_BEFORE_V4.has(e.id);
    }
  }
}

function renumberLogs(d) {
  const seen = new Set();
  d.logs.forEach((log, i) => {
    if (!log.id || seen.has(log.id)) log.id = `${log.date || 'log'}-${log.dayKey || '?'}-r${i + 1}`;
    seen.add(log.id);
  });
}

/* ─────────────── Persistence ─────────────── */

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    lastWriteError = null;
  } catch (e) {
    // Quota exhausted, or storage blocked (private mode on some browsers). The
    // in-memory state is still correct, but it will not survive a reload — and
    // silently telling the user their workout was saved is the worst outcome.
    lastWriteError = e;
    console.error('localStorage is full or unavailable', e);
  }
  listeners.forEach((fn) => fn(data));
}

/** The last write error, or null. Cleared by the next successful write. */
export function writeError() {
  return lastWriteError;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Fires when *another tab* changed the data. Without this the two tabs diverge
 * and whichever writes last silently wins.
 */
export function subscribeExternal(fn) {
  externalListeners.add(fn);
  return () => externalListeners.delete(fn);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      data = migrate(JSON.parse(e.newValue));
    } catch {
      return;
    }
    listeners.forEach((fn) => fn(data));
    externalListeners.forEach((fn) => fn(data));
  });
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
  return isoDate();
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

/* ─────────────── Exercise substitutions ─────────────── */

/** Permanently swap a program slot for another exercise. */
export function setSubstitution(slotId, exerciseId) {
  return update((d) => {
    if (!exerciseId || exerciseId === slotId) delete d.substitutions[slotId];
    else d.substitutions[slotId] = exerciseId;
  });
}

export function clearSubstitutions() {
  return update((d) => {
    d.substitutions = {};
  });
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
        slotId: e.slotId || e.id,
        name: e.name,
        mode: e.mode,
        isTime: e.isTime,
        perSide: !!e.perSide,
        ss: e.ss ?? null,
        target: { sets: e.sets, low: e.reps.low, high: e.reps.high },
        rest: e.rest,
        sets: Array.from({ length: e.sets }, () => ({
          kg: e.suggested.kg,
          reps: e.reps.low,
          done: false,
        })),
      })),
      finisherRounds: 0,
      finisherTarget: plan.finisher?.rounds || 0,
      finisherDone: false,
      rest: null,
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

/**
 * Remember where a running rest timer ends, so a backgrounded — or reaped —
 * PWA can pick it back up instead of losing the count entirely.
 * @param {{endsAt:number,total:number,paused:boolean,left:number}|null} rest
 */
export function saveRest(rest) {
  return update((d) => {
    if (d.active) d.active.rest = rest;
  });
}

/** Finish a workout: append to history, advance rotation and wave week. */
export function finishSession() {
  return update((d) => {
    const a = d.active;
    if (!a) return;
    const durationSec = Math.round((Date.now() - a.startedAt) / 1000);
    const seq = d.meta.nextLogSeq++;
    d.logs.push({
      // Sequence-based, never derived from logs.length: that repeats after a
      // delete, and two logs sharing an id means one delete removes both.
      id: `${a.date}-${a.dayKey}-${seq}`,
      date: a.date,
      dayKey: a.dayKey,
      week: a.week,
      durationSec,
      finisherRounds: a.finisherRounds || 0,
      finisherTarget: a.finisherTarget || 0,
      finisherDone: (a.finisherRounds || 0) > 0 || !!a.finisherDone,
      note: a.note || '',
      exercises: a.exercises.map((e) => ({
        id: e.id,
        slotId: e.slotId || e.id,
        mode: e.mode,
        isTime: e.isTime,
        perSide: !!e.perSide,
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

/** Called after a successful export — drives the "back this up" reminder. */
export function markBackedUp() {
  return update((d) => {
    d.meta.lastBackupAt = today();
    d.meta.lastBackupLogs = d.logs.length;
  });
}

/**
 * How exposed the data currently is.
 * @returns {{due:boolean, never:boolean, days:number|null, unsaved:number}}
 */
export function backupStatus() {
  const { meta, logs } = data;
  const unsaved = logs.length - (meta.lastBackupLogs || 0);
  const days = meta.lastBackupAt ? daysBetween(meta.lastBackupAt, today()) : null;
  const never = !meta.lastBackupAt;
  // Nothing to lose yet: do not nag someone with two workouts logged.
  const worthSaving = logs.length >= 3;
  return {
    never,
    days,
    unsaved: Math.max(0, unsaved),
    due: worthSaving && (never || days >= 21 || unsaved >= 6),
  };
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!isPlainObject(parsed) || !isPlainObject(parsed.profile)) {
    throw new Error('Файл не схожий на бекап цього застосунку');
  }
  for (const key of ['logs', 'weights', 'cardio']) {
    if (key in parsed && !Array.isArray(parsed[key])) {
      throw new Error(`Бекап пошкоджено: поле «${key}» має бути списком`);
    }
  }
  data = migrate(parsed);
  persist();
  return data;
}

export function resetAll() {
  data = DEFAULTS();
  persist();
}
