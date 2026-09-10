// CrowdRelay Control Plane service worker.
//
// Strategy:
//   - App shell (index.html, CSS, fonts, JS chunks): precached on install,
//     network-first for navigations with cached shell fallback.
//   - Read API (GET /api/v1/*): NOT intercepted. The backend has its own
//     in-process read model cache and TanStack Query has its own client
//     cache with placeholderData. SW caching of API responses served stale
//     degraded data on network blips — the operator saw "upstream contract
//     failed" persisted from a cached response and needed a hard refresh
//     (Ctrl+Shift+R) to clear it. Removing the interception lets every
//     API request go straight to the network.
//   - Static assets (/assets/*, /fonts/*, /icons/*): cache-first, long TTL.
//
// No external dependencies. Vanilla service worker.

const SHELL_CACHE = 'cp-shell-v3';
const ASSET_CACHE = 'cp-assets-v3';

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
  // Delete all old caches — including the retired cp-api-v2 and any v2
  // shell/asset caches — so stale API responses are evicted on activation.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== ASSET_CACHE)
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

  // Read API (GET /api/v1/*): not intercepted. See header comment.

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
