/** App shell: router, tab bar, onboarding, service-worker update flow. */

import { h, clear, btn, field, num, select, segmented, toast, card } from './ui.js';
import { get, subscribe, saveProfile } from './store.js';
import { primeAudio } from './lib/timer.js';
import { ACTIVITY } from './lib/nutrition.js';

export const APP_VERSION = '1.0.0';

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

async function render() {
  if (rendering) return;
  rendering = true;
  try {
    const data = get();
    if (!data.profile.onboarded) {
      clear(root()).appendChild(onboarding());
      renderTabs('#/');
      return;
    }
    const hash = ROUTES[location.hash] ? location.hash : '#/';
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
  }
}

let lastHash = null;

function renderTabs(active) {
  const bar = document.getElementById('tabs');
  const data = get();
  clear(bar);
  for (const [hash, r] of Object.entries(ROUTES)) {
    if (r.hidden) continue;
    bar.appendChild(
      h('button', { class: `tab ${active === hash ? 'is-active' : ''}`, onclick: () => go(hash) },
        h('span', { class: 'tab-icon' }, r.icon),
        h('span', { class: 'tab-label' }, r.label),
      ),
    );
  }
  if (data.active && active !== '#/session') {
    bar.classList.add('has-session');
    bar.appendChild(h('button', { class: 'tab tab-session', onclick: () => go('#/session') }, h('span', { class: 'tab-icon' }, '⏱'), h('span', { class: 'tab-label' }, 'Триває')));
  } else {
    bar.classList.remove('has-session');
  }
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

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  window.dispatchEvent(new CustomEvent('app:render'));
});

window.addEventListener('appinstalled', () => {
  installEvent = null;
  window.dispatchEvent(new CustomEvent('app:render'));
});

/** True once the app runs from the home screen rather than a browser tab. */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)')?.matches === true ||
    navigator.standalone === true
  );
}

/** Whether the browser has offered us a programmatic install prompt. */
export function canPromptInstall() {
  return installEvent !== null;
}

/** iOS never fires beforeinstallprompt — it needs the Share-menu instructions. */
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export async function promptInstall() {
  if (!installEvent) return 'unavailable';
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  window.dispatchEvent(new CustomEvent('app:render'));
  return outcome; // 'accepted' | 'dismissed'
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
    ios: isIOS(),
    version: APP_VERSION,
  };
}

/* ─────────────── Updates (GitHub Pages) ─────────────── */

let waitingWorker = null;

function updateBanner(worker) {
  waitingWorker = worker;
  if (document.getElementById('update-banner')) return;
  const banner = h('div', { class: 'update-banner', id: 'update-banner' },
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

/* ─────────────── Bootstrap ─────────────── */

window.addEventListener('hashchange', render);
window.addEventListener('app:render', render);
subscribe(() => {
  // Only the tab bar repaints here; full re-renders are explicit so typing is never interrupted.
  renderTabs(ROUTES[location.hash] ? location.hash : '#/');
});
document.addEventListener('click', primeAudio, { once: true });

render();
registerSW();
