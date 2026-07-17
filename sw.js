// sw.js — offline-first service worker.
// Offline use is MzansiLingo's core feature: after the first visit the whole
// app (shell, code, lesson content, icons) is cached and works with no network.
const CACHE = 'mzansilingo-v24';

const MASCOTS = ['lion', 'elephant', 'zebra', 'giraffe', 'hippo', 'crocodile', 'cheetah',
  'leopard', 'gorilla', 'antelope', 'meerkat', 'mandrill', 'rhino', 'buffalo']
  .map((m) => `./assets/mascots/${m}.png`);

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
  './src/gamify.js',
  './src/shop.js',
  './src/auth.js',
  './src/fx.js',
  './src/mascot.js',
  './src/mascots.js',
  './src/notify.js',
  './data/languages.json',
  './data/library.json',
  './data/courses/zu.json',
  './data/courses/xh.json',
  './data/courses/af.json',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  ...MASCOTS,
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

// ---------- daily streak reminder (no server needed) ----------
// On installed PWAs the browser wakes us ~daily. We read the streak state the
// page mirrored into Cache Storage and, if the learner hasn't studied today,
// fire a gentle local notification. Fully offline; degrades silently elsewhere.
const REMINDER_CACHE = 'mz-reminder';
const REMINDER_URL = './__mz_reminder_state';

async function maybeRemind() {
  try {
    const c = await caches.open(REMINDER_CACHE);
    const res = await c.match(REMINDER_URL);
    if (!res) return;
    const s = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    if (s.lastStudyDay === today) return;           // already practised — no nudge
    const hour = new Date().getHours();
    if (hour < (s.hourStart || 18) || hour >= (s.hourEnd || 21)) return;
    await self.registration.showNotification(s.title || 'A little practice goes a long way', {
      body: s.body || 'A few minutes of practice today builds real progress.',
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      tag: `mz-streak-reminder-${s.type || 'generic'}`,
    });
  } catch (e) { /* ignore */ }
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'mz-streak-reminder') e.waitUntil(maybeRemind());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) { if ('focus' in client) return client.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
