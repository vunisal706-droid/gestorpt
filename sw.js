// Service Worker de Gestor PE — v5
// Objetivo: que la app funcione DE VERDAD sin conexión.
//  · App shell (HTML, manifest, iconos) → cacheada.
//  · Librerías de CDN (Firebase, Chart.js, mammoth, docx…) → cacheadas también.
//    Sin esto la PWA arrancaba y se quedaba en blanco al perder la red.
//  · HTML: network-first (para no servir lógica vieja).
//  · Resto: stale-while-revalidate.

const VERSION     = 'v5';
const CACHE_SHELL = 'gestor-pe-shell-' + VERSION;
const CACHE_LIBS  = 'gestor-pe-libs-'  + VERSION;
const CACHES_OK   = [CACHE_SHELL, CACHE_LIBS];

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Librerías externas necesarias para que la app arranque offline.
const LIBS = [
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// Dominios cuyos recursos cacheamos aunque no estén en LIBS
// (mammoth, docx, jspdf… se cargan bajo demanda).
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'www.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(CACHE_SHELL);
    // addAll falla entero si un solo recurso falla → los añadimos uno a uno.
    await Promise.all(APP_SHELL.map(u => shell.add(u).catch(() => {})));
    const libs = await caches.open(CACHE_LIBS);
    await Promise.all(LIBS.map(u =>
      fetch(u, { mode: 'cors' })
        .then(r => r.ok && libs.put(u, r))
        .catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !CACHES_OK.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca interceptar Firebase Realtime Database (websocket / long-polling):
  // su propia caché interna gestiona el offline.
  if (url.hostname.endsWith('firebasedatabase.app') ||
      url.hostname.endsWith('firebaseio.com')) return;

  // 1) HTML → network-first, con fallback a caché.
  if (request.mode === 'navigate' ||
      (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_SHELL).then(c => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 2) Librerías de CDN → cache-first (son inmutables por versión).
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE_LIBS).then(c => c.put(request, copy));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 3) Resto (iconos, imágenes propias) → stale-while-revalidate.
  event.respondWith(
    caches.match(request).then(cached => {
      const red = fetch(request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_SHELL).then(c => c.put(request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || red;
    })
  );
});
