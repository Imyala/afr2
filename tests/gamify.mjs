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
ok(store.lang().quests.defs.length === 3, 'daily quest definitions are snapshotted for the day');

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
store.lang().completedUnits = ['zu-u1'];
G.checkAchievements(store);
ok(store.state.achievements['unit_1'], 'unit-based badge unlocks from completed units');

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

// recovery quest support after a missed day
store.reset();
store.setActiveLang('zu');
store.lang().lastStudyDay = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
G.ensureDaily(store);
ok(G.questDefs(store).some((q) => q.id === 'q_recovery'), 'recovery quest appears after a missed day');

// --- living leaderboard ---
store.reset();
store.setActiveLang('zu');
G.ensureWeek(store);
const board = G.leagueStandings(store);
ok(board.length === G.LEAGUE_SIZE, 'leaderboard has a full cohort');
ok(board.filter((r) => r.you).length === 1, 'exactly one "you" in the standings');
ok(board.every((r, i) => r.rank === i + 1), 'standings are ranked 1..N in order');
ok(board[0].xp >= board[board.length - 1].xp, 'standings sorted by XP descending');
// a big XP haul should rank the learner near the top
store.lang().league.weeklyXp = 99999;
const top = G.leagueRank(store);
ok(top.rank === 1 && top.zone === 'up', 'huge weekly XP puts you first, in the promotion zone');
// no XP at all should leave you in the pack, not crash
store.lang().league.weeklyXp = 0;
const r2 = G.leagueRank(store);
ok(r2.rank >= 1 && r2.rank <= G.LEAGUE_SIZE, 'rank stays within the cohort with zero XP');

// --- learner profiles (shared device) ---
store.reset();
store.setActiveLang('zu');
store.lang().xp = 123;
store.save();
ok(store.activeProfile().id === 'default', 'default profile is active to start');
const newId = store.createProfile('Lerato', '🦁');
ok(store.activeProfile().id === newId && store.activeProfile().name === 'Lerato', 'new learner becomes active');
ok(store.state.activeLang === null && store.lang('zu').xp === 0, 'new learner starts with a clean slate');
ok(store.profiles().length === 2, 'both learners are listed');
store.switchProfile('default');
ok(store.activeProfile().id === 'default' && store.lang('zu').xp === 123, 'switching back restores the original learner\'s progress');
ok(store.deleteProfile(newId) === true && store.profiles().length === 1, 'a learner can be removed');
ok(store.deleteProfile('default') === false, 'the original learner cannot be deleted');

// --- grammar patterns (spaced like vocab, own map) ---
store.reset();
store.setActiveLang('zu');
ok(store.grammarState('zu-g1') === 'new', 'grammar pattern starts as new');
const gi = store.grammarItem('zu-g1');
ok(gi && gi.due != null && gi.seen === 0, 'grammarItem creates a fresh SRS record');
gi.seen = 3; gi.mastered = true; store.save();
ok(store.grammarState('zu-g1') === 'mastered', 'grammar state reflects mastery');
gi.due = Date.now() - 1000;
ok(store.dueGrammar().includes('zu-g1'), 'dueGrammar surfaces a due, seen pattern');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
