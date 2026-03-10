// ═══════════════════════════════════════════════════
// PULSE — Service Worker  v1.0
// Strateji: Cache-First (oyun offline çalışır)
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'pulse-v1';

// Önbelleğe alınacak dosyalar
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    // Google Fonts — harici ama önbelleğe alınır
    'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&display=swap'
];

// ── INSTALL: tüm asset'leri önbelleğe al ──────────
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching assets...');
            // Harici kaynaklar başarısız olsa bile kurulum durmasın
            return Promise.allSettled(
                ASSETS.map(url =>
                    cache.add(url).catch(err =>
                        console.warn('[SW] Could not cache:', url, err)
                    )
                )
            );
        }).then(() => self.skipWaiting()) // Hemen aktif ol
    );
});

// ── ACTIVATE: eski cache'leri temizle ────────────
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME) // eski cache isimleri
                    .map(k => {
                        console.log('[SW] Deleting old cache:', k);
                        return caches.delete(k);
                    })
            )
        ).then(() => self.clients.claim()) // Açık tabları hemen kontrol et
    );
});

// ── FETCH: Cache-First stratejisi ────────────────
self.addEventListener('fetch', e => {
    // POST / non-GET isteklerini geç (reklam SDK'ları vb.)
    if (e.request.method !== 'GET') return;

    // Chrome extension isteklerini geç
    if (e.request.url.startsWith('chrome-extension://')) return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) {
                // Cache'de var → hemen dön, arka planda güncelle (Stale-While-Revalidate)
                const fetchPromise = fetch(e.request)
                    .then(response => {
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                        }
                        return response;
                    })
                    .catch(() => { }); // offline'da hata vermesin
                return cached;
            }

            // Cache'de yok → ağdan al, cache'e ekle
            return fetch(e.request)
                .then(response => {
                    if (!response || response.status !== 200 || response.type === 'opaque') {
                        return response;
                    }
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                    return response;
                })
                .catch(() => {
                    // Tamamen offline ve cache yok — fallback
                    if (e.request.destination === 'document') {
                        return caches.match('/index.html');
                    }
                });
        })
    );
});

// ── GÜNCELLEME BİLDİRİMİ ─────────────────────────
// Yeni SW yüklendiğinde oyun sayfasına mesaj gönder
self.addEventListener('message', e => {
    if (e.data === 'SKIP_WAITING') self.skipWaiting();
});