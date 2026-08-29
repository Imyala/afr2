// Cloud accounts & sync tests. Run from the repo root:  node tests/sync.mjs
//
// 1. Unit tests for the two-device merge rules (nobody loses work).
// 2. The real client (src/cloud.js) exercised end-to-end — signup, login,
//    token refresh + retry, push, pull — against an in-process fake of the
//    two Supabase REST endpoints (GoTrue auth + PostgREST saves), including
//    the row-level-security rule that a user can only touch their own row.
import './_setup.mjs';
import { createServer } from 'node:http';
import * as Cloud from '../src/cloud.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// ---------- merge rules ----------
const day = (n) => `2026-08-${String(n).padStart(2, '0')}`;

{
  // a brand-new device adopts the cloud identity wholesale
  const fresh = { settings: { onboarded: false }, activeLang: null, langs: {}, gems: 0 };
  const cloud = { settings: { onboarded: true, dailyGoalXP: 50 }, activeLang: 'af', learnerProfile: { goal: 'school' }, langs: { af: { xp: 300, completedLessons: ['af-u1-l1'] } }, gems: 40 };
  const m = Cloud.mergeStates(fresh, cloud);
  ok(m.activeLang === 'af' && m.settings.onboarded === true && m.settings.dailyGoalXP === 50, 'fresh device adopts cloud settings + language');
  ok(m.gems === 40 && m.langs.af.xp === 300, 'fresh device adopts cloud progress');
}

{
  // two devices that both practised: unions and "most progressed wins"
  const a = {
    settings: { onboarded: true }, activeLang: 'af', gems: 120, premium: false,
    achievements: { first_lesson: day(1) }, studiedLangs: ['af'],
    langs: { af: {
      completedLessons: ['l1', 'l2'], lessonStars: { l1: 3, l2: 1 },
      items: { w1: { reps: 5, due: 100 }, w2: { reps: 1, due: 50 } },
      xp: 400, streak: 4, lastStudyDay: day(20), bestStreak: 6,
      todayKey: day(20), xpToday: 30, unitChests: { u1: day(18) },
      league: { weekKey: '2026-W34', weeklyXp: 90, tier: 1, bestWeekXp: 200 },
    } },
  };
  const b = {
    settings: { onboarded: true }, activeLang: 'af', gems: 90, premium: true,
    achievements: { on_a_roll: day(2) }, studiedLangs: ['af', 'zu'],
    langs: { af: {
      completedLessons: ['l2', 'l3'], lessonStars: { l2: 3 },
      items: { w1: { reps: 2, due: 999 }, w3: { reps: 4, due: 70 } },
      xp: 350, streak: 9, lastStudyDay: day(22), bestStreak: 9,
      todayKey: day(22), xpToday: 10, unitChests: { u2: day(21) },
      league: { weekKey: '2026-W34', weeklyXp: 140, tier: 0, bestWeekXp: 150 },
    }, zu: { xp: 50, completedLessons: ['z1'] } },
  };
  const m = Cloud.mergeStates(a, b);
  const L = m.langs.af;
  ok(L.completedLessons.sort().join() === 'l1,l2,l3', 'completed lessons union');
  ok(L.lessonStars.l1 === 3 && L.lessonStars.l2 === 3, 'lesson stars take the best of both');
  ok(L.items.w1.reps === 5 && L.items.w2 && L.items.w3, 'SRS records: most-progressed wins, nothing is lost');
  ok(L.xp === 400 && L.bestStreak === 9, 'counters take the max');
  ok(L.streak === 9 && L.lastStudyDay === day(22), 'streak follows the most recent study day');
  ok(L.todayKey === day(22) && L.xpToday === 10, "today's XP follows the later day");
  ok(L.unitChests.u1 && L.unitChests.u2, 'opened chests union');
  ok(L.league.weeklyXp === 140 && L.league.tier === 1 && L.league.bestWeekXp === 200, 'same league week: best of both, record kept');
  ok(m.gems === 120 && m.premium === true, 'gems max; premium sticks');
  ok(m.achievements.first_lesson && m.achievements.on_a_roll, 'achievements union');
  ok(m.langs.zu && m.langs.zu.xp === 50, 'languages only on the other device come across');
  ok(m.studiedLangs.sort().join() === 'af,zu', 'studied languages union');
}

{
  // later league week wins outright
  const a = { settings: { onboarded: true }, activeLang: 'af', langs: { af: { league: { weekKey: '2026-W35', weeklyXp: 10, tier: 2, bestWeekXp: 100 } } } };
  const b = { settings: { onboarded: true }, activeLang: 'af', langs: { af: { league: { weekKey: '2026-W34', weeklyXp: 500, tier: 1, bestWeekXp: 500 } } } };
  const L = Cloud.mergeStates(a, b).langs.af;
  ok(L.league.weekKey === '2026-W35' && L.league.tier === 2, 'later league week wins');
  ok(L.league.bestWeekXp === 500, 'best-week record survives from the older week');
}

// ---------- fake Supabase (GoTrue + PostgREST) ----------
const users = new Map();     // email -> { id, email, password, name }
const tokens = new Map();    // access_token -> user id
const refreshes = new Map(); // refresh_token -> user id
const saves = new Map();     // user id -> { state, updated_at }
let seq = 0;

const tokenPayload = (u) => {
  const access = `at_${++seq}`;
  const refresh = `rt_${++seq}`;
  tokens.set(access, u.id);
  refreshes.set(refresh, u.id);
  return { access_token: access, refresh_token: refresh, expires_in: 3600, user: { id: u.id, email: u.email, user_metadata: { name: u.name } } };
};

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const url = new URL(req.url, 'http://x');
    const json = body ? JSON.parse(body) : {};
    const bearer = (req.headers.authorization || '').replace('Bearer ', '');

    if (req.method === 'POST' && url.pathname === '/auth/v1/signup') {
      if (users.has(json.email)) return send(400, { msg: 'User already registered' });
      const u = { id: `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`, email: json.email, password: json.password, name: json.data && json.data.name };
      users.set(u.email, u);
      return send(200, tokenPayload(u));
    }
    if (req.method === 'POST' && url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        const u = users.get(json.email);
        if (!u || u.password !== json.password) return send(400, { error_description: 'Invalid login credentials' });
        return send(200, tokenPayload(u));
      }
      const uid = refreshes.get(json.refresh_token);
      if (!uid) return send(400, { error_description: 'Invalid refresh token' });
      refreshes.delete(json.refresh_token);
      const u = [...users.values()].find((x) => x.id === uid);
      return send(200, tokenPayload(u));
    }
    if (req.method === 'POST' && url.pathname === '/auth/v1/logout') return send(204);

    // PostgREST /saves — RLS: only the token's own row
    const uid = tokens.get(bearer);
    if (url.pathname === '/rest/v1/saves') {
      if (!uid) return send(401, { message: 'JWT expired' });
      if (req.method === 'GET') {
        const row = saves.get(uid);
        return send(200, row ? [row] : []);
      }
      if (req.method === 'POST') {
        const row = Array.isArray(json) ? json[0] : json;
        if (row.user_id !== uid) return send(403, { message: 'new row violates row-level security' });
        saves.set(uid, { state: row.state, updated_at: new Date().toISOString() });
        return send(201);
      }
    }
    send(404, { message: 'not found' });
  });
});
await new Promise((r) => server.listen(0, r));
Cloud._setConfig({ url: `http://localhost:${server.address().port}`, anonKey: 'test-anon' });

// ---------- client end-to-end ----------
const bad = await Cloud.signIn('nobody@example.com', 'x');
ok(!!bad.error, 'login before signup fails with a readable error');

const su = await Cloud.signUp('thabo@example.com', 'correct horse battery', 'Thabo');
ok(!!(su.session && su.session.access_token), 'signup returns a live session');
ok(Cloud.user().email === 'thabo@example.com' && Cloud.user().name === 'Thabo', 'session user is stored with name');

const dup = await Cloud.signUp('thabo@example.com', 'other', 'T');
ok(!!dup.error, 'duplicate signup surfaces the server message');

const state1 = { settings: { onboarded: true }, activeLang: 'af', gems: 10, langs: { af: { xp: 100, completedLessons: ['l1'] } } };
ok(await Cloud.pushSave(state1) === true, 'push stores the save');
const row = await Cloud.pullSave();
ok(row && row.state.langs.af.xp === 100, 'pull returns what was pushed');

// stale access token: authedFetch refreshes and retries transparently
tokens.clear();
const rowAfterRefresh = await Cloud.pullSave();
ok(rowAfterRefresh && rowAfterRefresh.state.gems === 10, 'a stale token is refreshed and the request retried');

// RLS: pushing somebody else's user_id is rejected by the server
{
  const realUser = Cloud.user();
  const res = await fetch(`http://localhost:${server.address().port}/rest/v1/saves?on_conflict=user_id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${[...tokens.keys()][0]}` },
    body: JSON.stringify([{ user_id: 'someone-else', state: {} }]),
  });
  ok(res.status === 403, 'row-level security rejects writes to another user\'s row');
  ok(realUser.id !== 'someone-else', 'sanity: distinct ids');
}

// second device: login, pull, merge — both devices' work survives
{
  const login = await Cloud.signIn('thabo@example.com', 'correct horse battery');
  ok(!!login.session, 'second-device login succeeds');
  const device2 = { settings: { onboarded: true }, activeLang: 'af', gems: 25, langs: { af: { xp: 60, completedLessons: ['l2'] } } };
  const cloudRow = await Cloud.pullSave();
  const merged = Cloud.mergeStates(device2, cloudRow.state);
  ok(merged.langs.af.completedLessons.sort().join() === 'l1,l2', 'device 2 merge keeps both devices\' lessons');
  ok(merged.gems === 25 && merged.langs.af.xp === 100, 'merge takes the max of each device');
  ok(await Cloud.pushSave(merged) === true, 'merged state pushes back up');
  const back = await Cloud.pullSave();
  ok(back.state.langs.af.completedLessons.length === 2, 'cloud now holds the merged truth');
}

await Cloud.signOut();
ok(Cloud.session() === null, 'sign out clears the session');

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
