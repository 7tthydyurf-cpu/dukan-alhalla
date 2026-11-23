// دكان الحلة — تشغيل بدون إنترنت
const VER = '1.2.0';
const CACHE = 'dukkan-' + VER;
const IDX = new URL('index.html', self.registration.scope).href;
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'
];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(LIBS.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})));
    try { const r = await fetch(IDX, { cache: 'reload' }); if (r.ok) await c.put(IDX, r); } catch (_) {}
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => {
  if (e.data && e.data.t === 'refresh') {
    e.waitUntil(caches.open(CACHE).then(c => c.delete(IDX)).then(() => e.source && e.source.postMessage({ t: 'ok' })));
  }
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (r.mode === 'navigate') {
      e.respondWith(caches.match(IDX).then(m => m || fetch(r).then(x => {
        if (x.ok) { const cp = x.clone(); caches.open(CACHE).then(c => c.put(IDX, cp)); }
        return x;
      })));
      return;
    }
    if (/version\.json$/.test(u.pathname)) { e.respondWith(fetch(r, { cache: 'no-store' }).catch(() => caches.match(r))); return; }
    e.respondWith(caches.match(r).then(m => m || fetch(r)));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(x => {
    const cp = x.clone(); caches.open(CACHE).then(c => c.put(r, cp)); return x;
  })));
});
