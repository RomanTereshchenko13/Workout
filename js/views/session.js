import { h, card, btn, kg, mmss, sheet, toast, clear, confirmSheet, num, field, fmtDuration, accordion, replaceNode } from '../ui.js';
import { get, updateActive, finishSession, discardSession, saveRest, setSubstitution, writeError, startSession } from '../store.js';
import { dayByKey, waveOf, groupExercises, alternativesFor, suggestWeight, buildSession } from '../data/program.js';
import { EXERCISES, WARMUP, COOLDOWN } from '../data/exercises.js';
import { nearestLoad, nextLoadUp, nextLoadDown, describeLoad, shortLoad, liftedPerRep, totalVolume } from '../lib/plates.js';
import { restTimer, keepAwake, primeAudio, vibrate } from '../lib/timer.js';
import { go, onLeaveSession } from '../app.js';
import { e1rm } from '../lib/nutrition.js';

let timer = null;
let timerBar = null;
let clockId = null;
let finisherNode = null;

const MODE_LABEL = { pair: '2 гантелі', single: '1 гантель', bw: 'вага тіла', plate: 'блин' };

/**
 * Nodes of the currently mounted session screen.
 *
 * Logging a set used to dispatch a full re-render, which threw away and rebuilt
 * every card — collapsing the warm-up accordion and discarding scroll position
 * on each tap. Holding on to the nodes lets an interaction touch only the card
 * it actually changed.
 */
let refs = null;

export function sessionView() {
  const d = get();
  const a = d.active;
  if (!a) {
    refs = null;
    stopClock();
    // The «Почати тренування» app shortcut lands here. Telling someone who just
    // tapped "start a workout" to go and start one somewhere else made the
    // shortcut a dead end, so this screen starts the planned day itself.
    const plan = buildSession({
      rotation: d.state.rotation,
      week: d.state.week,
      history: d.logs,
      inventory: d.inventory,
      experience: d.profile.experience,
      substitutions: d.substitutions,
    });
    return h('div', { class: 'view' },
      card({ class: 'card-hero', style: { '--day-color': plan.day.color } },
        h('div', { class: 'hero-top' },
          h('div', { class: 'day-chip' }, `День ${plan.day.key}`),
          h('div', { class: 'wave-chip' }, plan.wave.label),
        ),
        h('h2', { class: 'hero-title' }, plan.day.title),
        h('p', { class: 'muted' }, plan.day.focus),
        h('div', { class: 'hero-meta' },
          h('span', {}, `≈ ${plan.estMinutes} хв`),
          h('span', {}, `${plan.exercises.length} вправ`),
          plan.finisher ? h('span', {}, 'фінішер') : null,
        ),
        btn('Почати тренування', {
          variant: 'primary', class: 'btn-block',
          onClick: () => {
            startSession(plan);
            rerender();
          },
        }),
        btn('На головну', { variant: 'ghost', class: 'btn-block', onClick: () => go('#/') }),
      ),
    );
  }

  document.body.dataset.session = 'active';
  keepAwake(true);
  // The router owns the exit path: leaving via the tab bar never reaches the
  // screen's own dismiss handlers, and used to leave the wake lock held.
  onLeaveSession(teardown);

  const day = dayByKey(a.dayKey);
  const wave = waveOf(a.week);
  const stats = sessionStats(a);

  const elapsed = h('span', {}, fmtDuration(elapsedSec(a)));
  const doneLabel = h('span', {}, `${stats.done}/${stats.total} підходів`);
  const volLabel = h('span', {}, `${Math.round(stats.volume)} кг тоннажу`);
  const fill = h('div', { class: 'progress-fill', style: { width: `${stats.pct}%` } });
  const progress = h('div', {
    class: 'progress-bar',
    role: 'progressbar',
    'aria-label': 'Виконано підходів',
    'aria-valuemin': '0',
    'aria-valuemax': String(stats.total),
    'aria-valuenow': String(stats.done),
  }, fill);
  const cards = [];

  const view = h('div', { class: 'view view-session' },
    h('div', { class: 'session-head', style: { '--day-color': day.color } },
      h('div', { class: 'row-between' },
        h('div', {},
          h('div', { class: 'eyebrow' }, `${wave.label} · `, elapsed),
          h('h1', {}, day.title),
        ),
        btn('✕', { variant: 'ghost', ariaLabel: 'Згорнути або скасувати тренування', onClick: () => quitSheet() }),
      ),
      progress,
      h('div', { class: 'session-meta' }, doneLabel, volLabel),
    ),

    warmupCard(),

    h('div', { class: 'ex-list' },
      groupExercises(a.exercises).map((block) => {
        const nodes = block.items.map(({ e, i }) => {
          const node = exerciseCard(e, i, a);
          cards[i] = node;
          return node;
        });
        if (block.ss === null) return nodes[0];
        // A superset is a real instruction, not decoration: the `ss` field had
        // been in the program data since day one with nothing rendering it, so
        // paired work was being performed — and rested — as separate exercises.
        return h('div', { class: 'superset' },
          h('div', { class: 'superset-tag' }, 'Суперсет — без паузи між вправами'),
          ...nodes,
        );
      }),
    ),

    day.finisher ? finisherCard(day.finisher, a) : null,
    cooldownCard(),

    card({},
      field('Нотатка про тренування', h('textarea', {
        class: 'input', rows: 2, value: a.note || '', placeholder: 'Самопочуття, сон, що болить...',
        onchange: (ev) => updateActive((s) => { s.note = ev.target.value; }),
      })),
      btn('Завершити тренування', {
        variant: 'primary', class: 'btn-block',
        onClick: () => {
          const now = sessionStats(get().active);
          if (now.done === 0) return toast('Спочатку зроби хоч один підхід', 'bad');
          finishSheet(now);
        },
      }),
    ),
  );

  refs = { elapsed, doneLabel, volLabel, fill, progress, cards };
  startClock();
  restoreRest(a);
  return view;
}

/* ─────────────── Live state ─────────────── */

function elapsedSec(a) {
  return Math.max(0, Math.round((Date.now() - a.startedAt) / 1000));
}

function sessionStats(a) {
  if (!a) return { done: 0, total: 0, volume: 0, pct: 0 };
  const done = a.exercises.reduce((acc, e) => acc + e.sets.filter((s) => s.done).length, 0);
  const total = a.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  return { done, total, volume: totalVolume(a.exercises), pct: total ? (done / total) * 100 : 0 };
}

/** The elapsed time is a clock, not a number sampled once at render time. */
function startClock() {
  stopClock();
  clockId = setInterval(() => {
    const a = get().active;
    if (!a || !refs?.elapsed || refs.elapsed.isConnected === false) return stopClock();
    refs.elapsed.textContent = fmtDuration(elapsedSec(a));
  }, 1000);
  clockId?.unref?.();
}

function stopClock() {
  if (clockId) clearInterval(clockId);
  clockId = null;
}

/** Refresh the header counters without touching the exercise list. */
function patchHead() {
  const a = get().active;
  if (!a || !refs) return;
  const s = sessionStats(a);
  refs.doneLabel.textContent = `${s.done}/${s.total} підходів`;
  refs.volLabel.textContent = `${Math.round(s.volume)} кг тоннажу`;
  refs.fill.style.width = `${s.pct}%`;
  refs.progress.setAttribute('aria-valuemax', String(s.total));
  refs.progress.setAttribute('aria-valuenow', String(s.done));
}

/** Rebuild exactly one exercise card in place. */
function patchExercise(i) {
  const a = get().active;
  if (!a || !refs?.cards[i]) return rerender();
  const next = exerciseCard(a.exercises[i], i, a);
  replaceNode(refs.cards[i], next);
  refs.cards[i] = next;
  patchHead();
}

function teardown() {
  stopClock();
  hideRest({ keepSaved: true });
  refs = null;
  // Held across sessions otherwise, keeping a detached card alive and letting a
  // stale replaceNode target survive into the next workout.
  finisherNode = null;
}

/* ─────────────── Static blocks ─────────────── */

function warmupCard() {
  return accordion('session-warmup',
    [h('strong', {}, 'Розминка'), h('span', { class: 'muted small' }, ' 6–8 хв')],
    h('ul', { class: 'bullets' }, WARMUP.map((w) => h('li', {}, h('strong', {}, w.name), ' — ', w.detail))),
    h('p', { class: 'note' }, 'Не пропускай: холодні плечі й поясниця — головне джерело травм у гантельних жимах і тягах.'),
  );
}

function cooldownCard() {
  return accordion('session-cooldown',
    [h('strong', {}, 'Заминка'), h('span', { class: 'muted small' }, ' 5 хв')],
    h('ul', { class: 'bullets' }, COOLDOWN.map((w) => h('li', {}, h('strong', {}, w.name), ' — ', w.detail))),
  );
}

/* ─────────────── Exercise card ─────────────── */

function exerciseCard(e, exIndex, active) {
  const meta = EXERCISES[e.id];
  const mode = e.mode === 'pair' ? 'pair' : 'single';
  const allDone = e.sets.every((s) => s.done);

  return card({ class: `ex-card ${allDone ? 'is-done' : ''}` },
    h('div', { class: 'row-between ex-head' },
      h('div', {},
        h('h3', {}, e.name),
        h('p', { class: 'muted small' }, `${meta.muscles}${e.perSide ? ' · на кожну сторону' : ''}`),
        e.slotId && e.slotId !== e.id
          ? h('p', { class: 'note' }, `Заміна для «${EXERCISES[e.slotId]?.name || e.slotId}»`)
          : null,
      ),
      h('div', { class: 'ex-actions' },
        h('button', { class: 'icon-btn', onclick: () => swapSheet(e, exIndex), 'aria-label': `Замінити вправу «${e.name}»` }, '⇄'),
        h('button', { class: 'icon-btn', onclick: () => cuesSheet(e.id), 'aria-label': `Техніка виконання: ${e.name}` }, 'i'),
      ),
    ),

    e.mode !== 'bw'
      ? h('div', { class: 'load-strip' },
          h('button', { class: 'load-btn', onclick: () => stepWeight(exIndex, -1), 'aria-label': 'Зменшити вагу' }, '−'),
          h('div', { class: 'load-mid' },
            h('div', { class: 'load-kg' }, kg(e.sets[0].kg)),
            h('div', { class: 'load-desc' }, shortLoad(nearestLoad(e.sets[0].kg, get().inventory, mode), get().inventory)),
          ),
          h('button', { class: 'load-btn', onclick: () => stepWeight(exIndex, 1), 'aria-label': 'Збільшити вагу' }, '+'),
        )
      : h('p', { class: 'note' }, 'Вага тіла — регулюй складність варіантом вправи (див. підказки).'),

    h('div', { class: 'sets' },
      e.sets.map((s, i) => setChip(s, i, exIndex, e)),
      h('button', { class: 'set-chip set-add', onclick: () => addSet(exIndex), 'aria-label': 'Додати підхід' }, '+'),
    ),
    h('p', { class: 'target-line' },
      `Ціль: ${e.target.sets}×`,
      e.isTime ? `${e.target.low} с` : `${e.target.low}–${e.target.high}`,
      e.suggested?.reason ? h('span', { class: 'muted' }, ` · ${e.suggested.reason}`) : null,
    ),
  );
}

function setChip(s, i, exIndex, e) {
  const unit = e.isTime ? 'с' : 'повт.';
  return h('button', {
    class: `set-chip ${s.done ? 'is-done' : ''}`,
    'aria-label': s.done
      ? `Підхід ${i + 1} виконано: ${s.reps} ${unit}${e.mode !== 'bw' ? `, ${s.kg} кг` : ''}. Натисни, щоб скасувати`
      : `Записати підхід ${i + 1}`,
    onclick: () => (s.done ? undoSet(exIndex, i) : logSetSheet(exIndex, i, e)),
  },
    h('span', { class: 'sc-idx', 'aria-hidden': 'true' }, i + 1),
    h('span', { class: 'sc-val', 'aria-hidden': 'true' }, s.done ? (e.isTime ? `${s.reps}с` : `${s.reps}`) : '·'),
    s.done && e.mode !== 'bw' ? h('span', { class: 'sc-kg', 'aria-hidden': 'true' }, `${s.kg}`) : null,
  );
}

function stepWeight(exIndex, dir) {
  const d = get();
  const e = d.active.exercises[exIndex];
  const mode = e.mode === 'pair' ? 'pair' : 'single';
  const cur = e.sets[0].kg || 0;
  const next = dir > 0 ? nextLoadUp(cur, d.inventory, mode) : nextLoadDown(cur, d.inventory, mode);
  if (!next) return toast(dir > 0 ? 'Це максимум інвентарю' : 'Це мінімум — далі тільки гриф', 'warn');
  updateActive((a) => {
    a.exercises[exIndex].sets.forEach((s) => {
      if (!s.done) s.kg = next.kg;
    });
  });
  vibrate(15);
  patchExercise(exIndex);
  toast(describeLoad(next, d.inventory, mode));
}

function addSet(exIndex) {
  updateActive((a) => {
    const e = a.exercises[exIndex];
    const last = e.sets[e.sets.length - 1];
    e.sets.push({ kg: last.kg, reps: last.reps, done: false });
  });
  patchExercise(exIndex);
}

function undoSet(exIndex, i) {
  updateActive((a) => {
    a.exercises[exIndex].sets[i].done = false;
  });
  patchExercise(exIndex);
}

/** Log a set: reps (or seconds) plus weight, then auto-start the rest timer. */
function logSetSheet(exIndex, setIndex, e) {
  primeAudio();
  const d = get();
  const set = d.active.exercises[exIndex].sets[setIndex];
  const mode = e.mode === 'pair' ? 'pair' : 'single';
  let reps = set.reps || e.target.low;
  let weight = set.kg;

  const repsInput = num(reps, { step: 1, onChange: (v) => (reps = v) });
  const weightInput = e.mode !== 'bw' ? num(weight, { step: 1, onChange: (v) => (weight = v) }) : null;

  const quick = (delta) => h('button', {
    class: 'quick-btn',
    'aria-label': delta > 0 ? `Додати ${delta}` : `Відняти ${-delta}`,
    onclick: () => {
      repsInput.value = Math.max(0, (parseFloat(repsInput.value) || 0) + delta);
    },
  }, delta > 0 ? `+${delta}` : `${delta}`);

  const save = () => {
    const r = parseFloat(repsInput.value) || 0;
    const w = weightInput ? parseFloat(weightInput.value) || 0 : null;
    if (r <= 0) return toast('Вкажи повторення', 'bad');
    updateActive((a) => {
      const s = a.exercises[exIndex].sets[setIndex];
      s.reps = r;
      if (w !== null) s.kg = w;
      s.done = true;
      // Carry the weight forward to the remaining unlogged sets.
      a.exercises[exIndex].sets.slice(setIndex + 1).forEach((n) => {
        if (!n.done && w !== null) n.kg = w;
      });
    });
    if (writeError()) toast('Не вдалося зберегти — пам’ять браузера переповнена', 'bad');
    vibrate(30);
    patchExercise(exIndex);

    const active = get().active;
    const isLast = setIndex === active.exercises[exIndex].sets.length - 1;
    const next = nextInSuperset(active, exIndex);
    if (next) {
      // Mid-superset: the whole point is that there is no pause here.
      toast(`Без паузи → ${next.name}`);
    } else if (get().settings.autoRest && !isLast) {
      startRest(e.rest);
    } else if (isLast) {
      toast('Вправу закрито 💪');
    }
  };

  sheet(`${e.name} · підхід ${setIndex + 1}`, h('div', {},
    h('div', { class: 'sheet-grid' },
      field(e.isTime ? 'Секунди' : 'Повторення', h('div', { class: 'input-row' }, quick(-1), repsInput, quick(1))),
      weightInput ? field('Вага гантелі, кг', weightInput) : null,
    ),
    e.perSide ? h('p', { class: 'note' }, 'Рахунок на одну сторону — тоннаж подвоюється автоматично.') : null,
    e.mode !== 'bw'
      ? h('p', { class: 'note' }, describeLoad(nearestLoad(weight, d.inventory, mode), d.inventory, mode))
      : null,
    e.mode === 'pair' ? h('p', { class: 'note' }, `Разом у руках: ${kg(weight * 2)}.`) : null,
    !e.isTime && weight ? h('p', { class: 'note' }, `Оцінка 1ПМ: ${e1rm(liftedPerRep(weight, mode), reps)} кг`) : null,
  ), [
    { label: 'Скасувати', variant: 'ghost' },
    { label: 'Готово', variant: 'primary', onClick: save },
  ]);
}

/** The next exercise in the same superset block, or null if this ends the round. */
function nextInSuperset(active, exIndex) {
  const block = groupExercises(active.exercises).find((b) => b.items.some((it) => it.i === exIndex));
  if (!block || block.ss === null) return null;
  const pos = block.items.findIndex((it) => it.i === exIndex);
  return block.items[pos + 1]?.e || null;
}

/* ─────────────── Substitution ─────────────── */

/**
 * Swap an exercise out. The library holds far more movements than the program
 * uses, and "my shoulder hurts on the overhead press" previously had no answer
 * inside the app at all.
 */
function swapSheet(e, exIndex) {
  const d = get();
  const slotId = e.slotId || e.id;
  const options = alternativesFor(slotId);
  let picked = e.id;

  const apply = (permanent) => {
    if (picked === e.id) return toast('Це та сама вправа');
    const meta = EXERCISES[picked];
    if (!meta) return toast('Невідома вправа', 'bad');
    if (permanent) setSubstitution(slotId, picked === slotId ? null : picked);

    const wave = waveOf(get().active.week);
    const sug = suggestWeight({ id: picked, ...meta }, {
      history: d.logs, inventory: d.inventory, experience: d.profile.experience, wave,
    });
    updateActive((a) => {
      const ex = a.exercises[exIndex];
      ex.id = picked;
      ex.name = meta.name;
      ex.mode = meta.mode;
      // A different movement counts its reps differently. Leaving the old flag
      // in place is what made a two-arm row report double its real tonnage.
      ex.perSide = meta.perSide === true;
      ex.baseKg = sug.baseKg ?? null;
      ex.sets.forEach((s) => {
        if (!s.done) s.kg = sug.kg;
      });
      ex.suggested = sug;
    });
    rerender();
    toast(permanent ? `Замінено назавжди: ${meta.name}` : `Сьогодні: ${meta.name}`);
  };

  const list = h('div', { class: 'swap-list' },
    [{ id: slotId, ...EXERCISES[slotId], sameMode: true }, ...options].map((opt) => {
      const row = h('button', {
        class: `swap-item ${opt.id === picked ? 'is-picked' : ''}`,
        'aria-pressed': opt.id === picked ? 'true' : 'false',
        onclick: () => {
          picked = opt.id;
          [...list.children].forEach((n) => {
            const on = n.dataset.id === picked;
            n.classList.toggle('is-picked', on);
            n.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        },
        dataset: { id: opt.id },
      },
        h('div', {},
          h('strong', {}, opt.name),
          h('p', { class: 'muted small' }, opt.muscles),
        ),
        h('span', { class: `mode-badge mode-${opt.mode}` }, MODE_LABEL[opt.mode] || opt.mode),
      );
      return row;
    }),
  );

  sheet(`Замінити «${e.name}»`, h('div', {},
    h('p', { class: 'muted small' }, `Варіанти для тієї ж групи м’язів. Місце в програмі: «${EXERCISES[slotId]?.name || slotId}».`),
    list,
    h('p', { class: 'note' }, 'Сьогодні — лише для цього тренування. Назавжди — програма й далі підставлятиме нову вправу в це місце; скинути можна в Профілі.'),
  ), [
    { label: 'Скасувати', variant: 'ghost' },
    { label: 'Сьогодні', variant: 'ghost', onClick: () => apply(false) },
    { label: 'Назавжди', variant: 'primary', onClick: () => apply(true) },
  ]);
}

/* ─────────────── Rest timer ─────────────── */

function startRest(seconds, restore = null) {
  const s = get().settings;
  const secs = seconds || s.restDefault;
  timer?.stop();

  if (!timerBar) {
    timerBar = h('div', { class: 'rest-bar', role: 'timer', 'aria-label': 'Таймер відпочинку' });
    document.body.appendChild(timerBar);
  }

  const render = (left) => {
    clear(timerBar);
    timerBar.appendChild(
      h('div', { class: 'rest-inner' },
        h('div', { class: 'rest-time' }, mmss(left)),
        h('div', { class: 'rest-label' }, 'відпочинок'),
        h('div', { class: 'rest-actions' },
          h('button', { class: 'rest-btn', onclick: () => timer?.add(15), 'aria-label': 'Додати 15 секунд' }, '+15'),
          h('button', {
            class: 'rest-btn',
            'aria-label': timer?.running ? 'Пауза' : 'Продовжити',
            onclick: () => { const running = timer?.toggle(); toast(running ? 'Продовжено' : 'Пауза'); },
          }, timer?.running ? '⏸' : '▶'),
          h('button', { class: 'rest-btn', onclick: () => timer?.skip(), 'aria-label': 'Пропустити відпочинок' }, '▶▶'),
        ),
      ),
    );
    timerBar.style.setProperty('--rest-progress', `${(1 - left / secs) * 100}%`);
  };

  timer = restTimer(secs, {
    sound: s.sound,
    vibrate: s.vibrate,
    startAt: restore?.left,
    paused: restore?.paused,
    onTick: render,
    // Written on every state change, not every tick: the deadline is an absolute
    // timestamp, so a killed app can rebuild the countdown from it exactly.
    onChange: (t) => saveRest(t.left > 0
      ? { endsAt: t.running ? Date.now() + t.left * 1000 : 0, total: t.total, paused: !t.running, left: t.left }
      : null),
    onDone: () => {
      timerBar?.classList.add('is-done');
      setTimeout(() => hideRest(), 1500);
    },
  });
  timerBar.classList.remove('is-done');
  timerBar.classList.add('is-in');
  render(timer.left);
}

/**
 * Pick a rest timer back up after the app was backgrounded — or reaped, which
 * Android does routinely. The timer used to live only in memory, so locking the
 * phone during a 100-second rest lost the count entirely.
 */
function restoreRest(a) {
  const r = a.rest;
  if (!r || !r.total) return;
  // A full re-render (a substitution, say) must not visibly restart a rest that
  // is already counting down in this same page.
  if (timer?.running) return;
  const left = r.paused ? r.left : Math.round((r.endsAt - Date.now()) / 1000);
  if (left <= 0) return saveRest(null);
  startRest(r.total, { left, paused: !!r.paused });
}

function hideRest({ keepSaved = false } = {}) {
  timer?.stop();
  timer = null;
  if (!keepSaved) saveRest(null);
  timerBar?.classList.remove('is-in');
  const bar = timerBar;
  timerBar = null;
  setTimeout(() => bar?.remove(), 250);
}

/* ─────────────── Finisher ─────────────── */

function finisherCard(f, active) {
  const rounds = active.finisherRounds || 0;
  const node = card({ class: 'card-finisher' },
    h('div', { class: 'row-between' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Метабол'), h('h3', {}, f.title)),
      h('span', { class: `finisher-count ${rounds >= f.rounds ? 'is-done' : ''}` }, `${rounds}/${f.rounds}`),
    ),
    h('ul', { class: 'bullets' },
      f.items.map((it) => {
        const meta = EXERCISES[it.id];
        return h('li', {}, h('strong', {}, meta.name), ' — ', it.time ? `${it.time} с` : `${it.reps} повт.`);
      }),
    ),
    // Rounds, not a checkbox: the finisher is described as the main calorie
    // block and was the least-tracked thing in the app.
    h('div', { class: 'round-chips' },
      Array.from({ length: f.rounds }, (_, i) => h('button', {
        class: `round-chip ${i < rounds ? 'is-done' : ''}`,
        'aria-label': `Коло ${i + 1} з ${f.rounds}${i < rounds ? ' — зараховано' : ''}`,
        'aria-pressed': i < rounds ? 'true' : 'false',
        onclick: () => setRounds(i + 1 === rounds ? i : i + 1, f),
      }, `${i + 1}`)),
    ),
    h('p', { class: 'note' },
      f.type === 'circuit'
        ? `${f.rounds} кола без пауз усередині, ${f.rest} с відпочинку між колами.`
        : `${f.rounds} кола: ${f.work} с робота / ${f.rest} с пауза.`),
    h('div', { class: 'row-gap' },
      btn(`Таймер ${f.rest} с`, { variant: 'ghost', onClick: () => { primeAudio(); startRest(f.rest); } }),
      btn('Таймер 30 с', { variant: 'ghost', onClick: () => { primeAudio(); startRest(30); } }),
    ),
    h('p', { class: 'note' }, 'Це головний блок для витрати калорій. Якщо пульс не зашкалює — вага замала або паузи задовгі.'),
  );
  finisherNode = node;
  return node;
}

function setRounds(n, f) {
  updateActive((a) => {
    a.finisherRounds = Math.max(0, Math.min(f.rounds, n));
    a.finisherTarget = f.rounds;
    a.finisherDone = a.finisherRounds >= f.rounds;
  });
  vibrate(15);
  const a = get().active;
  const next = finisherCard(f, a);
  replaceNode(finisherNode, next);
  finisherNode = next;
  if (a.finisherRounds >= f.rounds) toast('Фінішер закрито 🔥');
}

/* ─────────────── Dialogs ─────────────── */

function cuesSheet(id) {
  const meta = EXERCISES[id];
  sheet(meta.name, h('div', {},
    h('p', { class: 'muted' }, meta.muscles),
    h('ul', { class: 'bullets' }, meta.cues.map((c) => h('li', {}, c))),
    h('p', { class: 'note' }, meta.mode === 'pair' ? 'Дві гантелі однакової ваги.' : meta.mode === 'single' ? 'Одна гантель.' : meta.mode === 'plate' ? 'Один блин.' : 'Без обладнання.'),
  ));
}

/**
 * @param {boolean} discard true throws the workout away; false only minimises it,
 *   which deliberately leaves a running rest timer saved so returning resumes it.
 */
function exitSession(discard) {
  teardown();
  if (discard) {
    hideRest();
    discardSession();
  }
  document.body.dataset.session = '';
  keepAwake(false);
  go('#/');
}

function quitSheet() {
  sheet('Вийти з тренування?', h('p', { class: 'muted' }, 'Можна згорнути й повернутися пізніше — прогрес збережеться.'), [
    { label: 'Згорнути', variant: 'ghost', onClick: () => exitSession(false) },
    {
      label: 'Скасувати тренування',
      variant: 'danger',
      onClick: () => confirmSheet('Точно скасувати?', 'Записи цього тренування зникнуть.', () => exitSession(true), 'Скасувати тренування'),
    },
  ]);
}

function finishSheet(stats) {
  const d = get();
  const mins = Math.round(elapsedSec(d.active) / 60);
  sheet('Завершити тренування', h('div', {},
    h('div', { class: 'grid-3' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${stats.done}/${stats.total}`), h('div', { class: 'stat-label' }, 'підходів')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${mins} хв`), h('div', { class: 'stat-label' }, 'тривалість')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${Math.round(stats.volume)}`), h('div', { class: 'stat-label' }, 'кг тоннажу')),
    ),
    h('p', { class: 'note' }, 'Наступне тренування — наступний день ротації. Після повного кола A→B→C програма перейде на наступний тиждень хвилі.'),
  ), [
    { label: 'Ще ні', variant: 'ghost' },
    {
      label: 'Завершити',
      variant: 'primary',
      onClick: () => {
        teardown();
        hideRest();
        finishSession();
        // Read the write outcome before anything else touches the store.
        if (writeError()) toast('Тренування не збереглося — пам’ять браузера переповнена', 'bad');
        else toast('Тренування записано 🎉');
        document.body.dataset.session = '';
        keepAwake(false);
        go('#/progress');
      },
    },
  ]);
}

function rerender() {
  window.dispatchEvent(new CustomEvent('app:render'));
}
