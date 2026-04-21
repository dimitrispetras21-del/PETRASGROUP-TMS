// ═══════════════════════════════════════════════════════════
// SERVICE WORKER — Petras Group TMS
// Strategies:
//   - App shell: cache on install, network-first on fetch
//   - Airtable API (GET): network-first, cache fallback
//   - Static assets (fonts, images): cache-first
//   - Offline banner via postMessage to all clients
// ═══════════════════════════════════════════════════════════

const SW_VERSION = 'tms-sw-v16-intl-orders';

// ── App shell files to pre-cache on install ──────────────
const APP_SHELL = [
  '/PETRASGROUP-TMS/app.html',
  '/PETRASGROUP-TMS/index.html',
  '/PETRASGROUP-TMS/config.js',
  '/PETRASGROUP-TMS/logo.png',
  '/PETRASGROUP-TMS/assets/style.css',
  // Core
  '/PETRASGROUP-TMS/core/api.js',
  '/PETRASGROUP-TMS/core/auth.js',
  '/PETRASGROUP-TMS/core/router.js',
  '/PETRASGROUP-TMS/core/utils.js',
  '/PETRASGROUP-TMS/core/ui.js',
  '/PETRASGROUP-TMS/core/entity.js',
  '/PETRASGROUP-TMS/core/pa-helpers.js',
  '/PETRASGROUP-TMS/core/ai-chat.js',
  // Modules
  '/PETRASGROUP-TMS/modules/dashboard.js',
  '/PETRASGROUP-TMS/modules/weekly_intl.js',
  '/PETRASGROUP-TMS/modules/weekly_natl.js',
  '/PETRASGROUP-TMS/modules/daily_ramp.js',
  '/PETRASGROUP-TMS/modules/daily_ops.js',
  '/PETRASGROUP-TMS/modules/orders_intl.js',
  '/PETRASGROUP-TMS/modules/orders_natl.js',
  '/PETRASGROUP-TMS/modules/locations.js',
  '/PETRASGROUP-TMS/modules/maintenance.js',
  '/PETRASGROUP-TMS/modules/pallet_upload.js',
  '/PETRASGROUP-TMS/modules/pallet_ledger.js',
  '/PETRASGROUP-TMS/modules/invoicing.js',
  '/PETRASGROUP-TMS/modules/performance.js',
];

// ── Helpers ──────────────────────────────────────────────

function isAirtableAPI(url) {
  return url.hostname === 'api.airtable.com';
}

function isStaticAsset(url) {
  return url.hostname === 'fonts.googleapis.com'
      || url.hostname === 'fonts.gstatic.com'
      || /\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)(\?|$)/i.test(url.pathname);
}

// Notify all clients about online/offline status
function notifyClients(msg) {
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(c => c.postMessage(msg));
  });
}

// ── INSTALL: pre-cache app shell ────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SW_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: purge old caches, claim clients ───────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SW_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => notifyClients({ type: 'SW_ACTIVATED', version: SW_VERSION }))
  );
});

// ── FETCH ───────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── 1. Airtable API: network-first, cache GET responses ──
  if (isAirtableAPI(url)) {
    if (e.request.method !== 'GET') return; // POST/PATCH/DELETE pass through
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            // Store cache timestamp as a custom header in cached response
            const headers = new Headers(res.headers);
            headers.set('X-Cache-Timestamp', String(Date.now()));
            const cachedRes = new Response(res.clone().body, {
              status: res.status,
              statusText: res.statusText,
              headers: headers
            });
            caches.open(SW_VERSION).then(cache => cache.put(e.request, cachedRes));
          }
          notifyClients({ type: 'SW_ONLINE' });
          return res;
        })
        .catch(() => {
          notifyClients({ type: 'SW_OFFLINE' });
          return caches.match(e.request).then(cached => {
            if (cached) {
              const cacheTs = cached.headers.get('X-Cache-Timestamp');
              if (cacheTs) {
                const ageMs = Date.now() - parseInt(cacheTs, 10);
                notifyClients({ type: 'SW_CACHE_AGE', ageMs });
              }
            }
            return cached;
          });
        })
    );
    return;
  }

  // ── 2. Static assets (fonts, images): cache-first ──
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(SW_VERSION).then(cache => cache.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // ── 3. App shell / other: network-first, cache fallback ──
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(SW_VERSION).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── MESSAGE: handle skip-waiting from app ───────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
