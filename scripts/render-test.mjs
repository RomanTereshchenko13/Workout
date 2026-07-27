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
    // In-place swap is how the session screen refreshes a single card without
    // rebuilding the view, so the stub has to model it.
    replaceChild(next, old) {
      const i = this.children.indexOf(old);
      if (i === -1) return old;
      this.children[i] = next;
      next.parentNode = this;
      old.parentNode = null;
      return old;
    },
    contains(node) {
      if (node === this) return true;
      return (this.children || []).some((c) => c.contains?.(node));
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    dispatchEvent() { return true; },
    click() { (this.listeners.click || []).forEach((fn) => fn({ target: this, preventDefault() {} })); },
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
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

// ── Session structure: supersets, substitution, finisher rounds ──
// The `ss` field sat in the program data from day one with nothing rendering it,
// so paired work was performed — and rested — as if the exercises were unrelated.
console.log('\nSession structure');

/** Collect every node carrying a class, so structure can be asserted on. */
function findByClass(node, cls, acc = []) {
  if (node.classList?.contains?.(cls)) acc.push(node);
  for (const c of node.children || []) findByClass(c, cls, acc);
  return acc;
}

const supersetDay = [0, 1, 2].find((rotation) => {
  const s = store.get();
  return buildSession({ rotation, week: 1, history: [], inventory: s.inventory, experience: 'beginner' })
    .exercises.some((e) => e.ss);
});
ok(supersetDay !== undefined, 'at least one training day declares a superset');

const sState = store.get();
store.startSession(buildSession({
  rotation: supersetDay, week: 1, history: sState.logs, inventory: sState.inventory, experience: 'beginner',
}));
const sessionNode = views.session();
const supersetBlocks = findByClass(sessionNode, 'superset');
ok(supersetBlocks.length >= 1, 'the session screen renders a superset block', String(supersetBlocks.length));
ok(supersetBlocks.every((b) => findByClass(b, 'ex-card').length >= 2), 'each superset block contains at least two exercise cards');
ok(walk(sessionNode).text.join(' ').includes('Суперсет'), 'the superset is labelled for the user');

const roundChips = findByClass(sessionNode, 'round-chip');
ok(roundChips.length >= 3, 'the finisher offers one chip per round', String(roundChips.length));
ok(store.get().active.finisherRounds === 0, 'a new session starts with no finisher rounds');
roundChips[1].click();
ok(store.get().active.finisherRounds === 2, 'tapping the second chip records two rounds', String(store.get().active.finisherRounds));
const finisherRounds = store.get().active.finisherRounds;
ok(store.get().active.finisherTarget >= finisherRounds, 'the round target is recorded alongside the count');

// Substitution applied mid-session must survive into history and the next plan.
store.setSubstitution('ohp', 'arnold');
ok(store.get().substitutions.ohp === 'arnold', 'a permanent substitution is stored');
const subbed = buildSession({
  rotation: 0, week: 1, history: [], inventory: store.get().inventory,
  experience: 'beginner', substitutions: store.get().substitutions,
});
ok(subbed.exercises.some((e) => e.id === 'arnold' && e.slotId === 'ohp'), 'the next session plans the substitute');
store.setSubstitution('ohp', null);
ok(store.get().substitutions.ohp === undefined, 'a substitution can be undone');

store.updateActive((a) => a.exercises.forEach((e) => e.sets.forEach((set) => { set.done = true; set.reps = e.target.low; })));
store.finishSession();
const finisherLog = store.get().logs[store.get().logs.length - 1];
ok(finisherLog.finisherRounds === finisherRounds, 'finisher rounds land in history', String(finisherLog.finisherRounds));
ok(finisherLog.finisherDone === true, 'the legacy finisherDone flag stays consistent with the count');
ok((finisherLog.exercises || []).every((e) => typeof e.perSide === 'boolean'), 'every logged exercise records its perSide flag');

// ── Accordions keep their state across a re-render ──
// Views are rebuilt wholesale on every state change, which used to snap the
// warm-up list shut on every logged set.
console.log('\nAccordion state');
const { accordion } = await import('../js/ui.js');
const acc1 = accordion('test-key', makeElement('strong'), makeElement('p'));
ok(acc1.getAttribute('open') === null, 'an accordion starts closed');
acc1.open = true;
(acc1.listeners.toggle || []).forEach((fn) => fn());
const acc2 = accordion('test-key', makeElement('strong'), makeElement('p'));
ok(acc2.getAttribute('open') === 'true', 'a rebuilt accordion reopens if it was open', String(acc2.getAttribute('open')));
const other = accordion('other-key', makeElement('strong'));
ok(other.getAttribute('open') === null, 'state is keyed, not global');

// ── Sheets are real dialogs ──
console.log('\nDialog semantics');
const { sheet } = await import('../js/ui.js');
const closeSheet = sheet('Заголовок', makeElement('p'), [{ label: 'Ок', variant: 'primary' }]);
const wraps = document.body.children.filter((c) => c.classList?.contains?.('sheet-wrap'));
ok(wraps.length >= 1, 'the sheet is mounted on the body');
const panel = wraps[wraps.length - 1].children[0];
ok(panel.getAttribute('role') === 'dialog', 'the sheet announces itself as a dialog');
ok(panel.getAttribute('aria-modal') === 'true', 'the sheet is modal');
const labelledBy = panel.getAttribute('aria-labelledby');
ok(!!labelledBy, 'the dialog points at its own title');
ok(walk(panel).text.join(' ').includes('Заголовок'), 'the title is rendered');
ok(typeof closeSheet === 'function', 'sheet returns a close handle');
closeSheet();

// ── Icon-only controls have accessible names ──
console.log('\nAccessible names');
function unnamedIconButtons(node, acc = []) {
  if (node.tagName === 'BUTTON') {
    const text = walk(node).text.join('').trim();
    const named = node.getAttribute('aria-label') || node.getAttribute('title');
    // A control whose whole label is a glyph is unusable without a spoken name.
    if (!named && text.length > 0 && text.length <= 2 && !/[а-яїієґa-z0-9]/i.test(text)) acc.push(text);
  }
  for (const c of node.children || []) unnamedIconButtons(c, acc);
  return acc;
}
for (const [name, fn] of Object.entries(views)) {
  if (name === 'session') continue;
  const missing = unnamedIconButtons(fn());
  ok(missing.length === 0, `${name}: every icon-only button has an accessible name`, missing.join(' '));
}

// ── Install flow ──
// Every branch here was a bug at some point: the card told a user who had just
// installed the app to install it, a spent prompt event was re-used, and an
// app launched in minimal-ui was treated as "not installed".
console.log('\nInstall flow');

const realMatchMedia = globalThis.window.matchMedia;
globalThis.window.matchMedia = (q) => ({ matches: q.includes('minimal-ui'), addEventListener() {} });
ok(app.isStandalone() === true, 'minimal-ui counts as installed — display_override allows it');
globalThis.window.matchMedia = realMatchMedia;

ok(app.installState() === 'unavailable', 'with no captured prompt the card falls back to instructions');
ok((await app.promptInstall()) === 'unavailable', 'promptInstall without an event reports unavailable instead of throwing');

/** Stands in for Chrome's BeforeInstallPromptEvent. */
function fakePrompt(outcome) {
  return {
    prompts: 0,
    prevented: false,
    preventDefault() { this.prevented = true; },
    prompt() { this.prompts++; },
    userChoice: Promise.resolve({ outcome }),
  };
}
const fire = (e) => (winListeners.beforeinstallprompt || []).forEach((fn) => fn(e));

const declined = fakePrompt('dismissed');
fire(declined);
ok(declined.prevented, 'beforeinstallprompt is prevented so Chrome does not show its own bar');
ok(app.installState() === 'ready', 'a captured prompt puts the card into button state');
ok((await app.promptInstall()) === 'dismissed', 'promptInstall reports a declined install');
ok(app.installState() === 'unavailable', 'after declining, the card offers manual instructions');

const accepted = fakePrompt('accepted');
fire(accepted);
ok(app.installState() === 'ready', 'a fresh prompt event re-arms the button');
ok((await app.promptInstall()) === 'accepted', 'promptInstall reports a successful install');
ok(accepted.prompts === 1, 'the prompt event is used exactly once');
ok(app.installState() === 'installed', 'after installing, the card confirms instead of asking again');
ok((await app.promptInstall()) === 'unavailable', 'a spent prompt event is never prompted twice');

const installedHome = walk(views.home());
ok(installedHome.text.join(' ').includes('Встановлено'),
  'the home screen confirms the install rather than telling you to install it again');
ok(!installedHome.text.join(' ').includes('зараз працює як сайт'),
  'the "still a website" accordion is gone once the app is installed');

// ── Persistence round-trip ──
console.log('\nPersistence');
const logCount = store.get().logs.length;
ok(logCount >= 4, 'the run so far produced a history to round-trip', String(logCount));
const dump = store.exportJSON();
ok(dump.includes('"logs"') && dump.length > 500, 'export produces a full JSON dump');
store.resetAll();
ok(store.get().logs.length === 0, 'reset clears history');
store.importJSON(dump);
ok(store.get().logs.length === logCount && store.get().weights.length > 10, 'import restores history and weigh-ins');
let threw = false;
try { store.importJSON('{"nope":1}'); } catch { threw = true; }
ok(threw, 'import rejects a file that is not a backup');

// A backup whose arrays are the wrong shape used to sail through and then throw
// somewhere deep inside a view, long after the import reported success.
for (const bad of ['{"profile":{},"logs":"nope"}', '{"profile":{},"weights":{}}', '{"profile":{},"cardio":5}']) {
  let rejected = false;
  try { store.importJSON(bad); } catch { rejected = true; }
  ok(rejected, `import rejects a corrupt backup: ${bad.slice(0, 32)}`);
}
let arrayRejected = false;
try { store.importJSON('[]'); } catch { arrayRejected = true; }
ok(arrayRejected, 'import rejects a bare array');
ok(store.get().logs.length === logCount, 'a rejected import leaves the existing data untouched');

// ── Log identity ──
// Ids used to be `${date}-${dayKey}-${logs.length + 1}`, so deleting one made the
// next workout reuse a live id — and then one delete removed two workouts.
console.log('\nLog identity');
const idsBefore = store.get().logs.map((l) => l.id);
ok(new Set(idsBefore).size === idsBefore.length, 'existing log ids are unique');

const restart = () => {
  const s = store.get();
  store.startSession(buildSession({
    rotation: s.state.rotation, week: s.state.week, history: s.logs,
    inventory: s.inventory, experience: s.profile.experience,
  }));
  store.updateActive((a) => a.exercises.forEach((e) => e.sets.forEach((set) => { set.done = true; set.reps = e.target.low; })));
  store.finishSession();
};

// Every id this store has ever issued, including ones since deleted. The old
// scheme drew from `logs.length + 1`, so a delete put a live number back in the
// pool — reissue it and one tap on ✕ removed two workouts.
const everIssued = new Set(idsBefore);

store.deleteLog(idsBefore[1]);
ok(store.get().logs.length === idsBefore.length - 1, 'deleting one log removes exactly one', String(store.get().logs.length));

// Delete from the end too: that is the case the length-based scheme reused first.
store.deleteLog(idsBefore[idsBefore.length - 1]);
for (let i = 0; i < 4; i++) {
  restart();
  const issued = store.get().logs[store.get().logs.length - 1].id;
  ok(!everIssued.has(issued), `a workout logged after deletions gets a brand-new id (${issued})`);
  everIssued.add(issued);
}

const ids = store.get().logs.map((l) => l.id);
ok(new Set(ids).size === ids.length, 'ids stay unique after deletes followed by new workouts', ids.join(' | '));

// The payoff: deleting any single log must remove exactly that log.
const before = store.get().logs.length;
const victim = ids[Math.floor(ids.length / 2)];
store.deleteLog(victim);
ok(store.get().logs.length === before - 1, 'deleting a log removes exactly one, never a colliding pair', String(store.get().logs.length));
ok(!store.get().logs.some((l) => l.id === victim), 'the deleted log is the one that was asked for');

// ── Tonnage counts unilateral work twice ──
console.log('\nTonnage in logs');
const { totalVolume } = await import('../js/lib/plates.js');
const withPerSide = store.get().logs.flatMap((l) => l.exercises).filter((e) => e.perSide);
ok(withPerSide.length > 0, 'finished logs record which exercises are per side', String(withPerSide.length));
const sample = { mode: 'single', perSide: true, sets: [{ done: true, kg: 10, reps: 8 }] };
ok(totalVolume([sample]) === 160, 'a logged per-side set is worth both sides');

// A pre-v4 backup has no perSide flags at all; the migration must add them back
// so old workouts and new ones are measured the same way.
const legacy = JSON.stringify({
  v: 3,
  profile: { ...store.get().profile },
  logs: [{
    id: 'x', date: '2026-07-01', dayKey: 'A', week: 1, durationSec: 100,
    exercises: [{ id: 'reverse-lunge', mode: 'pair', sets: [{ kg: 8, reps: 10, done: true }] }],
  }],
  weights: [], cardio: [],
});
const keep = store.exportJSON();
store.importJSON(legacy);
const migrated = store.get().logs[0].exercises[0];
ok(migrated.perSide === true, 'the v4 migration backfills perSide on a unilateral exercise');
ok(totalVolume(store.get().logs[0].exercises) === 8 * 2 * 10 * 2, 'migrated history reports the corrected tonnage');
ok(store.get().v === 4, 'the imported blob is stamped with the current schema');
store.importJSON(keep);

// ── Backup reminder ──
console.log('\nBackup reminder');
const fresh = store.backupStatus();
ok(fresh.never === true, 'a store that has never been exported says so');
ok(fresh.due === true, 'with history on board the reminder is due');
store.markBackedUp();
const after2 = store.backupStatus();
ok(after2.never === false && after2.days === 0 && after2.unsaved === 0, 'exporting clears the reminder');
ok(after2.due === false, 'the reminder does not nag straight after a backup');
restart();
ok(store.backupStatus().unsaved === 1, 'a workout logged after the backup is counted as unsaved');

// ── Rest timer survives being killed ──
console.log('\nRest timer persistence');
const { restTimer } = await import('../js/lib/timer.js');
const paused = restTimer(90, { startAt: 45, paused: true });
ok(paused.left === 45 && paused.running === false && paused.total === 90, 'a timer can be restored paused, part-way through');
paused.add(15);
ok(paused.left === 60, 'add() extends a restored timer');
paused.skip();
ok(paused.left === 0 && paused.running === false, 'skip() ends it');

let saved = null;
const live = restTimer(60, { onChange: (t) => { saved = { left: t.left, total: t.total, paused: !t.running }; } });
ok(saved && saved.left === 60 && saved.total === 60 && saved.paused === false, 'onChange publishes the deadline as soon as the timer starts');
live.toggle();
ok(saved.paused === true, 'pausing is published so a reload restores it paused');
live.stop();

store.startSession(buildSession({
  rotation: 0, week: 1, history: [], inventory: store.get().inventory, experience: 'beginner',
}));
store.saveRest({ endsAt: Date.now() + 45000, total: 90, paused: false, left: 45 });
ok(store.get().active.rest.total === 90, 'the rest deadline is stored on the active session');
const reloaded = JSON.parse(store.exportJSON());
ok(reloaded.active.rest.left === 45, 'the rest deadline survives an export/reload round trip');
store.saveRest(null);
ok(store.get().active.rest === null, 'clearing the rest timer clears the stored deadline');
store.discardSession();

console.log(`\n${failed ? '✗' : '✓'} ${passed} checks passed, ${failed} failed (${nodesCreated} DOM nodes built)\n`);
process.exit(failed ? 1 : 0);
