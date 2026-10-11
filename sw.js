/*
 * Service worker: makes the app installable and usable offline (for example
 * for calls between two devices on the same Wi-Fi without any internet).
 *
 * Strategy: network first, so updates are picked up as soon as you are online,
 * with the cached copy as the fallback. Only same-origin GET requests are
 * handled and nothing else is ever stored.
 */
const CACHE = 'spv-v2.0.0';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/util.js',
  'js/crypto.js',
  'js/codec.js',
  'js/sas.js',
  'js/qr.js',
  'js/call.js',
  'js/i18n.js',
  'js/ui.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
