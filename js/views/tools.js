import { h, card, btn, kg, field, num, segmented, toast, sheet, stat } from '../ui.js';
import { get, saveInventory } from '../store.js';
import { achievableLoads, nearestLoad, describeLoad, plateUsage, maxLoad } from '../lib/plates.js';
import { NUTRITION_RULES, macroTargets, bmi, bmiLabel, weeklyRate, ACTIVITY, tdee, bmr } from '../lib/nutrition.js';
import { CARDIO } from '../data/program.js';

let calcTarget = 12;
let calcMode = 'pair';

export function toolsView() {
  const d = get();
  return h('div', { class: 'view' },
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Довідник'), h('h1', {}, 'Інструменти'))),
    plateCalculator(d),
    ladderCard(d),
    inventoryCard(d),
    bodyCard(d),
    nutritionCard(d),
    cardioCard(),
  );
}

/* ─────────────── Plate calculator ─────────────── */

function plateCalculator(d) {
  const inv = d.inventory;
  const load = nearestLoad(calcTarget, inv, calcMode);
  const usage = plateUsage(load, calcMode);
  const exact = Math.abs(load.kg - calcTarget) < 0.01;

  const rerender = () => window.dispatchEvent(new CustomEvent('app:render'));

  return card({},
    h('h3', {}, 'Калькулятор блинів'),
    segmented(calcMode, [['pair', 'Дві гантелі'], ['single', 'Одна гантель']], (v) => { calcMode = v; rerender(); }),
    h('div', { class: 'calc-target' },
      h('button', { class: 'load-btn', onclick: () => { calcTarget = Math.max(2, calcTarget - 1); rerender(); } }, '−'),
      h('div', {}, h('div', { class: 'calc-kg' }, `${calcTarget} кг`), h('div', { class: 'muted small' }, 'потрібна вага гантелі')),
      h('button', { class: 'load-btn', onclick: () => { calcTarget = Math.min(maxLoad(inv, calcMode), calcTarget + 1); rerender(); } }, '+'),
    ),
    h('input', {
      type: 'range', class: 'slider', min: 2, max: maxLoad(inv, calcMode), step: 1, value: calcTarget,
      oninput: (e) => { calcTarget = parseFloat(e.target.value); rerender(); },
    }),
    h('div', { class: `calc-result ${exact ? '' : 'is-approx'}` },
      h('div', { class: 'calc-result-kg' }, kg(load.kg)),
      h('p', {}, describeLoad(load, inv, calcMode)),
      !exact ? h('p', { class: 'note warn' }, `Рівно ${calcTarget} кг цим набором не збереш — найближче ${kg(load.kg)}.`) : null,
    ),
    h('div', { class: 'plate-usage' },
      Object.keys(inv.plates).map(Number).sort((a, b) => b - a).map((dn) =>
        h('div', { class: `pu-item ${usage[dn] ? 'is-used' : ''}` },
          h('div', { class: 'pu-count' }, `${usage[dn] || 0}/${inv.plates[dn]}`),
          h('div', { class: 'pu-label' }, `${dn} кг`),
        ),
      ),
    ),
    h('p', { class: 'note' },
      calcMode === 'pair'
        ? `Обидві гантелі однакові — разом у руках ${kg(load.kg * 2)}. Блини діляться навпіл між грифами.`
        : 'Одна гантель — другий гриф лежить. Так доступні ваги, яких немає в парному режимі (18 кг).'),
  );
}

/* ─────────────── Weight ladder ─────────────── */

function ladderCard(d) {
  const inv = d.inventory;
  const pair = achievableLoads(inv, 'pair');
  const single = achievableLoads(inv, 'single');
  const gaps = findGaps(pair.map((l) => l.kg));

  return card({},
    h('h3', {}, 'Усі доступні ваги'),
    h('div', { class: 'ladder' },
      h('div', { class: 'ladder-label' }, 'Пара'),
      h('div', { class: 'chips' }, pair.map((l) => h('span', { class: 'chip', title: describeLoad(l, inv, 'pair') }, l.kg))),
    ),
    h('div', { class: 'ladder' },
      h('div', { class: 'ladder-label' }, 'Одна'),
      h('div', { class: 'chips' }, single.map((l) => h('span', { class: `chip ${pair.some((p) => p.kg === l.kg) ? '' : 'chip-extra'}`, title: describeLoad(l, inv, 'single') }, l.kg))),
    ),
    h('p', { class: 'note' },
      `Крок між вагами — 2 кг у середині діапазону, але є розриви: ${gaps.join(', ')} кг у парному режимі не збираються.`),
    h('p', { class: 'note' }, 'Якщо колись захочеш дрібніший крок і закрити розриви — докупи 4 блини по 1 кг і 2 по 1,5 кг. Це найдешевше вливання в цей набір.'),
  );
}

function findGaps(list) {
  const gaps = [];
  for (let v = list[1]; v < list[list.length - 1]; v += 2) {
    if (!list.includes(v)) gaps.push(v);
  }
  return gaps.length ? gaps : ['—'];
}

/* ─────────────── Inventory ─────────────── */

function inventoryCard(d) {
  const inv = structuredClone(d.inventory);
  const inputs = {};
  for (const dn of Object.keys(inv.plates)) {
    inputs[dn] = num(inv.plates[dn], { min: 0, max: 20 });
  }
  const barInput = num(inv.barKg, { step: 0.5, min: 0.5 });
  const maxInput = num(inv.maxPerDumbbellKg, { step: 1, min: 2 });
  const sideInput = num(inv.maxPlatesPerSide, { step: 1, min: 1, max: 8 });

  return h('details', { class: 'card accordion' },
    h('summary', {}, h('strong', {}, 'Налаштування інвентарю'), h('span', { class: 'muted small' }, ' грифи, блини, ліміти')),
    h('div', { class: 'sheet-grid' },
      field('Вага грифа з гайками, кг', barInput),
      field('Ліміт на гантель, кг', maxInput, 'Твій набір розрахований на 20'),
      field('Макс. блинів на сторону', sideInput, 'Гриф 35 см тримає ~3 блини Ø160'),
    ),
    h('div', { class: 'sheet-grid' },
      Object.keys(inputs).sort((a, b) => a - b).map((dn) => field(`Блинів по ${dn} кг`, inputs[dn])),
    ),
    btn('Зберегти інвентар', {
      variant: 'primary', class: 'btn-block',
      onClick: () => {
        const plates = {};
        for (const dn of Object.keys(inputs)) {
          const v = parseInt(inputs[dn].value, 10);
          if (v > 0) plates[dn] = v;
        }
        saveInventory({
          barKg: parseFloat(barInput.value) || 2,
          plates,
          maxPerDumbbellKg: parseFloat(maxInput.value) || 20,
          maxPlatesPerSide: parseInt(sideInput.value, 10) || 3,
        });
        toast('Інвентар оновлено');
        window.dispatchEvent(new CustomEvent('app:render'));
      },
    }),
    h('p', { class: 'note' }, 'Докупив блини — онови тут, і програма сама почне пропонувати нові кроки ваги.'),
    h('p', { class: 'note' }, 'Якщо переставити блини з другого грифа на один, одна гантель фізично збирається важче за 20 кг — підніми ліміт, коли тяга однією рукою стане легкою.'),
  );
}

/* ─────────────── Body metrics ─────────────── */

function bodyCard(d) {
  const p = d.profile;
  const b = bmi(p);
  const lbl = bmiLabel(b);
  const rate = weeklyRate(p);
  return card({},
    h('h3', {}, 'Показники тіла'),
    h('div', { class: 'grid-3' },
      stat(b, 'ІМТ', lbl.tone),
      stat(bmr(p), 'BMR, ккал'),
      stat(tdee(p), 'витрати, ккал'),
    ),
    h('p', { class: 'note' }, `ІМТ: ${lbl.text}. Активність: ${ACTIVITY[p.activity]?.label || '—'}.`),
    h('p', { class: 'note' }, `Безпечний темп схуднення для твоєї ваги: ${rate.lo}–${rate.hi} кг на тиждень. Швидше — це вода й м’язи, а не жир.`),
    h('p', { class: 'note' }, 'ІМТ не бачить різниці між м’язами й жиром. Якщо тренуєшся й вага стоїть, а одяг сидить вільніше — усе працює.'),
  );
}

/* ─────────────── Nutrition ─────────────── */

function nutritionCard(d) {
  const m = macroTargets(d.profile);
  return card({},
    h('h3', {}, 'Харчування під дефіцит'),
    h('div', { class: 'grid-4' },
      stat(m.kcal, 'ккал'),
      stat(`${m.proteinG} г`, 'білок'),
      stat(`${m.fatG} г`, 'жири'),
      stat(`${m.carbsG} г`, 'вуглеводи'),
    ),
    h('div', { class: 'rules' }, NUTRITION_RULES.map((r) => h('div', { class: 'rule' }, h('strong', {}, r.t), h('p', { class: 'muted small' }, r.d)))),
    h('p', { class: 'note' }, `Орієнтир по білку: ${Math.round(m.proteinG / 4)} г на прийом їжі × 4 прийоми. Це приблизно долоня м’яса або 200 г сиру.`),
  );
}

function cardioCard() {
  const d = get();
  return card({},
    h('h3', {}, 'Кардіо: що і скільки'),
    h('div', { class: 'rules' },
      CARDIO.map((c) => h('div', { class: 'rule' },
        h('strong', {}, c.title),
        h('p', { class: 'muted small' }, c.detail),
        h('p', { class: 'note' }, `${c.why}${c.kcal(d.profile.weightKg) ? ` ≈ ${c.kcal(d.profile.weightKg)} ккал/45 хв.` : ''}`),
      )),
    ),
  );
}
