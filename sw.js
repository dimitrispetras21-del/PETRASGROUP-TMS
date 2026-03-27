// ═══════════════════════════════════════════════
// SERVICE WORKER — Offline Mode for TMS
// Strategy: Network-first, fall back to cache
// ═══════════════════════════════════════════════

const CACHE_NAME = 'tms-v1';

// App shell files to pre-cache on install
const APP_SHELL = [
  '/PETRASGROUP-TMS/app.html',
  '/PETRASGROUP-TMS/config.js',
  '/PETRASGROUP-TMS/assets/style.css',
  '/PETRASGROUP-TMS/core/api.js',
  '/PETRASGROUP-TMS/core/auth.js',
  '/PETRASGROUP-TMS/core/router.js',
  '/PETRASGROUP-TMS/core/utils.js',
  '/PETRASGROUP-TMS/core/ui.js',
  '/PETRASGROUP-TMS/core/entity.js',
  '/PETRASGROUP-TMS/modules/dashboard.js',
  '/PETRASGROUP-TMS/modules/weekly_intl.js',
  '/PETRASGROUP-TMS/modules/weekly_natl.js',
  '/PETRASGROUP-TMS/modules/daily_ramp.js',
  '/PETRASGROUP-TMS/modules/orders_intl.js',
  '/PETRASGROUP-TMS/modules/orders_natl.js',
];

// Install: pre-cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for everything
// If network fails, serve from cache (offline mode)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Airtable API calls: network-first, cache response for offline reads
  if (url.hostname === 'api.airtable.com') {
    // Only cache GET requests
    if (e.request.method === 'GET') {
      e.respondWith(
        fetch(e.request)
          .then(res => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
            return res;
          })
          .catch(() => caches.match(e.request))
      );
    }
    // POST/PATCH/DELETE: network only, queue if offline
    return;
  }

  // App files: network-first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses for app files
        if (res.ok && (url.pathname.includes('/PETRASGROUP-TMS/') || url.hostname === 'fonts.googleapis.com')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
