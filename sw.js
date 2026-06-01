const CACHE_NAME = 'whisper-room-v2';  // Version bumped to force update
const urlsToCache = [
  '/chat',
  '/chat.html',
  '/favicon.svg',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Bypass cache for API, admin, and upload endpoints
  if (url.includes('/api/') || url.includes('/admin/') || url.includes('/upload')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/chat.html');
          }
          return new Response('Offline – Whisper Room requires a network connection for chat.', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
