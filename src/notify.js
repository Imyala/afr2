// notify.js — daily streak reminders.
//
// True server push needs a backend (VAPID keys + a push service), which this
// offline-first static app deliberately doesn't have. Instead we use what works
// with NO server:
//   • Periodic Background Sync — on installed PWAs (Android/Chrome) the service
//     worker wakes ~once a day and, if you haven't studied today, fires a local
//     notification. This is the real "come back" nudge.
//   • A same-session fallback timer for browsers without periodic sync, so a
//     reminder still fires if the tab is left open.
// We write the streak state into the Cache Storage so the service worker (which
// can't read localStorage) can decide whether a reminder is due.

const REMINDER_URL = './__mz_reminder_state';   // virtual cache entry the SW reads
const CACHE = 'mz-reminder';
const TAG = 'mz-streak-reminder';

export function supported() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

export function permission() {
  return supported() ? Notification.permission : 'denied';
}

export function isEnabled(store) {
  return !!(store.state.settings && store.state.settings.remindersOn) && permission() === 'granted';
}

// Mirror the learner's streak status into Cache Storage for the SW to read.
export async function syncState(store) {
  if (!('caches' in window)) return;
  const L = store.lang() || {};
  const payload = {
    lastStudyDay: L.lastStudyDay || null,
    streak: L.streak || 0,
    hour: 18,                  // don't nudge before ~6pm local-ish (SW compares UTC roughly)
    updatedAt: Date.now(),
  };
  try {
    const c = await caches.open(CACHE);
    await c.put(REMINDER_URL, new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }));
  } catch (e) { /* storage unavailable */ }
}

// Ask permission and turn reminders on. Returns the resulting permission string.
export async function enable(store) {
  if (!supported()) return 'unsupported';
  let perm = Notification.permission;
  if (perm === 'default') {
    try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; }
  }
  if (perm !== 'granted') return perm;

  store.state.settings.remindersOn = true;
  store.save();
  await syncState(store);

  // Best-effort periodic background sync (installed PWA only).
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => ({ state: 'granted' }));
      if (status.state === 'granted') {
        await reg.periodicSync.register(TAG, { minInterval: 12 * 60 * 60 * 1000 }); // ~twice a day
      }
    }
  } catch (e) { /* not supported — same-session fallback below still applies */ }

  return 'granted';
}

export async function disable(store) {
  store.state.settings.remindersOn = false;
  store.save();
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) await reg.periodicSync.unregister(TAG);
  } catch (e) { /* ignore */ }
}

// Same-session safety net: if the page stays open past the evening and the
// learner hasn't studied today, show one gentle reminder. Cleared on navigation.
let fallbackTimer = null;
export function armSessionFallback(store) {
  if (!isEnabled(store)) return;
  clearTimeout(fallbackTimer);
  const L = store.lang() || {};
  const today = new Date().toISOString().slice(0, 10);
  if (L.lastStudyDay === today) return; // already studied — no nudge needed
  // fire in 20 minutes if still idle
  fallbackTimer = setTimeout(async () => {
    if ((store.lang() || {}).lastStudyDay === today) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification('Don\'t lose your streak! 🔥', {
        body: `You have a ${L.streak || 0}-day streak going. A 2-minute lesson keeps it alive.`,
        icon: 'assets/icons/icon-192.png',
        badge: 'assets/icons/icon-192.png',
        tag: TAG,
      });
    } catch (e) { /* ignore */ }
  }, 20 * 60 * 1000);
}
