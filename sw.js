/**
 * Service worker: offline support plus controlled updates.
 *
 * CI (GitHub Actions) substitutes BUILD at deploy time. The cache name embeds
 * BUILD, so every commit creates a fresh cache and the app surfaces its
 * "Оновити" (update) banner on the user's phone.
 */

const BUILD = '__BUILD__';
const CACHE = `workout-${BUILD}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/lib/plates.js',
  './js/lib/nutrition.js',
  './js/lib/timer.js',
  './js/lib/dates.js',
  './js/data/exercises.js',
  './js/data/program.js',
  './js/views/home.js',
  './js/views/session.js',
  './js/views/progress.js',
  './js/views/library.js',
  './js/views/tools.js',
  './js/views/profile.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll fails atomically if any single file 404s — cache them one by one.
      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (e) {
            console.warn('[sw] not cached:', url, e);
          }
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('workout-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navigation: network first so a new deploy is picked up fast, cache as fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Only a real page becomes the offline shell. Caching unconditionally
          // meant one 404 or 5xx from Pages was served as the app itself for the
          // whole life of this build's cache.
          if (fresh.ok) {
            const cache = await caches.open(CACHE);
            cache.put('./index.html', fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match('./index.html', { ignoreSearch: true })) || (await cache.match('./'));
        }
      })(),
    );
    return;
  }

  // Static assets: cache first (ignoreSearch so ?v=build still matches), then network.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh.ok && fresh.type === 'basic') cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return new Response('Офлайн і немає в кеші', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});
