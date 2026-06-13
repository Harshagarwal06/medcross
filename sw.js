// MedCross service worker — offline app shell (cache-first).
const CACHE = 'medcross-v58';
const CACHEABLE_RESPONSE_TYPES = new Set(['basic', 'cors', 'opaque']);
const ASSETS = [
  './',
  'index.html',
  'puzzle.html',
  'stats.html',
  'study.html',
  'style.css',
  'medical-database.js',
  'crossword-generator.js',
  'validation.js',
  'progress.js',
  'medical-api-sources.js',
  'notes-import.js',
  'homepage.js',
  'homepage-filters.js',
  'script.js',
  'stats.js',
  'study.js',
  'config.public.js',
  'gemini.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const versionedSameOriginAsset = sameOrigin && url.searchParams.has('v');
  const matchOptions = sameOrigin ? { ignoreSearch: true } : undefined;

  // For navigations, fall back to cached index.html when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(req, matchOptions).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  if (versionedSameOriginAsset) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && CACHEABLE_RESPONSE_TYPES.has(res.type)) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match(req, matchOptions)))
    );
    return;
  }

  // Stale-while-revalidate: serve cache immediately (fast/offline),
  // refresh the cached copy in the background so edits propagate. CDN assets
  // are cached after first use so fonts/icons/parsers keep working offline.
  event.respondWith(
    caches.match(req, matchOptions).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && (res.status === 200 || res.status === 0) && CACHEABLE_RESPONSE_TYPES.has(res.type)) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
