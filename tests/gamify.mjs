// Gamification logic tests (quests, achievements, league, streak freeze,
// daily reward). Run from repo root:  node tests/gamify.mjs
import './_setup.mjs';
import { store } from '../src/store.js';
import * as G from '../src/gamify.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

store.reset();
store.setActiveLang('zu');
G.ensureDaily(store);
G.ensureWeek(store);

// --- quests ---
const quests = G.questDefs(store);
ok(quests.length === 3, 'three daily quests generated');
ok(quests.every((q) => q.text && q.goal >= 1), 'quests have text + goal');

// earning XP advances the league and any XP quest
const before = store.lang().league.weeklyXp;
G.track(store, 'xp', { amount: 50 });
ok(store.lang().league.weeklyXp === before + 50, 'XP accrues to weekly league total');

// completing a lesson can complete a lesson quest + grant gems
const gemsBefore = G.gems(store);
const r = G.track(store, 'lesson', { mistakes: 0 });
ok(store.lang().perfectLessons === 1, 'perfect lesson counter increments');
ok(G.gems(store) >= gemsBefore, 'gems never decrease on a positive event');

// --- achievements ---
store.completeLesson('zu-u1-l1', 3);
const unlocked = G.checkAchievements(store);
ok(store.state.achievements['first_lesson'], 'first_lesson badge unlocks after a lesson');

// polyglot: study a second language
store.setActiveLang('xh');
G.checkAchievements(store);
ok(store.state.achievements['polyglot'], 'polyglot badge unlocks with 2 languages');

// --- daily reward ---
store.setActiveLang('zu');
const st = G.dailyRewardStatus(store);
ok(st.canClaim === true, 'daily reward claimable on first visit of the day');
const claim = G.claimDailyReward(store);
ok(claim && claim.gems > 0, 'claiming daily reward grants gems');
ok(G.dailyRewardStatus(store).canClaim === false, 'cannot claim twice in one day');

// --- streak freeze ---
store.state.gems = 100;
const boughtFreeze = G.buyStreakFreeze(store);
ok(boughtFreeze && store.lang().streakFreezes === 1, 'can buy a streak freeze with gems');
// simulate: studied two days ago, missed yesterday -> freeze should save the streak
const L = store.lang();
L.streak = 5;
L.lastStudyDay = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
store.markStudiedToday();
ok(L.streak === 6 && L.streakFreezes === 0, 'streak freeze preserves streak across one missed day');

// --- league rollover promotes on hitting target ---
store.reset();
store.setActiveLang('zu');
G.ensureWeek(store);
store.lang().league.weeklyXp = 999;       // beat the bronze target
store.lang().league.weekKey = '2000-W01'; // force a stale week so rollover settles
G.ensureWeek(store);
ok(store.lang().league.tier === 1, 'league promotes when weekly target is met');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
