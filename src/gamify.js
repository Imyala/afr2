// gamify.js — retention mechanics: daily quests, achievements, weekly leagues,
// streak freezes and a daily login reward. These are the habit-forming layer
// that brings learners back every day (which is exactly what the spaced-
// repetition engine needs to work). All of it runs offline.

import { todayKey, missedDaysSince } from './store.js';

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
  { id: 'q_say', text: 'Build 5 sentences of your own', goal: 5, event: 'sentence', gems: 14, icon: '🗣️' },
];

// Every badge carries `at` (how far the learner is now) and `goal` (what it
// takes), so a LOCKED badge can show its real art plus "12 / 25" instead of an
// anonymous padlock. `test` is derived from the pair — there is no second
// source of truth to drift.
const ACH_DEFS = [
  { id: 'first_lesson', name: 'First Steps', icon: '👣', hue: 'grass', desc: 'Complete your first lesson', goal: 1, at: (c) => c.lang.completedLessons.length },
  { id: 'streak_3', name: 'On a Roll', icon: '🔥', hue: 'flame', desc: '3-day streak', goal: 3, at: (c) => c.lang.bestStreak },
  { id: 'streak_7', name: 'Week Warrior', icon: '🔥', hue: 'flame', desc: '7-day streak', goal: 7, at: (c) => c.lang.bestStreak },
  { id: 'streak_30', name: 'Unstoppable', icon: '🏆', hue: 'sun', desc: '30-day streak', goal: 30, at: (c) => c.lang.bestStreak },
  { id: 'words_25', name: 'Word Collector', icon: '🧠', hue: 'grape', desc: 'Master 25 words', goal: 25, at: (c) => c.metrics.mastered },
  { id: 'words_50', name: 'Vocabulary Builder', icon: '🧠', hue: 'grape', desc: 'Master 50 words', goal: 50, at: (c) => c.metrics.mastered },
  { id: 'perfect_5', name: 'Sharpshooter', icon: '🎯', hue: 'berry', desc: '5 perfect lessons', goal: 5, at: (c) => c.lang.perfectLessons || 0 },
  { id: 'reader', name: 'Bookworm', icon: '📖', hue: 'sky', desc: 'Read your first story', goal: 1, at: (c) => c.lang.readingsCompleted || 0 },
  { id: 'reader_5', name: 'Storyteller', icon: '📚', hue: 'sky', desc: 'Read 5 stories', goal: 5, at: (c) => c.lang.readingsCompleted || 0 },
  { id: 'unit_1', name: 'Basics Complete', icon: '🧩', hue: 'grass', desc: 'Finish your first full unit', goal: 1, at: (c) => (c.lang.completedUnits || []).length },
  { id: 'unit_2', name: 'Conversation Ready', icon: '💬', hue: 'ocean', desc: 'Finish two full units', goal: 2, at: (c) => (c.lang.completedUnits || []).length },
  { id: 'unit_3', name: 'Everyday Explorer', icon: '🗺️', hue: 'ocean', desc: 'Finish three full units', goal: 3, at: (c) => (c.lang.completedUnits || []).length },
  { id: 'polyglot', name: 'Polyglot', icon: '🌍', hue: 'teal', desc: 'Study 2 languages', goal: 2, at: (c) => (c.state.studiedLangs || []).length },
  { id: 'xp_500', name: 'Rising Star', icon: '⭐', hue: 'sun', desc: 'Earn 500 XP', goal: 500, at: (c) => c.lang.xp },
  { id: 'xp_1000', name: 'Superstar', icon: '🌟', hue: 'sun', desc: 'Earn 1000 XP', goal: 1000, at: (c) => c.lang.xp },
  { id: 'sentences_25', name: 'Sentence Smith', icon: '🗣️', hue: 'berry', desc: 'Build 25 sentences of your own', goal: 25, at: (c) => c.lang.sentencesBuilt || 0 },
  { id: 'sentences_100', name: 'Freestyler', icon: '🎙️', hue: 'berry', desc: 'Build 100 sentences of your own', goal: 100, at: (c) => c.lang.sentencesBuilt || 0 },
];

export const ACHIEVEMENTS = ACH_DEFS.map((a) => ({ ...a, test: (c) => a.at(c) >= a.goal }));

// How close the learner is to every badge they have not earned yet — the
// Badges screen uses this to show real progress instead of a wall of locks.
export function achievementProgress(store) {
  const ctx = { metrics: store.metrics(), lang: store.lang(), state: store.state };
  const unlocked = store.state.achievements || {};
  return ACHIEVEMENTS.map((a) => {
    let at = 0;
    try { at = Number(a.at(ctx)) || 0; } catch (e) { at = 0; }
    const got = !!unlocked[a.id];
    return {
      ...a,
      got,
      date: unlocked[a.id] || null,
      at: Math.min(at, a.goal),
      pct: got ? 100 : Math.max(0, Math.min(100, Math.round((at / a.goal) * 100))),
    };
  });
}

export const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby', 'Diamond'];
const LEAGUE_ICON = { Bronze: '🥉', Silver: '🥈', Gold: '🥇', Sapphire: '🔷', Ruby: '♦️', Diamond: '💎' };
// Weekly XP needed to advance to the next league.
const LEAGUE_TARGET = [120, 180, 250, 350, 500, 700];
const DAILY_REWARD = [5, 5, 10, 10, 15, 20, 30]; // gems by consecutive-claim day

export function leagueIcon(name) { return LEAGUE_ICON[name] || '🥉'; }
export function leagueTarget(tierIndex) { return LEAGUE_TARGET[Math.min(tierIndex, LEAGUE_TARGET.length - 1)]; }

// ---------- honest weekly league ----------
// No fake rivals: the league is the learner vs their own week. Hit the tier's
// XP target to advance a league; fall under the hold floor and drop one. Your
// best-ever week is the record to beat. Fully offline, fully truthful.
// Stay above this fraction of the target to hold your current league.
const LEAGUE_HOLD = 0.4;

export function leagueHoldFloor(tierIndex) {
  return tierIndex > 0 ? Math.round(leagueTarget(tierIndex) * LEAGUE_HOLD) : 0;
}

// The learner's live standing this week: tier, XP toward the promotion
// target, and the personal record to beat.
export function leagueProgress(store) {
  ensureWeek(store);
  const lg = store.lang().league;
  const target = leagueTarget(lg.tier);
  const xp = Math.max(0, Math.round(lg.weeklyXp || 0));
  return {
    tier: lg.tier,
    name: LEAGUES[lg.tier],
    icon: leagueIcon(LEAGUES[lg.tier]),
    atTop: lg.tier >= LEAGUES.length - 1,
    weeklyXp: xp,
    target,
    toGo: Math.max(0, target - xp),
    pct: Math.min(100, Math.round((xp / target) * 100)),
    holdFloor: leagueHoldFloor(lg.tier),
    bestWeekXp: lg.bestWeekXp || 0,
    lastWeekXp: lg.lastWeekXp,
    lastOutcome: lg.lastOutcome || null, // 'up' | 'down' | 'held'
  };
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
  if (missedDaysSince(L.lastStudyDay, todayKey()) >= 1) pool.push({ id: 'q_recovery', text: 'Recovery mission: do one short review', goal: 1, event: 'recovery', gems: 20, icon: '🌱' });
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
  if (!L.league) { L.league = { weekKey: wk, weeklyXp: 0, tier: 0, bestWeekXp: 0 }; store.save(); return; }
  if (L.league.weekKey !== wk) {
    // settle the finished week honestly against the tier's own targets:
    // hit the promotion target -> up a league; fall under the hold floor -> down.
    const prev = L.league;
    const xp = Math.max(0, Math.round(prev.weeklyXp || 0));
    let tier = prev.tier;
    let outcome = 'held';
    if (xp >= leagueTarget(prev.tier)) { tier = Math.min(LEAGUES.length - 1, tier + 1); outcome = tier > prev.tier ? 'up' : 'held'; }
    else if (xp < leagueHoldFloor(prev.tier)) { tier = Math.max(0, tier - 1); outcome = tier < prev.tier ? 'down' : 'held'; }
    L.league = {
      weekKey: wk, weeklyXp: 0, tier,
      bestWeekXp: Math.max(prev.bestWeekXp || 0, xp),
      lastWeekXp: xp, lastOutcome: outcome, lastTier: prev.tier,
    };
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
    item.progress += def.event === 'xp' ? (payload.amount || 0) : (payload.amount || 1);
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
  // Project the streak the claim will ACTUALLY produce. This used to read the
  // next rung of the ladder unconditionally, so a learner who broke their
  // chain was shown "30 gems" and then paid 5 — claimDailyReward resets the
  // streak to 1 when yesterday was missed.
  const yest = todayKey(new Date(Date.now() - 86400000));
  const nextStreak = dr.lastClaim === yest ? dr.streak + 1 : 1;
  return {
    canClaim: dr.lastClaim !== todayKey(),
    nextGems: DAILY_REWARD[Math.min(nextStreak - 1, DAILY_REWARD.length - 1)],
    nextStreak,
    streak: dr.streak,
  };
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
