// gamify.js — retention mechanics: daily quests, achievements, weekly leagues,
// streak freezes and a daily login reward. These are the habit-forming layer
// that brings learners back every day (which is exactly what the spaced-
// repetition engine needs to work). All of it runs offline.

import { todayKey } from './store.js';

// ---------- date helpers ----------
function weekKey(d = new Date()) {
  // ISO-ish week key: year + week number
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Deterministic shuffle seeded by a string, so each day's quests are stable.
function seededPick(arr, n, seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return arr.map((v) => [rng(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).slice(0, n);
}

// ---------- content ----------
export const QUEST_POOL = [
  { id: 'q_lesson', text: 'Complete a lesson', goal: 1, event: 'lesson', gems: 10, icon: '📘' },
  { id: 'q_two_lessons', text: 'Complete 2 lessons', goal: 2, event: 'lesson', gems: 15, icon: '📚' },
  { id: 'q_xp', text: 'Earn 40 XP', goal: 40, event: 'xp', gems: 10, icon: '⚡' },
  { id: 'q_review', text: 'Finish a review session', goal: 1, event: 'review', gems: 15, icon: '🔁' },
  { id: 'q_perfect', text: 'Get a perfect lesson', goal: 1, event: 'perfect', gems: 15, icon: '🎯' },
  { id: 'q_reading', text: 'Read a story', goal: 1, event: 'reading', gems: 15, icon: '📖' },
  { id: 'q_listen', text: 'Do a listening session', goal: 1, event: 'listening', gems: 12, icon: '👂' },
  { id: 'q_speak', text: 'Do a speaking session', goal: 1, event: 'speaking', gems: 12, icon: '🎤' },
];

export const ACHIEVEMENTS = [
  { id: 'first_lesson', name: 'First Steps', icon: '👣', desc: 'Complete your first lesson', test: (c) => c.lang.completedLessons.length >= 1 },
  { id: 'streak_3', name: 'On a Roll', icon: '🔥', desc: '3-day streak', test: (c) => c.lang.bestStreak >= 3 },
  { id: 'streak_7', name: 'Week Warrior', icon: '🔥', desc: '7-day streak', test: (c) => c.lang.bestStreak >= 7 },
  { id: 'streak_30', name: 'Unstoppable', icon: '🏆', desc: '30-day streak', test: (c) => c.lang.bestStreak >= 30 },
  { id: 'words_25', name: 'Word Collector', icon: '🧠', desc: 'Master 25 words', test: (c) => c.metrics.mastered >= 25 },
  { id: 'words_50', name: 'Vocabulary Builder', icon: '🧠', desc: 'Master 50 words', test: (c) => c.metrics.mastered >= 50 },
  { id: 'perfect_5', name: 'Sharpshooter', icon: '🎯', desc: '5 perfect lessons', test: (c) => (c.lang.perfectLessons || 0) >= 5 },
  { id: 'reader', name: 'Bookworm', icon: '📖', desc: 'Read your first story', test: (c) => (c.lang.readingsCompleted || 0) >= 1 },
  { id: 'reader_5', name: 'Storyteller', icon: '📚', desc: 'Read 5 stories', test: (c) => (c.lang.readingsCompleted || 0) >= 5 },
  { id: 'unit_1', name: 'Basics Complete', icon: '🧩', desc: 'Finish your first full unit', test: (c) => (c.lang.completedUnits || []).length >= 1 },
  { id: 'unit_2', name: 'Conversation Ready', icon: '💬', desc: 'Finish two full units', test: (c) => (c.lang.completedUnits || []).length >= 2 },
  { id: 'unit_3', name: 'Everyday Explorer', icon: '🗺️', desc: 'Finish three full units', test: (c) => (c.lang.completedUnits || []).length >= 3 },
  { id: 'polyglot', name: 'Polyglot', icon: '🌍', desc: 'Study 2 languages', test: (c) => (c.state.studiedLangs || []).length >= 2 },
  { id: 'xp_500', name: 'Rising Star', icon: '⭐', desc: 'Earn 500 XP', test: (c) => c.lang.xp >= 500 },
  { id: 'xp_1000', name: 'Superstar', icon: '🌟', desc: 'Earn 1000 XP', test: (c) => c.lang.xp >= 1000 },
];

export const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby', 'Diamond'];
const LEAGUE_ICON = { Bronze: '🥉', Silver: '🥈', Gold: '🥇', Sapphire: '🔷', Ruby: '♦️', Diamond: '💎' };
// Weekly XP needed to advance to the next league.
const LEAGUE_TARGET = [120, 180, 250, 350, 500, 700];
const DAILY_REWARD = [5, 5, 10, 10, 15, 20, 30]; // gems by consecutive-claim day

export function leagueIcon(name) { return LEAGUE_ICON[name] || '🥉'; }
export function leagueTarget(tierIndex) { return LEAGUE_TARGET[Math.min(tierIndex, LEAGUE_TARGET.length - 1)]; }

// ---------- living weekly leaderboard ----------
// The league used to be a solo XP bar, which feels hollow. Instead we put the
// learner in a cohort of 15 with named rivals whose XP grows realistically
// through the week. It's fully deterministic (seeded by week + tier), so the
// standings are stable across reloads but climb with real time — no server,
// works offline. Top 5 promote, bottom 5 demote, just like the big apps.
export const LEAGUE_SIZE = 15;
export const PROMOTE_ZONE = 5;
export const DEMOTE_ZONE = 5;

const RIVAL_NAMES = [
  'Thabo', 'Nandi', 'Sipho', 'Lerato', 'Bongani', 'Zanele', 'Ayanda', 'Kgosi',
  'Naledi', 'Lindiwe', 'Sibusiso', 'Palesa', 'Mandla', 'Nomvula', 'Kabelo',
  'Refilwe', 'Tshepo', 'Anele', 'Busisiwe', 'Katlego', 'Dumisani', 'Zinhle',
  'Lwazi', 'Mpho', 'Nosipho', 'Siyabonga', 'Khanya', 'Olwethu',
];

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fraction of the current week elapsed, 0..7 (Monday is the start of the week).
function weekElapsedDays(now = Date.now()) {
  const d = new Date(now);
  const dayNum = (d.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNum, 0, 0, 0, 0);
  return Math.max(0, Math.min(7, (now - monday.getTime()) / 86400000));
}

// A rival's full-week XP — stable for a given week/tier/slot, scaled so the
// promotion line sits around the middle of the pack at higher tiers.
function rivalFullWeek(weekKey, tier, i) {
  const rng = mulberry(hashStr(`${weekKey}|${tier}|${i}`));
  return Math.round(leagueTarget(tier) * (0.45 + rng() * 1.55)); // 0.45x .. 2.0x
}

// Ranked standings: rivals at their current pace + the learner's real XP.
function standingsFor(weekKey, tier, userXp, elapsed) {
  const names = seededPick(RIVAL_NAMES, LEAGUE_SIZE - 1, `${weekKey}|${tier}|names`);
  const rows = names.map((name, i) => ({
    name, you: false,
    xp: Math.round(rivalFullWeek(weekKey, tier, i) * (elapsed / 7)),
  }));
  rows.push({ name: 'You', you: true, xp: Math.max(0, Math.round(userXp || 0)) });
  rows.sort((a, b) => (b.xp - a.xp) || (a.you ? 1 : b.you ? -1 : 0));
  return rows.map((r, idx) => ({
    ...r, rank: idx + 1,
    zone: idx < PROMOTE_ZONE ? 'up' : idx >= LEAGUE_SIZE - DEMOTE_ZONE ? 'down' : 'mid',
  }));
}

export function leagueStandings(store, now = Date.now()) {
  ensureWeek(store);
  const lg = store.lang().league;
  return standingsFor(lg.weekKey, lg.tier, lg.weeklyXp, weekElapsedDays(now));
}

export function leagueRank(store, now = Date.now()) {
  const me = leagueStandings(store, now).find((r) => r.you);
  return { rank: me.rank, size: LEAGUE_SIZE, zone: me.zone, xp: me.xp };
}

function missedDays(lastStudyDay) {
  if (!lastStudyDay) return 0;
  const diff = Math.floor((new Date(`${todayKey()}T00:00:00Z`) - new Date(`${lastStudyDay}T00:00:00Z`)) / 86400000);
  return Math.max(0, diff - 1);
}

function toughestWord(store) {
  const L = store.lang();
  const rows = Object.entries(L.items || {})
    .filter(([, it]) => it.seen >= 2 && (it.correct / it.seen) < 1)
    .map(([id, it]) => ({ id, acc: it.correct / it.seen }))
    .sort((a, b) => a.acc - b.acc);
  return rows[0] || null;
}

function questPoolFor(store) {
  const L = store.lang();
  const pool = [...QUEST_POOL];
  const due = store.dueItems().length;
  if (due >= 3) pool.push({ id: 'q_overdue_mastery', text: `Master ${Math.min(3, due)} overdue word${Math.min(3, due) === 1 ? '' : 's'}`, goal: Math.min(3, due), event: 'mastered_due', gems: 18, icon: '🧠' });
  const hard = toughestWord(store);
  if (hard) pool.push({ id: 'q_toughest', text: 'Fix your toughest word', goal: 1, event: 'tough_word', gems: 16, icon: '🩹' });
  if ((L.readingsCompleted || 0) >= 0) pool.push({ id: 'q_story_sharp', text: 'Finish a story with 90%+ accuracy', goal: 1, event: 'story_sharp', gems: 18, icon: '📖' });
  if (missedDays(L.lastStudyDay) >= 1) pool.push({ id: 'q_recovery', text: 'Recovery mission: do one short review', goal: 1, event: 'recovery', gems: 20, icon: '🌱' });
  return pool;
}

// ---------- daily / weekly rollover ----------
export function ensureDaily(store) {
  const L = store.lang();
  const tk = todayKey();
  if (!L.quests || L.quests.dayKey !== tk) {
    const pool = questPoolFor(store);
    const must = [];
    const recovery = pool.find((q) => q.id === 'q_recovery');
    if (recovery) must.push(recovery);
    const rest = pool.filter((q) => !must.some((m) => m.id === q.id));
    const picked = [...must, ...seededPick(rest, Math.max(0, 3 - must.length), tk + (store.state.activeLang || ''))].slice(0, 3);
    L.quests = {
      dayKey: tk,
      defs: picked,
      items: picked.map((q) => ({ id: q.id, progress: 0, claimed: false })),
    };
    store.save();
  }
}

export function ensureWeek(store) {
  const L = store.lang();
  const wk = weekKey();
  if (!L.league) { L.league = { weekKey: wk, weeklyXp: 0, tier: 0 }; store.save(); return; }
  if (L.league.weekKey !== wk) {
    // settle the finished week by final leaderboard position (full week elapsed):
    // top 5 promote, bottom 5 demote — same shape players expect from leagues.
    const prev = L.league;
    const me = standingsFor(prev.weekKey, prev.tier, prev.weeklyXp, 7).find((r) => r.you);
    let tier = prev.tier;
    if (me.rank <= PROMOTE_ZONE) tier = Math.min(LEAGUES.length - 1, tier + 1);
    else if (me.rank > LEAGUE_SIZE - DEMOTE_ZONE) tier = Math.max(0, tier - 1);
    L.league = { weekKey: wk, weeklyXp: 0, tier, lastRank: me.rank, lastTier: prev.tier };
    store.save();
  }
}

export function questDefs(store) {
  const L = store.lang();
  if (!L.quests) ensureDaily(store);
  const defs = (L.quests && L.quests.defs) || [];
  return L.quests.items.map((it) => ({ ...(defs.find((q) => q.id === it.id) || QUEST_POOL.find((q) => q.id === it.id)), ...it }));
}

// ---------- event tracking ----------
// Returns { quests:[completed quest defs], achievements:[unlocked defs], gems:gained }
export function track(store, event, payload = {}) {
  ensureDaily(store);
  ensureWeek(store);
  const L = store.lang();
  const result = { quests: [], achievements: [], gems: 0 };

  // counters used by quests/achievements
  if (event === 'lesson' && payload.mistakes === 0) { L.perfectLessons = (L.perfectLessons || 0) + 1; }
  if (event === 'reading') { L.readingsCompleted = (L.readingsCompleted || 0) + 1; }
  if (event === 'xp') { L.league.weeklyXp += (payload.amount || 0); }

  // advance quests
  const defs = (L.quests && L.quests.defs) || QUEST_POOL;
  for (const item of L.quests.items) {
    if (item.claimed) continue;
    const def = defs.find((q) => q.id === item.id);
    if (!def) continue;
    let matched = def.event === event;
    if (def.event === 'perfect' && event === 'lesson') matched = payload.mistakes === 0;
    if (!matched) continue;
    item.progress += def.event === 'xp' ? (payload.amount || 0) : 1;
    if (item.progress >= def.goal && !item.claimed) {
      item.claimed = true;
      store.state.gems = (store.state.gems || 0) + def.gems;
      result.gems += def.gems;
      result.quests.push(def);
    }
  }

  result.achievements = checkAchievements(store);
  store.save();
  return result;
}

// ---------- achievements ----------
export function checkAchievements(store) {
  const ctx = { metrics: store.metrics(), lang: store.lang(), state: store.state };
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (store.state.achievements[a.id]) continue;
    try {
      if (a.test(ctx)) { store.state.achievements[a.id] = todayKey(); unlocked.push(a); store.state.gems = (store.state.gems || 0) + 20; }
    } catch (e) { /* ignore */ }
  }
  if (unlocked.length) store.save();
  return unlocked;
}

// ---------- daily login reward ----------
export function dailyRewardStatus(store) {
  const dr = store.state.dailyReward || (store.state.dailyReward = { lastClaim: null, streak: 0 });
  return { canClaim: dr.lastClaim !== todayKey(), nextGems: DAILY_REWARD[Math.min(dr.streak, DAILY_REWARD.length - 1)], streak: dr.streak };
}

export function claimDailyReward(store) {
  const dr = store.state.dailyReward || (store.state.dailyReward = { lastClaim: null, streak: 0 });
  if (dr.lastClaim === todayKey()) return null;
  const yest = todayKey(new Date(Date.now() - 86400000));
  dr.streak = dr.lastClaim === yest ? dr.streak + 1 : 1;
  const gems = DAILY_REWARD[Math.min(dr.streak - 1, DAILY_REWARD.length - 1)];
  dr.lastClaim = todayKey();
  store.state.gems = (store.state.gems || 0) + gems;
  store.save();
  return { gems, streak: dr.streak };
}

// ---------- gems economy ----------
export function gems(store) { return store.state.gems || 0; }
export function buyStreakFreeze(store, cost = 50) {
  if ((store.state.gems || 0) < cost) return false;
  store.state.gems -= cost;
  const L = store.lang();
  L.streakFreezes = (L.streakFreezes || 0) + 1;
  store.save();
  return true;
}
export function buyHeartsRefill(store, cost = 30) {
  if ((store.state.gems || 0) < cost) return false;
  store.state.gems -= cost;
  store.refillHearts();
  store.save();
  return true;
}

export { weekKey };
