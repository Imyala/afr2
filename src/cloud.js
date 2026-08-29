// cloud.js — OPTIONAL accounts & cross-device sync.
//
// The app is offline-first and fully usable with no server. When a backend is
// configured (see docs/SYNC-SETUP.md) this module adds real accounts and
// progress sync on top, talking plain REST to a Supabase project:
//   - auth:  GoTrue    (POST /auth/v1/signup, /auth/v1/token, /auth/v1/logout)
//   - data:  PostgREST (GET/POST /rest/v1/saves) guarded by row-level security
// No SDK, no dependencies — a few fetch calls. With no config every export
// degrades to a harmless no-op and the app behaves exactly as before.
//
// Config resolution order:
//   1. localStorage 'mzansilingo.cloudcfg'  (dev/tests)
//   2. data/cloud.json                      (deployed config; safe to commit —
//      the anon key is public by design, row-level security does the guarding)
//
// Sync model: one row per user holding the whole store state as JSON.
//   - on login / boot with a session: pull, MERGE into local, save
//   - after local saves: debounced push (plus a keepalive flush on page hide)
// The merge is field-aware (unions, per-item "most progressed wins") so two
// devices that both practised can't wipe each other out.

const CFG_KEY = 'mzansilingo.cloudcfg';
const SESSION_KEY = 'mzansilingo.cloudsession';
const LAST_SYNC_KEY = 'mzansilingo.cloudsynced';

let cfg = null;

export function configured() { return !!(cfg && cfg.url && cfg.anonKey); }

export async function init() {
  try {
    const o = JSON.parse(localStorage.getItem(CFG_KEY));
    if (o && o.url && o.anonKey) { cfg = o; return true; }
  } catch (e) { /* no override */ }
  try {
    const res = await fetch('data/cloud.json', { cache: 'no-store' });
    if (res.ok) {
      const o = await res.json();
      if (o && o.url && o.anonKey) cfg = o;
    }
  } catch (e) { /* offline or not configured */ }
  return configured();
}

// test hook: point the client at a fake server without touching storage
export function _setConfig(o) { cfg = o; }

// ---------- session ----------
export function session() {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY)); return s && s.access_token ? s : null; } catch (e) { return null; }
}
function saveSession(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
export function user() { const s = session(); return s ? s.user : null; }

export function lastSyncedAt() {
  try { return localStorage.getItem(LAST_SYNC_KEY) || null; } catch (e) { return null; }
}
function markSynced() { try { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); } catch (e) { /* ignore */ } }

function sessionFromTokenResponse(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: { id: data.user && data.user.id, email: data.user && data.user.email, name: data.user && data.user.user_metadata && data.user.user_metadata.name },
  };
}

// ---------- auth (GoTrue REST) ----------
async function authPost(path, body) {
  const res = await fetch(`${cfg.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: cfg.anonKey },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

const authErrText = (d) =>
  (d && (d.msg || d.message || d.error_description || d.error)) || 'Something went wrong. Please try again.';

export async function signUp(email, password, name) {
  if (!configured()) return { error: 'Sync is not configured.' };
  const r = await authPost('/auth/v1/signup', { email, password, data: { name } });
  if (!r.ok) return { error: authErrText(r.data) };
  if (r.data && r.data.access_token) {
    const s = sessionFromTokenResponse(r.data);
    if (name && !s.user.name) s.user.name = name;
    saveSession(s);
    return { session: s };
  }
  // project has email confirmation turned on: account exists, no session yet
  return { needsConfirm: true };
}

export async function signIn(email, password) {
  if (!configured()) return { error: 'Sync is not configured.' };
  const r = await authPost('/auth/v1/token?grant_type=password', { email, password });
  if (!r.ok) return { error: authErrText(r.data) };
  const s = sessionFromTokenResponse(r.data);
  saveSession(s);
  return { session: s };
}

async function refreshSession() {
  const s = session();
  if (!s || !s.refresh_token) return null;
  const r = await authPost('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
  if (!r.ok || !r.data || !r.data.access_token) { clearSession(); return null; }
  const next = sessionFromTokenResponse(r.data);
  if (!next.user.id) next.user = s.user;
  saveSession(next);
  return next;
}

export async function signOut() {
  const s = session();
  clearSession();
  try { localStorage.removeItem(LAST_SYNC_KEY); } catch (e) { /* ignore */ }
  if (configured() && s) {
    try {
      await fetch(`${cfg.url}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: cfg.anonKey, authorization: `Bearer ${s.access_token}` },
      });
    } catch (e) { /* best effort */ }
  }
}

// authenticated fetch with one automatic refresh-and-retry on a stale token
async function authedFetch(path, opts = {}) {
  let s = session();
  if (!s) return null;
  if (s.expires_at && s.expires_at < Math.floor(Date.now() / 1000) + 30) s = (await refreshSession()) || s;
  const doFetch = (tok) => fetch(`${cfg.url}${path}`, {
    ...opts,
    headers: { ...(opts.headers || {}), apikey: cfg.anonKey, authorization: `Bearer ${tok}` },
  });
  let res = await doFetch(s.access_token);
  if (res.status === 401) {
    const next = await refreshSession();
    if (!next) return res;
    res = await doFetch(next.access_token);
  }
  return res;
}

// ---------- saves (PostgREST) ----------
export async function pullSave() {
  if (!configured() || !session()) return null;
  const res = await authedFetch('/rest/v1/saves?select=state,updated_at&limit=1');
  if (!res || !res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function pushSave(state, { keepalive = false } = {}) {
  const u = user();
  if (!configured() || !u || !u.id) return false;
  const res = await authedFetch('/rest/v1/saves?on_conflict=user_id', {
    method: 'POST',
    keepalive,
    headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ user_id: u.id, state, updated_at: new Date().toISOString() }]),
  });
  const ok = !!(res && res.ok);
  if (ok) markSynced();
  return ok;
}

// ---------- merge (two devices both practised — nobody loses work) ----------
const unionArr = (a = [], b = []) => Array.from(new Set([...(a || []), ...(b || [])]));
const maxNum = (a, b) => Math.max(a || 0, b || 0);
const laterStr = (a, b) => ((a || '') >= (b || '') ? a : b) || undefined;
// pick the SRS record that has progressed further (more reps; ties -> later due)
function mergeSrsMaps(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, rec] of Object.entries(b || {})) {
    const cur = out[id];
    if (!cur) { out[id] = rec; continue; }
    const better = (rec.reps || 0) > (cur.reps || 0)
      || ((rec.reps || 0) === (cur.reps || 0) && (rec.due || 0) > (cur.due || 0));
    if (better) out[id] = rec;
  }
  return out;
}
function perKeyMax(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = Math.max(out[k] || 0, v || 0);
  return out;
}
const laterBy = (a, b, key) => {
  if (!a) return b; if (!b) return a;
  return (String(a[key] || '') >= String(b[key] || '')) ? a : b;
};

function mergeLang(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  out.completedLessons = unionArr(a.completedLessons, b.completedLessons);
  out.completedReadings = unionArr(a.completedReadings, b.completedReadings);
  out.completedUnits = unionArr(a.completedUnits, b.completedUnits);
  out.completedDialogues = unionArr(a.completedDialogues, b.completedDialogues);
  out.lessonStars = perKeyMax(a.lessonStars, b.lessonStars);
  out.items = mergeSrsMaps(a.items, b.items);
  out.grammar = mergeSrsMaps(a.grammar, b.grammar);
  out.xp = maxNum(a.xp, b.xp);
  out.reviewsDone = maxNum(a.reviewsDone, b.reviewsDone);
  out.bestStreak = maxNum(a.bestStreak, b.bestStreak);
  out.perfectLessons = maxNum(a.perfectLessons, b.perfectLessons);
  out.readingsCompleted = maxNum(a.readingsCompleted, b.readingsCompleted);
  out.sentencesBuilt = maxNum(a.sentencesBuilt, b.sentencesBuilt);
  out.streakFreezes = maxNum(a.streakFreezes, b.streakFreezes);
  out.hearts = maxNum(a.hearts, b.hearts);
  out.warmupDone = !!(a.warmupDone || b.warmupDone);
  // the streak follows whichever device studied most recently
  const recent = laterBy(a, b, 'lastStudyDay');
  out.lastStudyDay = laterStr(a.lastStudyDay, b.lastStudyDay);
  out.streak = recent === a ? (a.streak || 0) : (b.streak || 0);
  // today's XP follows the later study day (same day on both -> take the max)
  if ((a.todayKey || '') === (b.todayKey || '')) { out.todayKey = a.todayKey; out.xpToday = maxNum(a.xpToday, b.xpToday); }
  else { const t = laterBy(a, b, 'todayKey'); out.todayKey = t.todayKey; out.xpToday = t.xpToday || 0; }
  out.unitChests = { ...(b.unitChests || {}), ...(a.unitChests || {}) };
  out.quests = laterBy(a.quests, b.quests, 'dayKey');
  out.wotd = laterBy(a.wotd, b.wotd, 'day');
  // the 90-day plan: whichever is further along
  out.plan = !a.plan ? b.plan : !b.plan ? a.plan : ((a.plan.day || 0) >= (b.plan.day || 0) ? a.plan : b.plan);
  // league: later week wins; same week -> best of both, records always kept
  if (a.league && b.league) {
    const w = laterBy(a.league, b.league, 'weekKey');
    out.league = { ...w };
    if ((a.league.weekKey || '') === (b.league.weekKey || '')) {
      out.league.weeklyXp = maxNum(a.league.weeklyXp, b.league.weeklyXp);
      out.league.tier = maxNum(a.league.tier, b.league.tier);
    }
    out.league.bestWeekXp = maxNum(a.league.bestWeekXp, b.league.bestWeekXp);
  } else out.league = a.league || b.league;
  out.baseline = laterBy(a.baseline, b.baseline, 'date');
  out.retest = laterBy(a.retest, b.retest, 'date');
  return out;
}

export function mergeStates(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const out = { ...local };
  // account-wide
  out.premium = !!(local.premium || remote.premium);
  out.gems = maxNum(local.gems, remote.gems);
  out.achievements = { ...(remote.achievements || {}), ...(local.achievements || {}) };
  out.studiedLangs = unionArr(local.studiedLangs, remote.studiedLangs);
  out.dailyReward = laterBy(local.dailyReward, remote.dailyReward, 'lastClaim') || local.dailyReward;
  // a device that never onboarded adopts the cloud's identity wholesale
  const localFresh = !(local.settings && local.settings.onboarded) && !local.activeLang;
  if (localFresh) {
    out.settings = remote.settings || local.settings;
    out.onboarding = remote.onboarding || local.onboarding;
    out.learnerProfile = remote.learnerProfile || local.learnerProfile;
    out.activeLang = remote.activeLang || local.activeLang;
  } else {
    out.activeLang = local.activeLang || remote.activeLang;
    out.learnerProfile = local.learnerProfile || remote.learnerProfile;
  }
  // inventory: own everything either device owns; keep this device's equips
  const li = local.inventory || {}; const ri = remote.inventory || {};
  out.inventory = {
    owned: { ...(ri.owned || {}), ...(li.owned || {}) },
    equipped: { ...(ri.equipped || {}), ...(li.equipped || {}) },
    boosts: perKeyMax(li.boosts, ri.boosts),
  };
  // per-language learning state
  out.langs = { ...(local.langs || {}) };
  for (const code of Object.keys(remote.langs || {})) {
    out.langs[code] = mergeLang((local.langs || {})[code], remote.langs[code]);
  }
  // weekly snapshots: union by week
  out.progressSnapshots = { ...(remote.progressSnapshots || {}) };
  for (const [code, snaps] of Object.entries(local.progressSnapshots || {})) {
    const remoteSnaps = out.progressSnapshots[code] || [];
    const byWeek = new Map(remoteSnaps.map((s) => [s.week, s]));
    for (const s of snaps || []) {
      const r = byWeek.get(s.week);
      if (!r || (s.mastered || 0) >= (r.mastered || 0)) byWeek.set(s.week, s);
    }
    out.progressSnapshots[code] = Array.from(byWeek.values()).sort((x, y) => String(x.week).localeCompare(String(y.week)));
  }
  return out;
}

// ---------- orchestration ----------
let pushTimer = null;

// pull the cloud save and merge it into the local store
export async function syncDown(store) {
  if (!configured() || !session()) return false;
  try {
    const row = await pullSave();
    if (row && row.state) {
      store.state = mergeStates(store.state, row.state);
      store.save();
    }
    markSynced();
    return true;
  } catch (e) { return false; }
}

// debounced push after local changes (store.save fires many times per session)
export function schedulePush(store) {
  if (!configured() || !session()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushSave(store.state).catch(() => {}); }, 4000);
}

// flush immediately (page going to background / closing)
export function flush(store) {
  if (!configured() || !session()) return;
  clearTimeout(pushTimer);
  pushSave(store.state, { keepalive: true }).catch(() => {});
}
