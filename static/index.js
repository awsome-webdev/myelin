const CACHE_NAME = 'myelin-v1';
const TAILWIND_CDN = 'https://cdn.tailwindcss.com';
const LOCAL_TAILWIND = '/sw/tailwind.js';

const ASSETS_TO_CACHE = [
  '/',
  LOCAL_TAILWIND,
  '/dash',
  '/viewcard'
];

// 1. Install & Cache initial assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); 
});

// 2. The "Stale-While-Revalidate" Strategy
self.addEventListener('fetch', (event) => {
  let request = event.request;
  const url = new URL(event.request.url);
  // INTERCEPT TAILWIND
  if (request.url.startsWith(TAILWIND_CDN)) {
    request = new Request(LOCAL_TAILWIND);
  }
  if (url.pathname.startsWith('/api/') || url.pathname.includes('login')) {
    return; // This tells the SW to ignore the request and let it hit the network normally
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // FIX: Add ignoreSearch: true to handle your dynamic query parameters
      const cachedResponse = await cache.match(request, { ignoreSearch: true });

      // Create a background fetch promise
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok && event.request.method === 'GET') {
              // Create a new request object with the same URL, but stripped of query params
              const urlObj = new URL(event.request.url);
              const normalizedRequest = new Request(urlObj.origin + urlObj.pathname);

              // Cache the response against the CLEAN URL
              cache.put(normalizedRequest, networkResponse.clone());
              console.log('cached normalized:', normalizedRequest.url);
          }
          return networkResponse;
          })
        .catch(() => {
          // Fallback if network is down
          return new Response(
            "You are offline and this page hasn't been cached yet.",
            { status: 503, statusText: "Service Unavailable", headers: {'Content-Type': 'text/plain'} }
          );
        });

      // Return cached version if found, otherwise perform the fetch
      return cachedResponse || fetchPromise;
    })
  );
});

// Ensure the new service worker takes over immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});