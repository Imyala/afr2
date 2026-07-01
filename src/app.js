// app.js — MzansiLingo PWA controller (routing, screens, exercise rendering)
import { store, XP_PER_CORRECT, XP_LESSON_BONUS, MAX_HEARTS } from './store.js';
import { review as srsReview, gradeFor, setDesiredRetention } from './srs.js';
import { speak, recordSupported, startRecording } from './audio.js';
import {
  loadCourse, loadLanguages, allLessons, findLesson, vocabIndex,
  checkAnswer, checkTyped, buildLessonSession, buildReviewSession, exerciseVocabIds, normalize,
} from './lessons.js';
import * as G from './gamify.js';
import * as Shop from './shop.js';
import { sound, haptic, confetti, countUp, pop, setSoundEnabled } from './fx.js';
import { mascotSvg, mascotLine } from './mascot.js';
import * as Notify from './notify.js';

let LIBRARY = null;   // library.json

const app = document.getElementById('app');
let LANGS = null;     // languages.json
let course = null;    // active course
let session = null;   // active lesson/review session

// ---------- tiny DOM helpers ----------
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
function mount(node) {
  app.innerHTML = '';
  app.appendChild(node);
  window.scrollTo(0, 0);
  // a11y: move focus to the new screen's heading so a screen reader announces
  // where we are. Programmatic focus (tabindex -1) is suppressed visually.
  const head = node.querySelector('h1, h2, .ex__q, .topbar strong, .onb__title');
  if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); }
}

// Announce a transient message (answer result, etc.) to assistive tech.
function announce(msg) {
  const el = document.getElementById('srLive');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = msg; });
}

// Make non-button clickable elements (role="button") keyboard-operable.
function wireKeyActivation(root) {
  root.querySelectorAll('[role="button"]').forEach((b) => b.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); }
  }));
}
function fmtTime(ms) { const m = Math.ceil(ms / 60000); return `${m} min`; }
// Time until the weekly league resets (next Monday 00:00).
function weekDaysLeft(now = Date.now()) {
  const d = new Date(now);
  const dayNum = (d.getDay() + 6) % 7;            // Mon = 0
  const nextMon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNum + 7, 0, 0, 0, 0);
  const days = Math.ceil((nextMon.getTime() - now) / 86400000);
  return days <= 1 ? '1 day' : `${days} days`;
}

// ---------- boot ----------
async function boot() {
  Shop.applyTheme(store);
  setSoundEnabled(store.state.settings.soundOn !== false);
  setDesiredRetention(store.state.settings.desiredRetention || 0.9);
  // Re-apply the palette if the OS flips between light/dark so themed accents
  // always use the variant tuned for the current background.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => Shop.applyTheme(store));
  }
  LANGS = await loadLanguages();
  // Migration: anyone with an existing language has already used the app —
  // don't show them onboarding or the first-win taster.
  if (store.state.activeLang && !store.state.settings.onboarded) {
    store.state.settings.onboarded = true;
    store.save();
  }
  // First-ever run: warm welcome + value before asking for any commitment.
  if (!store.state.settings.onboarded && !store.state.activeLang) return renderOnboarding();
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
  // First run: give an instant, guaranteed "I just learned something" win
  // before dropping the learner into the full home screen.
  if (!store.state.settings.onboarded) return renderFirstWin();
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
    b.addEventListener('click', () => { sound.tap(); openLanguage(b.dataset.code); }));
  mount(node);
}

// ---------- onboarding (first run only) ----------
const ONB_SLIDES = [
  { mood: 'wave', title: 'Sawubona! I\'m Themba 👋',
    body: 'I\'ll help you learn a real South African language — one you can actually speak with people around you.' },
  { mood: 'happy', title: 'Real progress, proven',
    body: 'No empty taps. Spaced repetition reviews each word right before you\'d forget it, so it truly sticks — and we measure it.' },
  { mood: 'cheer', title: 'Works offline, free to start',
    body: 'Learn anywhere with no data — on the taxi, at school, at home. Add it to your home screen and go.' },
];
function renderOnboarding(i = 0) {
  const s = ONB_SLIDES[i];
  const last = i === ONB_SLIDES.length - 1;
  const dots = ONB_SLIDES.map((_, k) => `<span class="onb__dot ${k === i ? 'onb__dot--on' : ''}"></span>`).join('');
  const node = h(`
    <div class="screen onb">
      <div class="onb__art">${mascotSvg(s.mood, { size: 150 })}</div>
      <h1 class="onb__title">${esc(s.title)}</h1>
      <p class="onb__body">${esc(s.body)}</p>
      <div class="onb__dots">${dots}</div>
      <div class="onb__actions">
        <button class="btn btn--primary" id="next">${last ? 'Choose your language' : 'Next'}</button>
        ${last ? '' : '<button class="btn btn--ghost" id="skip">Skip</button>'}
      </div>
    </div>`);
  node.querySelector('#next').addEventListener('click', () => {
    sound.tap();
    if (last) renderLanguageSelect(true);
    else renderOnboarding(i + 1);
  });
  const sk = node.querySelector('#skip');
  if (sk) sk.addEventListener('click', () => renderLanguageSelect(true));
  mount(node);
}

// ---------- first-win taster ----------
// A guaranteed quick success: meet 3 words, then get one right. The dopamine
// hit before the full app appears is what turns a visitor into a learner.
function renderFirstWin(step = 0, picks = null) {
  if (!picks) {
    const first = allLessons(course)[0];
    picks = (first.vocab || []).slice(0, 3);
    if (picks.length < 3) { finishOnboarding(); return; }
  }
  // steps 0..2 = flashcard intros, step 3 = a recognition check, step 4 = celebrate
  if (step <= 2) {
    const w = picks[step];
    const node = h(`
      <div class="screen onb">
        <p class="muted">Your first words · ${step + 1} of 3</p>
        <div class="onb__art">${mascotSvg('happy', { size: 96 })}</div>
        <div class="wotd-big">
          <strong>${esc(w.term)}</strong>
          <span class="wotd-big__phon muted">${esc(w.phonetic || '')}</span>
          <span class="wotd-big__tr">${esc(w.translation)}</span>
        </div>
        <button class="play-btn" id="hear">🔊 Hear it</button>
        <div class="onb__actions"><button class="btn btn--primary" id="next">${step === 2 ? 'Try it out' : 'Next word'}</button></div>
      </div>`);
    node.querySelector('#hear').addEventListener('click', () => tryHear(w.term, course.code));
    speak(w.term, course.code);
    node.querySelector('#next').addEventListener('click', () => { sound.tap(); renderFirstWin(step + 1, picks); });
    mount(node);
    return;
  }
  if (step === 3) {
    const w = picks[0];
    const others = picks.slice(1).map((p) => p.translation);
    const options = shuffle([w.translation, ...others]);
    const node = h(`
      <div class="screen onb">
        <div class="onb__art">${mascotSvg('think', { size: 96 })}</div>
        <h2 class="ex__q">What does “${esc(w.term)}” mean?</h2>
        <div class="opts">${options.map((o) => `<button class="opt" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      </div>`);
    node.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
      const ok = normalize(b.dataset.val) === normalize(w.translation);
      node.querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
      b.classList.add(ok ? 'opt--ok' : 'opt--bad');
      if (ok) { sound.correct(); haptic(15); } else { sound.wrong(); haptic([10, 40, 10]); }
      // introduce the 3 words into the real SRS schedule so this counts
      picks.forEach((p) => { srsReview(store.item(p.id), gradeFor(true, 'multiple_choice'), 'multiple_choice'); });
      store.save();
      setTimeout(() => renderFirstWin(4, picks), 800);
    }));
    mount(node);
    return;
  }
  // celebrate
  confetti();
  sound.complete();
  haptic([15, 30, 15]);
  const chips = picks.map((p) => `<span class="win-word">${esc(p.term)}</span>`).join('');
  const node = h(`
    <div class="screen onb">
      <div class="onb__art">${mascotSvg('cheer', { size: 150 })}</div>
      <h1 class="onb__title">You just learned 3 words! 🎉</h1>
      <div class="win-words">${chips}</div>
      <p class="onb__body">That's how it works — short, real, and it sticks. Ready for your first full lesson?</p>
      <div class="onb__actions"><button class="btn btn--primary" id="go">Start learning</button></div>
    </div>`);
  node.querySelector('#go').addEventListener('click', () => { sound.tap(); promptReminders(); });
  mount(node);
}

// Offer daily reminders once, right after the first win (peak motivation).
function promptReminders() {
  if (!Notify.supported() || Notify.permission() !== 'default') return finishOnboarding();
  const node = h(`
    <div class="screen onb">
      <div class="onb__art">${mascotSvg('wave', { size: 130 })}</div>
      <h1 class="onb__title">Want a daily nudge? 🔥</h1>
      <p class="onb__body">A gentle reminder helps you keep your streak and actually learn. No spam — just once a day if you haven't practised.</p>
      <div class="onb__actions">
        <button class="btn btn--primary" id="yes">Yes, remind me</button>
        <button class="btn btn--ghost" id="no">Not now</button>
      </div>
    </div>`);
  node.querySelector('#yes').addEventListener('click', async () => { await Notify.enable(store); finishOnboarding(); });
  node.querySelector('#no').addEventListener('click', finishOnboarding);
  mount(node);
}

function finishOnboarding() {
  store.state.settings.onboarded = true;
  store.save();
  const dr = G.dailyRewardStatus(store);
  if (dr.canClaim) return renderDailyReward();
  renderHome();
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
  // which units are already fully complete (so we only offer "test out" on the rest)
  const unitComplete = {};
  for (const u of course.units) unitComplete[u.id] = u.lessons.length > 0 && u.lessons.every((l) => store.isLessonComplete(l.id));
  let lastUnit = null;
  let activeMarked = false;
  const path = lessons.map((l, i) => {
    const done = store.isLessonComplete(l.id);
    const stars = L.lessonStars[l.id] || 0;
    const prevDone = i === 0 || store.isLessonComplete(lessons[i - 1].id);
    const locked = !done && !prevDone;
    // The first available, not-yet-finished lesson is the learner's clear
    // next step — highlight it so the eye lands on what to do now.
    const active = !done && !locked && !activeMarked;
    if (active) activeMarked = true;
    const unitHeader = l.unitTitle !== lastUnit
      ? `<div class="unit-head"><span>${esc(l.unitTitle)}</span><div class="unit-head__right"><small>${esc(l.level)}</small>${!unitComplete[l.unitId] ? `<button class="testout-btn" data-testout="${esc(l.unitId)}">Test out</button>` : ''}</div></div>`
      : '';
    lastUnit = l.unitTitle;
    const starHtml = done ? `<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` : '';
    const cta = active ? '<span class="node__cta">START</span>' : '';
    return `${unitHeader}
      <button class="node ${done ? 'node--done' : ''} ${locked ? 'node--locked' : ''} ${active ? 'node--active' : ''}" data-lesson="${l.id}" ${locked ? 'disabled' : ''}>
        <span class="node__icon">${done ? '✓' : locked ? '🔒' : i + 1}</span>
        <span class="node__title">${esc(l.title)}</span>
        ${active ? cta : starHtml}
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
  const lgRank = G.leagueRank(store);
  const hasReading = (course.reading || []).length > 0;
  const mascot = Shop.equippedMascot(store);
  const wotd = wordOfTheDay();
  const wotdLearned = (L.wotd && L.wotd.day === todayStr() && L.wotd.learned);
  const boostN = Shop.inventory(store).boosts.double_xp || 0;

  const node = h(`
    <div class="screen">
      <h1 class="sr-only">MzansiLingo — ${esc(meta.name)} home</h1>
      <header class="topbar">
        <button class="topbar__lang" id="switchLang">${esc(meta.name)} ▾</button>
        <div class="topbar__stats">
          <span class="stat stat--streak" id="streakBtn" role="button" tabindex="0" aria-label="Day streak ${L.streak}. Open league.">🔥 ${L.streak}</span>
          <span class="stat stat--gems" id="gemsBtn" role="button" tabindex="0" aria-label="${G.gems(store)} gems. Open shop.">💎 ${G.gems(store)}</span>
          <span class="stat stat--hearts" id="heartsBtn" role="button" tabindex="0" aria-label="${store.state.premium ? 'Unlimited hearts' : `${L.hearts} of ${MAX_HEARTS} hearts`}">${store.state.premium ? '❤️∞' : `${'❤️'.repeat(L.hearts)}${'🤍'.repeat(MAX_HEARTS - L.hearts)}`}</span>
          <button class="stat" id="settingsBtn" aria-label="Settings" style="background:none;border:none;font-size:18px">⚙️</button>
        </div>
      </header>

      <div class="mascot-row">
        <span class="goal__mascot">${mascotSvg(pct >= 100 ? 'cheer' : 'idle', { size: 64, decorative: true })}</span>
        <div class="speech">${pct >= 100 ? mascotLine('cheer', L.streak) : esc(homeGreeting(L, due))}</div>
      </div>

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

      ${L.plan
    ? `<button class="plan-card" id="planBtn"><span class="plan-card__l">📅 <b>Day ${L.plan.day}/90</b> · today's loop</span><span class="plan-card__r">${Object.values(L.plan.done).filter(Boolean).length}/4 ›</span></button>`
    : '<button class="plan-card plan-card--start" id="planBtn"><span class="plan-card__l">📅 <b>Start your 90-day plan</b></span><span class="plan-card__r">guided daily path ›</span></button>'}

      <button class="btn btn--review" id="reviewBtn" ${due ? '' : 'disabled'}>
        🔁 Review ${due ? `<span class="badge">${due} due</span>` : '<span class="muted">none due</span>'}
      </button>

      <div class="mini-row">
        <button class="mini" id="questsBtn">
          <span class="mini__top">🎯 Quests <b>${questsDone}/${quests.length}</b></span>
          <span class="qbar"><span style="width:${Math.round((questsDone / quests.length) * 100)}%"></span></span>
        </button>
        <button class="mini" id="leagueBtn">
          <span class="mini__top">${G.leagueIcon(G.LEAGUES[lg.tier])} ${esc(G.LEAGUES[lg.tier])} <b>#${lgRank.rank}</b></span>
          <span class="qbar qbar--gold"><span style="width:${Math.round(((G.LEAGUE_SIZE - lgRank.rank + 1) / G.LEAGUE_SIZE) * 100)}%"></span></span>
        </button>
      </div>

      ${wotd ? `<button class="wotd-strip" id="wotdBtn">
        🗓️ <span class="muted">Word of the day:</span> <b>${esc(wotd.term)}</b> — ${esc(wotd.translation)} ${wotdLearned ? '✓' : '🔊'}
      </button>` : ''}

      <button class="wotd-strip" id="glossaryBtn">
        📒 <span class="muted">Word list —</span> <b>browse all ${Object.keys(vocabIndex(course)).length} words</b> →
      </button>

      <button class="wotd-strip" id="speakBtn">
        🎤 <span class="muted">Speaking —</span> <b>say your words out loud</b> →
      </button>

      <button class="wotd-strip" id="listenBtn">
        👂 <span class="muted">Listening —</span> <b>understand it by ear</b> →
      </button>

      ${(course.dialogues || []).length ? `<button class="wotd-strip" id="dialogueBtn">
        💬 <span class="muted">Conversations —</span> <b>practise real-life chats</b> →
      </button>` : ''}

      ${(course.grammar || []).length ? `<button class="wotd-strip" id="grammarBtn">
        🧩 <span class="muted">Grammar —</span> <b>learn the patterns to build sentences</b> →
      </button>` : ''}

      <div class="path">${path}</div>
      <nav class="bottombar" aria-label="Main">
        <button class="navbtn navbtn--active" aria-current="page">🏠 Home</button>
        <button class="navbtn" id="storiesNav" ${hasReading ? '' : 'disabled'}>📖 Stories</button>
        <button class="navbtn" id="shopNav">🛒 Shop</button>
        <button class="navbtn" id="achBtn">🏅 Badges</button>
        <button class="navbtn" id="progressBtn2">📊 Progress</button>
      </nav>
    </div>`);

  node.querySelectorAll('[data-lesson]').forEach((b) =>
    b.addEventListener('click', () => startLesson(b.dataset.lesson)));
  node.querySelectorAll('[data-testout]').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); confirmTestOut(b.dataset.testout); }));
  node.querySelector('#switchLang').addEventListener('click', () => renderLanguageSelect(false));
  node.querySelector('#reviewBtn').addEventListener('click', startReview);
  node.querySelector('#planBtn').addEventListener('click', renderPlan);
  node.querySelector('#storiesNav').addEventListener('click', renderLibrary);
  node.querySelector('#glossaryBtn').addEventListener('click', () => renderGlossary());
  node.querySelector('#speakBtn').addEventListener('click', startSpeaking);
  node.querySelector('#listenBtn').addEventListener('click', startListening);
  const gb = node.querySelector('#grammarBtn'); if (gb) gb.addEventListener('click', renderGrammar);
  const db = node.querySelector('#dialogueBtn'); if (db) db.addEventListener('click', renderDialogues);
  node.querySelector('#shopNav').addEventListener('click', renderShop);
  node.querySelector('#questsBtn').addEventListener('click', renderQuests);
  node.querySelector('#leagueBtn').addEventListener('click', renderLeague);
  node.querySelector('#achBtn').addEventListener('click', renderAchievements);
  node.querySelector('#progressBtn2').addEventListener('click', renderProgress);
  node.querySelector('#gemsBtn').addEventListener('click', renderShop);
  node.querySelector('#streakBtn').addEventListener('click', renderLeague);
  node.querySelector('#heartsBtn').addEventListener('click', () => { if (store.lang().hearts < MAX_HEARTS) renderHeartsModal(); });
  node.querySelector('#settingsBtn').addEventListener('click', renderSettings);
  const wb = node.querySelector('#wotdBtn'); if (wb) wb.addEventListener('click', renderWotd);
  wireKeyActivation(node);
  mount(node);
  // keep the reminder state fresh for the service worker, and arm a same-session
  // nudge in case the learner leaves the tab open without practising
  Notify.syncState(store);
  Notify.armSessionFallback(store);
}

// A friendly, situation-aware line for the home mascot.
function homeGreeting(L, due) {
  if (due > 0) return `${due} word${due === 1 ? '' : 's'} ready to review — let's lock them in!`;
  if ((L.streak || 0) >= 3) return `${L.streak}-day streak! Keep it burning. 🔥`;
  return mascotLine('idle', (L.xp || 0) + (L.streak || 0));
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

// ---------- glossary / word list ----------
function masteryOf(id) {
  const it = store.lang().items[id];
  if (!it || !it.seen) return { cls: 'new', label: 'New' };
  if (it.mastered) return { cls: 'mastered', label: 'Mastered' };
  return { cls: 'learning', label: 'Learning' };
}

function renderGlossary() {
  const lessons = allLessons(course);
  const L = store.lang();
  const idx = vocabIndex(course);

  // toughest words: seen at least twice, ranked by lowest recall accuracy
  const hardest = Object.entries(L.items)
    .filter(([id, it]) => it.seen >= 2 && idx[id] && it.correct / it.seen < 1)
    .map(([id, it]) => ({ v: idx[id], acc: it.correct / it.seen }))
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 6);

  const hardestHtml = hardest.length ? `
    <h3 class="sec">Toughest words</h3>
    <p class="muted">The words tripping you up most — give them some love.</p>
    <div class="gloss-list">
      ${hardest.map(({ v, acc }) => `
        <button class="gloss-row gloss-row--hard" data-hear="${esc(v.term)}">
          <span class="gloss-term"><b>${esc(v.term)}</b><span class="muted">${esc(v.phonetic || '')}</span></span>
          <span class="gloss-tr">${esc(v.translation)}</span>
          <span class="gloss-acc">${Math.round(acc * 100)}%</span>
        </button>`).join('')}
    </div>
    <button class="btn btn--ghost" id="practiseHard">🔁 Practise these words</button>` : '';

  // full list grouped by unit
  let lastUnit = null;
  let groups = '';
  for (const l of lessons) {
    if (l.unitTitle !== lastUnit) {
      if (lastUnit !== null) groups += '</div></div>';
      groups += `<div class="gloss-group"><h4 class="gloss-unit">${esc(l.unitTitle)}</h4><div class="gloss-list">`;
      lastUnit = l.unitTitle;
    }
    for (const v of (l.vocab || [])) {
      const m = masteryOf(v.id);
      groups += `
        <button class="gloss-row" data-hear="${esc(v.term)}" data-search="${esc(normalize(`${v.term} ${v.translation}`))}">
          <span class="gloss-term"><b>${esc(v.term)}</b><span class="muted">${esc(v.phonetic || '')}</span></span>
          <span class="gloss-tr">${esc(v.translation)}</span>
          <span class="gloss-pill gloss-pill--${m.cls}">${m.label}</span>
        </button>`;
    }
  }
  if (lastUnit !== null) groups += '</div></div>';

  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Word list</strong><span></span></header>
      <input class="ex__input" id="glossSearch" placeholder="Search ${esc(course.name)} or English…" autocomplete="off" autocapitalize="off" />
      ${hardestHtml}
      <h3 class="sec">All words</h3>
      <div id="glossAll">${groups}</div>
      <p class="footnote">Tap a word to hear it. “Mastered” means you produced it from memory and it survived a spaced review.</p>
    </div>`);

  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelectorAll('[data-hear]').forEach((b) => b.addEventListener('click', () => tryHear(b.dataset.hear, course.code)));
  const ph = node.querySelector('#practiseHard');
  if (ph) ph.addEventListener('click', () => {
    if (store.lang().hearts <= 0) return renderHeartsModal();
    session = { mode: 'review', lesson: null, queue: buildReviewSession(course, hardest.map((x) => x.v.id)), idx: 0, mistakes: 0, total: 0 };
    renderExercise();
  });
  const search = node.querySelector('#glossSearch');
  search.addEventListener('input', () => {
    const q = normalize(search.value);
    node.querySelectorAll('#glossAll .gloss-group').forEach((g) => {
      let any = false;
      g.querySelectorAll('.gloss-row').forEach((r) => {
        const hit = !q || (r.dataset.search || '').includes(q);
        r.style.display = hit ? '' : 'none';
        if (hit) any = true;
      });
      g.style.display = any ? '' : 'none';
    });
  });
  mount(node);
}

// ---------- speaking practice (shadow & self-record) ----------
// Output practice toward spoken fluency: hear the model, say it aloud, record &
// compare, then self-rate. No speech recognition (unreliable for SA languages) —
// honest self-assessment, works offline. Self-rating reinforces the review
// schedule but does NOT grant production mastery (that still needs typing).
function speakingItems() {
  const items = [];
  for (const l of allLessons(course)) for (const p of (l.phrases || [])) {
    items.push({ text: p.t, meaning: p.en, phonetic: '', ids: exerciseVocabIds({ type: 'word_bank', answer: p.t }, l) });
  }
  const idx = vocabIndex(course);
  const L = store.lang();
  const pickIds = [...new Set([...store.dueItems(), ...shuffle(Object.keys(L.items).filter((id) => L.items[id].seen > 0))])].slice(0, 8);
  for (const id of pickIds) { const v = idx[id]; if (v) items.push({ text: v.term, meaning: v.translation, phonetic: v.phonetic || '', ids: [id] }); }
  if (!items.length) for (const v of Object.values(idx).slice(0, 8)) items.push({ text: v.term, meaning: v.translation, phonetic: v.phonetic || '', ids: [v.id] });
  return shuffle(items).slice(0, 10);
}

let speakSession = null;

function startSpeaking() {
  speakSession = { items: speakingItems(), idx: 0, done: 0 };
  if (!speakSession.items.length) return renderHome();
  renderSpeaking();
}

function renderSpeaking() {
  const s = speakSession;
  if (s.idx >= s.items.length) return renderSpeakingDone();
  const it = s.items[s.idx];
  const node = h(`
    <div class="screen ex">
      <header class="ex__top">
        <button class="ex__quit" id="quitBtn" aria-label="Quit">✕</button>
        <div class="ex__bar"><div class="ex__bar-fill" style="width:${Math.round((s.idx / s.items.length) * 100)}%"></div></div>
        <span class="muted">${s.idx + 1}/${s.items.length}</span>
      </header>
      <div class="ex__body">
        <h2 class="ex__q">Say it out loud 🎤</h2>
        <div class="wotd-big">
          <strong>${esc(it.text)}</strong>
          ${it.phonetic ? `<span class="wotd-big__phon muted">${esc(it.phonetic)}</span>` : ''}
          <span class="wotd-big__tr">${esc(it.meaning)}</span>
        </div>
        <button class="play-btn" id="hearBtn">🔊 Hear it</button>
        <div class="spk-rec" id="recArea">
          ${recordSupported() ? '<button class="btn btn--ghost" id="recBtn">🎤 Record yourself</button>' : '<p class="muted">Say it aloud, listen to the model, then rate yourself.</p>'}
        </div>
      </div>
      <div class="ex__foot">
        <p class="muted" style="text-align:center">Listen, repeat, then rate yourself honestly.</p>
        <button class="btn btn--primary" id="goodBtn">✓ I said it well</button>
        <button class="btn btn--ghost" id="againBtn">↻ Hear it again</button>
      </div>
    </div>`);
  node.querySelector('#quitBtn').addEventListener('click', () => { speakSession = null; renderHome(); });
  node.querySelector('#hearBtn').addEventListener('click', () => tryHear(it.text, course.code));
  speak(it.text, course.code);
  node.querySelector('#againBtn').addEventListener('click', () => tryHear(it.text, course.code));
  node.querySelector('#goodBtn').addEventListener('click', () => {
    for (const id of it.ids) srsReview(store.item(id), gradeFor(true, 'multiple_choice'), 'multiple_choice');
    store.addXp(5); store.save();
    s.done += 1; s.idx += 1; sound.correct(); haptic(12);
    renderSpeaking();
  });
  const recBtn = node.querySelector('#recBtn');
  if (recBtn) {
    let handle = null;
    recBtn.addEventListener('click', async () => {
      if (!handle) {
        try {
          handle = await startRecording();
          recBtn.textContent = '■ Stop'; recBtn.classList.add('spk-recording');
        } catch (e) { flashToast('Microphone unavailable — say it aloud and self-rate.'); recBtn.remove(); }
      } else {
        const blob = await handle.stop(); handle = null;
        recBtn.textContent = '🎤 Record again'; recBtn.classList.remove('spk-recording');
        const url = URL.createObjectURL(blob);
        let play = node.querySelector('#playYours');
        if (!play) { play = h('<button class="btn btn--ghost" id="playYours">▶ Play your recording</button>'); node.querySelector('#recArea').appendChild(play); }
        play.onclick = () => { try { new Audio(url).play(); } catch (e) {} };
      }
    });
  }
  mount(node);
}

function renderSpeakingDone() {
  const done = speakSession ? speakSession.done : 0;
  speakSession = null;
  markPlan('output');
  confetti({ count: 60, duration: 1100 }); sound.complete(); haptic([15, 30, 15]);
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotSvg('cheer', { size: 110 })}</div>
      <h1>Speaking practice done!</h1>
      <p class="muted">You used your voice on ${done} ${done === 1 ? 'item' : 'items'}. Saying words out loud is how spoken fluency grows.</p>
      <button class="btn btn--primary" id="doneBtn">Continue</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', renderHome);
  mount(node);
}

// ---------- listening practice (comprehension from audio) ----------
// Hear it, then pick the meaning. Audio-first (the text is hidden until you
// answer or tap "Show text"), so it trains listening — but never blocks: where
// no voice exists, "Show text" turns it into reading comprehension.
function listeningItems() {
  const idx = vocabIndex(course);
  const pool = Object.values(idx);
  const items = [];
  const allEns = [];
  for (const l of allLessons(course)) for (const p of (l.phrases || [])) allEns.push(p.en);
  for (const l of allLessons(course)) for (const p of (l.phrases || [])) {
    const distract = shuffle(allEns.filter((e) => normalize(e) !== normalize(p.en))).filter((e, i, a) => a.indexOf(e) === i).slice(0, 3);
    if (distract.length < 2) continue;
    items.push({ text: p.t, phonetic: '', answer: p.en, options: shuffle([p.en, ...distract]), ids: exerciseVocabIds({ type: 'word_bank', answer: p.t }, l) });
  }
  const L = store.lang();
  const pick = [...new Set([...store.dueItems(), ...shuffle(Object.keys(L.items).filter((id) => L.items[id].seen > 0))])].slice(0, 8);
  const base = pick.length ? pick : Object.keys(idx).slice(0, 8);
  for (const id of base) {
    const v = idx[id]; if (!v) continue;
    const distract = shuffle(pool.filter((o) => normalize(o.translation) !== normalize(v.translation))).slice(0, 3).map((o) => o.translation);
    items.push({ text: v.term, phonetic: v.phonetic || '', answer: v.translation, options: shuffle([v.translation, ...distract]), ids: [id] });
  }
  return shuffle(items).slice(0, 10);
}

let listenSession = null;
function startListening() {
  listenSession = { items: listeningItems(), idx: 0, done: 0 };
  if (!listenSession.items.length) return renderHome();
  renderListening();
}

function renderListening() {
  const s = listenSession;
  if (s.idx >= s.items.length) return renderListeningDone();
  const it = s.items[s.idx];
  const node = h(`
    <div class="screen ex">
      <header class="ex__top">
        <button class="ex__quit" id="quitBtn" aria-label="Quit">✕</button>
        <div class="ex__bar"><div class="ex__bar-fill" style="width:${Math.round((s.idx / s.items.length) * 100)}%"></div></div>
        <span class="muted">${s.idx + 1}/${s.items.length}</span>
      </header>
      <div class="ex__body">
        <h2 class="ex__q">👂 What did you hear?</h2>
        <button class="play-btn" id="playBtn">🔊 Play again</button>
        <div class="lst-reveal" id="reveal" hidden>
          <strong>${esc(it.text)}</strong> ${it.phonetic ? `<span class="muted">${esc(it.phonetic)}</span>` : ''}
        </div>
        <div class="opts">${it.options.map((o) => `<button class="opt" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        <button class="btn btn--ghost" id="showText">Can't hear it? Show text</button>
      </div>
      <div class="ex__foot" id="foot"></div>
    </div>`);
  node.querySelector('#quitBtn').addEventListener('click', () => { listenSession = null; renderHome(); });
  const reveal = node.querySelector('#reveal');
  node.querySelector('#playBtn').addEventListener('click', () => tryHear(it.text, course.code));
  node.querySelector('#showText').addEventListener('click', () => { reveal.hidden = false; });
  speak(it.text, course.code);
  node.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
    const ok = normalize(b.dataset.val) === normalize(it.answer);
    node.querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
    b.classList.add(ok ? 'opt--ok' : 'opt--bad');
    if (!ok) node.querySelectorAll('.opt').forEach((x) => { if (normalize(x.dataset.val) === normalize(it.answer)) x.classList.add('opt--ok'); });
    reveal.hidden = false;
    if (ok) { sound.correct(); haptic(12); } else { sound.wrong(); haptic([10, 40, 10]); }
    announce(ok ? 'Correct!' : `Not quite. It was ${it.text}, meaning ${it.answer}`);
    for (const id of it.ids) srsReview(store.item(id), gradeFor(ok, 'multiple_choice'), 'multiple_choice');
    if (ok) { store.addXp(5); s.done += 1; }
    store.save();
    const foot = node.querySelector('#foot');
    foot.innerHTML = '<button class="btn btn--primary" id="next">Continue</button>';
    foot.querySelector('#next').addEventListener('click', () => { sound.tap(); s.idx += 1; renderListening(); });
    foot.querySelector('#next').focus();
  }));
  mount(node);
}

function renderListeningDone() {
  const done = listenSession ? listenSession.done : 0;
  listenSession = null;
  markPlan('input');
  confetti({ count: 60, duration: 1100 }); sound.complete(); haptic([15, 30, 15]);
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotSvg('cheer', { size: 110 })}</div>
      <h1>Listening practice done!</h1>
      <p class="muted">You understood ${done} from sound. Training your ear is how real comprehension grows.</p>
      <button class="btn btn--primary" id="doneBtn">Continue</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', renderHome);
  mount(node);
}

// ---------- 90-day guided curriculum ----------
// A structured daily loop — interleaved review → new lesson → comprehensible
// input → pushed output — the research-backed sequence, tracked over 90 days.
function markPlan(type) {
  const L = store.lang();
  if (!L.plan || L.plan.completed) return;
  if (type && !L.plan.done[type]) L.plan.done[type] = true;
  if (!L.plan.done.review && store.dueItems().length === 0) L.plan.done.review = true; // nothing to review
  const d = L.plan.done;
  if (d.review && d.lesson && d.input && d.output) {
    const finished = L.plan.day;
    if (L.plan.day >= 90) { L.plan.completed = true; store.save(); flashToast('🎉 You finished the 90-day plan!'); }
    else { L.plan.day += 1; L.plan.done = { review: false, lesson: false, input: false, output: false }; store.save(); flashToast(`Day ${finished} complete! 🎉`); }
  } else { store.save(); }
}

function planActivities() {
  const done = store.lang().plan.done;
  const lessons = allLessons(course);
  const nextLesson = lessons.find((l) => !store.isLessonComplete(l.id));
  const due = store.dueItems().length;
  const hasReading = (course.reading || []).length > 0;
  const hasDialogue = (course.dialogues || []).length > 0;
  return [
    { key: 'review', icon: '🔁', label: 'Warm-up review', sub: due > 0 ? `${due} words are due` : 'nothing due — auto-done', done: done.review, action: due > 0 ? () => startReview() : null },
    { key: 'lesson', icon: '📘', label: nextLesson ? `Learn: ${nextLesson.title}` : 'Learn: all lessons done!', sub: nextLesson ? 'a new lesson' : 'try grammar or review', done: done.lesson, action: nextLesson ? () => startLesson(nextLesson.id) : () => ((course.grammar || []).length ? renderGrammar() : startReview()) },
    { key: 'input', icon: '📖', label: 'Input: read or listen', sub: 'understand real language', done: done.input, action: () => (hasReading ? renderLibrary() : startListening()) },
    { key: 'output', icon: '🗣️', label: 'Output: speak or converse', sub: 'use it out loud', done: done.output, action: () => (hasDialogue ? renderDialogues() : startSpeaking()) },
  ];
}

function renderPlanIntro() {
  const node = h(`
    <div class="screen screen--center">
      <div class="onb__art">${mascotSvg('wave', { size: 130 })}</div>
      <h1>Your 90-day plan</h1>
      <p class="onb__body">A guided daily loop — review, a new lesson, real input, and speaking practice — built to get you conversational in ${esc(course.name)} in about 3 months. Show up every day and we'll track the journey.</p>
      <div class="onb__actions">
        <button class="btn btn--primary" id="start">Start my 90 days</button>
        <button class="btn btn--ghost" id="back">Maybe later</button>
      </div>
    </div>`);
  node.querySelector('#start').addEventListener('click', () => { store.startPlan(); sound.reward(); confetti({ count: 60 }); renderPlan(); });
  node.querySelector('#back').addEventListener('click', renderHome);
  mount(node);
}

function renderPlan() {
  const L = store.lang();
  if (!L.plan) return renderPlanIntro();
  const p = L.plan;
  if (!p.done.review && store.dueItems().length === 0) { p.done.review = true; store.save(); }
  const acts = planActivities();
  const doneCount = acts.filter((a) => a.done).length;
  const allDone = doneCount === acts.length;
  const pct = Math.round(((p.day - 1) / 90) * 100);
  const rows = acts.map((a) => `
    <div class="plan-act ${a.done ? 'plan-act--done' : ''}">
      <span class="plan-act__icon">${a.done ? '✅' : a.icon}</span>
      <div class="plan-act__body"><strong>${esc(a.label)}</strong><span class="muted">${esc(a.sub)}</span></div>
      ${a.done ? '<span class="plan-act__ok">Done</span>' : `<button class="plan-act__go" data-act="${a.key}">Start</button>`}
    </div>`).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>90-Day Plan</strong><span></span></header>
      <div class="level-card">
        <span class="level-card__tag">${p.completed ? 'Plan complete! 🎉' : `Day ${p.day} of 90`}</span>
        <span class="level-card__sub">${p.completed ? 'You finished — keep the habit going' : `Guided path to conversational ${esc(course.name)}`}</span>
      </div>
      <div class="mastery-bar"><div class="mastery-bar__fill" style="width:${pct}%"></div><span>Day ${p.day} / 90</span></div>
      <h3 class="sec">Today's loop ${allDone ? '✓' : `· ${doneCount}/${acts.length}`}</h3>
      <p class="muted" style="margin:0 4px">Review locks in old words → a new lesson adds more → input builds understanding → output builds speaking.</p>
      <div class="set-list">${rows}</div>
      ${allDone ? '<div class="plan-complete">🎉 Loop done! Come back tomorrow — daily practice is what makes 90 days work.</div>' : ''}
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = acts.find((x) => x.key === b.dataset.act); if (a && a.action) a.action();
  }));
  mount(node);
}

// ---------- task-based dialogues (communicative practice) ----------
// Real scenarios (spaza shop, meeting a friend): the NPC speaks, the learner
// chooses an appropriate reply. Turns vocabulary into communicative ability,
// and the lines feed the review schedule (input-first). Offline & branching.
function renderDialogues() {
  const dias = course.dialogues || [];
  const L = store.lang();
  const rows = dias.map((d) => {
    const done = (L.completedDialogues || []).includes(d.id);
    return `<button class="story ${done ? 'story--done' : ''}" data-d="${esc(d.id)}">
        <span class="story__icon">${done ? '✅' : '💬'}</span>
        <div class="story__body"><strong>${esc(d.title)}</strong><span class="muted">🎯 ${esc(d.goal)}</span></div>
      </button>`;
  }).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Conversations</strong><span></span></header>
      <p class="muted">Practise real conversations. The other person speaks — you choose how to reply.</p>
      <div class="stories">${rows || '<p class="muted">Conversations coming soon for this language.</p>'}</div>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => startDialogue(b.dataset.d)));
  mount(node);
}

let dlg = null;
function startDialogue(id) {
  const d = (course.dialogues || []).find((x) => x.id === id);
  if (!d) return renderDialogues();
  dlg = { d, idx: 0, log: [], mistakes: 0 };
  advanceDialogueNpc();
  renderDialogue();
}
function advanceDialogueNpc() {
  const turns = dlg.d.turns;
  while (dlg.idx < turns.length && turns[dlg.idx].speaker === 'npc') {
    const t = turns[dlg.idx];
    dlg.log.push({ who: 'npc', name: t.name || '', t: t.t, en: t.en });
    dlg.idx += 1;
  }
}
function renderDialogue() {
  const d = dlg.d;
  const done = dlg.idx >= d.turns.length;
  const cur = done ? null : d.turns[dlg.idx];
  const shown = cur ? shuffle(cur.options.slice()) : [];
  const bubbles = dlg.log.map((m) => `
    <div class="dbubble dbubble--${m.who}">
      ${m.who === 'npc' && m.name ? `<span class="dbubble__name">${esc(m.name)}</span>` : ''}
      <button class="dbubble__t" data-hear="${esc(m.t)}">${esc(m.t)} 🔊</button>
      <span class="dbubble__en">${esc(m.en)}</span>
    </div>`).join('');
  const opts = shown.map((o, i) => `<button class="opt dopt" data-i="${i}"><b>${esc(o.t)}</b><span class="opt__en muted">${esc(o.en)}</span></button>`).join('');
  const foot = done
    ? '<button class="btn btn--primary" id="finishBtn">✓ Conversation complete</button>'
    : `<p class="ex__hint muted">${esc(cur.prompt || 'Your turn — choose a reply:')}</p><div class="opts dlg-opts">${opts}</div>`;
  const node = h(`
    <div class="screen ex">
      <header class="ex__top">
        <button class="ex__quit" id="quitBtn" aria-label="Quit">✕</button>
        <div class="dlg-goal">🎯 ${esc(d.goal)}</div>
      </header>
      <div class="dchat">${bubbles}</div>
      <div class="ex__foot" id="foot">${foot}</div>
    </div>`);
  node.querySelector('#quitBtn').addEventListener('click', () => { dlg = null; renderDialogues(); });
  node.querySelectorAll('[data-hear]').forEach((b) => b.addEventListener('click', () => tryHear(b.dataset.hear, course.code)));
  // autoplay the most recent NPC line
  const lastNpc = [...dlg.log].reverse().find((m) => m.who === 'npc');
  if (lastNpc) speak(lastNpc.t, course.code);
  if (cur) {
    node.querySelectorAll('.dopt').forEach((b) => b.addEventListener('click', () => {
      const choice = shown[b.dataset.i];
      if (choice.ok) {
        sound.correct(); haptic(12);
        dlg.log.push({ who: 'you', name: '', t: choice.t, en: choice.en });
        dlg.idx += 1;
        advanceDialogueNpc();
        renderDialogue();
      } else {
        dlg.mistakes += 1;
        sound.wrong(); haptic([10, 40, 10]);
        b.classList.add('opt--bad'); b.disabled = true;
        flashToast('Not quite — try a different reply.');
      }
    }));
  }
  const fin = node.querySelector('#finishBtn');
  if (fin) fin.addEventListener('click', finishDialogue);
  mount(node);
}
function finishDialogue() {
  const d = dlg.d;
  const L = store.lang();
  if (!(L.completedDialogues || (L.completedDialogues = [])).includes(d.id)) L.completedDialogues.push(d.id);
  // input-first: seed the conversation's vocabulary into the review schedule
  const idx = vocabIndex(course);
  const byTerm = {}; for (const v of Object.values(idx)) byTerm[normalize(v.term)] = v.id;
  const text = normalize(d.turns.map((t) => t.t || (t.options || []).map((o) => o.t).join(' ')).join(' '));
  const seeded = new Set();
  for (const [term, id] of Object.entries(byTerm)) {
    if (term && !seeded.has(id) && (text === term || text.includes(` ${term} `) || text.startsWith(`${term} `) || text.endsWith(` ${term}`))) {
      seeded.add(id); const it = store.item(id); if (!it.seen) srsReview(it, gradeFor(true, 'multiple_choice'), 'multiple_choice');
    }
  }
  const perfect = dlg.mistakes === 0;
  const xp = perfect ? 25 : 15;
  store.addXp(xp); store.state.gems = (store.state.gems || 0) + 5;
  G.track(store, 'xp', { amount: xp }); G.checkAchievements(store); store.save(); markPlan('output');
  dlg = null;
  confetti({ count: 80, duration: 1200 }); sound.complete(); haptic([15, 30, 15]);
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotSvg('cheer', { size: 120 })}</div>
      <h1>Conversation complete! 💬</h1>
      <p class="muted">${perfect ? 'Flawless — you handled the whole conversation!' : 'Nicely done — you got through it!'}</p>
      <div class="result__row"><div class="kpi"><span class="kpi__v">+${xp}</span><span class="kpi__k">XP</span></div><div class="kpi"><span class="kpi__v">+💎5</span><span class="kpi__k">Gems</span></div></div>
      <button class="btn btn--primary" id="doneBtn">Continue</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', renderHome);
  mount(node);
}

// ---------- grammar / pattern engine ----------
// Teaches the *system* (subject prefixes, plurals…), not just words — the thing
// that lets a learner build their own sentences. Patterns are spaced like vocab.
function renderGrammar() {
  const pats = course.grammar || [];
  const rows = pats.map((g) => {
    const st = store.grammarState(g.id);
    const pill = st === 'mastered' ? 'gloss-pill--mastered' : st === 'learning' ? 'gloss-pill--learning' : 'gloss-pill--new';
    const label = st === 'mastered' ? 'Mastered' : st === 'learning' ? 'Learning' : 'New';
    return `<button class="gram-card" data-g="${esc(g.id)}">
        <span class="gram-card__icon">🧩</span>
        <div class="gram-card__body"><strong>${esc(g.title)}</strong><span class="muted">${esc(g.tip.slice(0, 64))}…</span></div>
        <span class="gloss-pill ${pill}">${label}</span>
      </button>`;
  }).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Grammar</strong><span></span></header>
      <p class="muted">Learn the patterns that let you build your own sentences — not just memorise words.</p>
      <div class="set-list">${rows || '<p class="muted">Grammar patterns coming soon for this language.</p>'}</div>
      <p class="footnote">Grammar here is community-reviewed. Spot something off? Help us improve it.</p>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => renderGrammarTip(b.dataset.g)));
  mount(node);
}

function renderGrammarTip(gid) {
  const g = (course.grammar || []).find((x) => x.id === gid);
  if (!g) return renderGrammar();
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Grammar</button><strong>${esc(g.title)}</strong><span></span></header>
      <div class="gram-tip"><span class="gram-tip__icon">💡</span><p>${esc(g.tip)}</p></div>
      <button class="btn btn--primary" id="practise">Practise this pattern · ${g.drills.length} drills</button>
      <button class="btn btn--ghost" id="hear">🔊 Hear an example</button>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderGrammar);
  node.querySelector('#practise').addEventListener('click', () => startGrammar(gid));
  node.querySelector('#hear').addEventListener('click', () => tryHear(g.drills[0].answer, course.code));
  mount(node);
}

function startGrammar(gid) {
  const g = (course.grammar || []).find((x) => x.id === gid);
  if (!g) return renderGrammar();
  const queue = shuffle(g.drills).map((d) => (d.options
    ? { type: 'multiple_choice', prompt: d.prompt, answer: d.answer, options: d.options }
    : { type: 'translate', prompt: d.prompt, answer: d.answer, accept: [d.answer.toLowerCase()] }));
  session = { mode: 'grammar', grammarId: gid, lesson: null, queue, idx: 0, mistakes: 0, total: 0 };
  renderExercise();
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

// ---------- adaptive: test out of a unit you already know ----------
function confirmTestOut(unitId) {
  const unit = course.units.find((u) => u.id === unitId);
  if (!unit) return;
  const node = h(`
    <div class="screen screen--center">
      <div class="result__emoji">⏭️</div>
      <h1>Test out of ${esc(unit.title.replace(/^Unit \d+:\s*/, ''))}?</h1>
      <p class="muted">Already know this? Take a quick quiz. Score 80%+ and we'll mark the whole unit done so you can skip ahead — no time wasted on what you know.</p>
      <button class="btn btn--primary" id="go">Start the quiz</button>
      <button class="btn btn--ghost" id="back">Back</button>
    </div>`);
  node.querySelector('#go').addEventListener('click', () => startTestOut(unitId));
  node.querySelector('#back').addEventListener('click', renderHome);
  mount(node);
}

function startTestOut(unitId) {
  const unit = course.units.find((u) => u.id === unitId);
  if (!unit) return renderHome();
  const all = Object.values(vocabIndex(course));
  const unitVocab = unit.lessons.flatMap((l) => l.vocab || []);
  const pick = shuffle(unitVocab).slice(0, Math.min(10, unitVocab.length));
  const queue = pick.map((v) => {
    const distractors = shuffle(all.filter((o) => o.translation !== v.translation)).slice(0, 3);
    return { type: 'multiple_choice', prompt: `"${v.term}" means:`, answer: v.translation, options: shuffle([v.translation, ...distractors.map((d) => d.translation)]), vocabId: v.id, _test: true };
  });
  session = { mode: 'testout', unitId, lesson: null, queue, idx: 0, mistakes: 0, total: 0, score: 0 };
  renderExercise();
}

function finishTestOut() {
  const unit = course.units.find((u) => u.id === session.unitId);
  const pct = session.queue.length ? session.score / session.queue.length : 0;
  const passed = pct >= 0.8 && unit;
  if (passed) {
    for (const l of unit.lessons) {
      if (!store.isLessonComplete(l.id)) store.completeLesson(l.id, 2);
      for (const v of (l.vocab || [])) { const it = store.item(v.id); if (!it.seen) srsReview(it, gradeFor(true, 'multiple_choice'), 'multiple_choice'); }
    }
    G.checkAchievements(store);
    store.save();
    confetti({ count: 80 }); sound.complete();
  } else { sound.wrong(); }
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotSvg(passed ? 'cheer' : 'sad', { size: 110 })}</div>
      <h1>${passed ? 'Tested out! ⏭️' : 'Not quite yet'}</h1>
      <div class="result__row"><div class="kpi"><span class="kpi__v">${session.score}/${session.queue.length}</span><span class="kpi__k">Score</span></div><div class="kpi"><span class="kpi__v">${Math.round(pct * 100)}%</span><span class="kpi__k">Accuracy</span></div></div>
      <p class="muted">${passed ? `${esc(unit.title)} is marked complete — jump ahead to what's next!` : 'You need 80% to skip this unit. Work through the lessons and you\'ll master it.'}</p>
      <button class="btn btn--primary" id="doneBtn">${passed ? 'Continue' : 'Back to lessons'}</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', renderHome);
  mount(node);
}

function endSession() {
  if (session.mode === 'testout') return finishTestOut();
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
  const GEM_REWARD = { lesson: 5, review: 3, reading: 5, grammar: 4 };
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
    // input-first: words encountered in the story enter the review schedule, so
    // reading itself feeds spaced repetition (comprehensible input → retention)
    if (r) {
      const idx = vocabIndex(course);
      const byTerm = {};
      for (const v of Object.values(idx)) byTerm[normalize(v.term)] = v.id;
      const text = normalize(r.lines.map((ln) => ln.t).join(' '));
      const seeded = new Set();
      for (const [term, id] of Object.entries(byTerm)) {
        if (term && !seeded.has(id) && (text === term || text.includes(` ${term} `) || text.startsWith(`${term} `) || text.endsWith(` ${term}`))) {
          seeded.add(id);
          const it = store.item(id);
          if (!it.seen) srsReview(it, gradeFor(true, 'multiple_choice'), 'multiple_choice');
        }
      }
    }
    merge(G.track(store, 'reading'));
  } else if (session.mode === 'grammar') {
    // grade the whole pattern by this drill set; spaced like a vocab item
    const git = store.grammarItem(session.grammarId);
    srsReview(git, gradeFor(session.mistakes <= 1, 'translate'), 'translate');
    merge(G.track(store, 'review'));
  }
  merge({ quests: [], achievements: G.checkAchievements(store), gems: 0 });
  store.save();
  // advance the 90-day plan's daily loop
  if (session.mode === 'lesson') markPlan('lesson');
  else if (session.mode === 'review') markPlan('review');
  else if (session.mode === 'reading') markPlan('input');
  session.earned = earned;
  renderSessionComplete(stars, correct, session.total, rewards);
}

function advance(wasCorrect, ex) {
  session.total += 1;
  if (!wasCorrect) session.mistakes += 1;
  if (session.mode === 'baseline' || session.mode === 'retest' || session.mode === 'testout') {
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
    case 'word_bank': body = renderWordBank(ex); break;
    default: body = '<p>Unknown exercise</p>';
  }
  const node = h(`<div class="screen ex">${progressBar()}<div class="ex__body">${body}</div><div class="ex__foot" id="foot"></div></div>`);
  mount(node);
  node.querySelector('#quitBtn').addEventListener('click', () => { if (confirm('Quit this session? Progress in this session is lost.')) renderHome(); });
  wireExercise(ex, node);
}

function footFor(node) { return node.querySelector('#foot'); }

function showFeedback(node, ok, ex, correctText, typoNote = '') {
  // sound + haptics first so they land with the visual
  if (ok) { sound.correct(); haptic(15); } else { sound.wrong(); haptic([10, 50, 10]); }
  const foot = footFor(node);
  foot.className = `ex__foot ${ok ? 'ex__foot--ok' : 'ex__foot--bad'}`;
  const note = ex.meaning ? `<div class="fb__meaning">${esc(ex.meaning)}</div>` : '';
  // a typo-accepted answer gets a gentle spelling nudge instead of a penalty
  const spell = (ok && typoNote) ? `<div class="fb__answer">${esc(typoNote)}</div>` : '';
  const title = ok ? (typoNote ? 'Almost perfect!' : mascotLine('cheer', session.total)) : '✗ Not quite';
  foot.innerHTML = `
    <div class="fb">
      <span class="fb__mascot">${mascotSvg(ok ? 'cheer' : 'sad', { size: 52, decorative: true })}</span>
      <div class="fb__text">
        <div class="fb__title">${title}</div>
        ${ok ? '' : `<div class="fb__answer">Answer: <strong>${esc(correctText)}</strong></div>`}
        ${spell}
        ${note}
      </div>
    </div>
    <button class="btn btn--primary" id="continueBtn">Continue</button>`;
  const cont = foot.querySelector('#continueBtn');
  cont.addEventListener('click', () => { sound.tap(); advance(ok, ex); });
  // lock inputs
  node.querySelectorAll('.opt, .ex__input, .check, .wb-tok').forEach((e) => { e.disabled = true; });
  // a11y: announce the result, then put focus on Continue so it's one keypress away
  announce(ok ? (typoNote ? `Correct, but ${typoNote}` : 'Correct!') : `Not quite. Answer: ${correctText}`);
  cont.focus();
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

function renderWordBank(ex) {
  const bank = ex.tokens.map((w, i) => `<button class="wb-tok" data-i="${i}">${esc(w)}</button>`).join('');
  return `<h2 class="ex__q">Build the sentence</h2>
    <p class="ex__hint muted">${esc(ex.prompt)}</p>
    <div class="wb-build" id="wbBuild" aria-label="Your sentence"></div>
    <div class="wb-bank" id="wbBank">${bank}</div>
    <button class="btn btn--primary check" id="checkBtn" disabled>Check</button>`;
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
      const res = checkTyped(ex, input.value);
      showFeedback(node, res.correct, ex, ex.answer, res.typo ? `Watch the spelling: ${ex.answer}` : '');
    };
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    node.querySelector('#checkBtn').addEventListener('click', submit);
  }

  if (ex.type === 'word_bank') {
    const bank = node.querySelector('#wbBank');
    const build = node.querySelector('#wbBuild');
    const check = node.querySelector('#checkBtn');
    const refresh = () => { check.disabled = build.children.length === 0; };
    bank.querySelectorAll('.wb-tok').forEach((b) => b.addEventListener('click', () => {
      if (b.disabled) return;
      b.disabled = true; b.classList.add('wb-tok--used');
      const chip = h(`<button class="wb-tok wb-tok--in">${esc(b.textContent)}</button>`);
      chip.addEventListener('click', () => { chip.remove(); b.disabled = false; b.classList.remove('wb-tok--used'); refresh(); });
      build.appendChild(chip); sound.tap(); refresh();
    }));
    check.addEventListener('click', () => {
      const resp = Array.from(build.children).map((c) => c.textContent).join(' ');
      showFeedback(node, checkAnswer(ex, resp), ex, ex.answer);
    });
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
  const title = session.mode === 'review' ? 'Review complete!' : session.mode === 'reading' ? 'Story complete!' : session.mode === 'grammar' ? 'Grammar practice!' : 'Lesson complete!';
  const questHtml = rewards.quests.length
    ? `<div class="reward-list"><strong>Quests completed</strong>${rewards.quests.map((q) => `<div class="reward-row">${q.icon} ${esc(q.text)} <span>+💎${q.gems}</span></div>`).join('')}</div>` : '';
  const achHtml = rewards.achievements.length
    ? `<div class="reward-list reward-list--ach"><strong>New badges! 🏅</strong>${rewards.achievements.map((a) => `<div class="reward-row">${a.icon} ${esc(a.name)} <span>+💎20</span></div>`).join('')}</div>` : '';
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotSvg('cheer', { size: 120 })}</div>
      <h1>${title}</h1>
      <div class="result__stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      ${session.xpBoosted ? '<div class="boost-badge">⚡ Double XP applied!</div>' : ''}
      <div class="result__row">
        <div class="kpi"><span class="kpi__v">${correct}/${total}</span><span class="kpi__k">Correct</span></div>
        <div class="kpi"><span class="kpi__v" id="xpKpi">+0</span><span class="kpi__k">XP</span></div>
        <div class="kpi"><span class="kpi__v" id="gemKpi">+💎0</span><span class="kpi__k">Gems</span></div>
      </div>
      ${questHtml}
      ${achHtml}
      <p class="muted">Words you missed are scheduled for review so they actually stick.</p>
      <button class="btn btn--primary" id="doneBtn">Continue</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', () => { sound.tap(); renderHome(); });
  mount(node);
  // celebrate: a perfect run gets the big confetti; any finish gets a chime
  sound.complete();
  haptic([15, 30, 15]);
  if (stars === 3) confetti({ count: 120 });
  else confetti({ count: 60, duration: 1100 });
  countUp(node.querySelector('#xpKpi'), session.earned || 0, { prefix: '+' });
  countUp(node.querySelector('#gemKpi'), rewards.gems || 0, { prefix: '+💎' });
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

  // CEFR-style "can-do" goals, one per unit, achieved when its lessons are done
  let unitsDone = 0;
  const canDoRows = course.units.map((u) => {
    const ls = u.lessons || [];
    const done = ls.filter((l) => store.isLessonComplete(l.id)).length;
    const pct = ls.length ? Math.round((done / ls.length) * 100) : 0;
    const achieved = ls.length > 0 && done === ls.length;
    if (achieved) unitsDone += 1;
    if (!u.canDo) return '';
    return `<div class="cando ${achieved ? 'cando--done' : ''}">
        <span class="cando__icon">${achieved ? '✅' : '🎯'}</span>
        <div class="cando__body">
          <span class="cando__text">${esc(u.canDo)}</span>
          <div class="qbar"><div style="width:${pct}%"></div></div>
        </div>
      </div>`;
  }).join('');
  const level = unitsDone === 0 ? { tag: 'Starter', sub: 'just getting going' }
    : unitsDone <= 2 ? { tag: 'A1 · Beginner', sub: 'basic words & phrases' }
      : unitsDone <= 4 ? { tag: 'A1+ · Beginner', sub: 'simple everyday topics' }
        : unitsDone <= 6 ? { tag: 'A2 · Elementary', sub: 'familiar situations' }
          : { tag: 'A2+ · Elementary', sub: 'getting conversational' };

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

      <div class="level-card">
        <span class="level-card__tag">${esc(level.tag)}</span>
        <span class="level-card__sub">Your level · ${esc(level.sub)} · ${unitsDone}/${course.units.length} units mastered</span>
      </div>

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

      <h3 class="sec">What you can do</h3>
      <p class="muted" style="margin:0 4px">Real-world "can-do" goals — complete a unit's lessons to unlock each.</p>
      <div class="cando-list">${canDoRows}</div>

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
    sound.reward(); haptic(20); confetti({ count: 70, duration: 1200 });
    setTimeout(renderHome, 700);
  });
  mount(node);
}

// Re-route after a profile switch (mirrors boot's tail; LANGS already loaded).
async function restart() {
  Shop.applyTheme(store);
  setSoundEnabled(store.state.settings.soundOn !== false);
  setDesiredRetention(store.state.settings.desiredRetention || 0.9);
  if (!store.state.settings.onboarded && !store.state.activeLang) return renderOnboarding();
  if (!store.state.activeLang) return renderLanguageSelect(true);
  await openLanguage(store.state.activeLang);
}

// ---------- learner profiles (shared-device support) ----------
function renderProfiles() {
  const active = store.activeProfile();
  const list = store.profiles().map((p) => {
    const isActive = p.id === active.id;
    const del = (p.id !== 'default' && !isActive)
      ? `<button class="prof-del" data-del="${esc(p.id)}" title="Remove">✕</button>` : '';
    return `<div class="prof-row ${isActive ? 'prof-row--active' : ''}">
        <button class="prof-pick" data-pick="${esc(p.id)}">
          <span class="prof-avatar">${esc(p.avatar)}</span>
          <span class="prof-name">${esc(p.name)}</span>
          ${isActive ? '<span class="prof-cur">Active</span>' : '<span class="muted">Switch →</span>'}
        </button>
        ${del}
      </div>`;
  }).join('');
  const avatars = store.avatarChoices().map((a, i) =>
    `<button class="prof-av ${i === 0 ? 'prof-av--sel' : ''}" data-av="${esc(a)}">${esc(a)}</button>`).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Settings</button><strong>Learners</strong><span></span></header>
      <p class="muted">Share this device? Each learner keeps their own streak, words and progress.</p>
      <div class="set-list">${list}</div>
      <h3 class="sec">Add a learner</h3>
      <section class="card">
        <input class="ex__input" id="newName" maxlength="20" placeholder="Name" autocomplete="off" />
        <div class="prof-avs">${avatars}</div>
        <button class="btn btn--primary" id="addBtn">Add learner</button>
      </section>
    </div>`);
  let chosen = store.avatarChoices()[0];
  node.querySelector('#back').addEventListener('click', renderSettings);
  node.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    if (store.switchProfile(b.dataset.pick)) { sound.tap(); restart(); }
  }));
  node.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    if (confirm('Remove this learner and all their progress on this device?')) {
      store.deleteProfile(b.dataset.del); renderProfiles();
    }
  }));
  node.querySelectorAll('[data-av]').forEach((b) => b.addEventListener('click', () => {
    chosen = b.dataset.av;
    node.querySelectorAll('.prof-av').forEach((x) => x.classList.remove('prof-av--sel'));
    b.classList.add('prof-av--sel');
  }));
  node.querySelector('#addBtn').addEventListener('click', () => {
    const name = node.querySelector('#newName').value.trim();
    if (!name) { flashToast('Enter a name first'); return; }
    store.createProfile(name, chosen);   // creates + switches to the new learner
    sound.reward();
    restart();                           // new learner -> onboarding/first win
  });
  mount(node);
}

// ---------- settings ----------
function renderSettings() {
  const soundOn = store.state.settings.soundOn !== false;
  const prof = store.activeProfile();
  const remOn = Notify.isEnabled(store);
  const remSupported = Notify.supported();
  const remDenied = Notify.permission() === 'denied';
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Settings</strong><span></span></header>
      <button class="set-row set-row--btn" id="profBtn" style="width:100%;text-align:left">
        <div class="set-row__label"><b>${esc(prof.avatar)} ${esc(prof.name)}</b><small>Active learner · tap to switch or add</small></div>
        <span class="muted" style="font-size:22px">›</span>
      </button>
      <div class="set-list">
        <div class="set-row">
          <div class="set-row__label"><b>Sound effects</b><small>Chimes on correct answers and lessons</small></div>
          <label class="switch"><input type="checkbox" id="soundTgl" ${soundOn ? 'checked' : ''}><span class="switch__track"></span></label>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>Daily reminders</b><small>${remSupported ? (remDenied ? 'Blocked in your browser settings' : 'A gentle nudge to keep your streak') : 'Not supported on this device'}</small></div>
          <label class="switch"><input type="checkbox" id="remTgl" ${remOn ? 'checked' : ''} ${remSupported && !remDenied ? '' : 'disabled'}><span class="switch__track"></span></label>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>Daily goal</b><small>XP target per day</small></div>
          <select id="goalSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[20, 30, 50, 80].map((g) => `<option value="${g}" ${store.state.settings.dailyGoalXP === g ? 'selected' : ''}>${g} XP</option>`).join('')}
          </select>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>Review intensity</b><small>How often words come back for review</small></div>
          <select id="retSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[['0.85', 'Relaxed'], ['0.9', 'Standard'], ['0.95', 'Intense']].map(([v, label]) => `<option value="${v}" ${Math.abs((store.state.settings.desiredRetention || 0.9) - Number(v)) < 0.001 ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
      </div>
      <h3 class="sec">Premium</h3>
      <button class="card" id="prem" style="text-align:left"><strong>⭐ MzansiLingo Premium</strong><span class="muted">Unlimited hearts, all languages, no ads.</span></button>
      <p class="footnote">MzansiLingo v1 · Works offline · Made for South Africa 🇿🇦</p>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelector('#soundTgl').addEventListener('change', (e) => {
    store.state.settings.soundOn = e.target.checked;
    setSoundEnabled(e.target.checked);
    store.save();
    if (e.target.checked) sound.correct();
  });
  node.querySelector('#remTgl').addEventListener('change', async (e) => {
    if (e.target.checked) {
      const res = await Notify.enable(store);
      if (res !== 'granted') { e.target.checked = false; flashToast('Enable notifications in your browser to use reminders.'); }
      else flashToast('Daily reminders on 🔔');
    } else {
      await Notify.disable(store);
    }
  });
  node.querySelector('#goalSel').addEventListener('change', (e) => {
    store.state.settings.dailyGoalXP = Number(e.target.value);
    store.save();
  });
  node.querySelector('#retSel').addEventListener('change', (e) => {
    const r = Number(e.target.value);
    store.state.settings.desiredRetention = r;
    setDesiredRetention(r);
    store.save();
    flashToast(r >= 0.95 ? 'More frequent reviews 🔁' : r <= 0.85 ? 'Fewer reviews — lighter load' : 'Standard review schedule');
  });
  node.querySelector('#prem').addEventListener('click', renderPremium);
  node.querySelector('#profBtn').addEventListener('click', renderProfiles);
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
  const standings = G.leagueStandings(store);
  const me = standings.find((r) => r.you);
  const nextLeague = G.LEAGUES[Math.min(G.LEAGUES.length - 1, lg.tier + 1)];
  const N = standings.length;

  const rows = standings.map((r, i) => {
    let divider = '';
    if (i === G.PROMOTE_ZONE) divider = `<div class="lb-line lb-line--up"><span>Promotion to ${esc(nextLeague)} ▲</span></div>`;
    if (i === N - G.DEMOTE_ZONE) divider = `<div class="lb-line lb-line--down"><span>▼ Demotion zone</span></div>`;
    const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank;
    return `${divider}
      <div class="lb-row ${r.you ? 'lb-row--you' : ''} lb-row--${r.zone}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-name">${r.you ? '<b>You</b>' : esc(r.name)}</span>
        <span class="lb-xp">${r.xp} XP</span>
      </div>`;
  }).join('');

  // last week's result, if we just settled one
  const settled = (lg.lastRank && lg.lastTier !== undefined)
    ? (lg.tier > lg.lastTier
        ? `<div class="lb-banner lb-banner--up">⬆ Promoted! You finished #${lg.lastRank} last week.</div>`
        : lg.tier < lg.lastTier
          ? `<div class="lb-banner lb-banner--down">You finished #${lg.lastRank} and dropped a league. Climb back!</div>`
          : `<div class="lb-banner">You finished #${lg.lastRank} last week — held your league.</div>`)
    : '';

  const zoneMsg = me.zone === 'up'
    ? `🔥 You're in the promotion zone at #${me.rank}! Keep it up to reach ${esc(nextLeague)}.`
    : me.zone === 'down'
      ? `⚠️ You're in the demotion zone at #${me.rank}. Earn XP to climb out!`
      : `You're #${me.rank} of ${N}. Earn XP to break into the top ${G.PROMOTE_ZONE}.`;

  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>League</strong><span class="stat">💎 ${G.gems(store)}</span></header>
      <section class="card">
        <div class="card__head"><strong>${G.leagueIcon(G.LEAGUES[lg.tier])} ${esc(G.LEAGUES[lg.tier])} League</strong><span class="muted">${esc(weekDaysLeft())} left</span></div>
        ${settled}
        <p class="muted">${zoneMsg}</p>
      </section>
      <div class="leaderboard">${rows}</div>
      <p class="footnote">Top ${G.PROMOTE_ZONE} advance · bottom ${G.DEMOTE_ZONE} drop a league · resets every Monday.</p>
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
