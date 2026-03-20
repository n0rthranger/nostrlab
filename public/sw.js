const CACHE_VERSION = 2;
const STATIC_CACHE = 'nostrlab-static-v' + CACHE_VERSION;
const FONT_CACHE = 'nostrlab-fonts-v1';

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== FONT_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip WebSocket connections
  if (url.protocol === 'wss:' || url.protocol === 'ws:') return;

  // Google Fonts: cache-first with separate long-lived cache
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fontCacheFirst(request));
    return;
  }

  // Hashed static assets (js, css with hash in filename): cache-first, immutable
  if (isHashedAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Other static assets (images, icons, etc)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // SPA navigation: serve index.html for same-origin HTML requests
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(spaNavigationHandler(request));
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(networkFirst(request));
});

// Hashed assets contain a hash in their filename (e.g., index-DHwpmiX6.js)
function isHashedAsset(pathname) {
  return /\/assets\/.*-[a-zA-Z0-9]{8,}\.(js|css)(\?.*)?$/.test(pathname);
}

function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|webp|avif)(\?.*)?$/.test(pathname);
}

// Cache-first: return cached version, or fetch and cache
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

// Font cache-first with dedicated long-lived cache
async function fontCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(FONT_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

// SPA navigation: try network, fall back to cached index.html
async function spaNavigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put('/', response.clone());
    }
    return response;
  } catch {
    // Offline: serve cached index.html for any route (SPA handles routing)
    const cached = await caches.match('/') || await caches.match('/index.html');
    if (cached) return cached;
    return offlineFallback();
  }
}

// Network-first with cache fallback
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('', { status: 503 });
  }
}

function offlineFallback() {
  return new Response(
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Offline - NostrLab</title><style>body{font-family:system-ui,sans-serif;background:#0a0a14;color:#e0d6ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}h1{font-size:1.5rem;color:#bf5af2}p{color:#9088b0}</style></head><body><div><h1>You are offline</h1><p>NostrLab requires a network connection to communicate with Nostr relays.</p><p>Please check your connection and try again.</p></div></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html' } }
  );
}
