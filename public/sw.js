const CACHE_NAME = 'nostrlab-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
];

// Install: pre-cache core static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for static assets, network-first for everything else
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip WebSocket (relay) connections
  if (url.protocol === 'wss:' || url.protocol === 'ws:') return;

  // Network-first for API / relay HTTP requests
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets (js, css, images, fonts)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for navigation and everything else
  event.respondWith(networkFirst(request));
});

function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)(\?.*)?$/.test(pathname);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback();
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlineFallback();
  }
}

function offlineFallback() {
  return new Response(
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Offline - NostrLab</title><style>body{font-family:system-ui,sans-serif;background:#0a0a14;color:#e0d6ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}h1{font-size:1.5rem;color:#bf5af2}p{color:#9088b0}</style></head><body><div><h1>You are offline</h1><p>NostrLab requires a network connection to communicate with Nostr relays.</p><p>Please check your connection and try again.</p></div></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html' } }
  );
}
