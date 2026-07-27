/** App shell: router, tab bar, onboarding, service-worker update flow. */

import { h, clear, btn, field, num, select, segmented, toast, card, mmss } from './ui.js';
import { get, subscribe, subscribeExternal, saveProfile, requestPersistence } from './store.js';
import { primeAudio, keepAwake } from './lib/timer.js';
import { ACTIVITY } from './lib/nutrition.js';

export const APP_VERSION = '1.4.0';

const ROUTES = {
  '#/': { label: 'Головна', icon: '🏋', load: () => import('./views/home.js').then((m) => m.homeView) },
  '#/session': { label: 'Сесія', icon: '⏱', hidden: true, load: () => import('./views/session.js').then((m) => m.sessionView) },
  '#/progress': { label: 'Прогрес', icon: '📈', load: () => import('./views/progress.js').then((m) => m.progressView) },
  '#/library': { label: 'Вправи', icon: '📚', load: () => import('./views/library.js').then((m) => m.libraryView) },
  '#/tools': { label: 'Інструменти', icon: '🧮', load: () => import('./views/tools.js').then((m) => m.toolsView) },
  '#/profile': { label: 'Профіль', icon: '⚙', load: () => import('./views/profile.js').then((m) => m.profileView) },
};

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

const root = () => document.getElementById('app');

let rendering = false;
// A repaint requested mid-render must not be dropped: the first paint after a
// cold launch awaits a network import, which is exactly when `beforeinstallprompt`
// tends to land. Without this the install card would not appear until the next
// navigation.
let renderPending = false;

/**
 * Anything the session screen switches on globally has to be switched back off
 * when the user leaves it — including via the tab bar, which is the one exit
 * the session screen itself never sees. Leaving the wake lock held meant the
 * phone screen stayed lit for the rest of the day.
 */
const SESSION_HOOKS = { onLeave: null };

export function onLeaveSession(fn) {
  SESSION_HOOKS.onLeave = fn;
}

function leaveSessionIfNeeded(hash) {
  if (lastHash !== '#/session' || hash === '#/session') return;
  document.body.dataset.session = '';
  keepAwake(false);
  SESSION_HOOKS.onLeave?.();
}

async function render() {
  if (rendering) {
    renderPending = true;
    return;
  }
  rendering = true;
  try {
    const data = get();
    if (!data.profile.onboarded) {
      leaveSessionIfNeeded('#/');
      clear(root()).appendChild(onboarding());
      // No tab bar until onboarding is done — it let you navigate out of a form
      // the rest of the app depends on having been filled in.
      clear(document.getElementById('tabs'));
      lastHash = null;
      return;
    }
    const hash = ROUTES[location.hash] ? location.hash : '#/';
    leaveSessionIfNeeded(hash);
    // An in-progress session must stay reachable — the tab bar shows a live entry.
    const view = await ROUTES[hash].load();
    const node = view();
    const r = root();
    const prevScroll = r.scrollTop;
    clear(r).appendChild(node);
    if (hash === lastHash) r.scrollTop = prevScroll;
    lastHash = hash;
    renderTabs(hash);
  } catch (e) {
    console.error(e);
    clear(root()).appendChild(
      card({}, h('h3', {}, 'Щось зламалося'), h('p', { class: 'muted' }, String(e && e.message)), btn('На головну', { variant: 'primary', onClick: () => go('#/') })),
    );
  } finally {
    rendering = false;
    if (renderPending) {
      renderPending = false;
      render();
    }
  }
}

let lastHash = null;

function renderTabs(active) {
  const bar = document.getElementById('tabs');
  const data = get();
  if (!data.profile.onboarded) return clear(bar);
  clear(bar);
  for (const [hash, r] of Object.entries(ROUTES)) {
    if (r.hidden) continue;
    bar.appendChild(
      h('button', {
        class: `tab ${active === hash ? 'is-active' : ''}`,
        onclick: () => go(hash),
        'aria-current': active === hash ? 'page' : null,
      },
        h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, r.icon),
        h('span', { class: 'tab-label' }, r.label),
      ),
    );
  }
  if (data.active && active !== '#/session') {
    bar.classList.add('has-session');
    bar.appendChild(sessionTab());
  } else {
    stopTabClock();
    bar.classList.remove('has-session');
  }
}

/* ─────────────── Live session tab ─────────────── */

let tabClockId = null;

function stopTabClock() {
  if (tabClockId) clearInterval(tabClockId);
  tabClockId = null;
}

/** Seconds left on a persisted rest deadline, or null if none is running. */
function restLeft(rest) {
  if (!rest || !rest.total) return null;
  const left = rest.paused ? rest.left : Math.round((rest.endsAt - Date.now()) / 1000);
  return left > 0 ? left : null;
}

/**
 * The "workout in progress" tab, doubling as the rest countdown.
 *
 * A rest timer keeps running after you leave the session screen — its deadline
 * is persisted, precisely so a backgrounded app does not lose it. But the bar
 * that displays it belongs to the session screen, so stepping out to check the
 * exercise library meant the countdown vanished while still running, and the
 * only way to see it was to navigate back.
 */
function sessionTab() {
  const icon = h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, '⏱');
  const label = h('span', { class: 'tab-label' }, 'Триває');
  const tab = h('button', { class: 'tab tab-session', onclick: () => go('#/session') }, icon, label);

  const paint = () => {
    const left = restLeft(get().active?.rest);
    const resting = left !== null;
    tab.classList.toggle('is-resting', resting);
    label.textContent = resting ? mmss(left) : 'Триває';
    tab.setAttribute('aria-label', resting
      ? `Відпочинок, залишилось ${mmss(left)}. Повернутися до тренування`
      : 'Повернутися до тренування, що триває');
  };

  paint();
  stopTabClock();
  tabClockId = setInterval(() => {
    // `=== false` on purpose: a detached-but-untracked node reports undefined.
    if (tab.isConnected === false) return stopTabClock();
    paint();
  }, 1000);
  tabClockId?.unref?.();
  return tab;
}

/* ─────────────── Onboarding ─────────────── */

function onboarding() {
  const p = { ...get().profile };
  const inputs = {
    sex: p.sex,
    age: num(p.age),
    heightCm: num(p.heightCm),
    weightKg: num(p.weightKg, { step: 0.1 }),
    goalWeightKg: num(p.goalWeightKg, { step: 0.5 }),
    activity: p.activity,
    experience: p.experience,
    name: h('input', { class: 'input', placeholder: 'необов’язково', value: p.name || '' }),
  };

  return h('div', { class: 'view onboarding' },
    h('div', { class: 'ob-hero' },
      h('div', { class: 'ob-logo' }, '🏋'),
      h('h1', {}, 'Home Workout'),
      h('p', { class: 'muted' }, 'Програма під дві набірні гантелі до 20 кг: сила, суха вага, схуднення. Усі дані — лише на цьому телефоні.'),
    ),
    card({},
      h('h3', {}, 'Кілька питань для розрахунків'),
      field('Ім’я', inputs.name),
      field('Стать', segmented(inputs.sex, [['m', 'Чоловік'], ['f', 'Жінка']], (v) => { inputs.sex = v; })),
      h('div', { class: 'sheet-grid' },
        field('Вік', inputs.age),
        field('Зріст, см', inputs.heightCm),
        field('Вага зараз, кг', inputs.weightKg),
        field('Цільова вага, кг', inputs.goalWeightKg),
      ),
      field('Активність поза тренуваннями', select(inputs.activity, Object.entries(ACTIVITY).map(([k, v]) => [k, v.label]), (v) => { inputs.activity = v; })),
      field('Досвід силових', segmented(inputs.experience, [['beginner', 'Новачок'], ['inter', 'Середній'], ['adv', 'Досвід']], (v) => { inputs.experience = v; }),
        'Визначає стартові ваги — далі програма підбирає їх сама за твоїми результатами'),
      btn('Почати', {
        variant: 'primary', class: 'btn-block',
        onClick: () => {
          const age = parseInt(inputs.age.value, 10);
          const heightCm = parseFloat(inputs.heightCm.value);
          const weightKg = parseFloat(inputs.weightKg.value);
          const goalWeightKg = parseFloat(inputs.goalWeightKg.value);
          if (!age || age < 12 || age > 100) return toast('Перевір вік', 'bad');
          if (!heightCm || heightCm < 120 || heightCm > 230) return toast('Перевір зріст', 'bad');
          if (!weightKg || weightKg < 30 || weightKg > 300) return toast('Перевір вагу', 'bad');
          saveProfile({
            name: inputs.name.value.trim(),
            sex: inputs.sex,
            age, heightCm, weightKg,
            goalWeightKg: goalWeightKg || weightKg,
            activity: inputs.activity,
            experience: inputs.experience,
            onboarded: true,
          });
          primeAudio();
          // Inside the click that created the data, which is the only context
          // where Firefox's permission prompt makes sense to the user.
          requestPersistence();
          toast('Готово — почнемо з Дня A');
          go('#/');
        },
      }),
      h('p', { class: 'note' }, 'Це не медична порада. За хронічних проблем зі спиною, серцем чи тиском спершу порадься з лікарем.'),
    ),
  );
}

/* ─────────────── Installation ─────────────── */

/**
 * Chrome fires `beforeinstallprompt` when the app qualifies for installation and
 * then hides the prompt behind its ⋮ menu. Capturing the event lets the app show
 * a real button instead, which is the difference between "this is a website" and
 * "this is an app" for anyone who does not go hunting through browser menus.
 */
let installEvent = null;

/**
 * How the last install attempt ended: null (never asked), 'accepted' or
 * 'dismissed'. Needed because `isStandalone()` stays false in the tab that
 * triggered the install — without this flag the UI would tell someone who just
 * installed the app to go and install it.
 */
let installOutcome = null;

/** A prompt event is single-use; a second prompt() call throws InvalidStateError. */
let prompting = false;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  installOutcome = null; // the browser is offering again — forget the previous answer
  render();
});

window.addEventListener('appinstalled', () => {
  // Fires both for our own button and for Chrome's ⋮ menu item.
  installEvent = null;
  installOutcome = 'accepted';
  render();
});

/** True once the app runs from the home screen rather than a browser tab. */
export function isStandalone() {
  // The manifest allows minimal-ui through display_override, and a desktop
  // install can land in window-controls-overlay. Matching only `standalone`
  // would show the install card to someone who already installed the app.
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
  return modes.some((m) => window.matchMedia?.(`(display-mode: ${m})`)?.matches === true) ||
    navigator.standalone === true;
}

/** Whether the browser has offered us a programmatic install prompt. */
function canPromptInstall() {
  return installEvent !== null;
}

/**
 * What the install card should show:
 *   'standalone'  — launched from the home screen, say nothing
 *   'installed'   — installed during this visit; this tab is still a tab
 *   'ready'       — we hold a prompt event, show the button
 *   'unavailable' — iOS, or Chrome before/after its prompt: show instructions
 */
export function installState() {
  if (isStandalone()) return 'standalone';
  if (installOutcome === 'accepted') return 'installed';
  if (canPromptInstall()) return 'ready';
  return 'unavailable';
}

/** iOS never fires beforeinstallprompt — it needs the Share-menu instructions. */
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** @returns {'accepted'|'dismissed'|'pending'|'unavailable'} */
export async function promptInstall() {
  if (prompting) return 'pending'; // double tap: the button lives until userChoice resolves
  if (!installEvent) return 'unavailable';
  const event = installEvent;
  prompting = true;
  try {
    event.prompt();
    const { outcome } = await event.userChoice;
    installOutcome = outcome;
    return outcome;
  } catch (e) {
    // Some browsers reject a prompt they consider stale. Nothing to recover:
    // fall back to the manual instructions rather than surfacing a raw error.
    console.warn('Install prompt failed', e);
    return 'unavailable';
  } finally {
    prompting = false;
    installEvent = null; // spent either way — the spec forbids re-prompting
    render();
  }
}

/** Diagnostics for the profile screen — answers "why can't I install this?". */
export async function installDiagnostics() {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  return {
    standalone: isStandalone(),
    secure: window.isSecureContext === true,
    serviceWorker: 'serviceWorker' in navigator,
    serviceWorkerActive: !!reg?.active,
    manifest: !!document.querySelector('link[rel="manifest"]'),
    promptReady: canPromptInstall(),
    outcome: installOutcome,
    ios: isIOS(),
    version: APP_VERSION,
  };
}

/* ─────────────── Updates (GitHub Pages) ─────────────── */

let waitingWorker = null;

function updateBanner(worker) {
  waitingWorker = worker;
  if (document.getElementById('update-banner')) return;
  const banner = h('div', { class: 'update-banner', id: 'update-banner', role: 'status' },
    h('span', {}, 'Доступна нова версія'),
    h('button', {
      class: 'ub-btn',
      onclick: () => {
        waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
        banner.textContent = 'Оновлюю...';
      },
    }, 'Оновити'),
  );
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('is-in'));
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');

    if (reg.waiting && navigator.serviceWorker.controller) updateBanner(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) updateBanner(nw);
      });
    });

    // A new worker took over — reload once so the fresh code is actually running.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });

    // Check for updates on launch, on return from background, and hourly.
    reg.update();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });
    setInterval(() => reg.update(), 60 * 60 * 1000);
  } catch (e) {
    console.warn('Service worker registration failed', e);
  }
}

export async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  await reg.update();
  if (reg.waiting) {
    updateBanner(reg.waiting);
    return true;
  }
  return false;
}

/* ─────────────── Hash commands ─────────────── */

/**
 * Entry points that *do* something rather than name a screen.
 *
 * They exist for the manifest shortcuts, which promise actions. «Зважитись»
 * pointed at #/progress, which merely showed the chart — the shortcut was one
 * tap short of the thing it was named after.
 *
 * A command rewrites the hash before running, so Back does not re-fire it and a
 * reload does not repeat it.
 */
const COMMANDS = {
  '#/weigh': async () => {
    const { weighSheet } = await import('./views/home.js');
    weighSheet(get().profile);
  },
};

function takeCommand() {
  const run = COMMANDS[location.hash];
  if (!run) return false;
  history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  // Render first so the sheet opens over a real screen rather than a blank one.
  render().then(run);
  return true;
}

function onHashChange() {
  if (!takeCommand()) render();
}

/* ─────────────── Bootstrap ─────────────── */

window.addEventListener('hashchange', onHashChange);
window.addEventListener('app:render', render);
subscribe(() => {
  // Only the tab bar repaints here; full re-renders are explicit so typing is never interrupted.
  renderTabs(ROUTES[location.hash] ? location.hash : '#/');
});
// Another tab wrote to storage: adopt its state rather than letting the two
// copies drift until one overwrites the other.
subscribeExternal(() => {
  toast('Дані оновлено з іншої вкладки');
  render();
});
document.addEventListener('click', primeAudio, { once: true });

if (!takeCommand()) render();
registerSW();

// Only once there is something to lose: an onboarded profile is already real
// data the user would not want silently evicted.
if (get().profile.onboarded) requestPersistence();
