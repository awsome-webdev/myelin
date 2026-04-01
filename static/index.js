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
  const url = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate';

  // 1. STRATEGIC BYPASS (Let Flask handle Auth routes directly)
  if (
    url.pathname.startsWith('/api/') || 
    url.pathname.includes('login') || 
    url.pathname.includes('register') ||
    url.pathname.includes('logout')
  ) {
    return;
  }

  // 2. INTERCEPT TAILWIND
  let requestToProcess = event.request;
  if (event.request.url.startsWith(TAILWIND_CDN)) {
    requestToProcess = new Request(LOCAL_TAILWIND);
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Check cache first (we'll need this for fallbacks)
      const cachedResponse = await cache.match(requestToProcess, { ignoreSearch: true });

      // 3. NAVIGATION LOGIC (Pages like /dash)
      if (isNavigation) {
        // CRITICAL: Force the fetch to NOT follow redirects silently
        const navRequest = new Request(requestToProcess, { redirect: 'manual' });

        return fetch(navRequest)
          .then((networkResponse) => {
            // Did Flask send a 302 Redirect? 
            // In 'manual' mode, redirects show up as type 'opaqueredirect' or statuses in the 300s
            if (networkResponse.type === 'opaqueredirect' || (networkResponse.status >= 300 && networkResponse.status < 400)) {
              // Return the redirect instruction straight to the browser so the URL bar changes
              return networkResponse;
            }

            // If it's a normal 200 OK page load, cache it for offline use
            if (networkResponse.ok) {
              cache.put(requestToProcess, networkResponse.clone());
            }

            return networkResponse;
          })
          .catch(() => {
            // Network is down. Try the cache, otherwise show the offline page.
            return cachedResponse || new Response(
              "<h1>Offline</h1><p>You are offline and this page isn't cached.</p>",
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
      }

      // 4. ASSET LOGIC (Scripts, CSS, Images - Stale-While-Revalidate)
      const fetchPromise = fetch(requestToProcess).then((networkResponse) => {
        if (networkResponse.ok) {
          cache.put(requestToProcess, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {
         // Silently fail for assets if offline, fallback to cache
      });

      return cachedResponse || fetchPromise;
    })
  );
});

// Ensure the new service worker takes over immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});