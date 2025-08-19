/**
 * FinePointRehab Service Worker (development-friendly)
 * Goal: avoid stale HTML while iterating; cache static assets opportunistically.
 *
 * During development:
 *  - Bump CACHE_NAME on each deploy to force invalidation.
 *  - HTML is never intercepted; navigations go straight to network.
 */

const CACHE_NAME = 'fpr-dev-v3'; // 🔁 Bump on each deploy while developing
const CACHE_PREFIX = 'fpr-';

// Open (but don’t aggressively prefill) a cache on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => self.skipWaiting())
  );
});

// Clean old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// Runtime caching for same-origin, non-HTML GET requests only
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle same-origin GET
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Don’t intercept HTML while stabilising (prevents stale pages)
  // Covers both explicit HTML fetches and page navigations.
  const accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.includes('text/html')) return;

  event.respondWith(cacheFirstSafe(req));
});

/**
 * Cache-first, but only store safe responses (no redirects/opaques).
 * Falls back to network if not cached; if network fails, falls back to cache (if any).
 */
async function cacheFirstSafe(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const resp = await fetch(request);
    // Only cache successful, basic (same-origin) responses that are not redirects
    if (resp && resp.status === 200 && resp.type === 'basic' && !resp.redirected) {
      cache.put(request, resp.clone());
    }
    return resp;
  } catch (err) {
    // If network fails, serve any stale copy if available
    if (cached) return cached;
    // Last resort: generic 503 (don’t fabricate HTML to avoid confusion in dev)
    return new Response('Offline or fetch failed', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Optional: lightweight message handler for future convenience (e.g., CLEAR_CACHE)
self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    await self.skipWaiting();
  } else if (data.type === 'CLEAR_CACHE') {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX)).map(n => caches.delete(n)));
    if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true });
  }
});
