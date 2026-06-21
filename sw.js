// sw.js — offline-first service worker.
// Offline use is MzansiLingo's core feature: after the first visit the whole
// app (shell, code, lesson content, icons) is cached and works with no network.
const CACHE = 'mzansilingo-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/app.js',
  './src/store.js',
  './src/srs.js',
  './src/audio.js',
  './src/lessons.js',
  './data/languages.json',
  './data/courses/zu.json',
  './data/courses/xh.json',
  './data/courses/af.json',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GETs, falling back to network and caching new
// content. This keeps the app fully usable offline while staying fresh online.
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
