/* دكان الحلة — offline cache. Keep library versions in sync with index.html. */
const CACHE_NAME = 'dukan-alhalla-offline-v1';
const BASE_URL = new URL('./', self.registration.scope).href;
const VERSION_URL = new URL('version.json', self.registration.scope).href;
const REMOTE_LIBRARIES = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache the main game page and version metadata for offline launch/update checks.
    const pageResponse = await fetch(BASE_URL, { cache: 'force-cache' });
    if (!pageResponse.ok) throw new Error('Could not cache the game page');
    await cache.put(BASE_URL, pageResponse.clone());

    try {
      const versionResponse = await fetch(VERSION_URL, { cache: 'force-cache' });
      if (versionResponse.ok) await cache.put(VERSION_URL, versionResponse.clone());
    } catch (_) {}

    // These are the only external runtime dependencies found in the supplied game.
    // no-cors responses are opaque, but can still be stored and replayed by a service worker.
    for (const url of REMOTE_LIBRARIES) {
      const response = await fetch(url, { mode: 'no-cors', cache: 'force-cache' });
      if (!response || (response.type !== 'opaque' && !response.ok)) {
        throw new Error('Could not cache dependency: ' + url);
      }
      await cache.put(url, response.clone());
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('dukan-alhalla-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: 'DUKAN_OFFLINE_READY' });
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Pinned cross-origin libraries: cache-first, with a network fallback on first setup.
  if (REMOTE_LIBRARIES.includes(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response && (response.type === 'opaque' || response.ok)) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;

  // The game checks version.json periodically. Use the network when possible,
  // but serve the saved copy when the device is offline.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(VERSION_URL, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(VERSION_URL)) || Response.error();
      }
    })());
    return;
  }

  // Network-first for page navigation so online visits receive new deployments;
  // the cached game page is used if there is no connection.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(BASE_URL, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(BASE_URL)) || Response.error();
      }
    })());
  }
});
