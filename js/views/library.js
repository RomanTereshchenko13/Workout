import { h, card, sheet, segmented, kg, btn } from '../ui.js';
import { GROUPS, allExercises, WARMUP, COOLDOWN } from '../data/exercises.js';
import { get } from '../store.js';
import { nearestLoad, describeLoad } from '../lib/plates.js';
import { DAYS } from '../data/program.js';

let filter = 'all';

export function libraryView() {
  const d = get();
  const list = allExercises().filter((e) => filter === 'all' || e.group === filter);

  return h('div', { class: 'view' },
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, `${allExercises().length} вправ під твій інвентар`), h('h1', {}, 'Вправи'))),

    h('div', { class: 'filter-scroll' },
      h('div', { class: 'chips' },
        [['all', 'Усі'], ...Object.entries(GROUPS).map(([k, v]) => [k, shortGroup(v)])].map(([k, label]) =>
          h('button', { class: `chip chip-btn ${filter === k ? 'is-active' : ''}`, onclick: () => { filter = k; rerender(); } }, label),
        ),
      ),
    ),

    h('div', { class: 'ex-grid' },
      list.map((e) =>
        h('button', { class: 'ex-tile', onclick: () => exSheet(e, d) },
          h('div', { class: 'et-top' },
            h('strong', {}, e.name),
            h('span', { class: `mode-badge mode-${e.mode}` }, modeLabel(e.mode)),
          ),
          h('p', { class: 'muted small' }, e.muscles),
        ),
      ),
    ),

    programCard(),

    h('details', { class: 'card accordion' },
      h('summary', {}, h('strong', {}, 'Розминка й заминка')),
      h('h4', {}, 'Розминка'),
      h('ul', { class: 'bullets' }, WARMUP.map((w) => h('li', {}, h('strong', {}, w.name), ' — ', w.detail))),
      h('h4', {}, 'Заминка'),
      h('ul', { class: 'bullets' }, COOLDOWN.map((w) => h('li', {}, h('strong', {}, w.name), ' — ', w.detail))),
    ),

    safetyCard(),
  );
}

function shortGroup(v) {
  return v.split(' /')[0].split(' (')[0];
}

function modeLabel(mode) {
  return { pair: '2 гантелі', single: '1 гантель', bw: 'вага тіла', plate: 'блин' }[mode] || mode;
}

function exSheet(e, d) {
  const mode = e.mode === 'pair' ? 'pair' : 'single';
  const start = e.start ? e.start[d.profile.experience] || e.start.beginner : null;
  const load = start ? nearestLoad(start, d.inventory, mode, 'down') : null;

  sheet(e.name, h('div', {},
    h('p', { class: 'muted' }, `${GROUPS[e.group]} · ${e.muscles}`),
    h('span', { class: `mode-badge mode-${e.mode}` }, modeLabel(e.mode)),
    h('h4', {}, 'Техніка'),
    h('ul', { class: 'bullets' }, e.cues.map((c) => h('li', {}, c))),
    load ? h('p', { class: 'note' }, `Орієнтовний старт для тебе: ${kg(load.kg)}. ${describeLoad(load, d.inventory, mode)}`) : null,
    e.mode === 'bw' ? h('p', { class: 'note' }, 'Складність регулюй кутом і темпом: повільніше опускання = важче.') : null,
    inWhichDays(e.id),
  ));
}

function inWhichDays(id) {
  const days = DAYS.filter((day) => day.main.some((s) => s.id === id) || day.finisher?.items.some((i) => i.id === id));
  if (!days.length) return h('p', { class: 'note' }, 'Не входить у базову програму — використовуй як заміну.');
  return h('p', { class: 'note' }, `У програмі: ${days.map((day) => `День ${day.key}`).join(', ')}.`);
}

function programCard() {
  return card({},
    h('h3', {}, 'Структура програми'),
    h('div', { class: 'day-cards' },
      DAYS.map((day) =>
        h('div', { class: 'day-card', style: { '--day-color': day.color } },
          h('div', { class: 'day-chip' }, `День ${day.key}`),
          h('strong', {}, day.title.replace(/^День [ABC] — /, '')),
          h('p', { class: 'muted small' }, day.focus),
          h('ul', { class: 'mini-list' }, day.main.map((s) => h('li', {}, `${s.sets}× ${nameOf(s.id)}`))),
          day.finisher ? h('p', { class: 'note' }, `🔥 ${day.finisher.title}`) : null,
        ),
      ),
    ),
    h('p', { class: 'note' }, 'Дні йдуть по колу A → B → C. Після кожного повного кола програма переходить на наступний тиждень 4-тижневої хвилі (база → об’єм → пік → розгрузка).'),
  );
}

function nameOf(id) {
  return allExercises().find((e) => e.id === id)?.name || id;
}

function safetyCard() {
  return card({ class: 'card-soft' },
    h('h3', {}, 'Безпека з набірними гантелями'),
    h('ul', { class: 'bullets' },
      h('li', {}, h('strong', {}, 'Гайки — перед кожним підходом.'), ' Різьбовий гриф розкручується від вібрації, особливо в махах і ривках.'),
      h('li', {}, h('strong', {}, 'Не кидай гантелі.'), ' Блини без покриття гнуть різьбу й розбивають підлогу. Опускай контрольовано, у крайньому разі — на підстилку.'),
      h('li', {}, h('strong', {}, 'Жим лежачи — тільки з підлоги.'), ' Без стійок і страхувальника це єдиний безпечний варіант: у крайньому разі просто опускаєш руки.'),
      h('li', {}, h('strong', {}, 'Біль у суглобі — стоп.'), ' М’язове паління нормальне, різкий біль у плечі, коліні чи поясниці — ні. Заміни вправу.'),
      h('li', {}, h('strong', {}, 'Спина в тягах.'), ' Округлилась — вага завелика. Це найчастіша травма домашніх тренувань.'),
    ),
    h('p', { class: 'note' }, 'Якщо є хронічні проблеми зі спиною, серцем або тиском — узгодь програму з лікарем перед початком.'),
  );
}

function rerender() {
  window.dispatchEvent(new CustomEvent('app:render'));
}
