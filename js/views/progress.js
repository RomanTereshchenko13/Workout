import { h, card, btn, stat, kg, weightChart, barChart, fmtDate, fmtDateFull, relDay, fmtDuration, sheet, plural, confirmSheet, toast, segmented, accordion } from '../ui.js';
import { get, deleteLog, deleteWeight } from '../store.js';
import { EXERCISES } from '../data/exercises.js';
import { dayByKey } from '../data/program.js';
import { weightTrend, changeOverDays, e1rm, forecast } from '../lib/nutrition.js';
import { liftedPerRep, totalVolume } from '../lib/plates.js';
import { daysAgoISO, mondayOfISO } from '../lib/dates.js';
import { weighSheet } from './home.js';

let tab = 'weight';

export function progressView() {
  const d = get();
  return h('div', { class: 'view' },
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Аналітика'), h('h1', {}, 'Прогрес'))),
    segmented(tab, [['weight', 'Вага'], ['strength', 'Сила'], ['history', 'Історія']], (v) => {
      tab = v;
      window.dispatchEvent(new CustomEvent('app:render'));
    }),
    tab === 'weight' ? weightTab(d) : tab === 'strength' ? strengthTab(d) : historyTab(d),
  );
}

/* ─────────────── Bodyweight ─────────────── */

function weightTab(d) {
  const { weights, profile, cardio } = d;
  const trend = weightTrend(weights);
  const w7 = changeOverDays(weights, 7);
  const w14 = changeOverDays(weights, 14);
  const w30 = changeOverDays(weights, 30);
  const fc = forecast(profile);

  return h('div', {},
    card({},
      h('div', { class: 'row-between' }, h('h3', {}, 'Динаміка ваги'), btn('Зважитись', { variant: 'ghost', onClick: () => weighSheet(profile) })),
      weightChart(trend, { goal: profile.goalWeightKg, height: 190 }),
      h('div', { class: 'grid-3' },
        stat(w7 ? signed(w7.delta) : '—', '7 днів', tone(w7)),
        stat(w14 ? signed(w14.delta) : '—', '14 днів', tone(w14)),
        stat(w30 ? signed(w30.delta) : '—', '30 днів', tone(w30)),
      ),
      h('p', { class: 'note' }, 'Лінія — згладжений тренд, точки — щоденні заміри. Рішення приймай по лінії.'),
      w14 && w14.delta > -0.2 && weights.length > 8
        ? h('p', { class: 'note warn' }, 'Два тижні без руху вниз. Варіанти: −150 ккал на день, +1500 кроків, перевірити приховані калорії (олія, соуси, напої).')
        : null,
    ),
    fc ? card({}, h('h3', {}, 'Прогноз'),
      h('div', { class: 'grid-3' },
        stat(`${fc.toLose} кг`, 'залишилось'),
        stat(`${fc.kgPerWeek}`, 'кг/тиждень'),
        stat(`${fc.weeks}`, plural(fc.weeks, 'тиждень', 'тижні', 'тижнів')),
      ),
      h('p', { class: 'note' }, `Орієнтовна дата: ${fmtDate(fc.dateISO, true)}. Прогноз лінійний, у житті швидкість падає — це нормально.`)) : null,
    cardio.length ? cardioCard(cardio) : null,
    weights.length ? weightLogCard(weights) : null,
  );
}

function tone(c) {
  if (!c) return '';
  return c.delta <= 0 ? 'good' : 'warn';
}

function signed(v) {
  if (v === 0) return '0';
  return `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
}

function cardioCard(cardio) {
  const last14 = cardio.filter((c) => c.d >= daysAgoISO(14));
  const totalMin = last14.reduce((a, c) => a + c.minutes, 0);
  return card({},
    h('h3', {}, 'Кардіо за 2 тижні'),
    h('div', { class: 'grid-2' },
      stat(`${totalMin} хв`, 'усього'),
      stat(last14.length, plural(last14.length, 'сесія', 'сесії', 'сесій')),
    ),
    h('ul', { class: 'log-list' },
      [...cardio].reverse().slice(0, 6).map((c) =>
        h('li', {}, h('span', {}, relDay(c.d)), h('span', { class: 'muted' }, `${c.key === 'zone2' ? 'Зона 2' : c.key === 'steps' ? 'Кроки' : 'Інтервали'} · ${c.minutes} хв`)),
      ),
    ),
  );
}

function weightLogCard(weights) {
  return accordion('progress-weights',
    [h('strong', {}, 'Усі заміри'), h('span', { class: 'muted small' }, ` ${weights.length}`)],
    h('ul', { class: 'log-list' },
      [...weights].reverse().map((w) =>
        h('li', {},
          h('span', {}, fmtDateFull(w.d)),
          h('span', {},
            h('strong', {}, kg(w.kg)),
            h('button', {
              class: 'link-btn',
              'aria-label': `Видалити замір ${fmtDate(w.d)}`,
              onclick: () => confirmSheet('Видалити замір?', `${fmtDate(w.d)} — ${kg(w.kg)}`, () => { deleteWeight(w.d); toast('Видалено'); }, 'Видалити'),
            }, '✕'),
          ),
        ),
      ),
    ),
  );
}

/* ─────────────── Strength ─────────────── */

function strengthTab(d) {
  const { logs } = d;
  if (!logs.length) return card({}, h('p', { class: 'muted' }, 'Дані з’являться після першого тренування.'));

  const records = buildRecords(logs);
  const weeks = weeklyVolume(logs);

  return h('div', {},
    card({},
      h('h3', {}, 'Тоннаж по тижнях'),
      barChart(weeks, { unit: 'т' }),
      h('p', { class: 'note' }, 'Тоннаж = вага × повторення × підходи (дві гантелі рахуються разом). Головний показник, що навантаження росте.'),
    ),
    card({},
      h('h3', {}, 'Рекорди по вправах'),
      h('div', { class: 'rec-list' },
        records.map((r) =>
          h('button', { class: 'rec-item', onclick: () => exerciseHistorySheet(r, logs) },
            h('div', {},
              h('strong', {}, r.name),
              h('p', { class: 'muted small' }, `${kg(r.bestKg)} × ${r.bestReps} · ${relDay(r.date)}`),
            ),
            h('div', { class: 'rec-1rm' }, r.e1rm ? h('span', {}, `${r.e1rm} кг`) : null, h('span', { class: 'muted small' }, '1ПМ')),
          ),
        ),
      ),
      h('p', { class: 'note' }, '1ПМ — розрахункова оцінка максимуму (формула Еплі). Перевіряти на практиці не потрібно.'),
    ),
  );
}

function buildRecords(logs) {
  const map = new Map();
  for (const log of logs) {
    for (const e of log.exercises || []) {
      const meta = EXERCISES[e.id];
      if (!meta || meta.mode === 'bw') continue;
      const mode = meta.mode === 'pair' ? 'pair' : 'single';
      for (const s of e.sets || []) {
        if (!s.done || !s.kg) continue;
        const lifted = liftedPerRep(s.kg, mode);
        const est = e.isTime ? 0 : e1rm(lifted, s.reps);
        const prev = map.get(e.id);
        const better = !prev || est > prev.e1rm || (est === prev.e1rm && s.kg > prev.bestKg);
        if (better) {
          map.set(e.id, { id: e.id, name: meta.name, bestKg: s.kg, bestReps: s.reps, e1rm: est, date: log.date });
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.e1rm - a.e1rm);
}

function weeklyVolume(logs) {
  const buckets = new Map();
  for (const log of logs) {
    const key = mondayOfISO(log.date);
    buckets.set(key, (buckets.get(key) || 0) + totalVolume(log.exercises || []));
  }
  const arr = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  return arr.map(([d, v], i, all) => ({
    label: fmtDate(d).split(' ')[0],
    value: Math.round(v / 1000 * 10) / 10,
    highlight: i === all.length - 1,
  }));
}

function exerciseHistorySheet(rec, logs) {
  const rows = [];
  for (const log of [...logs].reverse()) {
    const e = (log.exercises || []).find((x) => x.id === rec.id);
    if (!e) continue;
    const done = (e.sets || []).filter((s) => s.done);
    if (!done.length) continue;
    rows.push({ date: log.date, text: done.map((s) => `${s.reps}${e.isTime ? 'с' : ''}×${s.kg}кг`).join(', ') });
  }
  sheet(rec.name, h('div', {},
    h('ul', { class: 'log-list' }, rows.slice(0, 12).map((r) => h('li', {}, h('span', {}, relDay(r.date)), h('span', { class: 'muted small' }, r.text)))),
    h('p', { class: 'note' }, `Рекорд: ${kg(rec.bestKg)} × ${rec.bestReps} повт.`),
  ));
}

/* ─────────────── History ─────────────── */

function historyTab(d) {
  const { logs } = d;
  if (!logs.length) return card({}, h('p', { class: 'muted' }, 'Історія порожня.'));
  return h('div', {},
    ...[...logs].reverse().map((log) => {
      const day = dayByKey(log.dayKey);
      const done = (log.exercises || []).reduce((a, e) => a + (e.sets || []).filter((s) => s.done).length, 0);
      const vol = totalVolume(log.exercises || []);
      return card({ class: 'hist-card', style: { '--day-color': day.color } },
        h('div', { class: 'row-between' },
          h('div', {},
            h('div', { class: 'eyebrow' }, `${fmtDateFull(log.date)} · тиждень ${log.week}`),
            h('h3', {}, day.title),
          ),
          h('button', {
            class: 'link-btn',
            'aria-label': `Видалити тренування ${fmtDate(log.date)}`,
            onclick: () => confirmSheet('Видалити запис?', `${day.title}, ${fmtDate(log.date)}`, () => { deleteLog(log.id); toast('Видалено'); }, 'Видалити'),
          }, '✕'),
        ),
        h('div', { class: 'hist-meta' },
          h('span', {}, `${done} підходів`),
          h('span', {}, fmtDuration(log.durationSec)),
          h('span', {}, `${Math.round(vol)} кг`),
          log.finisherRounds
            ? h('span', { class: 'tag-hot' }, `фінішер ${log.finisherRounds}/${log.finisherTarget || log.finisherRounds}`)
            : log.finisherDone ? h('span', { class: 'tag-hot' }, 'фінішер ✓') : null,
        ),
        h('details', {},
          h('summary', { class: 'muted small' }, 'деталі'),
          h('ul', { class: 'log-list' },
            (log.exercises || []).map((e) => {
              const sets = (e.sets || []).filter((s) => s.done);
              if (!sets.length) return null;
              return h('li', {},
                h('span', {}, EXERCISES[e.id]?.name || e.id),
                h('span', { class: 'muted small' }, sets.map((s) => `${s.reps}${e.isTime ? 'с' : ''}${s.kg ? `×${s.kg}` : ''}`).join(' · ')),
              );
            }),
          ),
          log.note ? h('p', { class: 'note' }, log.note) : null,
        ),
      );
    }),
  );
}
