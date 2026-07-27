import { h, card, btn, kg, mmss, sheet, toast, clear, confirmSheet, num, field, fmtDuration } from '../ui.js';
import { get, updateActive, finishSession, discardSession } from '../store.js';
import { dayByKey, waveOf } from '../data/program.js';
import { EXERCISES, WARMUP, COOLDOWN } from '../data/exercises.js';
import { nearestLoad, nextLoadUp, nextLoadDown, describeLoad, shortLoad, liftedPerRep } from '../lib/plates.js';
import { restTimer, keepAwake, primeAudio, vibrate } from '../lib/timer.js';
import { go } from '../app.js';
import { e1rm } from '../lib/nutrition.js';

let timer = null;
let timerBar = null;

export function sessionView() {
  const d = get();
  const a = d.active;
  if (!a) {
    return h('div', { class: 'view' },
      card({}, h('h3', {}, 'Активного тренування немає'), h('p', { class: 'muted' }, 'Почни його з головного екрана.'),
        btn('На головну', { variant: 'primary', class: 'btn-block', onClick: () => go('#/') })),
    );
  }

  document.body.dataset.session = 'active';
  keepAwake(true);

  const day = dayByKey(a.dayKey);
  const wave = waveOf(a.week);
  const doneSets = a.exercises.reduce((acc, e) => acc + e.sets.filter((s) => s.done).length, 0);
  const totalSets = a.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const volume = a.exercises.reduce(
    (acc, e) => acc + e.sets.filter((s) => s.done).reduce((v, s) => v + liftedPerRep(s.kg || 0, e.mode) * (e.isTime ? 1 : s.reps || 0), 0),
    0,
  );

  return h('div', { class: 'view view-session' },
    h('div', { class: 'session-head', style: { '--day-color': day.color } },
      h('div', { class: 'row-between' },
        h('div', {},
          h('div', { class: 'eyebrow' }, `${wave.label} · ${fmtDuration(Math.round((Date.now() - a.startedAt) / 1000))}`),
          h('h1', {}, day.title),
        ),
        btn('✕', { variant: 'ghost', onClick: () => quitSheet() }),
      ),
      h('div', { class: 'progress-bar' }, h('div', { class: 'progress-fill', style: { width: `${(doneSets / totalSets) * 100}%` } })),
      h('div', { class: 'session-meta' },
        h('span', {}, `${doneSets}/${totalSets} підходів`),
        h('span', {}, `${Math.round(volume)} кг тоннажу`),
      ),
    ),

    warmupCard(),

    h('div', { class: 'ex-list' }, a.exercises.map((e, i) => exerciseCard(e, i, a))),

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
          if (doneSets === 0) return toast('Спочатку зроби хоч один підхід', 'bad');
          finishSheet(doneSets, totalSets, volume);
        },
      }),
    ),
  );
}

function warmupCard() {
  return h('details', { class: 'card accordion' },
    h('summary', {}, h('strong', {}, 'Розминка'), h('span', { class: 'muted small' }, ' 6–8 хв'),),
    h('ul', { class: 'bullets' }, WARMUP.map((w) => h('li', {}, h('strong', {}, w.name), ' — ', w.detail))),
    h('p', { class: 'note' }, 'Не пропускай: холодні плечі й поясниця — головне джерело травм у гантельних жимах і тягах.'),
  );
}

function cooldownCard() {
  return h('details', { class: 'card accordion' },
    h('summary', {}, h('strong', {}, 'Заминка'), h('span', { class: 'muted small' }, ' 5 хв')),
    h('ul', { class: 'bullets' }, COOLDOWN.map((w) => h('li', {}, h('strong', {}, w.name), ' — ', w.detail))),
  );
}

function exerciseCard(e, exIndex, active) {
  const meta = EXERCISES[e.id];
  const mode = e.mode === 'pair' ? 'pair' : 'single';
  const allDone = e.sets.every((s) => s.done);

  return card({ class: `ex-card ${allDone ? 'is-done' : ''}` },
    h('div', { class: 'row-between ex-head' },
      h('div', {},
        h('h3', {}, e.name),
        h('p', { class: 'muted small' }, `${meta.muscles}${e.perSide ? ' · на кожну сторону' : ''}`),
      ),
      h('button', { class: 'icon-btn', onclick: () => cuesSheet(e.id) }, 'i'),
    ),

    e.mode !== 'bw'
      ? h('div', { class: 'load-strip' },
          h('button', { class: 'load-btn', onclick: () => stepWeight(exIndex, -1) }, '−'),
          h('div', { class: 'load-mid' },
            h('div', { class: 'load-kg' }, kg(e.sets[0].kg)),
            h('div', { class: 'load-desc' }, shortLoad(nearestLoad(e.sets[0].kg, get().inventory, mode), get().inventory)),
          ),
          h('button', { class: 'load-btn', onclick: () => stepWeight(exIndex, 1) }, '+'),
        )
      : h('p', { class: 'note' }, 'Вага тіла — регулюй складність варіантом вправи (див. підказки).'),

    h('div', { class: 'sets' },
      e.sets.map((s, i) => setChip(s, i, exIndex, e)),
      h('button', { class: 'set-chip set-add', onclick: () => addSet(exIndex) }, '+'),
    ),
    h('p', { class: 'target-line' },
      `Ціль: ${e.target.sets}×`,
      e.isTime ? `${e.target.low} с` : `${e.target.low}–${e.target.high}`,
      e.suggested?.reason ? h('span', { class: 'muted' }, ` · ${e.suggested.reason}`) : null,
    ),
  );
}

function setChip(s, i, exIndex, e) {
  return h('button', {
    class: `set-chip ${s.done ? 'is-done' : ''}`,
    onclick: () => (s.done ? undoSet(exIndex, i) : logSetSheet(exIndex, i, e)),
  },
    h('span', { class: 'sc-idx' }, i + 1),
    h('span', { class: 'sc-val' }, s.done ? (e.isTime ? `${s.reps}с` : `${s.reps}`) : '·'),
    s.done && e.mode !== 'bw' ? h('span', { class: 'sc-kg' }, `${s.kg}`) : null,
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
  rerender();
  toast(describeLoad(next, d.inventory, mode));
}

function addSet(exIndex) {
  updateActive((a) => {
    const e = a.exercises[exIndex];
    const last = e.sets[e.sets.length - 1];
    e.sets.push({ kg: last.kg, reps: last.reps, done: false });
  });
  rerender();
}

function undoSet(exIndex, i) {
  updateActive((a) => {
    a.exercises[exIndex].sets[i].done = false;
  });
  rerender();
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
    vibrate(30);
    const isLast = setIndex === d.active.exercises[exIndex].sets.length - 1;
    rerender();
    if (get().settings.autoRest && !isLast) startRest(e.rest);
    else if (isLast) toast('Вправу закрито 💪');
  };

  sheet(`${e.name} · підхід ${setIndex + 1}`, h('div', {},
    h('div', { class: 'sheet-grid' },
      field(e.isTime ? 'Секунди' : 'Повторення', h('div', { class: 'input-row' }, quick(-1), repsInput, quick(1))),
      weightInput ? field('Вага гантелі, кг', weightInput) : null,
    ),
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

/* ─────────────── Rest timer ─────────────── */

export function startRest(seconds) {
  const s = get().settings;
  const secs = seconds || s.restDefault;
  timer?.stop();

  if (!timerBar) {
    timerBar = h('div', { class: 'rest-bar' });
    document.body.appendChild(timerBar);
  }

  const render = (left) => {
    clear(timerBar);
    timerBar.appendChild(
      h('div', { class: 'rest-inner' },
        h('div', { class: 'rest-time' }, mmss(left)),
        h('div', { class: 'rest-label' }, 'відпочинок'),
        h('div', { class: 'rest-actions' },
          h('button', { class: 'rest-btn', onclick: () => timer.add(15) }, '+15'),
          h('button', { class: 'rest-btn', onclick: () => { const running = timer.toggle(); toast(running ? 'Продовжено' : 'Пауза'); } }, timer?.running ? '⏸' : '▶'),
          h('button', { class: 'rest-btn', onclick: () => timer.skip() }, '▶▶'),
        ),
      ),
    );
    timerBar.style.setProperty('--rest-progress', `${(1 - left / secs) * 100}%`);
  };

  timer = restTimer(secs, {
    sound: s.sound,
    vibrate: s.vibrate,
    onTick: render,
    onDone: () => {
      timerBar?.classList.add('is-done');
      setTimeout(() => hideRest(), 1500);
    },
  });
  timerBar.classList.remove('is-done');
  timerBar.classList.add('is-in');
  render(secs);
}

function hideRest() {
  timer?.stop();
  timer = null;
  timerBar?.classList.remove('is-in');
  setTimeout(() => {
    timerBar?.remove();
    timerBar = null;
  }, 250);
}

/* ─────────────── Finisher ─────────────── */

function finisherCard(f, active) {
  return card({ class: 'card-finisher' },
    h('div', { class: 'row-between' },
      h('div', {}, h('div', { class: 'eyebrow' }, 'Метабол'), h('h3', {}, f.title)),
      h('label', { class: 'checkbox' },
        h('input', {
          type: 'checkbox', checked: active.finisherDone,
          onchange: (ev) => { updateActive((a) => { a.finisherDone = ev.target.checked; }); toast(ev.target.checked ? 'Фінішер закрито 🔥' : 'Знято'); },
        }),
        h('span', {}, 'зроблено'),
      ),
    ),
    h('ul', { class: 'bullets' },
      f.items.map((it) => {
        const meta = EXERCISES[it.id];
        return h('li', {}, h('strong', {}, meta.name), ' — ', it.time ? `${it.time} с` : `${it.reps} повт.`);
      }),
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

function quitSheet() {
  sheet('Вийти з тренування?', h('p', { class: 'muted' }, 'Можна згорнути й повернутися пізніше — прогрес збережеться.'), [
    { label: 'Згорнути', variant: 'ghost', onClick: () => { hideRest(); document.body.dataset.session = ''; keepAwake(false); go('#/'); } },
    { label: 'Скасувати тренування', variant: 'danger', onClick: () => confirmSheet('Точно скасувати?', 'Записи цього тренування зникнуть.', () => { hideRest(); discardSession(); document.body.dataset.session = ''; keepAwake(false); go('#/'); }, 'Скасувати тренування') },
  ]);
}

function finishSheet(doneSets, totalSets, volume) {
  const d = get();
  const mins = Math.round((Date.now() - d.active.startedAt) / 60000);
  sheet('Завершити тренування', h('div', {},
    h('div', { class: 'grid-3' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${doneSets}/${totalSets}`), h('div', { class: 'stat-label' }, 'підходів')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${mins} хв`), h('div', { class: 'stat-label' }, 'тривалість')),
      h('div', { class: 'stat' }, h('div', { class: 'stat-value' }, `${Math.round(volume)}`), h('div', { class: 'stat-label' }, 'кг тоннажу')),
    ),
    h('p', { class: 'note' }, 'Наступне тренування — наступний день ротації. Після повного кола A→B→C програма перейде на наступний тиждень хвилі.'),
  ), [
    { label: 'Ще ні', variant: 'ghost' },
    {
      label: 'Завершити',
      variant: 'primary',
      onClick: () => {
        hideRest();
        finishSession();
        document.body.dataset.session = '';
        keepAwake(false);
        toast('Тренування записано 🎉');
        go('#/progress');
      },
    },
  ]);
}

function rerender() {
  window.dispatchEvent(new CustomEvent('app:render'));
}
