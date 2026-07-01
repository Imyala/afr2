// store.js — offline-first state, progress and persistence (localStorage)
import { newItem } from './srs.js';

// Per-learner storage. A device (e.g. a shared school tablet) can hold several
// profiles, each with its own progress under its own key. The original
// single-user save lives under the bare KEY_BASE and becomes the "default"
// profile, so existing learners keep everything with no migration step.
const KEY_BASE = 'mzansilingo.v1';
const PROFILES_KEY = 'mzansilingo.profiles';
const AVATARS = ['🦫', '🦁', '🐘', '🦓', '🦌', '🐧', '🦏', '🐝', '🌟', '⚽', '🎨', '📚'];
const keyFor = (id) => (id === 'default' ? KEY_BASE : `${KEY_BASE}__${id}`);

const HEART_REFILL_MS = 30 * 60 * 1000; // one heart every 30 minutes (free tier)
const MAX_HEARTS = 5;

export const XP_PER_CORRECT = 10;
export const XP_LESSON_BONUS = 20;

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function freshLang() {
  return {
    hearts: MAX_HEARTS,
    heartsUpdatedAt: Date.now(),
    xp: 0,
    xpToday: 0,
    todayKey: todayKey(),
    streak: 0,
    lastStudyDay: null,
    bestStreak: 0,
    items: {},               // vocabId -> srs record
    completedLessons: [],
    lessonStars: {},         // lessonId -> 1..3
    reviewsDone: 0,
    baseline: null,          // { score, total, date }
    retest: null,
    // gamification (per language)
    quests: null,            // { dayKey, items:[{id,progress,claimed}] }
    league: null,            // { weekKey, weeklyXp, tier }
    streakFreezes: 0,
    perfectLessons: 0,
    readingsCompleted: 0,
    completedReadings: [],
    wotd: null,              // { day, learned } — word-of-the-day state
    grammar: {},             // patternId -> srs record (grammar patterns are spaced too)
    completedDialogues: [],  // dialogue ids the learner has finished
    plan: null,              // 90-day guided curriculum: { started, day, done:{...} }
  };
}

function freshState() {
  return {
    version: 1,
    activeLang: null,
    premium: false,
    settings: { dailyGoalXP: 30, soundOn: true, onboarded: false, remindersOn: false, desiredRetention: 0.9 },
    langs: {},
    // account-wide gamification
    gems: 0,
    achievements: {},       // achievementId -> unlock date
    dailyReward: { lastClaim: null, streak: 0 },
    studiedLangs: [],       // codes the learner has opened (for the Polyglot badge)
    inventory: {            // shop purchases (cosmetics + power-ups)
      owned: { zebra: true, savanna: true },
      equipped: { mascot: 'zebra', theme: 'savanna' },
      boosts: { double_xp: 0 },
    },
  };
}

function loadProfiles() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILES_KEY));
    if (p && Array.isArray(p.list) && p.list.length) return p;
  } catch (e) { /* none yet */ }
  return { active: 'default', list: [{ id: 'default', name: 'Me', avatar: '🦫' }] };
}
function saveProfiles(p) { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }

class Store {
  constructor() {
    this.reg = loadProfiles();
    this.profileId = this.reg.active || 'default';
    if (!this.reg.list.some((p) => p.id === this.profileId)) this.profileId = this.reg.list[0].id;
    this.state = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(keyFor(this.profileId));
      if (raw) return Object.assign(freshState(), JSON.parse(raw));
    } catch (e) { /* corrupt or unavailable storage — start fresh */ }
    return freshState();
  }

  save() {
    try { localStorage.setItem(keyFor(this.profileId), JSON.stringify(this.state)); } catch (e) { /* ignore quota */ }
  }

  reset() {
    this.state = freshState();
    this.save();
  }

  // --- learner profiles ---------------------------------------------------
  profiles() { return this.reg.list; }
  activeProfile() { return this.reg.list.find((p) => p.id === this.profileId) || this.reg.list[0]; }
  avatarChoices() { return AVATARS; }

  switchProfile(id) {
    if (id === this.profileId || !this.reg.list.some((p) => p.id === id)) return false;
    this.save();                       // persist the learner we're leaving
    this.profileId = id;
    this.reg.active = id;
    saveProfiles(this.reg);
    this.state = this.load();          // load the learner we're entering
    return true;
  }

  // Ensure a profile with a specific id exists and is active (used by the demo
  // account system: each account's id doubles as its progress-profile id).
  ensureProfile(id, name, avatar) {
    if (id === this.profileId) return true;
    if (!this.reg.list.some((p) => p.id === id)) {
      this.save();                       // persist whoever is active now
      this.reg.list.push({ id, name: (name || 'Learner').trim().slice(0, 20) || 'Learner', avatar: avatar || '🙂' });
      this.reg.active = id;
      saveProfiles(this.reg);
      this.profileId = id;
      this.state = freshState();
      this.save();
      return true;
    }
    return this.switchProfile(id);
  }

  createProfile(name, avatar) {
    this.save();                       // persist current learner first
    const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    this.reg.list.push({ id, name: (name || 'Learner').trim().slice(0, 20) || 'Learner', avatar: avatar || '🙂' });
    this.reg.active = id;
    saveProfiles(this.reg);
    this.profileId = id;
    this.state = freshState();         // a fresh start for the new learner
    this.save();
    return id;
  }

  deleteProfile(id) {
    if (id === 'default' || this.reg.list.length <= 1) return false; // keep at least the original
    this.reg.list = this.reg.list.filter((p) => p.id !== id);
    try { localStorage.removeItem(keyFor(id)); } catch (e) { /* ignore */ }
    if (this.profileId === id) {
      this.profileId = this.reg.list[0].id;
      this.reg.active = this.profileId;
      this.state = this.load();
    }
    saveProfiles(this.reg);
    return true;
  }

  // --- language selection -------------------------------------------------
  setActiveLang(code) {
    if (!this.state.langs[code]) this.state.langs[code] = freshLang();
    this.state.activeLang = code;
    if (!this.state.studiedLangs) this.state.studiedLangs = [];
    if (!this.state.studiedLangs.includes(code)) this.state.studiedLangs.push(code);
    this.save();
  }

  lang(code = this.state.activeLang) {
    if (!code) return null;
    if (!this.state.langs[code]) this.state.langs[code] = freshLang();
    return this.state.langs[code];
  }

  // --- daily rollover (streak + daily XP) ---------------------------------
  rollover(code = this.state.activeLang) {
    const L = this.lang(code);
    const tk = todayKey();
    if (L.todayKey !== tk) {
      L.todayKey = tk;
      L.xpToday = 0;
    }
    return L;
  }

  // --- hearts (lives) -----------------------------------------------------
  refreshHearts(code = this.state.activeLang) {
    const L = this.lang(code);
    if (this.state.premium) { L.hearts = MAX_HEARTS; return L.hearts; }
    if (L.hearts >= MAX_HEARTS) { L.heartsUpdatedAt = Date.now(); return L.hearts; }
    const elapsed = Date.now() - (L.heartsUpdatedAt || Date.now());
    const gained = Math.floor(elapsed / HEART_REFILL_MS);
    if (gained > 0) {
      L.hearts = Math.min(MAX_HEARTS, L.hearts + gained);
      L.heartsUpdatedAt = Date.now() - (elapsed % HEART_REFILL_MS);
      this.save();
    }
    return L.hearts;
  }

  msToNextHeart(code = this.state.activeLang) {
    const L = this.lang(code);
    if (this.state.premium || L.hearts >= MAX_HEARTS) return 0;
    const elapsed = Date.now() - (L.heartsUpdatedAt || Date.now());
    return HEART_REFILL_MS - (elapsed % HEART_REFILL_MS);
  }

  loseHeart(code = this.state.activeLang) {
    const L = this.lang(code);
    if (this.state.premium) return L.hearts;
    if (L.hearts === MAX_HEARTS) L.heartsUpdatedAt = Date.now();
    L.hearts = Math.max(0, L.hearts - 1);
    this.save();
    return L.hearts;
  }

  refillHearts(code = this.state.activeLang) {
    const L = this.lang(code);
    L.hearts = MAX_HEARTS;
    L.heartsUpdatedAt = Date.now();
    this.save();
  }

  // --- xp + streak --------------------------------------------------------
  addXp(amount, code = this.state.activeLang) {
    const L = this.rollover(code);
    L.xp += amount;
    L.xpToday += amount;
    this.markStudiedToday(code);
    this.save();
  }

  markStudiedToday(code = this.state.activeLang) {
    const L = this.lang(code);
    const tk = todayKey();
    if (L.lastStudyDay === tk) return;
    const yesterday = todayKey(new Date(Date.now() - 86400000));
    const dayBefore = todayKey(new Date(Date.now() - 2 * 86400000));
    if (L.lastStudyDay === yesterday) {
      L.streak += 1;
    } else if (L.lastStudyDay === dayBefore && (L.streakFreezes || 0) > 0) {
      // a streak freeze covers the single missed day
      L.streakFreezes -= 1;
      L.streak += 1;
      L.freezeUsedOn = tk;
    } else {
      L.streak = 1;
    }
    L.lastStudyDay = tk;
    L.bestStreak = Math.max(L.bestStreak || 0, L.streak);
  }

  // --- vocab memory records ----------------------------------------------
  item(vocabId, code = this.state.activeLang) {
    const L = this.lang(code);
    if (!L.items[vocabId]) L.items[vocabId] = newItem();
    return L.items[vocabId];
  }

  dueItems(code = this.state.activeLang, now = Date.now()) {
    const L = this.lang(code);
    return Object.entries(L.items)
      .filter(([, it]) => it.due <= now && it.seen > 0)
      .map(([id]) => id);
  }

  // --- 90-day guided plan --------------------------------------------------
  startPlan(code = this.state.activeLang) {
    const L = this.lang(code);
    L.plan = { started: todayKey(), day: 1, done: { review: false, lesson: false, input: false, output: false } };
    this.save();
    return L.plan;
  }

  // --- grammar patterns (spaced like vocab, kept in their own map) ----------
  grammarItem(patternId, code = this.state.activeLang) {
    const L = this.lang(code);
    if (!L.grammar) L.grammar = {};
    if (!L.grammar[patternId]) L.grammar[patternId] = newItem();
    return L.grammar[patternId];
  }

  grammarState(patternId, code = this.state.activeLang) {
    const L = this.lang(code);
    const it = L.grammar && L.grammar[patternId];
    if (!it || !it.seen) return 'new';
    return it.mastered ? 'mastered' : 'learning';
  }

  dueGrammar(code = this.state.activeLang, now = Date.now()) {
    const L = this.lang(code);
    if (!L.grammar) return [];
    return Object.entries(L.grammar).filter(([, it]) => it.due <= now && it.seen > 0).map(([id]) => id);
  }

  // --- lessons ------------------------------------------------------------
  completeLesson(lessonId, stars, code = this.state.activeLang) {
    const L = this.lang(code);
    if (!L.completedLessons.includes(lessonId)) L.completedLessons.push(lessonId);
    L.lessonStars[lessonId] = Math.max(L.lessonStars[lessonId] || 0, stars);
    this.save();
  }

  isLessonComplete(lessonId, code = this.state.activeLang) {
    return this.lang(code).completedLessons.includes(lessonId);
  }

  // --- progress metrics (the "real proof of learning") --------------------
  metrics(code = this.state.activeLang) {
    const L = this.lang(code);
    const items = Object.values(L.items);
    const introduced = items.length;
    const mastered = items.filter((i) => i.mastered).length;
    const learning = items.filter((i) => !i.mastered && i.seen > 0).length;
    const totalSeen = items.reduce((s, i) => s + i.seen, 0);
    const totalCorrect = items.reduce((s, i) => s + i.correct, 0);
    return {
      introduced,
      mastered,
      learning,
      retention: totalSeen ? totalCorrect / totalSeen : 0,
      lessonsCompleted: L.completedLessons.length,
      xp: L.xp,
      streak: L.streak,
      bestStreak: L.bestStreak || 0,
    };
  }
}

export const store = new Store();
export { todayKey, MAX_HEARTS };
