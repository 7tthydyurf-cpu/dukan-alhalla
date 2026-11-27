// دكان الحلة — Service Worker موثوق للتشغيل دون إنترنت
// يحافظ على النسخ القديمة حتى يتأكد من وجود نسخة جديدة قابلة للفتح.
const CACHE = 'dukkan-offline-1.9.4';
const SCOPE = self.registration.scope;
const IDX = new URL('index.html', SCOPE).href;
const KARO = new URL('karoD.txt', SCOPE).href;
const VERSION = new URL('version.json', SCOPE).href;
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'
];

async function saveResponse(cache, key, response) {
  try {
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(key, response.clone());
      return true;
    }
  } catch (e) { /* نترك النسخة السابقة كما هي */ }
  return false;
}

async function cacheURL(cache, url, mode) {
  try {
    const options = { cache: 'reload' };
    if (mode === 'no-cors') options.mode = 'no-cors';
    const response = await fetch(url, options);
    return await saveResponse(cache, url, response);
  } catch (e) { return false; }
}

async function cachedFirst(request, ignoreSearch = true) {
  const current = await caches.open(CACHE);
  let hit = await current.match(request, { ignoreSearch });
  if (hit) return hit;
  const keys = await caches.keys();
  for (const key of keys) {
    if (key === CACHE || !key.startsWith('dukkan-')) continue;
    const old = await caches.open(key);
    hit = await old.match(request, { ignoreSearch });
    if (hit) return hit;
  }
  return undefined;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // الملفات الضرورية فقط أثناء التثبيت؛ المجسمات الكبيرة تُخزّن عند استخدامها.
    await Promise.allSettled([
      cacheURL(cache, IDX),
      cacheURL(cache, KARO),
      cacheURL(cache, VERSION),
      ...LIBS.map(url => cacheURL(cache, url, 'no-cors'))
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // لا نحذف أي كاش قديم هنا؛ فقد يحتوي على مجسمات سبق تنزيلها.
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.t === 'refresh') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await cache.delete(IDX);
      await cacheURL(cache, IDX);
      if (event.source) event.source.postMessage({ t: 'ok' });
    })());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (/\/version\.json$/.test(url.pathname)) {
      event.respondWith((async () => {
        try {
          const response = await fetch(request, { cache: 'no-store' });
          if (response && response.ok) {
            const cache = await caches.open(CACHE);
            await saveResponse(cache, VERSION, response);
          }
          return response;
        } catch (e) {
          return (await cachedFirst(VERSION)) || Response.error();
        }
      })());
      return;
    }

    if (request.mode === 'navigate') {
      event.respondWith((async () => {
        const saved = await cachedFirst(IDX);
        if (saved) return saved;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE);
            await saveResponse(cache, IDX, response);
          }
          return response;
        } catch (e) {
          const fallback = await cachedFirst(request) || await cachedFirst(IDX);
          return fallback || new Response('افتح اللعبة مرة واحدة بالإنترنت حتى تُحفظ للتشغيل دون إنترنت.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
      })());
      return;
    }

    event.respondWith((async () => {
      const saved = await cachedFirst(request);
      if (saved) return saved;
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await saveResponse(cache, request, response);
        }
        return response;
      } catch (e) {
        return (await cachedFirst(request)) || Response.error();
      }
    })());
    return;
  }

  // مكتبات CDN: استخدم النسخة المخزنة أولاً، وخزّنها عند أول اتصال ناجح.
  event.respondWith((async () => {
    const saved = await cachedFirst(request);
    if (saved) return saved;
    try {
      const response = await fetch(request);
      if (response && (response.ok || response.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        await saveResponse(cache, request, response);
      }
      return response;
    } catch (e) {
      return (await cachedFirst(request)) || Response.error();
    }
  })());
});
