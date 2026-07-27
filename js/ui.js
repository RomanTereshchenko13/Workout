/** Small helpers for DOM building, charts and dialogs. No dependencies. */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  add(el, children);
  return el;
}

function add(parent, children) {
  for (const c of children.flat(9)) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function svgEl(tag, props = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, v);
  }
  add(el, children);
  return el;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ─────────────── Formatting ─────────────── */

const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function fmtDate(iso, withYear = false) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

export function fmtDateFull(iso) {
  const dt = new Date(`${iso}T12:00:00`);
  return `${WEEKDAYS[dt.getDay()]}, ${fmtDate(iso)}`;
}

export function relDay(iso) {
  const t = new Date();
  const target = new Date(`${iso}T12:00:00`);
  const days = Math.round((target - new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12)) / 86400000);
  if (days === 0) return 'сьогодні';
  if (days === -1) return 'вчора';
  if (days === -2) return 'позавчора';
  if (days < 0) return `${-days} дн. тому`;
  return fmtDate(iso);
}

export function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} с`;
  if (m < 60) return `${m} хв${s ? ` ${s} с` : ''}`;
  return `${Math.floor(m / 60)} год ${m % 60} хв`;
}

export function mmss(sec) {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${sec < 0 ? '-' : ''}${m}:${String(s).padStart(2, '0')}`;
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function kg(n) {
  if (n === null || n === undefined) return '—';
  return `${Math.round(n * 10) / 10} кг`;
}

/* ─────────────── Components ─────────────── */

export function card(props, ...children) {
  return h('div', { ...props, class: `card ${props.class || ''}` }, ...children);
}

export function btn(label, opts = {}) {
  return h(
    'button',
    {
      class: `btn ${opts.variant ? `btn-${opts.variant}` : ''} ${opts.class || ''}`,
      onclick: opts.onClick,
      type: opts.type || 'button',
      disabled: opts.disabled,
    },
    opts.icon ? h('span', { class: 'btn-icon' }, opts.icon) : null,
    label,
  );
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function num(value, opts = {}) {
  return h('input', {
    type: 'number',
    class: 'input',
    value: value ?? '',
    step: opts.step ?? 1,
    min: opts.min ?? 0,
    max: opts.max,
    inputmode: 'decimal',
    onchange: opts.onChange ? (e) => opts.onChange(parseFloat(e.target.value)) : null,
  });
}

export function select(value, options, onChange) {
  return h(
    'select',
    { class: 'input', onchange: (e) => onChange(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)),
  );
}

export function segmented(value, options, onChange) {
  return h(
    'div',
    { class: 'segmented' },
    options.map(([v, label]) =>
      h(
        'button',
        { type: 'button', class: `seg ${v === value ? 'is-active' : ''}`, onclick: () => onChange(v) },
        label,
      ),
    ),
  );
}

export function stat(value, label, tone) {
  return h('div', { class: `stat ${tone ? `tone-${tone}` : ''}` }, h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label));
}

export function toast(msg, tone = '') {
  const t = h('div', { class: `toast ${tone}` }, msg);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-in'));
  setTimeout(() => {
    t.classList.remove('is-in');
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

/** Bottom sheet — the mobile-style modal used throughout the app. */
export function sheet(title, content, actions = []) {
  const close = () => {
    wrap.classList.remove('is-in');
    setTimeout(() => wrap.remove(), 220);
  };
  const wrap = h(
    'div',
    { class: 'sheet-wrap', onclick: (e) => e.target === wrap && close() },
    h(
      'div',
      { class: 'sheet' },
      h('div', { class: 'sheet-grip' }),
      h('h3', { class: 'sheet-title' }, title),
      h('div', { class: 'sheet-body' }, content),
      actions.length ? h('div', { class: 'sheet-actions' }, actions.map((a) => btn(a.label, { variant: a.variant, onClick: () => { a.onClick?.(close); if (!a.keepOpen) close(); } }))) : null,
    ),
  );
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('is-in'));
  return close;
}

export function confirmSheet(title, text, onYes, yesLabel = 'Так') {
  sheet(title, h('p', { class: 'muted' }, text), [
    { label: 'Скасувати', variant: 'ghost' },
    { label: yesLabel, variant: 'danger', onClick: onYes },
  ]);
}

/* ─────────────── Charts ─────────────── */

/**
 * Bodyweight chart: grey dots are daily weigh-ins, the line is the smoothed trend.
 * @param {Array<{d:string,kg:number,trend:number}>} points
 */
export function weightChart(points, { goal, height = 180 } = {}) {
  const W = 320;
  const H = height;
  const pad = { t: 14, r: 10, b: 20, l: 30 };
  if (points.length < 2) {
    return h('div', { class: 'chart-empty' }, 'Додай ще один замір, щоб побачити графік');
  }

  const vals = points.flatMap((p) => [p.kg, p.trend]).concat(goal ? [goal] : []);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const span = Math.max(1.5, max - min);
  min -= span * 0.12;
  max += span * 0.12;

  const x = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  const trendPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ');
  const areaPath = `${trendPath} L${x(points.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;

  const gridVals = [min + span * 0.08, (min + max) / 2, max - span * 0.08];

  return svgEl(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'chart', preserveAspectRatio: 'none' },
    svgEl('defs', {}, svgEl('linearGradient', { id: 'wgrad', x1: '0', y1: '0', x2: '0', y2: '1' },
      svgEl('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.28' }),
      svgEl('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0' }),
    )),
    gridVals.map((v) =>
      svgEl('g', {},
        svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }),
        svgEl('text', { x: 2, y: y(v) + 3, class: 'axis' }, (Math.round(v * 10) / 10).toFixed(1)),
      ),
    ),
    goal ? svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y(goal), y2: y(goal), class: 'goal-line' }) : null,
    goal ? svgEl('text', { x: W - pad.r, y: y(goal) - 4, class: 'axis goal-text', 'text-anchor': 'end' }, `ціль ${goal}`) : null,
    svgEl('path', { d: areaPath, fill: 'url(#wgrad)' }),
    svgEl('path', { d: trendPath, class: 'line' }),
    points.map((p, i) => svgEl('circle', { cx: x(i), cy: y(p.kg), r: 1.8, class: 'dot' })),
    svgEl('circle', { cx: x(points.length - 1), cy: y(points[points.length - 1].trend), r: 3.6, class: 'dot-last' }),
    svgEl('text', { x: pad.l, y: H - 5, class: 'axis' }, fmtDate(points[0].d)),
    svgEl('text', { x: W - pad.r, y: H - 5, class: 'axis', 'text-anchor': 'end' }, fmtDate(points[points.length - 1].d)),
  );
}

/** Bar chart: weekly tonnage or session counts. */
export function barChart(items, { height = 140, unit = '' } = {}) {
  const W = 320;
  const H = height;
  const pad = { t: 12, r: 6, b: 22, l: 6 };
  if (!items.length) return h('div', { class: 'chart-empty' }, 'Ще немає даних');
  const max = Math.max(...items.map((i) => i.value), 1);
  const bw = (W - pad.l - pad.r) / items.length;

  return svgEl(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'chart' },
    items.map((it, i) => {
      const bh = Math.max(2, ((H - pad.t - pad.b) * it.value) / max);
      const x = pad.l + i * bw;
      return svgEl('g', {},
        svgEl('rect', {
          x: x + bw * 0.15,
          y: H - pad.b - bh,
          width: bw * 0.7,
          height: bh,
          rx: 3,
          class: `bar ${it.highlight ? 'is-hl' : ''}`,
        }),
        svgEl('text', { x: x + bw / 2, y: H - pad.b + 13, class: 'axis', 'text-anchor': 'middle' }, it.label),
        it.value ? svgEl('text', { x: x + bw / 2, y: H - pad.b - bh - 4, class: 'axis bar-val', 'text-anchor': 'middle' }, `${it.value}${unit}`) : null,
      );
    }),
  );
}

/** Circular progress indicator (0..1). */
export function ring(progress, label, sub) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return h('div', { class: 'ring-wrap' },
    svgEl('svg', { viewBox: '0 0 110 110', class: 'ring' },
      svgEl('circle', { cx: 55, cy: 55, r, class: 'ring-bg' }),
      svgEl('circle', {
        cx: 55, cy: 55, r,
        class: 'ring-fg',
        'stroke-dasharray': `${(c * p).toFixed(1)} ${c.toFixed(1)}`,
        transform: 'rotate(-90 55 55)',
      }),
    ),
    h('div', { class: 'ring-center' }, h('div', { class: 'ring-label' }, label), sub ? h('div', { class: 'ring-sub' }, sub) : null),
  );
}
