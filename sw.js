/* Service worker: makes Shred12 installable and usable offline (e.g. at the gym).
   Bump VERSION whenever app files change so phones pick up the update. */
const VERSION = 'shred12-v4';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/foods.js', 'js/science.js', 'js/store.js', 'data/exercises.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];
const RUNTIME = 'shred12-runtime';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))));
  self.skipWaiting();
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

  // App files: serve from cache instantly, refresh in the background (stale-while-revalidate).
  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await c.match('index.html') : null);
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
    }));
  }
});
