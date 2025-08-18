/**
 * FinePointRehab Service Worker
 * Versioned caching strategy for offline functionality and performance
 */

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

// Version bump invalidates cache on deploy
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `fpr-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `fpr-dynamic-${CACHE_VERSION}`;
const EXERCISE_CACHE = `fpr-exercises-${CACHE_VERSION}`;

// ============================================================================
// ASSETS TO PRECACHE
// ============================================================================

const STATIC_ASSETS = [
  // Core CSS (consolidated design system)
  '/css/tokens.css',
  '/css/base.css',
  '/css/components.css',
  
  // Core JavaScript modules
  '/js/utils.js',
  '/js/exercises.js',
  '/js/progress.js',
  '/js/achievements.js',
  '/js/adaptive-difficulty.js',
  
  // Local Chart.js bundle (no CDN dependency)
  '/js/vendor/chart.min.js',
  
  // PWA essentials (don't cache sw.js - browser handles SW updates)
  '/manifest.json',
  
  // Icons for all platforms
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/icons/shortcut-exercise.png',
  '/icons/shortcut-dashboard.png',
  
  // Audio assets (both formats for cross-browser support)
  '/audio/success.mp3',
  '/audio/success.ogg',
  '/audio/level-up.mp3',
  '/audio/level-up.ogg',
  '/audio/achievement.mp3',
  '/audio/achievement.ogg'
];

const EXERCISE_ASSETS = [
  '/exercises/bubble-exercise.html',
  '/exercises/comet-exercise.html',
  '/exercises/trace-reveal-exercise.html',
  '/exercises/rhythm-exercise.html',
  '/exercises/pattern-exercise.html',
  '/exercises/coordination-exercise.html',
  '/exercises/precision-exercise.html',
  '/exercises/dexterity-exercise.html'
];

// ============================================================================
// INSTALL EVENT - PRECACHE CRITICAL ASSETS (RESILIENT TO 404s)
// ============================================================================

self.addEventListener('install', event => {
  console.log(`[SW] Installing version ${CACHE_VERSION}`);
  
  event.waitUntil(
    (async () => {
      try {
        const staticCache = await caches.open(STATIC_CACHE);
        const exerciseCache = await caches.open(EXERCISE_CACHE);

        // Use allSettled so one missing file doesn't break entire install
        const results = await Promise.allSettled([
          staticCache.addAll(STATIC_ASSETS),
          exerciseCache.addAll(EXERCISE_ASSETS)
        ]);

        // Log any failures but don't break installation
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const cacheName = index === 0 ? 'static' : 'exercise';
            console.warn(`[SW] ${cacheName} cache installation had errors:`, result.reason);
          }
        });

        console.log('[SW] Installation complete');
        await self.skipWaiting();
      } catch (error) {
        console.error('[SW] Installation failed:', error);
        throw error;
      }
    })()
  );
});

// ============================================================================
// ACTIVATE EVENT - CLEANUP OLD CACHES + ENABLE NAVIGATION PRELOAD
// ============================================================================

self.addEventListener('activate', event => {
  console.log(`[SW] Activating version ${CACHE_VERSION}`);
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith('fpr-') && !cacheName.endsWith(CACHE_VERSION))
          .map(cacheName => {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          })
      );

      // Enable navigation preload if supported (speeds up first paint)
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
        console.log('[SW] Navigation preload enabled');
      }

      // Take control of all pages immediately
      await self.clients.claim();
      
      console.log('[SW] Activation complete');
      
      // Notify clients about the update
      notifyClientsOfUpdate();
    })()
  );
});

// ============================================================================
// FETCH EVENT - IMPLEMENT CACHING STRATEGIES (GET REQUESTS ONLY)
// ============================================================================

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Only handle same-origin GET requests
  if (url.origin !== location.origin) return;
  if (request.method !== 'GET') return;
  
  // App shell strategy for navigation requests (works with deep links offline)
  if (request.mode === 'navigate') {
    event.respondWith(appShellResponse(request));
    return;
  }
  
  event.respondWith(handleRequest(request));
});

// ============================================================================
// APP SHELL STRATEGY FOR NAVIGATION
// ============================================================================

async function appShellResponse(request) {
  const cache = await caches.open(STATIC_CACHE);
  
  // Try navigation preload first (fast path on slow connections)
  const preloadResponse = await (async () => {
    try {
      if ('navigationPreload' in self.registration) {
        const state = await self.registration.navigationPreload.getState();
        if (state.enabled) {
          return await event.preloadResponse;
        }
      }
    } catch (error) {
      console.warn('[SW] Navigation preload error:', error);
    }
    return undefined;
  })();

  if (preloadResponse) {
    cache.put('/index.html', preloadResponse.clone());
    return preloadResponse;
  }

  // Try fresh network request
  try {
    const networkResponse = await fetch('/index.html', { cache: 'no-store' });
    if (networkResponse.ok) {
      cache.put('/index.html', networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await cache.match('/index.html');
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // No cache either, return offline fallback
    return getOfflineFallback('/index.html');
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  try {
    // Route to appropriate caching strategy
    if (isStaticAsset(pathname)) {
      return await cacheFirst(request, STATIC_CACHE);
    } else if (isExercisePage(pathname)) {
      return await staleWhileRevalidate(request, EXERCISE_CACHE);
    } else if (isContentPage(pathname)) {
      return await networkFirst(request, DYNAMIC_CACHE);
    } else {
      // Default: try cache first, then network
      return await cacheFirst(request, DYNAMIC_CACHE);
    }
  } catch (error) {
    console.error('[SW] Request failed:', error);
    return await getOfflineFallback(pathname);
  }
}

// ============================================================================
// CACHING STRATEGIES
// ============================================================================

/**
 * Cache-first strategy for static assets
 * Fast loading, update only when cache version changes
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    return getOfflineFallback(new URL(request.url).pathname);
  }
}

/**
 * Network-first strategy for content pages
 * Always try to get fresh content, fallback to cache
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return getOfflineFallback(new URL(request.url).pathname);
  }
}

/**
 * Stale-while-revalidate strategy for exercise pages
 * Instant loading from cache + background update
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Start fetch in background (don't await)
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(error => {
    console.warn('[SW] Background fetch failed:', error);
    return undefined; // Return undefined on failure
  });
  
  // Return cached version immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // If no cache, wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }
  
  // No cache and network failed -> offline fallback
  return getOfflineFallback(new URL(request.url).pathname);
}

// ============================================================================
// ROUTE CLASSIFICATION
// ============================================================================

function isStaticAsset(pathname) {
  return pathname.startsWith('/css/') ||
         pathname.startsWith('/js/') ||
         pathname.startsWith('/icons/') ||
         pathname.startsWith('/audio/') ||
         pathname === '/manifest.json';
  // Note: /sw.js removed to avoid confusion - browser handles SW updates
}

function isExercisePage(pathname) {
  return pathname.startsWith('/exercises/') && pathname.endsWith('.html');
}

function isContentPage(pathname) {
  return pathname === '/' ||
         pathname === '/index.html' ||
         pathname === '/dashboard.html' ||
         pathname === '/privacy-policy.html' ||
         pathname === '/about.html' ||
         pathname === '/faq.html';
}

// ============================================================================
// OFFLINE FALLBACKS
// ============================================================================

async function getOfflineFallback(pathname) {
  const cache = await caches.open(STATIC_CACHE);
  
  if (isExercisePage(pathname) || isContentPage(pathname)) {
    // Return cached index.html as fallback
    const fallback = await cache.match('/index.html');
    if (fallback) {
      return fallback;
    }
  }
  
  // Return generic offline response with version info for debugging
  return new Response(
    `<!DOCTYPE html>
    <html>
    <head>
      <title>FinePointRehab - Offline</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: system-ui, sans-serif; 
          text-align: center; 
          padding: 2rem; 
          color: #1f2937;
        }
        .offline-message {
          max-width: 400px;
          margin: 2rem auto;
        }
        .retry-btn {
          background: #2563eb;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          font-size: 1rem;
          cursor: pointer;
          margin-top: 1rem;
        }
        .version {
          font-size: 0.75rem;
          color: #6b7280;
          margin-top: 2rem;
        }
      </style>
    </head>
    <body>
      <div class="offline-message">
        <h1>You're Offline</h1>
        <p>This page requires an internet connection. Please check your network and try again.</p>
        <button class="retry-btn" onclick="window.location.reload()">Try Again</button>
        <div class="version">SW Version: ${CACHE_VERSION}</div>
      </div>
    </body>
    </html>`,
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/html' }
    }
  );
}

// ============================================================================
// UPDATE NOTIFICATIONS
// ============================================================================

function notifyClientsOfUpdate() {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SW_UPDATE_AVAILABLE',
        version: CACHE_VERSION
      });
    });
  });
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

self.addEventListener('message', event => {
  const { data } = event;
  
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  } else if (data.type === 'CLEAR_CACHE') {
    handleCacheClear().then(() => {
      event.ports[0].postMessage({ success: true });
    }).catch(error => {
      event.ports[0].postMessage({ success: false, error: error.message });
    });
  }
});

async function handleCacheClear() {
  const cacheNames = await caches.keys();
  const deletePromises = cacheNames
    .filter(cacheName => cacheName.startsWith('fpr-'))
    .map(cacheName => caches.delete(cacheName));
  
  await Promise.all(deletePromises);
  console.log('[SW] All caches cleared');
}

// ============================================================================
// BACKGROUND SYNC EVENTS
// ============================================================================

// One-off Background Sync
self.addEventListener('sync', event => {
  if (event.tag === 'update-check') {
    event.waitUntil(checkForUpdates());
  }
});

// Periodic Background Sync (requires permission)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'progress-sync') {
    event.waitUntil(syncProgressData());
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

self.addEventListener('error', event => {
  console.error('[SW] Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

console.log(`[SW] Service Worker loaded - version ${CACHE_VERSION}`);