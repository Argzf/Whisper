const CACHE_NAME = 'whisper-room-v2'; // Increment version to force update
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
  );
  self.skipWaiting(); // Activate new SW immediately
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Bypass cache for admin API calls and uploaded files – prevents stale data
  const url = event.request.url;
  if (url.includes('/admin/') || url.includes('/uploads/') || url.includes('/socket.io/')) {
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
          return new Response('Offline – Whisper Room requires network connection.', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
