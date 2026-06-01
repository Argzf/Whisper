const CACHE_NAME = 'whisper-room-v2';
const urlsToCache = [
  '/chat',
  '/chat.html',
  '/manifest.json',
  '/favicon.svg',
  '/socket.io/socket.io.js'
];

// Install event – cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event – clean up old caches
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

// Fetch event – serve cached chat.html when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          // If the request is for a page, return the cached chat.html
          if (event.request.mode === 'navigate') {
            return caches.match('/chat.html');
          }
          return new Response('Offline – Whisper Room requires network connection for chat.', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
