// MedCross service worker — offline app shell (cache-first).
const CACHE = 'medcross-v16';
const ASSETS = [
  './',
  'index.html',
  'puzzle.html',
  'stats.html',
  'study.html',
  'style.css',
  'medical-database.js',
  'crossword-generator.js',
  'progress.js',
  'homepage.js',
  'script.js',
  'stats.js',
  'study.js',
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

  // For navigations, fall back to cached index.html when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  // Stale-while-revalidate: serve cache immediately (fast/offline),
  // refresh the cached copy in the background so edits propagate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
