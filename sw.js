/* Service worker: makes Shred12 installable and usable offline (e.g. at the gym).
   Bump VERSION (and BUILD) whenever app files change so phones pick up the update. */
const VERSION = 'shred12-v11';
const BUILD = '2026-11-02';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/coach.js', 'js/foods.js', 'js/science.js', 'js/training.js', 'js/store.js', 'data/exercises.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];
const RUNTIME = 'shred12-runtime';

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache so a new version never stores stale files.
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))));
  self.skipWaiting();
});

// The app asks which version is running (shown in Me → App).
self.addEventListener('message', e => {
  if (e.data === 'version') e.ports[0]?.postMessage({ version: VERSION, build: BUILD });
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Live food search must always hit the network.
  if (url.hostname.includes('openfoodfacts')) return;

  // Exercise images and fonts: cache-first, saved as you browse.
  if (url.hostname === 'raw.githubusercontent.com' || url.hostname.includes('fonts.g')) {
    e.respondWith(caches.open(RUNTIME).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch { return hit || Response.error(); }
    }));
    return;
  }

  // Pinned CDN library never changes: cache-first.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(req)) || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })));
    return;
  }

  // App files: network-first so updates show immediately; cached copy when offline or slow (>3 s).
  if (url.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const cached = () => c.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? c.match('index.html') : Response.error()));
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000));
      try { return await Promise.race([net, timeout]); } catch { return cached(); }
    }));
  }
});
