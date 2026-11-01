/* Service worker: makes Shred12 installable and usable offline (e.g. at the gym).
   Updates are all-or-nothing: a new version downloads every file in the background, and only
   when all of them arrived does it take over (the app then reloads itself once).
   Bump VERSION (and BUILD) whenever app files change so phones pick up the update. */
const VERSION = 'shred12-v18';
const BUILD = '2026-11-02';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/coach.js', 'js/foods.js', 'js/science.js', 'js/training.js', 'js/store.js', 'data/exercises.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png',
];
const OPTIONAL = ['https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'];
const RUNTIME = 'shred12-runtime';

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache. If any core file fails, the install fails
  // and the phone keeps the previous complete version (it retries next launch).
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    await Promise.all(OPTIONAL.map(u => c.add(u).catch(() => null)));
    await self.skipWaiting();
  }));
});

// The app asks which version is running (shown in Me → App).
self.addEventListener('message', e => {
  if (e.data === 'version') e.ports[0]?.postMessage({ version: VERSION, build: BUILD });
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Live food search and the update check (sw.js) always go to the network.
  if (url.hostname.includes('openfoodfacts') || url.pathname.endsWith('/sw.js')) return;

  // Exercise images and fonts: cache-first, saved as you browse.
  if (url.hostname === 'raw.githubusercontent.com' || url.hostname.includes('fonts.g')) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch { return Response.error(); }
    }));
    return;
  }

  // App files and the pinned chart library: always from this version's complete cache,
  // so a page never mixes files from two versions. Network only for anything not cached.
  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await c.match('index.html') : null);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok && url.hostname === 'cdn.jsdelivr.net') c.put(req, res.clone()); return res; }
      catch { return req.mode === 'navigate' ? (await c.match('index.html')) || Response.error() : Response.error(); }
    }));
  }
});
