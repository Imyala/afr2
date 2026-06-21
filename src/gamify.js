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
  { id: 'q_speak', text: 'Do a speaking exercise', goal: 1, event: 'speak', gems: 10, icon: '🗣️' },
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

// ---------- daily / weekly rollover ----------
export function ensureDaily(store) {
  const L = store.lang();
  const tk = todayKey();
  if (!L.quests || L.quests.dayKey !== tk) {
    const picked = seededPick(QUEST_POOL, 3, tk + (store.state.activeLang || ''));
    L.quests = { dayKey: tk, items: picked.map((q) => ({ id: q.id, progress: 0, claimed: false })) };
    store.save();
  }
}

export function ensureWeek(store) {
  const L = store.lang();
  const wk = weekKey();
  if (!L.league) { L.league = { weekKey: wk, weeklyXp: 0, tier: 0 }; store.save(); return; }
  if (L.league.weekKey !== wk) {
    // settle previous week: promote if target met, otherwise gentle demote
    const target = leagueTarget(L.league.tier);
    if (L.league.weeklyXp >= target) L.league.tier = Math.min(LEAGUES.length - 1, L.league.tier + 1);
    else if (L.league.weeklyXp < target * 0.4) L.league.tier = Math.max(0, L.league.tier - 1);
    L.league = { weekKey: wk, weeklyXp: 0, tier: L.league.tier };
    store.save();
  }
}

export function questDefs(store) {
  const L = store.lang();
  if (!L.quests) ensureDaily(store);
  return L.quests.items.map((it) => ({ ...QUEST_POOL.find((q) => q.id === it.id), ...it }));
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
  for (const item of L.quests.items) {
    if (item.claimed) continue;
    const def = QUEST_POOL.find((q) => q.id === item.id);
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
