// دكان الحلة — تخزين كامل للتشغيل دون إنترنت
const VER = '1.9.3';
const CACHE = 'dukkan-' + VER;
const IDX = new URL('index.html', self.registration.scope).href;
const KARO = new URL('karoD.txt', self.registration.scope).href;
const MODEL = new URL('zongshen.glb', self.registration.scope).href;
const SHEEP_HOUSE = new URL('sheep_house.glb', self.registration.scope).href;
const SHEEP_MODEL = new URL('sheep.glb', self.registration.scope).href;
const VERSION = new URL('version.json', self.registration.scope).href;
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'
];

async function cacheURL(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response && response.ok) await cache.put(url, response);
  } catch (_) {
    // لا نفشل تثبيت عامل الخدمة إذا تعذر تنزيل مورد؛ سيُعاد المحاولة عند الاتصال.
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([
      ...LIBS.map(async url => {
        try {
          const response = await fetch(url, { mode: 'no-cors', cache: 'reload' });
          if (response) await cache.put(url, response);
        } catch (_) {}
      }),
      cacheURL(cache, IDX),
      cacheURL(cache, KARO),
      cacheURL(cache, MODEL),
      cacheURL(cache, SHEEP_HOUSE),
      cacheURL(cache, SHEEP_MODEL),
      cacheURL(cache, VERSION)
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('dukkan-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.t === 'refresh') {
    event.waitUntil(
      caches.open(CACHE)
        .then(cache => cache.delete(IDX))
        .then(() => event.source && event.source.postMessage({ t: 'ok' }))
    );
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (/version\.json$/.test(url.pathname)) {
      event.respondWith(
        fetch(request, { cache: 'no-store' })
          .then(response => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then(cache => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => caches.match(request).then(cached => cached || Response.error()))
      );
      return;
    }

    if (request.mode === 'navigate') {
      event.respondWith(
        caches.match(IDX).then(cached => cached || fetch(request).then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(IDX, copy));
          }
          return response;
        }))
      );
      return;
    }

    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
      return response;
    }))
  );
});
