// store.js — offline-first state, progress and persistence (localStorage)
import { newItem } from './srs.js';

const KEY = 'mzansilingo.v1';
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
  };
}

function freshState() {
  return {
    version: 1,
    activeLang: null,
    premium: false,
    settings: { dailyGoalXP: 30, soundOn: true },
    langs: {},
  };
}

class Store {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(freshState(), JSON.parse(raw));
    } catch (e) { /* corrupt or unavailable storage — start fresh */ }
    return freshState();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* ignore quota */ }
  }

  reset() {
    this.state = freshState();
    this.save();
  }

  // --- language selection -------------------------------------------------
  setActiveLang(code) {
    if (!this.state.langs[code]) this.state.langs[code] = freshLang();
    this.state.activeLang = code;
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
    if (L.lastStudyDay === yesterday) L.streak += 1;
    else L.streak = 1;
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
