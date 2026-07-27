import { h, card, btn, stat, kg, fmtDuration, relDay, plural, ring, sheet, num, field, toast } from '../ui.js';
import { get, startSession, logWeight, today, logCardio } from '../store.js';
import { buildSession, dayByRotation, waveOf, CARDIO, WEEK_TEMPLATE } from '../data/program.js';
import { describeLoad, shortLoad } from '../lib/plates.js';
import { macroTargets, calorieTarget, changeOverDays, weightTrend, forecast, sessionKcal } from '../lib/nutrition.js';
import { go, isStandalone, canPromptInstall, promptInstall, isIOS } from '../app.js';

export function homeView() {
  const d = get();
  const { profile, logs, state, inventory, active } = d;
  const plan = buildSession({
    rotation: state.rotation,
    week: state.week,
    history: logs,
    inventory,
    experience: profile.experience,
  });
  const wave = waveOf(state.week);
  const macros = macroTargets(profile);
  const cal = calorieTarget(profile);

  return h('div', { class: 'view' },
    header(profile, logs),
    installCard(),
    active ? activeBanner(active) : nextWorkoutCard(plan, wave),
    weightCard(d),
    todayTargets(macros, cal, profile),
    streakCard(logs),
    weekPlanCard(state),
    equipmentNote(inventory),
  );
}

/**
 * Shown only while the app runs in a browser tab. Chrome hides "Install app"
 * in its ⋮ menu, so without this card the PWA reads as an ordinary website.
 */
function installCard() {
  if (isStandalone()) return null;

  if (canPromptInstall()) {
    return card({ class: 'card-accent' },
      h('div', { class: 'row-between' },
        h('div', {},
          h('div', { class: 'eyebrow' }, 'Встановлення'),
          h('h3', {}, 'Додати на головний екран'),
          h('p', { class: 'muted small' }, 'Свій значок, повний екран без адресного рядка, робота офлайн.'),
        ),
        btn('Встановити', {
          variant: 'primary',
          onClick: async () => {
            const outcome = await promptInstall();
            if (outcome === 'accepted') toast('Готово — шукай значок серед застосунків');
            else if (outcome === 'dismissed') toast('Скасовано. Кнопка лишиться тут');
            else toast('Браузер не пропонує встановлення — див. інструкцію', 'warn');
          },
        }),
      ),
    );
  }

  // No programmatic prompt: iOS Safari never offers one, and Chrome needs the menu.
  return h('details', { class: 'card accordion' },
    h('summary', {}, h('strong', {}, '📲 Встановити як застосунок'), h('span', { class: 'muted small' }, ' зараз працює як сайт')),
    isIOS()
      ? h('div', {},
          h('p', { class: 'muted small' }, 'На iPhone встановлює лише Safari — у Chrome цієї можливості немає.'),
          h('ol', { class: 'bullets' },
            h('li', {}, 'Відкрий цю сторінку в Safari.'),
            h('li', {}, 'Натисни «Поділитися» (квадрат зі стрілкою вгору).'),
            h('li', {}, 'Обери «Додати на початковий екран» → «Додати».'),
          ),
        )
      : h('div', {},
          h('ol', { class: 'bullets' },
            h('li', {}, 'Меню ⋮ у Chrome (три крапки вгорі справа).'),
            h('li', {}, '«Встановити застосунок» або «Додати на головний екран».'),
            h('li', {}, 'Підтвердь — значок з’явиться серед застосунків.'),
          ),
          h('p', { class: 'note' }, 'Якщо пункту немає: перезавантаж сторінку через кілька секунд — браузер має спершу зареєструвати офлайн-режим. Встановлення працює лише за https, не в режимі інкогніто.'),
        ),
  );
}

function header(profile, logs) {
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Доброї ночі' : hour < 12 ? 'Доброго ранку' : hour < 18 ? 'Добрий день' : 'Добрий вечір';
  return h('div', { class: 'page-head' },
    h('div', {},
      h('div', { class: 'eyebrow' }, greet + (profile.name ? `, ${profile.name}` : '')),
      h('h1', {}, 'Тренування'),
    ),
    h('div', { class: 'head-badge' }, `${logs.length} ${plural(logs.length, 'сесія', 'сесії', 'сесій')}`),
  );
}

function activeBanner(active) {
  const mins = Math.round((Date.now() - active.startedAt) / 60000);
  const done = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const total = active.exercises.reduce((a, e) => a + e.sets.length, 0);
  return card({ class: 'card-accent' },
    h('div', { class: 'row-between' },
      h('div', {},
        h('div', { class: 'eyebrow' }, 'Тренування триває'),
        h('h2', {}, `День ${active.dayKey}`),
        h('p', { class: 'muted' }, `${mins} хв · ${done}/${total} підходів`),
      ),
      btn('Продовжити', { variant: 'primary', onClick: () => go('#/session') }),
    ),
  );
}

function nextWorkoutCard(plan, wave) {
  const { day, exercises, estMinutes, finisher } = plan;
  return card({ class: 'card-hero', style: { '--day-color': day.color } },
    h('div', { class: 'hero-top' },
      h('div', { class: 'day-chip' }, `День ${day.key}`),
      h('div', { class: 'wave-chip' }, wave.label),
    ),
    h('h2', { class: 'hero-title' }, day.title),
    h('p', { class: 'muted' }, day.focus),
    h('div', { class: 'hero-meta' },
      h('span', {}, `≈ ${estMinutes} хв`),
      h('span', {}, `${exercises.length} вправ`),
      finisher ? h('span', {}, 'фінішер') : null,
    ),
    h('p', { class: 'wave-hint' }, wave.hint),
    h('ul', { class: 'preview-list' },
      exercises.slice(0, 4).map((e) =>
        h('li', {},
          h('span', { class: 'pl-name' }, e.name),
          h('span', { class: 'pl-load' },
            e.mode === 'bw'
              ? `${e.sets}×${e.isTime ? `${e.reps.low} с` : `${e.reps.low}-${e.reps.high}`}`
              : `${e.sets}×${e.isTime ? `${e.reps.low} с` : `${e.reps.low}-${e.reps.high}`} · ${kg(e.suggested.kg)}`,
          ),
        ),
      ),
      exercises.length > 4 ? h('li', { class: 'muted' }, `+ ще ${exercises.length - 4}`) : null,
    ),
    btn('Почати тренування', {
      variant: 'primary',
      class: 'btn-block',
      onClick: () => {
        startSession(plan);
        go('#/session');
      },
    }),
  );
}

function weightCard(d) {
  const { weights, profile } = d;
  const trend = weightTrend(weights);
  const last = trend[trend.length - 1];
  const w7 = changeOverDays(weights, 7);
  const w30 = changeOverDays(weights, 30);
  const fc = forecast(profile);
  const toGo = profile.goalWeightKg ? Math.round((profile.weightKg - profile.goalWeightKg) * 10) / 10 : null;

  const startW = weights.length ? weights[0].kg : profile.weightKg;
  const progress = toGo !== null && startW > profile.goalWeightKg
    ? (startW - profile.weightKg) / (startW - profile.goalWeightKg)
    : 0;

  return card({},
    h('div', { class: 'row-between' },
      h('h3', {}, 'Вага тіла'),
      btn('Зважитись', { variant: 'ghost', onClick: () => weighSheet(profile) }),
    ),
    h('div', { class: 'weight-row' },
      ring(progress, kg(profile.weightKg), toGo > 0 ? `−${toGo} до цілі` : 'ціль ✓'),
      h('div', { class: 'weight-stats' },
        stat(w7 ? signed(w7.delta) : '—', 'за 7 днів', w7 ? (w7.delta <= 0 ? 'good' : 'warn') : ''),
        stat(w30 ? signed(w30.delta) : '—', 'за 30 днів', w30 ? (w30.delta <= 0 ? 'good' : 'warn') : ''),
        stat(last ? kg(last.trend) : '—', 'тренд'),
      ),
    ),
    fc
      ? h('p', { class: 'note' },
          `За поточного дефіциту ≈ ${fc.kgPerWeek} кг/тиждень → ціль ${kg(profile.goalWeightKg)} приблизно через ${fc.weeks} ${plural(fc.weeks, 'тиждень', 'тижні', 'тижнів')}.`)
      : null,
    weights.length > 1 ? btn('Графік і історія', { variant: 'ghost', class: 'btn-block', onClick: () => go('#/progress') }) : null,
  );
}

function signed(v) {
  if (v === 0) return '0';
  return `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
}

export function weighSheet(profile) {
  let value = profile.weightKg;
  const input = num(value, { step: 0.1, onChange: (v) => (value = v) });
  sheet('Зважування', h('div', {},
    field('Вага, кг', input, 'Зранку, після туалету, до їжі — так дані порівнювані'),
    h('p', { class: 'note' }, 'Коливання ±1,5 кг за день — це вода й вміст ШКТ, а не жир. Дивись на тренд.'),
  ), [
    { label: 'Скасувати', variant: 'ghost' },
    {
      label: 'Записати',
      variant: 'primary',
      onClick: () => {
        const v = parseFloat(input.value);
        if (!v || v < 30 || v > 300) return toast('Схоже на помилку у вазі', 'bad');
        logWeight(v);
        toast('Записано');
      },
    },
  ]);
}

function todayTargets(macros, cal, profile) {
  return card({},
    h('h3', {}, 'Цілі на день'),
    h('div', { class: 'grid-4' },
      stat(macros.kcal, 'ккал'),
      stat(`${macros.proteinG} г`, 'білок'),
      stat(`${macros.fatG} г`, 'жири'),
      stat(`${macros.carbsG} г`, 'вуглеводи'),
    ),
    h('p', { class: 'note' },
      cal.mode === 'cut'
        ? `Дефіцит ${cal.deficit} ккал від витрат${cal.floored ? ' (обмежено знизу — глибше різати шкідливо)' : ''}. Білок високий, щоб зберегти м’язи.`
        : 'Режим підтримки: цільова вага не нижче поточної.'),
    h('p', { class: 'note' }, `Вода: ≈ ${(macros.waterMl / 1000).toFixed(1)} л на день. Силове тренування спалює ≈ ${sessionKcal(profile.weightKg, 50)} ккал.`),
  );
}

function streakCard(logs) {
  const days = new Set(logs.map((l) => l.date));
  let streakWeeks = 0;
  for (let w = 0; w < 12; w++) {
    const from = new Date(Date.now() - (w + 1) * 7 * 86400000);
    const to = new Date(Date.now() - w * 7 * 86400000);
    const count = [...days].filter((d) => {
      const t = new Date(`${d}T12:00:00`);
      return t > from && t <= to;
    }).length;
    if (count >= 2) streakWeeks++;
    else if (w > 0) break;
  }
  const last = logs[logs.length - 1];
  const totalMin = Math.round(logs.reduce((a, l) => a + (l.durationSec || 0) / 60, 0));

  return card({},
    h('h3', {}, 'Регулярність'),
    h('div', { class: 'grid-3' },
      stat(streakWeeks, plural(streakWeeks, 'тиждень підряд', 'тижні підряд', 'тижнів підряд')),
      stat(logs.length, 'усього тренувань'),
      stat(fmtDuration(totalMin * 60), 'під навантаженням'),
    ),
    last ? h('p', { class: 'note' }, `Останнє тренування: День ${last.dayKey}, ${relDay(last.date)}, ${fmtDuration(last.durationSec)}.`) : h('p', { class: 'note' }, 'Ще не було тренувань — почни з Дня A.'),
  );
}

function weekPlanCard(state) {
  const d = get();
  const doneDates = new Set(d.logs.map((l) => l.date));
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const todayISO = today();

  return card({},
    h('div', { class: 'row-between' }, h('h3', {}, 'Тиждень'), h('span', { class: 'muted small' }, waveOf(state.week).label)),
    h('div', { class: 'week-grid' },
      WEEK_TEMPLATE.map((slot, i) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const iso = date.toISOString().slice(0, 10);
        const isDone = doneDates.has(iso);
        const isToday = iso === todayISO;
        return h('div', { class: `week-cell kind-${slot.kind} ${isDone ? 'is-done' : ''} ${isToday ? 'is-today' : ''}` },
          h('div', { class: 'wc-day' }, slot.day),
          h('div', { class: 'wc-dot' }, isDone ? '✓' : ''),
          h('div', { class: 'wc-label' }, slot.kind === 'strength' ? 'сила' : slot.kind === 'cardio' ? 'кардіо' : 'відп.'),
        );
      }),
    ),
    h('div', { class: 'cardio-list' },
      CARDIO.slice(0, 3).map((c) =>
        h('button', { class: 'cardio-item', onclick: () => cardioSheet(c) },
          h('div', {}, h('strong', {}, c.title), h('p', { class: 'muted small' }, c.detail)),
          h('span', { class: 'chev' }, '›'),
        ),
      ),
    ),
  );
}

function cardioSheet(c) {
  const d = get();
  let minutes = c.key === 'zone2' ? 45 : c.key === 'intervals' ? 30 : 30;
  const input = num(minutes, { onChange: (v) => (minutes = v) });
  sheet(c.title, h('div', {},
    h('p', {}, c.detail),
    h('p', { class: 'note' }, c.why),
    h('p', { class: 'note' }, `Орієнтовна витрата: ≈ ${c.kcal(d.profile.weightKg)} ккал за 45 хв.`),
    c.key !== 'rest' ? field('Скільки хвилин зробив', input) : null,
  ), c.key === 'rest' ? [] : [
    { label: 'Закрити', variant: 'ghost' },
    {
      label: 'Записати',
      variant: 'primary',
      onClick: () => {
        logCardio(c.key, parseFloat(input.value) || minutes);
        toast('Кардіо записано');
      },
    },
  ]);
}

function equipmentNote(inventory) {
  return card({ class: 'card-soft' },
    h('h3', {}, 'Інвентар'),
    h('p', { class: 'muted' }, `Дві гантелі до ${inventory.maxPerDumbbellKg} кг: грифи 35 см, блини 4×2, 4×3, 4×4 кг (Ø160 мм, без покриття).`),
    h('ul', { class: 'bullets' },
      h('li', {}, 'Затягуй гайки перед кожним підходом — різьбовий гриф розкручується від вібрації.'),
      h('li', {}, 'Не кидай на підлогу: сталь без покриття псує покриття підлоги й гнеться різьба.'),
      h('li', {}, 'Доступні ваги на гантель: 2, 6, 8, 10, 12, 14, 16, 20 кг (і 18 кг, коли збираєш одну гантель).'),
    ),
    btn('Калькулятор блинів', { variant: 'ghost', class: 'btn-block', onClick: () => go('#/tools') }),
  );
}
