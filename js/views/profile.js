import { h, card, btn, field, num, select, segmented, toast, confirmSheet, sheet, kg, stat } from '../ui.js';
import { get, saveProfile, saveSettings, exportJSON, importJSON, resetAll, update } from '../store.js';
import { ACTIVITY, bmr, tdee, calorieTarget, macroTargets, forecast } from '../lib/nutrition.js';
import { APP_VERSION, checkForUpdate, installDiagnostics } from '../app.js';

export function profileView() {
  const d = get();
  const p = d.profile;

  return h('div', { class: 'view' },
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Налаштування'), h('h1', {}, 'Профіль'))),
    profileCard(p),
    goalCard(p),
    settingsCard(d.settings),
    programStateCard(d),
    dataCard(),
    aboutCard(),
  );
}

function profileCard(p) {
  const set = (patch) => {
    saveProfile(patch);
    window.dispatchEvent(new CustomEvent('app:render'));
  };
  return card({},
    h('h3', {}, 'Про тебе'),
    field('Ім’я', h('input', { class: 'input', value: p.name || '', placeholder: 'необов’язково', onchange: (e) => set({ name: e.target.value }) })),
    h('div', { class: 'sheet-grid' },
      field('Стать', segmented(p.sex, [['m', 'Чоловік'], ['f', 'Жінка']], (v) => set({ sex: v }))),
      field('Вік', num(p.age, { onChange: (v) => v && set({ age: v }) })),
      field('Зріст, см', num(p.heightCm, { onChange: (v) => v && set({ heightCm: v }) })),
      field('Вага, кг', num(p.weightKg, { step: 0.1, onChange: (v) => v && set({ weightKg: v }) })),
    ),
    field('Активність поза тренуваннями', select(p.activity, Object.entries(ACTIVITY).map(([k, v]) => [k, v.label]), (v) => set({ activity: v }))),
    field('Досвід силових', segmented(p.experience, [['beginner', 'Новачок'], ['inter', 'Середній'], ['adv', 'Досвід']], (v) => set({ experience: v })),
      'Впливає на стартові ваги в програмі'),
  );
}

function goalCard(p) {
  const set = (patch) => {
    saveProfile(patch);
    window.dispatchEvent(new CustomEvent('app:render'));
  };
  const cal = calorieTarget(p);
  const m = macroTargets(p);
  const fc = forecast(p);
  return card({},
    h('h3', {}, 'Ціль'),
    field('Цільова вага, кг', num(p.goalWeightKg, { step: 0.5, onChange: (v) => v && set({ goalWeightKg: v }) })),
    h('div', { class: 'grid-3' },
      stat(bmr(p), 'BMR'),
      stat(tdee(p), 'витрати'),
      stat(m.kcal, 'ціль ккал'),
    ),
    h('p', { class: 'note' },
      cal.mode === 'cut'
        ? `Дефіцит ${cal.deficit} ккал/день${cal.floored ? ' — обмежено знизу, щоб не втрачати м’язи' : ''}. Білок ${m.proteinG} г.`
        : 'Цільова вага не менша за поточну — розрахунок у режимі підтримки.'),
    fc ? h('p', { class: 'note' }, `Прогноз: ${fc.kgPerWeek} кг/тиждень, ≈ ${fc.weeks} тижнів до цілі.`) : null,
  );
}

function settingsCard(s) {
  const set = (patch) => {
    saveSettings(patch);
    window.dispatchEvent(new CustomEvent('app:render'));
  };
  return card({},
    h('h3', {}, 'Тренування'),
    field('Відпочинок за замовчуванням, с', num(s.restDefault, { step: 15, onChange: (v) => v && set({ restDefault: v }) })),
    toggle('Автотаймер після підходу', s.autoRest, (v) => set({ autoRest: v })),
    toggle('Звук таймера', s.sound, (v) => set({ sound: v })),
    toggle('Вібрація', s.vibrate, (v) => set({ vibrate: v })),
    h('p', { class: 'note' }, 'Екран не гасне під час тренування (якщо браузер дозволяє). Звук починає працювати після першого дотику до екрана — обмеження браузерів.'),
  );
}

function toggle(label, value, onChange) {
  return h('label', { class: 'switch-row' },
    h('span', {}, label),
    h('input', { type: 'checkbox', class: 'switch', checked: !!value, onchange: (e) => onChange(e.target.checked) }),
  );
}

function programStateCard(d) {
  const { state } = d;
  const DAY_KEYS = ['A', 'B', 'C'];
  return card({},
    h('h3', {}, 'Стан програми'),
    h('div', { class: 'grid-3' },
      stat(DAY_KEYS[state.rotation % 3], 'наступний день'),
      stat(state.week, 'тиждень'),
      stat(((state.week - 1) % 4) + 1, 'у хвилі'),
    ),
    h('div', { class: 'row-gap' },
      btn('Наступний день ▸', { variant: 'ghost', onClick: () => { update((x) => { x.state.rotation += 1; }); toast('Ротацію зсунуто'); rerender(); } }),
      btn('Тиждень +1', { variant: 'ghost', onClick: () => { update((x) => { x.state.week += 1; }); toast('Тиждень змінено'); rerender(); } }),
      btn('Тиждень −1', { variant: 'ghost', onClick: () => { update((x) => { x.state.week = Math.max(1, x.state.week - 1); }); toast('Тиждень змінено'); rerender(); } }),
    ),
    h('p', { class: 'note' }, 'Пропустив тренування — нічого не зсувай, просто зроби наступний день ротації. Ручні кнопки тут для випадків, коли тренувався не за застосунком.'),
  );
}

function dataCard() {
  return card({},
    h('h3', {}, 'Дані'),
    h('p', { class: 'muted small' }, 'Усе зберігається лише на цьому телефоні. Роби бекап перед зміною пристрою або очищенням даних браузера.'),
    h('div', { class: 'row-gap' },
      btn('Експорт у файл', { variant: 'ghost', onClick: doExport }),
      btn('Імпорт з файлу', { variant: 'ghost', onClick: doImport }),
    ),
    btn('Скинути всі дані', {
      variant: 'danger', class: 'btn-block',
      onClick: () => confirmSheet('Стерти все?', 'Історія тренувань, заміри ваги й налаштування зникнуть безповоротно.', () => {
        resetAll();
        toast('Дані стерто');
        location.hash = '#/';
        rerender();
      }, 'Стерти все'),
    }),
  );
}

function doExport() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `workout-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Файл збережено');
}

function doImport() {
  const input = h('input', {
    type: 'file', accept: 'application/json',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        importJSON(await file.text());
        toast('Дані відновлено');
        rerender();
      } catch (err) {
        toast(`Не вдалося: ${err.message}`, 'bad');
      }
    },
  });
  input.click();
}

function aboutCard() {
  return card({ class: 'card-soft' },
    h('h3', {}, 'Про застосунок'),
    h('p', { class: 'muted small' }, `Версія ${APP_VERSION}. Працює офлайн, дані не виходять за межі телефона.`),
    h('div', { class: 'row-gap' },
      btn('Перевірити оновлення', { variant: 'ghost', onClick: async () => { toast('Перевіряю...'); const found = await checkForUpdate(); if (!found) toast('Версія найновіша'); } }),
      btn('Як встановити', { variant: 'ghost', onClick: installSheet }),
      btn('Чому не встановлюється?', { variant: 'ghost', onClick: diagnosticsSheet }),
    ),
  );
}

/**
 * Installation has a lot of invisible preconditions (https, an active service
 * worker, a browser that offers the prompt at all). When it silently does not
 * work there is nothing to look at — this sheet is that "nothing" made visible.
 */
async function diagnosticsSheet() {
  const d = await installDiagnostics();
  const row = (label, ok, hint) => h('div', { class: 'diag-row' },
    h('div', {}, h('div', {}, label), hint ? h('div', { class: 'note' }, hint) : null),
    h('span', { class: ok ? 'diag-ok' : 'diag-no' }, ok ? '✓' : '✗'),
  );

  sheet('Чому не встановлюється', h('div', {},
    d.standalone
      ? h('p', { class: 'muted small' }, 'Застосунок уже запущено з головного екрана — встановлювати нічого не треба.')
      : h('p', { class: 'muted small' }, 'Усе нижче має бути ✓, інакше браузер не запропонує встановлення.'),
    row('Захищене з’єднання (https)', d.secure, d.secure ? null : 'Встановлення працює лише за https або на localhost.'),
    row('Браузер підтримує офлайн-режим', d.serviceWorker),
    row('Офлайн-режим уже активний', d.serviceWorkerActive, d.serviceWorkerActive ? null : 'Перезавантаж сторінку через кілька секунд.'),
    row('Маніфест застосунку знайдено', d.manifest),
    row('Браузер запропонував встановлення', d.promptReady || d.outcome === 'accepted',
      d.ios ? 'iOS ніколи цього не пропонує — став через Safari → «Поділитися».' : 'У режимі інкогніто Chrome не пропонує встановлення.'),
    h('p', { class: 'note' }, `Версія ${d.version}${d.outcome ? ` · остання спроба: ${d.outcome === 'accepted' ? 'встановлено' : 'скасовано'}` : ''}.`),
  ), [{ label: 'Закрити', variant: 'ghost' }]);
}

function installSheet() {
  sheet('Встановлення на телефон', h('div', {},
    h('h4', {}, 'Android (Chrome)'),
    h('ol', { class: 'bullets' },
      h('li', {}, 'Відкрий сайт у Chrome.'),
      h('li', {}, 'Меню ⋮ → «Встановити застосунок» (або «Додати на головний екран»).'),
      h('li', {}, 'Іконка з’явиться серед застосунків, відкриватиметься без адресного рядка.'),
    ),
    h('h4', {}, 'iPhone (Safari)'),
    h('ol', { class: 'bullets' },
      h('li', {}, 'Відкрий сайт у Safari (не в Chrome — на iOS встановлює лише Safari).'),
      h('li', {}, 'Кнопка «Поділитися» → «Додати на початковий екран».'),
      h('li', {}, 'Готово. Дані зберігаються окремо від браузера.'),
    ),
    h('p', { class: 'note' }, 'Оновлення приходять самі: коли я викладаю нову версію, застосунок підтягує її при наступному запуску й показує кнопку «Оновити».'),
  ));
}

function rerender() {
  window.dispatchEvent(new CustomEvent('app:render'));
}
