const CACHE_NAME = 'whisper-v2';
const urlsToCache = [
  '/',
  '/chat.html',
  '/admin.html',
  '/faq.html',
  '/pp.html',
  '/tos.html',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/wr-banner.png'
];

// Install event – cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
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
    })
  );
  self.clients.claim();
});

// Fetch event – network-first for API, cache-first for static, bypass for clean URLs
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const path = url.pathname;
  
  // ----- BYPASS FOR CLEAN URL REDIRECTS (let Express handle) -----
  if (path === '/faq' || path === '/privacy-policy' || path === '/tos') {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // ----- API, admin, upload – network only -----
  if (path.includes('/api/') || path.includes('/admin') || path === '/upload') {
    event.respondWith(fetch(event.request).catch(() => {
      return new Response('Network error', { status: 503 });
    }));
    return;
  }
  
  // ----- Static assets – cache first, fallback to network -----
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          networkResponse => {
            // Cache a copy of valid responses (not opaque)
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          }
        );
      })
  );
});
