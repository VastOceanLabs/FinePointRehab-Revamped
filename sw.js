// /sw.js (production-ready)
const CACHE = 'fpr-v1'; // bump each deploy
const NAVIGATION_FALLBACK = '/'; // fallback for offline navigation

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  if ('navigationPreload' in self.registration) {
    e.waitUntil(self.registration.navigationPreload.enable());
  }
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  
  // Skip non-GET, opaque, and range requests
  if (req.method !== 'GET' || req.headers.get('range')) return;
  
  // HTML: serve from network with fallback to cache (or navigation fallback)
  if (req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).catch(() => 
        caches.match(req).then(res => res || caches.match(NAVIGATION_FALLBACK))
      )
    );
    return;
  }
  
  // Assets: cache-first with network fallback
  e.respondWith(
    caches.match(req).then(res => res || fetch(req).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return r;
    }))
  );
});