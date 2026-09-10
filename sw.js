/* ============================================================
   FM_FINANCE — sw.js  (Service Worker)
   - App shell en caché (cache-first) para que abra offline.
   - Las llamadas al Apps Script SIEMPRE van a la red (network-only):
     nunca cacheamos datos financieros.
   - Sube CACHE_VERSION cuando cambies archivos para forzar refresco.
   ============================================================ */

const CACHE_VERSION = 'fm-finance-v9';

const APP_SHELL = [
  './',
  './form.html',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/form.css',
  './css/dashboard.css',
  './js/config.js',
  './js/utils.js',
  './js/sheets.js',
  './js/charts.js',
  './js/form.js',
  './js/dashboard.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Instalar: precachear el app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar cachés viejos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1) Apps Script (backend): SIEMPRE red, nunca caché.
  if (url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    e.respondWith(fetch(req));
    return;
  }

  // 2) Solo manejamos GET para caché.
  if (req.method !== 'GET') { e.respondWith(fetch(req)); return; }

  // 3) Navegación (abrir páginas): network-first, cae a caché si no hay red.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('./form.html')))
    );
    return;
  }

  // 4) Resto (CSS/JS/fuentes/CDN/íconos): cache-first, y guarda lo nuevo.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && (url.origin === self.location.origin || url.hostname.includes('cloudflare') || url.hostname.includes('gstatic') || url.hostname.includes('googleapis'))) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
