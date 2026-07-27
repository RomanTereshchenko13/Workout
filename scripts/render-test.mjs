/**
 * Headless render test. Stubs just enough of the DOM to import every module and
 * actually build each screen, then walks the resulting tree.
 *
 * Run: node scripts/render-test.mjs
 *
 * This catches what the pure-logic smoke test cannot: broken imports, typos in
 * helper names, and view code that throws on empty or populated state. Extend
 * SCREENS when you add a view.
 */

/* ─────────── Minimal DOM ─────────── */

let nodesCreated = 0;

function makeElement(tag, ns) {
  nodesCreated++;
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    namespace: ns,
    children: [],
    attributes: {},
    listeners: {},
    style: { setProperty(k, v) { this[k] = v; } },
    dataset: {},
    classList: {
      _set: new Set(),
      add(...c) { c.forEach((x) => this._set.add(x)); },
      remove(...c) { c.forEach((x) => this._set.delete(x)); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        const on = force === undefined ? !this._set.has(c) : !!force;
        on ? this._set.add(c) : this._set.delete(c);
        return on;
      },
      get value() { return [...this._set].join(' '); },
    },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; },
    remove() { this.parentNode?.removeChild(this); },
    insertBefore(child) { this.children.unshift(child); return child; },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    dispatchEvent() { return true; },
    click() { (this.listeners.click || []).forEach((fn) => fn({ target: this, preventDefault() {} })); },
    focus() {},
    querySelector() { return null; },
    get firstChild() { return this.children[0] || null; },
    get textContent() { return this.children.map((c) => c.textContent ?? '').join(''); },
    set textContent(v) { this.children = [makeText(v)]; },
    get innerHTML() { return ''; },
    set innerHTML(v) { this.children = [makeText(String(v).replace(/<[^>]*>/g, ''))]; },
  };
  // In a real DOM, className and classList are two views of the same value.
  // Keeping them in sync is what lets tests assert on classes set at build time.
  Object.defineProperty(el, 'className', {
    get() { return [...el.classList._set].join(' '); },
    set(v) {
      el.classList._set = new Set(String(v).split(/\s+/).filter(Boolean));
    },
    enumerable: true,
    configurable: true,
  });
  return el;
}

function makeText(value) {
  nodesCreated++;
  return { nodeType: 3, textContent: String(value), children: [] };
}

const storage = new Map();

globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

const appRoot = makeElement('main');
const tabsRoot = makeElement('nav');

globalThis.document = {
  createElement: (t) => makeElement(t),
  createElementNS: (ns, t) => makeElement(t, ns),
  createTextNode: (v) => makeText(v),
  getElementById: (id) => (id === 'app' ? appRoot : id === 'tabs' ? tabsRoot : null),
  querySelector: () => null,
  body: Object.assign(makeElement('body'), { dataset: {} }),
  documentElement: makeElement('html'),
  addEventListener() {},
  removeEventListener() {},
  visibilityState: 'visible',
};

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}
globalThis.CustomEvent = FakeEvent;
globalThis.Event = FakeEvent;

const winListeners = {};
globalThis.window = {
  addEventListener: (t, fn) => ((winListeners[t] ||= []).push(fn)),
  removeEventListener() {},
  dispatchEvent: () => true, // never re-render from here, that would loop forever
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  AudioContext: undefined,
};
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.location = { hash: '#/', href: 'http://localhost/', reload() {}, origin: 'http://localhost' };
// Node 24 exposes navigator as a getter-only global — patch the vibrate hook onto it.
Object.defineProperty(globalThis, 'navigator', {
  value: { vibrate: () => true, userAgent: 'node' },
  configurable: true,
  writable: true,
});
globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
globalThis.URL.createObjectURL = () => 'blob:fake';
globalThis.URL.revokeObjectURL = () => {};

/* ─────────── Harness ─────────── */

let failed = 0;
let passed = 0;

function ok(cond, label, extra = '') {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

/** Walks a rendered tree and returns all text plus a node count. */
function walk(node, acc = { text: [], count: 0, buttons: 0 }) {
  acc.count++;
  if (node.nodeType === 3) acc.text.push(node.textContent);
  if (node.tagName === 'BUTTON') acc.buttons++;
  for (const c of node.children || []) walk(c, acc);
  return acc;
}

async function renderScreen(name, viewFn) {
  try {
    const node = viewFn();
    const info = walk(node);
    ok(info.count > 15, `${name}: renders a non-trivial tree`, `${info.count} nodes`);
    ok(info.text.join(' ').trim().length > 40, `${name}: contains text`);
    const cyrillic = info.text.join('').match(/[а-яїієґА-ЯЇІЄҐ]/g) || [];
    ok(cyrillic.length > 20, `${name}: UI text is Ukrainian`, `${cyrillic.length} cyrillic chars`);
    ok(!info.text.join(' ').includes('undefined'), `${name}: no "undefined" leaked into the UI`);
    ok(!info.text.join(' ').includes('NaN'), `${name}: no "NaN" leaked into the UI`);
    return info;
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: threw ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
    return null;
  }
}

/* ─────────── Run ─────────── */

console.log('\nModule wiring');

const store = await import('../js/store.js');
const app = await import('../js/app.js');
ok(typeof app.go === 'function', 'app.js exports go()');
ok(typeof app.APP_VERSION === 'string', 'app.js exports APP_VERSION');
ok(typeof app.checkForUpdate === 'function', 'app.js exports checkForUpdate()');

const SCREENS = [
  ['home', () => import('../js/views/home.js').then((m) => m.homeView)],
  ['progress', () => import('../js/views/progress.js').then((m) => m.progressView)],
  ['library', () => import('../js/views/library.js').then((m) => m.libraryView)],
  ['tools', () => import('../js/views/tools.js').then((m) => m.toolsView)],
  ['profile', () => import('../js/views/profile.js').then((m) => m.profileView)],
  ['session', () => import('../js/views/session.js').then((m) => m.sessionView)],
];

const views = {};
for (const [name, load] of SCREENS) {
  const fn = await load();
  ok(typeof fn === 'function', `${name} view is exported as a function`);
  views[name] = fn;
}

// ── Empty state (fresh install, onboarding already completed) ──
console.log('\nScreens on a fresh profile');
store.saveProfile({
  name: 'Тест', sex: 'm', age: 34, heightCm: 180, weightKg: 92,
  goalWeightKg: 82, activity: 'light', experience: 'beginner', onboarded: true,
});
// The session screen is checked separately: with nothing running it is an intentional stub.
for (const name of Object.keys(views).filter((n) => n !== 'session')) {
  await renderScreen(`${name} (empty)`, views[name]);
}
const idleSession = walk(views.session());
ok(idleSession.text.join(' ').includes('Активного тренування немає'), 'session view shows an empty state when nothing is running');
ok(idleSession.buttons >= 1, 'the empty session state offers a way back home');

// ── Populated state: weigh-ins, a finished workout and cardio ──
console.log('\nScreens with data');
for (let i = 30; i >= 0; i -= 2) {
  const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
  store.logWeight(Math.round((92 - (30 - i) * 0.12) * 10) / 10, d);
}
store.logCardio('zone2', 45);

const { buildSession } = await import('../js/data/program.js');
for (let rotation = 0; rotation < 4; rotation++) {
  const data = store.get();
  const plan = buildSession({
    rotation: data.state.rotation,
    week: data.state.week,
    history: data.logs,
    inventory: data.inventory,
    experience: data.profile.experience,
  });
  store.startSession(plan);
  const active = store.get().active;
  ok(active && active.exercises.length >= 5, `session ${rotation + 1}: started with exercises`);

  // Complete every set at the top of the rep range — simulates a successful workout.
  store.updateActive((s) => {
    s.exercises.forEach((e) => e.sets.forEach((set) => {
      set.done = true;
      set.reps = e.target.high;
    }));
    s.finisherDone = true;
  });
  await renderScreen(`session (rotation ${rotation})`, views.session);
  store.finishSession();
}

const after = store.get();
ok(after.logs.length === 4, 'four workouts landed in history', String(after.logs.length));
ok(after.active === null, 'active session is cleared after finishing');
ok(after.state.week === 2, 'a full A→B→C cycle advanced the wave to week 2', String(after.state.week));
ok(after.state.rotation === 4, 'rotation advanced once per workout', String(after.state.rotation));

for (const name of Object.keys(views).filter((n) => n !== 'session')) {
  await renderScreen(`${name} (with data)`, views[name]);
}

// ── Progression actually shows up in the next session ──
const next = buildSession({
  rotation: after.state.rotation, week: after.state.week, history: after.logs,
  inventory: after.inventory, experience: after.profile.experience,
});
const progressed = next.exercises.filter((e) => e.suggested.progressed);
ok(progressed.length > 0, 'after hitting every target, the next session raises weights', `${progressed.length} exercises stepped up`);

// ── Interactive controls ──
// Regression guard: the segmented control used to paint its highlight once and
// never move it, which made the onboarding form look like the experience level
// could not be changed away from "Новачок".
console.log('\nInteractive controls');
const { segmented } = await import('../js/ui.js');
let picked = null;
const seg = segmented('beginner', [['beginner', 'Новачок'], ['inter', 'Середній'], ['adv', 'Досвід']], (v) => { picked = v; });
const segs = seg.children;
ok(segs.length === 3, 'segmented renders one button per option');
ok(segs[0].classList.contains('is-active'), 'segmented starts on the supplied value');

segs[2].click();
ok(picked === 'adv', 'clicking a segment reports the new value to the caller');
ok(segs[2].classList.contains('is-active'), 'the clicked segment becomes active');
ok(!segs[0].classList.contains('is-active'), 'the previously active segment is cleared');

segs[1].click();
ok(picked === 'inter' && segs[1].classList.contains('is-active') && !segs[2].classList.contains('is-active'), 'the highlight keeps following further clicks');

picked = null;
segs[1].click();
ok(picked === null, 're-clicking the active segment does not fire a redundant change');

// ── Persistence round-trip ──
console.log('\nPersistence');
const dump = store.exportJSON();
ok(dump.includes('"logs"') && dump.length > 500, 'export produces a full JSON dump');
store.resetAll();
ok(store.get().logs.length === 0, 'reset clears history');
store.importJSON(dump);
ok(store.get().logs.length === 4 && store.get().weights.length > 10, 'import restores history and weigh-ins');
let threw = false;
try { store.importJSON('{"nope":1}'); } catch { threw = true; }
ok(threw, 'import rejects a file that is not a backup');

console.log(`\n${failed ? '✗' : '✓'} ${passed} checks passed, ${failed} failed (${nodesCreated} DOM nodes built)\n`);
process.exit(failed ? 1 : 0);
