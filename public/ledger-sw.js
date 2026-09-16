// 下方的佔位字串由 scripts/stamp-build.js 在 vite build 之後替換成當次建置的雜湊。
// 開發時維持原樣，快取名稱固定，不影響行為。
const BUILD_ID = '__BUILD_ID__';
const CACHE = 'ledger-shell-' + BUILD_ID;
const SHELL = [
  './',
  './ledger-manifest.webmanifest',
  './ledger-icon-32.png',
  './ledger-icon-180.png',
  './ledger-icon-192.png',
  './ledger-icon-512.png',
  './ledger-icon-maskable-192.png',
  './ledger-icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

// 每次 BUILD_ID 改變都會產生新的快取名稱，舊版殼在此一併清除。
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// 同源請求走 network-first，離線時回退到快取。
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const u = new URL(event.request.url);
  if (u.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match('./')))
  );
});
