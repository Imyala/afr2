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

import { todayKey, missedDaysSince } from './store.js';

const REMINDER_URL = './__mz_reminder_state';   // virtual cache entry the SW reads
const CACHE = 'mz-reminder';
const TAG = 'mz-streak-reminder';
const WINDOWS = {
  morning: { start: 7, end: 10 },
  after_school: { start: 15, end: 18 },
  evening: { start: 18, end: 21 },
  anytime: { start: 10, end: 20 },
};

export function supported() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

export function permission() {
  return supported() ? Notification.permission : 'denied';
}

export function isEnabled(store) {
  return !!(store.state.settings && store.state.settings.remindersOn) && permission() === 'granted';
}

function reminderWindow(store) {
  const key = (store.state.settings && store.state.settings.reminderWindow) || 'after_school';
  return { key, ...(WINDOWS[key] || WINDOWS.after_school) };
}

function reminderCopy(state) {
  if (state.missedDays >= 2) {
    return {
      type: 'win_back',
      title: 'A gentle restart is ready 🌱',
      body: state.dueCount
        ? 'No pressure - just do a small confidence-building review and pick the habit back up.'
        : 'A few calm minutes today will get the habit moving again.',
    };
  }
  if (state.missedDays >= 1 && state.streak > 0) {
    return {
      type: 'streak_risk',
      title: 'Your streak could use a tiny top-up 🔥',
      body: `You’re on a ${state.streak}-day streak. Even a 2-minute lesson keeps the rhythm going.`,
    };
  }
  if (state.unfinishedPlan) {
    return {
      type: 'unfinished_plan',
      title: 'Your plan is already underway 📅',
      body: `You’ve started today’s loop — ${state.planDone}/${state.planTotal} steps done so far.`,
    };
  }
  if (state.dueCount > 0) {
    return {
      type: 'reviews_due',
      title: 'A few reviews are ready 🔁',
      body: `${state.dueCount} word${state.dueCount === 1 ? '' : 's'} are due. A short review now will make them stick.`,
    };
  }
  if (state.openQuests > 0) {
    return {
      type: 'quest_expiring',
      title: 'A quest is still open 🎯',
      body: `${state.openQuests} daily quest${state.openQuests === 1 ? '' : 's'} still have rewards waiting if you feel like a short session.`,
    };
  }
  return {
    type: 'generic',
    title: 'A little practice goes a long way',
    body: 'A few minutes today is enough to keep real progress moving.',
  };
}

// Mirror the learner's streak status into Cache Storage for the SW to read.
export async function syncState(store) {
  if (!('caches' in window)) return;
  const L = store.lang() || {};
  const win = reminderWindow(store);
  const dueCount = store.state.activeLang ? store.dueItems().length : 0;
  const unfinishedPlan = !!(L.plan && Object.values(L.plan.done || {}).some((x) => !x));
  const openQuests = (L.quests && L.quests.items ? L.quests.items.filter((q) => !q.claimed).length : 0);
  const payload = {
    lastStudyDay: L.lastStudyDay || null,
    streak: L.streak || 0,
    hourStart: win.start,
    hourEnd: win.end,
    dueCount,
    unfinishedPlan,
    planDone: L.plan ? Object.values(L.plan.done || {}).filter(Boolean).length : 0,
    planTotal: L.plan ? Object.keys(L.plan.done || {}).length : 0,
    openQuests,
    missedDays: missedDaysSince(L.lastStudyDay, todayKey()),
    ...reminderCopy({
      streak: L.streak || 0,
      dueCount,
      unfinishedPlan,
      planDone: L.plan ? Object.values(L.plan.done || {}).filter(Boolean).length : 0,
      planTotal: L.plan ? Object.keys(L.plan.done || {}).length : 0,
      openQuests,
      missedDays: missedDaysSince(L.lastStudyDay, todayKey()),
    }),
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
  const win = reminderWindow(store);
  const now = new Date();
  const inWindow = now.getHours() >= win.start && now.getHours() < win.end;
  if (now.getHours() >= win.end) return;
  const nextAt = inWindow
    ? Date.now() + 20 * 60 * 1000
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), win.start, 0, 0, 0).getTime();
  fallbackTimer = setTimeout(async () => {
    if ((store.lang() || {}).lastStudyDay === today) return;
    try {
      const L2 = store.lang() || {};
      const dueCount = store.state.activeLang ? store.dueItems().length : 0;
      const copy = reminderCopy({
        streak: L2.streak || 0,
        dueCount,
        unfinishedPlan: !!(L2.plan && Object.values(L2.plan.done || {}).some((x) => !x)),
        planDone: L2.plan ? Object.values(L2.plan.done || {}).filter(Boolean).length : 0,
        planTotal: L2.plan ? Object.keys(L2.plan.done || {}).length : 0,
        openQuests: (L2.quests && L2.quests.items ? L2.quests.items.filter((q) => !q.claimed).length : 0),
        missedDays: missedDaysSince(L2.lastStudyDay, todayKey()),
      });
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(copy.title, {
        body: copy.body,
        icon: 'assets/icons/icon-192.png',
        badge: 'assets/icons/icon-192.png',
        tag: `${TAG}-${copy.type}`,
      });
    } catch (e) { /* ignore */ }
  }, Math.max(1000, nextAt - Date.now()));
}
