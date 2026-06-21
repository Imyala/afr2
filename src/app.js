// app.js — MzansiLingo PWA controller (routing, screens, exercise rendering)
import { store, XP_PER_CORRECT, XP_LESSON_BONUS, MAX_HEARTS } from './store.js';
import { review as srsReview, gradeFor } from './srs.js';
import { speak } from './audio.js';
import {
  loadCourse, loadLanguages, allLessons, findLesson, vocabIndex,
  checkAnswer, buildLessonSession, buildReviewSession, exerciseVocabIds, normalize,
} from './lessons.js';
import * as G from './gamify.js';
import * as Shop from './shop.js';

let LIBRARY = null;   // library.json

const app = document.getElementById('app');
let LANGS = null;     // languages.json
let course = null;    // active course
let session = null;   // active lesson/review session

// ---------- tiny DOM helpers ----------
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
function mount(node) { app.innerHTML = ''; app.appendChild(node); window.scrollTo(0, 0); }
function fmtTime(ms) { const m = Math.ceil(ms / 60000); return `${m} min`; }

// ---------- boot ----------
async function boot() {
  Shop.applyTheme(store);
  LANGS = await loadLanguages();
  if (!store.state.activeLang) return renderLanguageSelect(true);
  await openLanguage(store.state.activeLang);
}

async function openLanguage(code) {
  store.setActiveLang(code);
  store.rollover(code);
  store.refreshHearts(code);
  course = await loadCourse(code);
  G.ensureDaily(store);
  G.ensureWeek(store);
  G.checkAchievements(store);
  const dr = G.dailyRewardStatus(store);
  if (dr.canClaim) return renderDailyReward();
  renderHome();
}

// ---------- language select / onboarding ----------
const LANG_ACCENT = { zu: '#1b7a43', xh: '#1d6fb8', af: '#e2711d', default: '#7c3aed' };

function renderLanguageSelect(first = false) {
  const cards = LANGS.languages.map((l) => {
    const accent = LANG_ACCENT[l.code] || LANG_ACCENT.default;
    const mono = l.englishName.slice(0, 2);
    return `
    <button class="lang-card" data-code="${l.code}" style="--accent:${accent}">
      <span class="lang-card__avatar">${esc(mono)}</span>
      <span class="lang-card__main">
        <span class="lang-card__name">${esc(l.name)}</span>
        <span class="lang-card__en">${esc(l.englishName)} · ${esc(l.speakers)} speakers</span>
        <span class="lang-card__blurb">${esc(l.blurb)}</span>
      </span>
      <span class="lang-card__go">›</span>
    </button>`;
  }).join('');
  const soon = LANGS.comingSoon.map((s) => `<span class="chip chip--soon">${esc(s)}</span>`).join('');
  const node = h(`
    <div class="screen">
      <header class="brand">
        <div class="brand__logo">🇿🇦</div>
        <h1 class="brand__name">MzansiLingo</h1>
        <p class="brand__tag">Learn real South African languages for real conversations.</p>
      </header>
      <p class="muted lang-intro">${first ? 'Pick a language to begin — it\'s free. You can switch any time.' : 'Choose a language to learn.'}</p>
      <div class="lang-grid">${cards}</div>
      <h3 class="soon-title">Coming soon</h3>
      <div class="chips">${soon}</div>
      <p class="footnote">Works offline · Built for South African classrooms</p>
    </div>`);
  node.querySelectorAll('.lang-card').forEach((b) =>
    b.addEventListener('click', () => openLanguage(b.dataset.code)));
  mount(node);
}

// ---------- home / lesson path ----------
function renderHome() {
  store.rollover();
  store.refreshHearts();
  const L = store.lang();
  const m = store.metrics();
  const meta = LANGS.languages.find((x) => x.code === course.code);
  const goal = store.state.settings.dailyGoalXP;
  const pct = Math.min(100, Math.round((L.xpToday / goal) * 100));
  const due = store.dueItems().length;

  const lessons = allLessons(course);
  let lastUnit = null;
  const path = lessons.map((l, i) => {
    const done = store.isLessonComplete(l.id);
    const stars = L.lessonStars[l.id] || 0;
    const prevDone = i === 0 || store.isLessonComplete(lessons[i - 1].id);
    const locked = !done && !prevDone;
    const unitHeader = l.unitTitle !== lastUnit ? `<div class="unit-head"><span>${esc(l.unitTitle)}</span><small>${esc(l.level)}</small></div>` : '';
    lastUnit = l.unitTitle;
    const starHtml = done ? `<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` : '';
    return `${unitHeader}
      <button class="node ${done ? 'node--done' : ''} ${locked ? 'node--locked' : ''}" data-lesson="${l.id}" ${locked ? 'disabled' : ''}>
        <span class="node__icon">${done ? '✓' : locked ? '🔒' : i + 1}</span>
        <span class="node__title">${esc(l.title)}</span>
        ${starHtml}
      </button>`;
  }).join('');

  // gamification widgets
  const quests = G.questDefs(store);
  const questsDone = quests.filter((q) => q.claimed).length;
  const questHtml = quests.map((q) => {
    const pc = Math.min(100, Math.round((q.progress / q.goal) * 100));
    return `<div class="quest ${q.claimed ? 'quest--done' : ''}">
        <span class="quest__icon">${q.claimed ? '✅' : q.icon}</span>
        <div class="quest__body">
          <span class="quest__text">${esc(q.text)}</span>
          <div class="qbar"><div style="width:${pc}%"></div></div>
        </div>
        <span class="quest__reward">${q.claimed ? 'done' : `💎${q.gems}`}</span>
      </div>`;
  }).join('');

  const lg = L.league;
  const target = G.leagueTarget(lg.tier);
  const lgPct = Math.min(100, Math.round((lg.weeklyXp / target) * 100));
  const hasReading = (course.reading || []).length > 0;
  const mascot = Shop.equippedMascot(store);
  const wotd = wordOfTheDay();
  const wotdLearned = (L.wotd && L.wotd.day === todayStr() && L.wotd.learned);
  const boostN = Shop.inventory(store).boosts.double_xp || 0;

  const node = h(`
    <div class="screen">
      <header class="topbar">
        <button class="topbar__lang" id="switchLang">${esc(meta.name)} ▾</button>
        <div class="topbar__stats">
          <span class="stat stat--streak" id="streakBtn" title="Day streak">🔥 ${L.streak}</span>
          <span class="stat stat--gems" id="gemsBtn" title="Gems">💎 ${G.gems(store)}</span>
          <span class="stat stat--hearts" id="heartsBtn" title="Hearts">${store.state.premium ? '❤️∞' : `${'❤️'.repeat(L.hearts)}${'🤍'.repeat(MAX_HEARTS - L.hearts)}`}</span>
        </div>
      </header>

      <section class="goal">
        <div class="goal__ring" style="--pct:${pct}">
          <span>${L.xpToday}/${goal}</span>
        </div>
        <div class="goal__text">
          <strong>${mascot.icon} ${pct >= 100 ? 'Sharp sharp!' : 'Daily goal'}</strong>
          <p class="muted">${pct >= 100 ? 'Done for today — well played! 🎉' : `${goal - L.xpToday} XP to keep your streak`}</p>
          ${boostN ? `<span class="boost-chip">⚡ ${boostN} Double XP ready</span>` : ''}
        </div>
      </section>

      <button class="btn btn--review" id="reviewBtn" ${due ? '' : 'disabled'}>
        🔁 Review ${due ? `<span class="badge">${due} due</span>` : '<span class="muted">none due</span>'}
      </button>

      <div class="mini-row">
        <button class="mini" id="questsBtn">
          <span class="mini__top">🎯 Quests <b>${questsDone}/${quests.length}</b></span>
          <span class="qbar"><span style="width:${Math.round((questsDone / quests.length) * 100)}%"></span></span>
        </button>
        <button class="mini" id="leagueBtn">
          <span class="mini__top">${G.leagueIcon(G.LEAGUES[lg.tier])} ${esc(G.LEAGUES[lg.tier])}</span>
          <span class="qbar qbar--gold"><span style="width:${lgPct}%"></span></span>
        </button>
      </div>

      ${wotd ? `<button class="wotd-strip" id="wotdBtn">
        🗓️ <span class="muted">Word of the day:</span> <b>${esc(wotd.term)}</b> — ${esc(wotd.translation)} ${wotdLearned ? '✓' : '🔊'}
      </button>` : ''}

      <div class="path">${path}</div>
      <nav class="bottombar">
        <button class="navbtn navbtn--active">🏠 Home</button>
        <button class="navbtn" id="storiesNav" ${hasReading ? '' : 'disabled'}>📖 Stories</button>
        <button class="navbtn" id="shopNav">🛒 Shop</button>
        <button class="navbtn" id="achBtn">🏅 Badges</button>
        <button class="navbtn" id="progressBtn2">📊 Progress</button>
      </nav>
    </div>`);

  node.querySelectorAll('[data-lesson]').forEach((b) =>
    b.addEventListener('click', () => startLesson(b.dataset.lesson)));
  node.querySelector('#switchLang').addEventListener('click', () => renderLanguageSelect(false));
  node.querySelector('#reviewBtn').addEventListener('click', startReview);
  node.querySelector('#storiesNav').addEventListener('click', renderLibrary);
  node.querySelector('#shopNav').addEventListener('click', renderShop);
  node.querySelector('#questsBtn').addEventListener('click', renderQuests);
  node.querySelector('#leagueBtn').addEventListener('click', renderLeague);
  node.querySelector('#achBtn').addEventListener('click', renderAchievements);
  node.querySelector('#progressBtn2').addEventListener('click', renderProgress);
  node.querySelector('#gemsBtn').addEventListener('click', renderShop);
  node.querySelector('#streakBtn').addEventListener('click', renderLeague);
  node.querySelector('#heartsBtn').addEventListener('click', () => { if (store.lang().hearts < MAX_HEARTS) renderHeartsModal(); });
  const wb = node.querySelector('#wotdBtn'); if (wb) wb.addEventListener('click', renderWotd);
  mount(node);
}

// ---------- word of the day (offline, from the active course vocab) ----------
function todayStr() { return new Date().toISOString().slice(0, 10); }
function wordOfTheDay() {
  const all = Object.values(vocabIndex(course));
  if (!all.length) return null;
  const tk = todayStr();
  let s = 0; for (let i = 0; i < tk.length; i++) s = (s * 31 + tk.charCodeAt(i)) >>> 0;
  return all[s % all.length];
}

// Optional "tap to hear" — uses on-device TTS where a voice exists, and tells
// the learner if it doesn't (instead of silently doing nothing). The text is
// always visible on screen, so this never blocks learning.
async function tryHear(text, lang) {
  const ok = await speak(text, lang);
  if (!ok) flashToast('Audio for this language isn’t available on this device yet.');
  return ok;
}

function renderWotd() {
  const w = wordOfTheDay();
  if (!w) return renderHome();
  const L = store.lang();
  const already = L.wotd && L.wotd.day === todayStr() && L.wotd.learned;
  const node = h(`
    <div class="screen screen--center">
      <div class="result__emoji">🗓️</div>
      <h1>Word of the Day</h1>
      <div class="wotd-big">
        <strong>${esc(w.term)}</strong>
        <span class="wotd-big__phon muted">${esc(w.phonetic || '')}</span>
        <span class="wotd-big__tr">${esc(w.translation)}</span>
        ${w.note ? `<span class="muted">(${esc(w.note)})</span>` : ''}
      </div>
      <button class="play-btn" id="hear">🔊 Hear it</button>
      <button class="btn btn--primary" id="learn">${already ? 'Learned ✓ — practise again' : 'Add to my reviews (+5 XP)'}</button>
      <button class="btn btn--ghost" id="back">Back</button>
    </div>`);
  node.querySelector('#hear').addEventListener('click', () => tryHear(w.term, course.code));
  speak(w.term, course.code); // best-effort autoplay (silent if no voice)
  node.querySelector('#learn').addEventListener('click', () => {
    const it = store.item(w.id);
    srsReview(it, gradeFor(true, 'multiple_choice'), 'multiple_choice'); // introduce into the SRS schedule
    if (!already) { store.addXp(5); store.lang().wotd = { day: todayStr(), learned: true }; }
    store.save();
    flashToast('Added to your reviews! 🎉');
    setTimeout(renderHome, 700);
  });
  node.querySelector('#back').addEventListener('click', renderHome);
  mount(node);
}

// ---------- daily quests screen ----------
function renderQuests() {
  const quests = G.questDefs(store);
  const list = quests.map((q) => {
    const pc = Math.min(100, Math.round((q.progress / q.goal) * 100));
    return `<div class="quest ${q.claimed ? 'quest--done' : ''}">
        <span class="quest__icon">${q.claimed ? '✅' : q.icon}</span>
        <div class="quest__body">
          <span class="quest__text">${esc(q.text)}</span>
          <div class="qbar"><div style="width:${pc}%"></div></div>
          <span class="muted quest__prog">${Math.min(q.progress, q.goal)}/${q.goal}</span>
        </div>
        <span class="quest__reward">${q.claimed ? 'done' : `💎${q.gems}`}</span>
      </div>`;
  }).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Daily Quests</strong><span class="stat stat--gems">💎 ${G.gems(store)}</span></header>
      <p class="muted">Fresh quests every day. Finish them to earn gems for the shop.</p>
      <div class="card quests-card">${list}</div>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  mount(node);
}

// ---------- session engine ----------
function startLesson(lessonId) {
  if (store.lang().hearts <= 0) return renderHeartsModal();
  const lesson = findLesson(course, lessonId);
  session = { mode: 'lesson', lesson, queue: buildLessonSession(lesson, course, store.dueItems()), idx: 0, mistakes: 0, total: 0 };
  renderExercise();
}

function startReview() {
  if (store.lang().hearts <= 0) return renderHeartsModal();
  const due = store.dueItems();
  if (!due.length) return renderHome();
  session = { mode: 'review', lesson: null, queue: buildReviewSession(course, due), idx: 0, mistakes: 0, total: 0 };
  renderExercise();
}

function startBaseline(isRetest) {
  const idx = vocabIndex(course);
  const all = Object.values(idx);
  const pick = shuffle(all).slice(0, 10);
  const queue = pick.map((v) => {
    const distractors = shuffle(all.filter((o) => o.translation !== v.translation)).slice(0, 3);
    return {
      type: 'multiple_choice', prompt: `"${v.term}" means:`, answer: v.translation,
      options: shuffle([v.translation, ...distractors.map((d) => d.translation)]), vocabId: v.id, _test: true,
    };
  });
  session = { mode: isRetest ? 'retest' : 'baseline', lesson: null, queue, idx: 0, mistakes: 0, total: 0, score: 0 };
  renderExercise();
}

const HEART_MODES = ['lesson', 'review'];

function endSession() {
  const isTest = session.mode === 'baseline' || session.mode === 'retest';
  if (isTest) {
    const result = { score: session.score, total: session.queue.length, date: new Date().toISOString().slice(0, 10) };
    if (session.mode === 'baseline') store.lang().baseline = result; else store.lang().retest = result;
    store.save();
    return renderTestResult(result);
  }
  const correct = session.total - session.mistakes;
  let stars = 3;
  if (session.mistakes >= 1) stars = 2;
  if (session.mistakes >= 3) stars = 1;

  // award XP once at the end (keeps league/quest tracking clean)
  const baseXp = XP_PER_CORRECT * Math.max(1, correct) + (session.mode === 'lesson' ? XP_LESSON_BONUS : 0);
  const boost = Shop.applyXpBoost(store, baseXp);
  const earned = boost.amount;
  session.xpBoosted = boost.boosted;
  store.addXp(earned);

  // small gem trickle for finishing, so the shop is reachable through play
  const GEM_REWARD = { lesson: 5, review: 3, reading: 5 };
  const baseGems = GEM_REWARD[session.mode] || 0;
  if (baseGems) store.state.gems = (store.state.gems || 0) + baseGems;

  // gamification events
  let rewards = G.track(store, 'xp', { amount: earned });
  rewards.gems += baseGems;
  const merge = (r) => { rewards.quests.push(...r.quests); rewards.achievements.push(...r.achievements); rewards.gems += r.gems; };
  if (session.mode === 'lesson') {
    store.completeLesson(session.lesson.id, stars);
    merge(G.track(store, 'lesson', { mistakes: session.mistakes }));
  } else if (session.mode === 'review') {
    store.lang().reviewsDone += session.total;
    merge(G.track(store, 'review'));
  } else if (session.mode === 'reading') {
    const r = session.reading;
    if (r && !store.lang().completedReadings.includes(r.id)) store.lang().completedReadings.push(r.id);
    merge(G.track(store, 'reading'));
  }
  merge({ quests: [], achievements: G.checkAchievements(store), gems: 0 });
  store.save();
  session.earned = earned;
  renderSessionComplete(stars, correct, session.total, rewards);
}

function advance(wasCorrect, ex) {
  session.total += 1;
  if (!wasCorrect) session.mistakes += 1;
  if (session.mode === 'baseline' || session.mode === 'retest') {
    if (wasCorrect) session.score += 1;
  } else {
    // credit SRS for each vocab id this exercise touched
    for (const vid of exerciseVocabIds(ex, session.lesson)) {
      const it = store.item(vid);
      srsReview(it, gradeFor(wasCorrect, ex.type), ex.type);
    }
    if (!wasCorrect && HEART_MODES.includes(session.mode)) {
      store.loseHeart();
      session.queue.push({ ...ex }); // requeue missed item to the end
      if (store.lang().hearts <= 0) return renderOutOfHearts();
    }
    store.save();
  }
  session.idx += 1;
  if (session.idx >= session.queue.length) return endSession();
  renderExercise();
}

// ---------- exercise rendering ----------
function progressBar() {
  const pct = Math.round((session.idx / session.queue.length) * 100);
  const L = store.lang();
  const hearts = HEART_MODES.includes(session.mode)
    ? `<span class="ex__hearts">${store.state.premium ? '❤️∞' : `${'❤️'.repeat(L.hearts)}${'🤍'.repeat(MAX_HEARTS - L.hearts)}`}</span>` : '';
  return `<header class="ex__top">
      <button class="ex__quit" id="quitBtn" aria-label="Quit">✕</button>
      <div class="ex__bar"><div class="ex__bar-fill" style="width:${pct}%"></div></div>
      ${hearts}
    </header>`;
}

function renderExercise() {
  const ex = session.queue[session.idx];
  let body = '';
  switch (ex.type) {
    case 'match': body = renderMatch(ex); break;
    case 'multiple_choice': body = renderChoice(ex, ex.prompt); break;
    case 'fill_blank': body = renderFill(ex); break;
    case 'translate': body = renderTranslate(ex); break;
    default: body = '<p>Unknown exercise</p>';
  }
  const node = h(`<div class="screen ex">${progressBar()}<div class="ex__body">${body}</div><div class="ex__foot" id="foot"></div></div>`);
  mount(node);
  node.querySelector('#quitBtn').addEventListener('click', () => { if (confirm('Quit this session? Progress in this session is lost.')) renderHome(); });
  wireExercise(ex, node);
}

function footFor(node) { return node.querySelector('#foot'); }

function showFeedback(node, ok, ex, correctText) {
  const foot = footFor(node);
  foot.className = `ex__foot ${ok ? 'ex__foot--ok' : 'ex__foot--bad'}`;
  const note = ex.meaning ? `<div class="fb__meaning">${esc(ex.meaning)}</div>` : '';
  foot.innerHTML = `
    <div class="fb">
      <div class="fb__title">${ok ? '✓ Correct!' : '✗ Not quite'}</div>
      ${ok ? '' : `<div class="fb__answer">Answer: <strong>${esc(correctText)}</strong></div>`}
      ${note}
    </div>
    <button class="btn btn--primary" id="continueBtn">Continue</button>`;
  foot.querySelector('#continueBtn').addEventListener('click', () => advance(ok, ex));
  // lock inputs
  node.querySelectorAll('.opt, .ex__input, .check').forEach((e) => { e.disabled = true; });
}

// --- multiple choice / fill / listen share an option grid ---
function renderChoice(ex, promptHtml) {
  const opts = shuffle(ex.options).map((o) => `<button class="opt" data-val="${esc(o)}">${esc(o)}</button>`).join('');
  return `<h2 class="ex__q">${promptHtml}</h2><div class="opts">${opts}</div>`;
}

function renderFill(ex) {
  const sentence = esc(ex.sentence).replace('____', '<span class="blank">_____</span>');
  const opts = shuffle(ex.options).map((o) => `<button class="opt" data-val="${esc(o)}">${esc(o)}</button>`).join('');
  return `<h2 class="ex__q">Fill in the missing word</h2>
    <p class="ex__sentence">${sentence}</p>
    <p class="ex__hint muted">${esc(ex.meaning || '')}</p>
    <div class="opts">${opts}</div>`;
}

function renderTranslate(ex) {
  return `<h2 class="ex__q">Translate</h2>
    <p class="ex__prompt-big">${esc(ex.prompt)}</p>
    <input class="ex__input" id="answerInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type in ${esc(course.name)}…" />
    <button class="btn btn--primary check" id="checkBtn">Check</button>`;
}

function renderMatch(ex) {
  const left = ex.pairs.map((p, i) => `<button class="opt match-opt" data-side="L" data-i="${i}">${esc(p[0])}</button>`).join('');
  const right = shuffle(ex.pairs.map((p, i) => ({ i, t: p[1] }))).map((o) => `<button class="opt match-opt" data-side="R" data-i="${o.i}">${esc(o.t)}</button>`).join('');
  return `<h2 class="ex__q">Match the pairs</h2>
    <div class="match"><div class="match__col">${left}</div><div class="match__col">${right}</div></div>`;
}

// --- wiring per exercise type ---
function wireExercise(ex, node) {
  if (ex.type === 'multiple_choice' || ex.type === 'fill_blank') {
    node.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
      const ok = checkAnswer(ex, b.dataset.val);
      node.querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
      b.classList.add(ok ? 'opt--ok' : 'opt--bad');
      if (!ok) node.querySelectorAll('.opt').forEach((x) => { if (normalize(x.dataset.val) === normalize(ex.answer)) x.classList.add('opt--ok'); });
      showFeedback(node, ok, ex, ex.answer);
    }));
  }

  if (ex.type === 'translate') {
    const input = node.querySelector('#answerInput');
    const submit = () => {
      if (!input.value.trim()) return;
      const ok = checkAnswer(ex, input.value);
      showFeedback(node, ok, ex, ex.answer);
    };
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    node.querySelector('#checkBtn').addEventListener('click', submit);
  }

  if (ex.type === 'match') {
    let firstPick = null;
    let solved = 0;
    const total = ex.pairs.length;
    node.querySelectorAll('.match-opt').forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('match-opt--done')) return;
      if (!firstPick) {
        firstPick = b; b.classList.add('match-opt--sel'); return;
      }
      if (firstPick === b) { b.classList.remove('match-opt--sel'); firstPick = null; return; }
      const sameSide = firstPick.dataset.side === b.dataset.side;
      const match = firstPick.dataset.i === b.dataset.i && !sameSide;
      if (match) {
        [firstPick, b].forEach((x) => { x.classList.remove('match-opt--sel'); x.classList.add('match-opt--done'); x.disabled = true; });
        solved += 1;
        if (solved === total) showFeedback(node, true, ex, '');
      } else {
        const a = firstPick;
        [a, b].forEach((x) => x.classList.add('match-opt--wrong'));
        setTimeout(() => [a, b].forEach((x) => x.classList.remove('match-opt--wrong', 'match-opt--sel')), 500);
      }
      firstPick = null;
    }));
  }
}

// ---------- completion screens ----------
function renderSessionComplete(stars, correct, total, rewards = { quests: [], achievements: [], gems: 0 }) {
  const acc = Math.round((correct / Math.max(1, total)) * 100);
  const title = session.mode === 'review' ? 'Review complete!' : session.mode === 'reading' ? 'Story complete!' : 'Lesson complete!';
  const questHtml = rewards.quests.length
    ? `<div class="reward-list"><strong>Quests completed</strong>${rewards.quests.map((q) => `<div class="reward-row">${q.icon} ${esc(q.text)} <span>+💎${q.gems}</span></div>`).join('')}</div>` : '';
  const achHtml = rewards.achievements.length
    ? `<div class="reward-list reward-list--ach"><strong>New badges! 🏅</strong>${rewards.achievements.map((a) => `<div class="reward-row">${a.icon} ${esc(a.name)} <span>+💎20</span></div>`).join('')}</div>` : '';
  const node = h(`
    <div class="screen screen--center result">
      <div class="result__emoji">🎉</div>
      <h1>${title}</h1>
      <div class="result__stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      ${session.xpBoosted ? '<div class="boost-badge">⚡ Double XP applied!</div>' : ''}
      <div class="result__row">
        <div class="kpi"><span class="kpi__v">${correct}/${total}</span><span class="kpi__k">Correct</span></div>
        <div class="kpi"><span class="kpi__v">+${session.earned || 0}</span><span class="kpi__k">XP</span></div>
        <div class="kpi"><span class="kpi__v">+💎${rewards.gems || 0}</span><span class="kpi__k">Gems</span></div>
      </div>
      ${questHtml}
      ${achHtml}
      <p class="muted">Words you missed are scheduled for review so they actually stick.</p>
      <button class="btn btn--primary" id="doneBtn">Continue</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', renderHome);
  mount(node);
}

function renderOutOfHearts() {
  const node = h(`
    <div class="screen screen--center result">
      <div class="result__emoji">💔</div>
      <h1>Out of hearts</h1>
      <p class="muted">You ran out of hearts this session. Hearts refill over time, or go Premium for unlimited hearts.</p>
      <button class="btn btn--primary" id="practiceBtn">Keep practising (no hearts)</button>
      <button class="btn btn--ghost" id="homeBtn">Back home</button>
      <button class="btn btn--ghost" id="goPremium">⭐ Get unlimited hearts</button>
    </div>`);
  node.querySelector('#practiceBtn').addEventListener('click', () => { renderExercise(); }); // continue current item, hearts stay 0 (practice)
  node.querySelector('#homeBtn').addEventListener('click', renderHome);
  node.querySelector('#goPremium').addEventListener('click', renderPremium);
  mount(node);
}

function renderHeartsModal() {
  const ms = store.msToNextHeart();
  const node = h(`
    <div class="screen screen--center">
      <div class="result__emoji">❤️</div>
      <h1>You're low on hearts</h1>
      <p>You have <strong>${store.lang().hearts}</strong> hearts.</p>
      <p class="muted">${ms ? `Next heart in about ${fmtTime(ms)}.` : ''}</p>
      <button class="btn btn--primary" id="premium">⭐ Go Premium — unlimited hearts</button>
      <button class="btn btn--ghost" id="practice">Practise old words (free, no hearts)</button>
      <button class="btn btn--ghost" id="back">Back</button>
    </div>`);
  node.querySelector('#premium').addEventListener('click', renderPremium);
  node.querySelector('#practice').addEventListener('click', () => store.dueItems().length ? startReview() : renderHome());
  node.querySelector('#back').addEventListener('click', renderHome);
  mount(node);
}

// ---------- progress dashboard (the proof of learning) ----------
function renderProgress() {
  const m = store.metrics();
  const L = store.lang();
  const totalVocab = Object.keys(vocabIndex(course)).length;
  const masteredPct = totalVocab ? Math.round((m.mastered / totalVocab) * 100) : 0;
  const retPct = Math.round(m.retention * 100);

  const baseline = L.baseline;
  const retest = L.retest;
  let compare = '';
  if (baseline && retest) {
    const b = Math.round((baseline.score / baseline.total) * 100);
    const r = Math.round((retest.score / retest.total) * 100);
    const delta = r - b;
    compare = `<div class="proof">
      <h3>Your measured progress</h3>
      <div class="proof__bars">
        <div><span>Baseline (${esc(baseline.date)})</span><div class="pbar"><div style="width:${b}%"></div></div><b>${b}%</b></div>
        <div><span>Re-test (${esc(retest.date)})</span><div class="pbar pbar--green"><div style="width:${r}%"></div></div><b>${r}%</b></div>
      </div>
      <p class="${delta >= 0 ? 'gain' : 'muted'}">${delta >= 0 ? `📈 +${delta}% improvement — real, measured learning.` : `${delta}% — keep reviewing daily.`}</p>
    </div>`;
  } else if (baseline) {
    compare = `<div class="proof">
      <h3>Your measured progress</h3>
      <p class="muted">Baseline recorded (${Math.round((baseline.score / baseline.total) * 100)}%). Come back after ~1 month of daily practice and take the re-test to see your gains.</p>
      <button class="btn btn--ghost" id="retestBtn">Take the 1-month re-test</button>
    </div>`;
  } else {
    compare = `<div class="proof">
      <h3>Prove your progress</h3>
      <p class="muted">Take a 60-second baseline test now. In a month, re-test to see exactly how much you've learned.</p>
      <button class="btn btn--primary" id="baselineBtn">Take baseline test</button>
    </div>`;
  }

  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Progress</strong><span></span></header>

      <div class="dash">
        <div class="dcard"><span class="dcard__v">${m.mastered}</span><span class="dcard__k">Words mastered</span><div class="dcard__sub">of ${totalVocab} (${masteredPct}%)</div></div>
        <div class="dcard"><span class="dcard__v">${m.learning}</span><span class="dcard__k">Still learning</span></div>
        <div class="dcard"><span class="dcard__v">${retPct}%</span><span class="dcard__k">Retention</span><div class="dcard__sub">recall accuracy</div></div>
        <div class="dcard"><span class="dcard__v">${m.lessonsCompleted}</span><span class="dcard__k">Lessons done</span></div>
        <div class="dcard"><span class="dcard__v">🔥 ${m.streak}</span><span class="dcard__k">Day streak</span><div class="dcard__sub">best ${m.bestStreak}</div></div>
        <div class="dcard"><span class="dcard__v">⭐ ${m.xp}</span><span class="dcard__k">Total XP</span></div>
      </div>

      <div class="mastery-bar">
        <div class="mastery-bar__fill" style="width:${masteredPct}%"></div>
        <span>${m.mastered} / ${totalVocab} words mastered</span>
      </div>

      ${compare}

      <p class="footnote">Mastered = recalled correctly in <em>production</em> (typing/speaking) and survived a spaced review. That's real retention, not just taps.</p>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  const bb = node.querySelector('#baselineBtn'); if (bb) bb.addEventListener('click', () => startBaseline(false));
  const rb = node.querySelector('#retestBtn'); if (rb) rb.addEventListener('click', () => startBaseline(true));
  mount(node);
}

function renderTestResult(result) {
  const pct = Math.round((result.score / result.total) * 100);
  const node = h(`
    <div class="screen screen--center result">
      <div class="result__emoji">📋</div>
      <h1>${session.mode === 'retest' ? 'Re-test' : 'Baseline'} recorded</h1>
      <div class="result__row"><div class="kpi"><span class="kpi__v">${result.score}/${result.total}</span><span class="kpi__k">Score</span></div><div class="kpi"><span class="kpi__v">${pct}%</span><span class="kpi__k">Accuracy</span></div></div>
      <p class="muted">${session.mode === 'baseline' ? 'This is your starting point. Practise daily, then re-test in about a month.' : 'Check your Progress page to see your improvement over your baseline.'}</p>
      <button class="btn btn--primary" id="toProgress">See progress</button>
    </div>`);
  node.querySelector('#toProgress').addEventListener('click', renderProgress);
  mount(node);
}

// ---------- premium / paywall ----------
function renderPremium() {
  const isP = store.state.premium;
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Premium</strong><span></span></header>
      <div class="pay">
        <div class="pay__hero">⭐ MzansiLingo Premium</div>
        <ul class="pay__list">
          <li>✅ All ${LANGS.languages.length}+ languages</li>
          <li>✅ Unlimited hearts</li>
          <li>✅ Offline lesson packs</li>
          <li>✅ Speaking mode &amp; cultural packs</li>
          <li>✅ No ads</li>
        </ul>
        <div class="pay__plans">
          <button class="plan ${isP ? '' : 'plan--best'}" id="yearBtn"><b>R899 / year</b><small>best value</small></button>
          <button class="plan" id="monthBtn"><b>R129 / month</b><small>or $6.99</small></button>
        </div>
        <p class="muted">${isP ? '✅ Premium is active. Enjoy unlimited hearts.' : 'Demo: tap a plan to unlock Premium locally.'}</p>
        ${isP ? '<button class="btn btn--ghost" id="cancel">Turn off Premium (demo)</button>' : ''}
      </div>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  const setP = (v) => { store.state.premium = v; if (v) store.refillHearts(); store.save(); renderPremium(); };
  if (node.querySelector('#yearBtn')) node.querySelector('#yearBtn').addEventListener('click', () => setP(true));
  if (node.querySelector('#monthBtn')) node.querySelector('#monthBtn').addEventListener('click', () => setP(true));
  if (node.querySelector('#cancel')) node.querySelector('#cancel').addEventListener('click', () => setP(false));
  mount(node);
}

// ---------- daily login reward ----------
function renderDailyReward() {
  const st = G.dailyRewardStatus(store);
  const node = h(`
    <div class="screen screen--center">
      <div class="result__emoji">🎁</div>
      <h1>Daily reward</h1>
      <p class="muted">Come back every day to keep the rewards growing.</p>
      <div class="chest" id="chest">💎 +${st.nextGems}</div>
      <p class="muted">Day ${st.streak + 1} of your login streak</p>
      <button class="btn btn--primary" id="claim">Claim ${st.nextGems} gems</button>
    </div>`);
  node.querySelector('#claim').addEventListener('click', () => {
    const r = G.claimDailyReward(store);
    node.querySelector('#claim').textContent = r ? `+${r.gems} gems! 🎉` : 'Claimed';
    setTimeout(renderHome, 600);
  });
  mount(node);
}

// ---------- stories / reading library ----------
async function renderLibrary() {
  if (!LIBRARY) { try { LIBRARY = await (await fetch('data/library.json')).json(); } catch (e) { LIBRARY = { sources: [] }; } }
  const readings = course.reading || [];
  const L = store.lang();
  const cards = readings.map((r) => {
    const done = (L.completedReadings || []).includes(r.id);
    return `<button class="story ${done ? 'story--done' : ''}" data-read="${r.id}">
        <span class="story__icon">${done ? '✅' : '📖'}</span>
        <div class="story__body"><strong>${esc(r.title)}</strong><span class="muted">${esc(r.level)} · ${r.lines.length} lines</span></div>
      </button>`;
  }).join('');
  const books = (LIBRARY.sources || []).filter((s) => s.langs.includes(course.code)).map((s) => `
    <a class="book" href="${esc(s.url)}" target="_blank" rel="noopener">
      <strong>${esc(s.name)}</strong>
      <span class="muted">${esc(s.blurb)}</span>
      <span class="book__lic">${esc(s.by)} · ${esc(s.license)}</span>
    </a>`).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Stories</strong><span></span></header>
      <h3 class="sec">Read in ${esc(course.name)}</h3>
      <p class="muted">Read the story, tap a line to hear it, then answer a few questions. Reading builds real comprehension.</p>
      <div class="stories">${cards || '<p class="muted">Stories coming soon for this language.</p>'}</div>
      <h3 class="sec">Free book libraries</h3>
      <p class="muted">Thousands more children's books in ${esc(course.name)} — all free and openly licensed. Best with internet.</p>
      <div class="books">${books}</div>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', () => renderReadingIntro(b.dataset.read)));
  mount(node);
}

function renderReadingIntro(readId) {
  const r = (course.reading || []).find((x) => x.id === readId);
  if (!r) return renderLibrary();
  const lines = r.lines.map((ln, i) => `
    <button class="rline" data-line="${i}">
      <span class="rline__t">${esc(ln.t)}</span>
      <span class="rline__en muted">${esc(ln.en)}</span>
    </button>`).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Stories</button><strong>${esc(r.title)}</strong><span></span></header>
      <p class="muted">${esc(r.intro || '')}</p>
      <div class="reading">${lines}</div>
      <button class="play-btn" id="playAll">🔊 Play the whole story</button>
      <button class="btn btn--primary" id="quizBtn">I've read it — answer questions</button>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderLibrary);
  node.querySelectorAll('[data-line]').forEach((b) => b.addEventListener('click', () => tryHear(r.lines[b.dataset.line].t, course.code)));
  node.querySelector('#playAll').addEventListener('click', async () => {
    let any = false;
    for (const ln of r.lines) { const ok = await speak(ln.t, course.code); any = any || ok; }
    if (!any) flashToast('Audio for this language isn’t available on this device yet.');
  });
  node.querySelector('#quizBtn').addEventListener('click', () => {
    session = { mode: 'reading', reading: r, lesson: null, queue: r.questions.map((q, i) => ({ ...q, _i: i })), idx: 0, mistakes: 0, total: 0 };
    renderExercise();
  });
  mount(node);
}

// ---------- achievements / badges ----------
function renderAchievements() {
  G.checkAchievements(store);
  const unlocked = store.state.achievements || {};
  const grid = G.ACHIEVEMENTS.map((a) => {
    const got = unlocked[a.id];
    return `<div class="badge-card ${got ? '' : 'badge-card--locked'}">
        <span class="badge-card__icon">${got ? a.icon : '🔒'}</span>
        <strong>${esc(a.name)}</strong>
        <span class="muted">${esc(a.desc)}</span>
        ${got ? `<span class="badge-card__date">${esc(got)}</span>` : ''}
      </div>`;
  }).join('');
  const count = Object.keys(unlocked).length;
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Badges</strong><span>${count}/${G.ACHIEVEMENTS.length}</span></header>
      <div class="badge-grid">${grid}</div>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  mount(node);
}

// ---------- weekly league + gem shop ----------
function renderLeague() {
  G.ensureWeek(store);
  const L = store.lang();
  const lg = L.league;
  const tiers = G.LEAGUES.map((name, i) => `
    <div class="tier ${i === lg.tier ? 'tier--cur' : ''} ${i < lg.tier ? 'tier--past' : ''}">
      <span>${G.leagueIcon(name)}</span><span>${esc(name)}</span>${i === lg.tier ? '<span class="muted">you are here</span>' : ''}
    </div>`).join('');
  const target = G.leagueTarget(lg.tier);
  const pct = Math.min(100, Math.round((lg.weeklyXp / target) * 100));
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>League</strong><span class="stat">💎 ${G.gems(store)}</span></header>
      <section class="card">
        <div class="card__head"><strong>${G.leagueIcon(G.LEAGUES[lg.tier])} ${esc(G.LEAGUES[lg.tier])} League</strong></div>
        <div class="qbar qbar--gold"><div style="width:${pct}%"></div></div>
        <p class="muted">${lg.weeklyXp}/${target} XP this week. Earn XP daily to climb the leagues!</p>
      </section>
      <div class="tiers">${tiers}</div>
      <h3 class="sec">Streak protection</h3>
      <section class="card">
        <p>🔥 Current streak: <strong>${L.streak}</strong> · ❄️ Streak freezes: <strong>${L.streakFreezes || 0}</strong></p>
        <p class="muted">A streak freeze saves your streak if you miss a day. Buy one with gems.</p>
        <button class="btn btn--ghost" id="buyFreeze">Buy streak freeze (💎50)</button>
      </section>
      <h3 class="sec">Gem shop</h3>
      <section class="card">
        <button class="btn btn--ghost" id="buyHearts">Refill hearts (💎30)</button>
      </section>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelector('#buyFreeze').addEventListener('click', () => { if (G.buyStreakFreeze(store)) renderLeague(); else flashToast('Not enough gems'); });
  node.querySelector('#buyHearts').addEventListener('click', () => { if (G.buyHeartsRefill(store)) { flashToast('Hearts refilled!'); renderLeague(); } else flashToast('Not enough gems'); });
  mount(node);
}

function flashToast(msg) {
  const t = h(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

// ---------- rewards shop ----------
function renderShop() {
  const inv = Shop.inventory(store);
  const gems = G.gems(store);

  const powerCard = (p) => `
    <div class="shop-item">
      <span class="shop-item__icon">${p.icon}</span>
      <div class="shop-item__body"><strong>${esc(p.name)}</strong><span class="muted">${esc(p.desc)}</span></div>
      <button class="shop-buy ${gems < p.cost ? 'shop-buy--off' : ''}" data-buy="${p.id}">💎${p.cost}</button>
    </div>`;

  const cosmeticCard = (c, kind) => {
    const owned = inv.owned[c.id];
    const equipped = inv.equipped[kind] === c.id;
    const action = equipped
      ? '<span class="shop-eq">Equipped</span>'
      : owned
        ? `<button class="shop-buy shop-buy--equip" data-equip="${c.id}">Equip</button>`
        : `<button class="shop-buy ${gems < c.cost ? 'shop-buy--off' : ''}" data-buy="${c.id}">💎${c.cost}</button>`;
    return `<div class="shop-item ${equipped ? 'shop-item--eq' : ''}">
      <span class="shop-item__icon">${c.icon}</span>
      <div class="shop-item__body"><strong>${esc(c.name)}</strong><span class="muted">${esc(c.desc || '')}</span></div>
      ${action}
    </div>`;
  };

  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Shop</strong><span class="stat stat--gems">💎 ${gems}</span></header>
      <p class="muted">Earn 💎 gems from quests, badges, daily logins and finishing lessons — then spend them here.</p>

      <h3 class="sec">⚡ Power-ups</h3>
      <div class="shop-list">${Shop.POWERUPS.map(powerCard).join('')}</div>

      <h3 class="sec">🐾 Buddies</h3>
      <div class="shop-list">${Shop.MASCOTS.map((m) => cosmeticCard(m, 'mascot')).join('')}</div>

      <h3 class="sec">🎨 Themes</h3>
      <div class="shop-list">${Shop.THEMES.map((t) => cosmeticCard(t, 'theme')).join('')}</div>

      <h3 class="sec">⭐ Premium</h3>
      <button class="card" id="premiumBanner" style="text-align:left">
        <strong>Unlock everything with Premium</strong>
        <span class="muted">All languages, unlimited hearts, offline book packs and more.</span>
      </button>
    </div>`);

  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelector('#premiumBanner').addEventListener('click', renderPremium);
  node.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
    const res = Shop.buy(store, b.dataset.buy);
    if (res.ok) { Shop.applyTheme(store); flashToast(`Got ${res.item.name}! 🎉`); renderShop(); }
    else flashToast(res.reason);
  }));
  node.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => {
    Shop.equip(store, b.dataset.equip);
    Shop.applyTheme(store);
    flashToast('Equipped!');
    renderShop();
  }));
  mount(node);
}

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

boot();
