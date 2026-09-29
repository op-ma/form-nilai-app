const CACHE_NAME = 'almatuq-nilai-v2';
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Hanya request ke origin sendiri dan CDN pustaka Excel yang boleh ditangani cache.
// Semua yang lain (terutama Google Apps Script / data siswa) SELALU langsung ke jaringan.
const CACHEABLE_HOSTS = [self.location.hostname, 'cdnjs.cloudflare.com'];

// Install: simpan aset inti. Satu aset gagal tidak membatalkan seluruh instalasi.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(CORE_ASSETS.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

// Aktivasi: hapus cache versi lama
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;
  if (!CACHEABLE_HOSTS.includes(url.hostname)) return; // biarkan browser menangani (GAS, dll.)

  const isPage = req.mode === 'navigate' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname.endsWith('/');

  // Halaman (index.html): NETWORK FIRST -> selalu dapat versi terbaru saat online,
  // cache hanya dipakai saat offline.
  if (isPage) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || Response.error()))
    );
    return;
  }

  // Aset statis (pustaka XLSX, manifest, ikon): tampil cepat dari cache, diperbarui di belakang layar.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
