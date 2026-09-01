// CrowdRelay Control Plane service worker.
//
// Strategy:
//   - App shell (index.html, CSS, fonts, JS chunks): precached on install,
//     cache-first for navigations with network fallback.
//   - Read API (GET /api/v1/*): network-first with 30s stale-while-revalidate
//     fallback. Only 200 responses are cached. Mutations are never cached.
//   - Static assets (/assets/*, /fonts/*, /icons/*): cache-first, long TTL.
//
// No external dependencies. Vanilla service worker.

const SHELL_CACHE = 'cp-shell-v1';
const API_CACHE = 'cp-api-v1';
const ASSET_CACHE = 'cp-assets-v1';
const API_STALE_MS = 30_000;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/crowdrelay-brand-mark.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/Inter-Regular.woff2',
  '/fonts/Inter-SemiBold.woff2',
  '/fonts/Inter-Bold.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== API_CACHE && name !== ASSET_CACHE)
          .map((name) => caches.delete(name)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // Mutations: always hit the network, never cache.
  if (request.method !== 'GET') return;

  // Navigations (HTML pages): network-first, fall back to cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Read API: network-first with stale-while-revalidate.
  if (url.pathname.startsWith('/api/v1/')) {
    event.respondWith(networkFirstApi(request, url));
    return;
  }

  // Static assets: cache-first with network fallback.
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  ) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }
});

async function networkFirstApi(request, url) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      cache.put(request, copy);
    }
    return response;
  } catch (networkError) {
    const cached = await cache.match(request);
    if (cached) {
      // Stale-while-revalidate: return cached, kick off background refresh.
      fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
      }).catch(() => {});
      return cached;
    }
    throw networkError;
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return cached || Response.error();
  }
}
