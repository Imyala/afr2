// app.js — MzansiLingo PWA controller (routing, screens, exercise rendering)
import { store, missedDaysSince, XP_PER_CORRECT, XP_LESSON_BONUS, MAX_HEARTS } from './store.js';
import { review as srsReview, gradeFor, setDesiredRetention } from './srs.js';
import { speak, listenOnce, recordSupported, srSupported, startRecording } from './audio.js';
import {
  loadCourse, loadLanguages, allLessons, findLesson, vocabIndex, phraseIndex,
  checkAnswer, checkTyped, buildLessonSession, buildReviewSession, exerciseVocabIds, normalize,
  sentencePool, readingCoverage, genFrameDrills, memberVocabIds, genExplainPrompt, genPatternInquiry,
} from './lessons.js';
import * as G from './gamify.js';
import * as Shop from './shop.js';
import { sound, haptic, confetti, countUp, pop, setSoundEnabled } from './fx.js';
import { cheerLine, learnLine } from './mascot.js';
import { MASCOT_CAST, mascotById, mascotImg, mascotGreeting } from './mascots.js';
import * as Auth from './auth.js';
import * as Notify from './notify.js';

let LIBRARY = null;   // library.json

// The learner's illustrated buddy: picked at RANDOM once per day, per learner,
// and remembered, so it's one familiar companion all day — but every learner
// (and every day) gets their own surprise instead of the whole world seeing
// the same animal on the same date. Never repeats yesterday's buddy.
function currentBuddy() {
  const s = store.state;
  const day = todayStr();
  if (!s.buddy || s.buddy.day !== day) {
    let pick = MASCOT_CAST[Math.floor(Math.random() * MASCOT_CAST.length)];
    while (MASCOT_CAST.length > 1 && s.buddy && pick.id === s.buddy.id) {
      pick = MASCOT_CAST[Math.floor(Math.random() * MASCOT_CAST.length)];
    }

    if (ex.type === 'speak') {
      const reveal = () => {
        const card = node.querySelector('#speakReveal');
        const tools = node.querySelector('#speakTools');
        const coach = node.querySelector('#speakCoach');
        if (card) card.hidden = false;
        if (tools) tools.hidden = false;
        if (coach) coach.textContent = 'Compare with the model, say it again out loud, then rate yourself honestly.';
        const foot = footFor(node);
        foot.innerHTML = `
          <button class="btn btn--primary" id="speakGood">✓ I said it right</button>
          <button class="btn btn--ghost" id="speakMiss">🔁 Not yet</button>`;
        foot.querySelector('#speakGood').addEventListener('click', () => showFeedback(node, true, ex, ex.text));
        foot.querySelector('#speakMiss').addEventListener('click', () => showFeedback(node, false, ex, ex.text));
        node.querySelector('#hearModel').addEventListener('click', () => tryHear(ex.text, course.code));
        wireRecorder(node);
        speak(ex.text, course.code);
      };
      const revealBtn = node.querySelector('#speakRevealBtn');
      if (revealBtn) revealBtn.addEventListener('click', () => { sound.tap(); reveal(); });
      const micBtn = node.querySelector('#speakCheck');
      if (micBtn) micBtn.addEventListener('click', async () => {
        micBtn.disabled = true;
        micBtn.textContent = 'Listening…';
        const heard = await listenOnce(course.code, 5000);
        if (heard && checkAnswer(ex, heard)) {
          showFeedback(node, true, ex, ex.text);
        } else {
          micBtn.disabled = false;
          micBtn.textContent = 'Try the mic again';
          reveal();
        }
      });
    }
    s.buddy = { day, id: pick.id };
    store.save();
  }
  return mascotById(s.buddy.id);
}

const app = document.getElementById('app');
let LANGS = null;     // languages.json
let course = null;    // active course
let session = null;   // active lesson/review session

// ---------- tiny DOM helpers ----------
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
// Bumped on every screen change: pending auto-advance timers compare against
// it so they die quietly if the learner quit to another screen meanwhile.
let mountSeq = 0;
function mount(node) {
  mountSeq += 1;
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
function feedbackDelay(base, text = '') {
  const pace = (store.state.settings && store.state.settings.feedbackPace) || 'comfortable';
  const mult = pace === 'quick' ? 0.95 : pace === 'slow' ? 1.8 : 1.35;
  return Math.round(base * mult + Math.min(900, text.length * 10));
}
function learnerProfile() {
  return store.state.learnerProfile || { goal: 'general', dailyTime: '10', confidence: 'new' };
}
function isGuestLearner() {
  const auth = Auth.getAuth();
  return !auth || auth.mode === 'guest';
}
function syncCompletedUnits() {
  const L = store.lang();
  if (!L || !course) return;
  const completed = course.units
    .filter((u) => (u.lessons || []).length && u.lessons.every((l) => store.isLessonComplete(l.id)))
    .map((u) => u.id);
  L.completedUnits = completed;
}
function recordWeeklySnapshot() {
  if (!course || !store.state.activeLang) return;
  const d = new Date();
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum);
  const week = d.toISOString().slice(0, 10);
  const code = store.state.activeLang;
  const m = store.metrics(code);
  const all = store.state.progressSnapshots || (store.state.progressSnapshots = {});
  const list = all[code] || (all[code] = []);
  const snap = { week, mastered: m.mastered, retention: m.retention, introduced: m.introduced };
  const last = list[list.length - 1];
  let changed = false;
  if (!last || last.week !== week) {
    list.push(snap);
    changed = true;
  } else if (last.mastered !== snap.mastered || last.retention !== snap.retention || last.introduced !== snap.introduced) {
    Object.assign(last, snap);
    changed = true;
  }
  all[code] = list.slice(-8);
  if (changed) store.save();
}
// Time until the weekly league resets (next Monday 00:00).
function weekDaysLeft(now = Date.now()) {
  const d = new Date(now);
  const dayNum = (d.getDay() + 6) % 7;            // Mon = 0
  const nextMon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNum + 7, 0, 0, 0, 0);
  const days = Math.ceil((nextMon.getTime() - now) / 86400000);
  return days <= 1 ? '1 day' : `${days} days`;
}

// ---------- colour scheme (light by default) ----------
// The app is LIGHT unless the learner changes it in Settings: 'light' | 'dark'
// | 'system'. The resolved scheme is stamped on <html data-theme="…"> — the
// stylesheet keys its dark palette off that attribute, never off the OS alone.
function applyColorScheme() {
  const pref = store.state.settings.theme || 'light';
  const dark = pref === 'dark'
    || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // keep the browser chrome (address bar) matching the scheme
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0e1611' : '#1b7a43';
}

// ---------- boot ----------
async function boot() {
  applyColorScheme();
  // Re-resolve the scheme if the OS flips between light/dark (only matters for
  // learners on "Match device") and re-apply the palette so themed accents
  // always use the variant tuned for the current background.
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => { applyColorScheme(); Shop.applyTheme(store); });
  }
  LANGS = await loadLanguages();
  // Auth gate (demo). Grandfather existing users in as guests so this update
  // never locks anyone out of progress they already have.
  let auth = Auth.getAuth();
  if (!auth) {
    if (store.state.activeLang || store.state.settings.onboarded) { Auth.setAuth({ mode: 'guest' }); auth = Auth.getAuth(); }
    else return renderAuthLanding();
  }
  if (auth.mode === 'account') {
    const acc = Auth.accountById(auth.accountId);
    if (acc) store.ensureProfile(acc.id, acc.name, acc.avatar);
    else { Auth.setAuth({ mode: 'guest' }); }
  }
  await bootIntoApp();
}

// Continue booting once we know who the learner is (account or guest).
async function bootIntoApp() {
  applyColorScheme();
  Shop.applyTheme(store);
  setSoundEnabled(store.state.settings.soundOn !== false);
  setDesiredRetention(store.state.settings.desiredRetention || 0.9);
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

// ---------- demo accounts: landing / sign up / log in ----------
function renderAuthLanding() {
  const node = h(`
    <div class="screen screen--center">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 130, className: 'mascot-img--bob' })}</div>
      <h1 class="brand__name">MzansiLingo</h1>
      <p class="onb__body">Learn real South African languages. Start instantly as a guest, then decide later whether you want an account on this device.</p>
      <div class="onb__actions">
        <button class="btn btn--primary" id="guest">Start learning now</button>
        <button class="btn btn--ghost" id="create">Create account</button>
        <button class="btn btn--ghost" id="login">Log in</button>
      </div>
      <p class="footnote">Demo: accounts are stored on this device only.</p>
    </div>`);
  node.querySelector('#guest').addEventListener('click', () => { store.ensureProfile('default', 'Me', '🦫'); Auth.setAuth({ mode: 'guest' }); sound.tap(); bootIntoApp(); });
  node.querySelector('#create').addEventListener('click', () => { sound.tap(); renderSignup(); });
  node.querySelector('#login').addEventListener('click', () => { sound.tap(); renderLogin(); });
  mount(node);
}

function renderSignup() {
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Back</button><strong>Create account</strong><span></span></header>
      <form class="auth-form" id="form">
        <input class="ex__input" id="name" placeholder="Your name" autocomplete="name" />
        <input class="ex__input" id="email" type="email" placeholder="Email" autocomplete="email" autocapitalize="off" spellcheck="false" />
        <input class="ex__input" id="pw" type="password" placeholder="Password (min 4 characters)" autocomplete="new-password" />
        <div class="auth-err" id="err" role="alert" hidden></div>
        <button class="btn btn--primary" id="submit" type="submit">Create account</button>
      </form>
      <p class="footnote">Demo: your account and progress are stored only on this device.</p>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderAuthLanding);
  node.querySelector('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = node.querySelector('#err');
    const submit = node.querySelector('#submit');
    err.hidden = true;
    submit.disabled = true; submit.textContent = 'Checking password…';
    const res = await Auth.createAccount(node.querySelector('#name').value, node.querySelector('#email').value, node.querySelector('#pw').value);
    submit.disabled = false; submit.textContent = 'Create account';
    if (res.error) { err.textContent = res.error; err.hidden = false; sound.wrong(); return; }
    store.ensureProfile(res.account.id, res.account.name, res.account.avatar);
    Auth.setAuth({ mode: 'account', accountId: res.account.id });
    sound.reward(); flashToast(`Welcome, ${res.account.name}! 🎉`);
    bootIntoApp();
  });
  mount(node);
}

function renderLogin() {
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Back</button><strong>Log in</strong><span></span></header>
      <form class="auth-form" id="form">
        <input class="ex__input" id="email" type="email" placeholder="Email" autocomplete="email" autocapitalize="off" spellcheck="false" />
        <input class="ex__input" id="pw" type="password" placeholder="Password" autocomplete="current-password" />
        <div class="auth-err" id="err" role="alert" hidden></div>
        <button class="btn btn--primary" id="submit" type="submit">Log in</button>
        <button class="btn btn--ghost" id="toCreate" type="button">No account? Create one</button>
      </form>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderAuthLanding);
  node.querySelector('#toCreate').addEventListener('click', renderSignup);
  node.querySelector('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = node.querySelector('#err');
    const res = await Auth.login(node.querySelector('#email').value, node.querySelector('#pw').value);
    if (res.error) { err.textContent = res.error; err.hidden = false; sound.wrong(); return; }
    store.ensureProfile(res.account.id, res.account.name, res.account.avatar);
    Auth.setAuth({ mode: 'account', accountId: res.account.id });
    sound.reward(); flashToast(`Welcome back, ${res.account.name}!`);
    bootIntoApp();
  });
  mount(node);
}

async function openLanguage(code) {
  store.setActiveLang(code);
  store.rollover(code);
  store.refreshHearts(code);
  course = await loadCourse(code);
  syncCompletedUnits();
  G.ensureDaily(store);
  G.ensureWeek(store);
  G.checkAchievements(store);
  // First run: pure LEARNING first — the gentle warm-up teaches the first
  // words before anything that could be answered wrongly, so an absolute
  // beginner's opening minutes can't feel like a test they're failing.
  if (!store.state.settings.onboarded) return renderFirstRunChoice();
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
  { title: null, // filled in with the buddy's own name at render time
    body: 'I\'ll help you learn a real South African language — one you can actually speak with people around you.' },
  { title: 'Real progress, proven',
    body: 'No empty taps. Spaced repetition reviews each word right before you\'d forget it, so it truly sticks — and we measure it.' },
  { title: 'Works offline, free to start',
    body: 'Learn anywhere with no data — on the taxi, at school, at home. Add it to your home screen and go.' },
];
function renderOnboarding(i = 0) {
  const s = ONB_SLIDES[i];
  const buddy = currentBuddy();
  const title = s.title || `Sawubona! I'm ${buddy.name} 👋`;
  const last = i === ONB_SLIDES.length - 1;
  const dots = ONB_SLIDES.map((_, k) => `<span class="onb__dot ${k === i ? 'onb__dot--on' : ''}"></span>`).join('');
  const node = h(`
    <div class="screen onb">
      <div class="onb__art">${mascotImg(buddy, { size: 150, className: 'mascot-img--bob' })}</div>
      <h1 class="onb__title">${esc(title)}</h1>
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

function renderFirstRunChoice() {
  const unit = (course.units || []).find((u) => (u.lessons || []).length);
  const node = h(`
    <div class="screen onb">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 138, className: 'mascot-img--bob' })}</div>
      <h1 class="onb__title">Let’s make your first minutes feel right</h1>
      <p class="onb__body">Brand new? Start with a tiny warm-up and get an easy first win. Coming back to the language? Take a quick placement quiz and skip ahead if you already know the basics.</p>
      <div class="onb__actions">
        <button class="btn btn--primary" id="warmup">Start the warm-up</button>
        ${unit ? '<button class="btn btn--ghost" id="placement">I know some already</button>' : ''}
      </div>
    </div>`);
  node.querySelector('#warmup').addEventListener('click', () => { sound.tap(); startWarmup(true); });
  const pb = node.querySelector('#placement');
  if (pb) pb.addEventListener('click', () => { sound.tap(); confirmTestOut(unit.id, true); });
  mount(node);
}

function renderSetupQuestions() {
  const cur = learnerProfile();
  const node = h(`
    <div class="screen onb">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 126 })}</div>
      <h1 class="onb__title">Nice first win! One quick setup</h1>
      <p class="onb__body">Answer three tiny questions and I’ll tune your daily plan to fit you better.</p>
      <div class="set-list">
        <div class="set-row">
          <div class="set-row__label"><b>What’s your main goal?</b><small>We’ll bias your plan around this</small></div>
          <select id="goalSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[['school', 'School'], ['travel', 'Travel'], ['conversation', 'Conversation'], ['general', 'General']].map(([v, label]) => `<option value="${v}" ${cur.goal === v ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>How much time do you usually have?</b><small>Just a rough daily target</small></div>
          <select id="timeSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[['5', '5 min'], ['10', '10 min'], ['20', '20 min'], ['30', '30+ min']].map(([v, label]) => `<option value="${v}" ${cur.dailyTime === v ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>How confident do you feel?</b><small>This helps set the tone</small></div>
          <select id="confSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[['new', 'Brand new'], ['rusty', 'Rusty but returning'], ['steady', 'Fairly confident']].map(([v, label]) => `<option value="${v}" ${cur.confidence === v ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="onb__actions">
        <button class="btn btn--primary" id="save">Save my setup</button>
      </div>
    </div>`);
  node.querySelector('#save').addEventListener('click', () => {
    store.state.learnerProfile = {
      goal: node.querySelector('#goalSel').value,
      dailyTime: node.querySelector('#timeSel').value,
      confidence: node.querySelector('#confSel').value,
      date: todayStr(),
    };
    store.state.onboarding = { ...(store.state.onboarding || {}), setupDone: true };
    store.save();
    sound.reward();
    promptReminders();
  });
  mount(node);
}

// Offer daily reminders once, right after the first win (peak motivation).
function promptReminders() {
  if (!Notify.supported() || Notify.permission() !== 'default') return finishOnboarding();
  const node = h(`
    <div class="screen onb">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 130, className: 'mascot-img--bob' })}</div>
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

function renderAccountPrompt(next = renderHome) {
  store.state.onboarding = { ...(store.state.onboarding || {}), accountPrompted: true };
  store.save();
  const node = h(`
    <div class="screen onb">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 126, className: 'mascot-img--cheer' })}</div>
      <h1 class="onb__title">Want to keep this progress?</h1>
      <p class="onb__body">You can keep learning as a guest, but creating an account makes this learner easier to find again on this device.</p>
      <div class="onb__actions">
        <button class="btn btn--primary" id="create">Create account</button>
        <button class="btn btn--ghost" id="later">Maybe later</button>
      </div>
    </div>`);
  node.querySelector('#create').addEventListener('click', () => { sound.tap(); renderSignup(); });
  node.querySelector('#later').addEventListener('click', () => { sound.tap(); next(); });
  mount(node);
}

function recommendedStory() {
  const readings = course.reading || [];
  if (!readings.length) return null;
  const idx = vocabIndex(course);
  const known = new Set();
  for (const [id, it] of Object.entries(store.lang().items || {})) {
    if ((it.seen > 0 || it.encountered) && idx[id]) for (const tok of normalize(idx[id].term).split(' ')) known.add(tok);
  }
  return readings
    .filter((r) => !store.lang().completedReadings.includes(r.id))
    .sort((a, b) => readingCoverage(b.lines, known).pct - readingCoverage(a.lines, known).pct)[0] || null;
}

function toughestWordId() {
  const idx = vocabIndex(course);
  const rows = Object.entries(store.lang().items || {})
    .filter(([id, it]) => it.seen >= 2 && idx[id] && (it.correct / it.seen) < 1)
    .sort((a, b) => (a[1].correct / a[1].seen) - (b[1].correct / b[1].seen));
  return rows[0] ? rows[0][0] : null;
}

function nextBestAction(L, due, nextLesson) {
  const repairPending = due > 0 && missedDaysSince(L.lastStudyDay, todayStr()) >= 2 && L.lastRepairDay !== todayStr();
  if (repairPending) return { id: 'resumeReview', icon: '🌱', title: 'Ease back in', sub: `Start a shorter confidence-building review (${Math.min(due, 8)} due first)`, action: startReview };
  if (due > 0) return { id: 'resumeReview', icon: '🔁', title: 'Reviews ready', sub: `${due} review${due === 1 ? '' : 's'} due now`, action: startReview };
  if (L.plan && Object.values(L.plan.done).some((x) => !x)) return { id: 'resumePlan', icon: '📅', title: 'Resume today’s plan', sub: `${Object.values(L.plan.done).filter(Boolean).length}/4 steps done`, action: renderPlan };
  if (nextLesson) return { id: 'resumeLesson', icon: '📘', title: 'Next lesson', sub: nextLesson.title, action: () => startLesson(nextLesson.id) };
  const story = recommendedStory();
  if (story) return { id: 'resumeStory', icon: '📖', title: 'Best next story', sub: story.title, action: () => renderReadingIntro(story.id) };
  return { id: 'resumeSpeak', icon: '🎤', title: 'Keep your fluency warm', sub: 'Do a quick speaking practice', action: startSpeaking };
}

// ---------- home / lesson path ----------
function renderHome() {
  planLaunch = null; // any loop step we drop back home from is abandoned, not done
  store.rollover();
  store.refreshHearts();
  const L = store.lang();
  const m = store.metrics();
  recordWeeklySnapshot();
  const meta = LANGS.languages.find((x) => x.code === course.code);
  const goal = store.state.settings.dailyGoalXP;
  const pct = Math.min(100, Math.round((L.xpToday / goal) * 100));
  const due = store.dueItems().length;
  const totalVocab = Object.keys(vocabIndex(course)).length;
  const unseen = Math.max(0, totalVocab - m.introduced);
  const weekly = weeklyMomentum();
  const statusClass = due > 0 ? 'home-hero__sub home-hero__sub--urgent' : 'muted home-hero__sub';

  const lessons = allLessons(course);
  const nextLesson = lessons.find((l) => !store.isLessonComplete(l.id));
  const nextAction = nextBestAction(L, due, nextLesson);
  // Progressive disclosure: a brand-new learner sees ONE thing to do — the
  // path — under a friendly hello. Extra widgets appear as lessons complete,
  // so the screen grows with the learner instead of shouting at a beginner.
  const lessonsDone = L.completedLessons.length;
  const showPlanReview = lessonsDone >= 1;  // 90-day plan + review button
  const showPractice = lessonsDone >= 2;    // practice tools grid
  const showMinis = lessonsDone >= 3;       // quests/league + word of the day
  // which units are already fully complete (so we only offer "test out" on the rest)
  const unitComplete = {};
  for (const u of course.units) unitComplete[u.id] = u.lessons.length > 0 && u.lessons.every((l) => store.isLessonComplete(l.id));
  // Step 0: a no-pressure warm-up before Lesson 1 for absolute beginners.
  // Shown until the first lesson is complete; while it's pending it is the
  // highlighted next step (Lesson 1 stays open for those who want to dive in).
  const firstLesson = lessons[0];
  const showWarmup = firstLesson && !store.isLessonComplete(firstLesson.id) && (firstLesson.vocab || []).length >= 3;
  const warmupPending = showWarmup && !L.warmupDone;
  const warmupNode = showWarmup ? `
      <button class="node ${L.warmupDone ? 'node--done' : 'node--active'}" data-warmup>
        <span class="node__icon">${L.warmupDone ? '✓' : '🌱'}</span>
        <span class="node__title">Warm-up: meet your first words</span>
        ${L.warmupDone ? '' : '<span class="node__cta">START HERE</span>'}
      </button>` : '';
  let lastUnit = null;
  let activeMarked = warmupPending;
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
      ? `<div class="unit-head"><span>${esc(l.unitTitle)}</span><div class="unit-head__right"><small>${esc(l.level)}</small>${!unitComplete[l.unitId] && lessonsDone >= 1 ? `<button class="testout-btn" data-testout="${esc(l.unitId)}">Test out</button>` : ''}</div></div>`
      : '';
    lastUnit = l.unitTitle;
    const starHtml = done ? `<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` : '';
    const cta = active ? '<span class="node__cta">START</span>' : '';
    return `${unitHeader}${i === 0 ? warmupNode : ''}
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
  const buddy = currentBuddy();
  const greetSeed = (L.xp || 0) + (L.streak || 0) + (L.reviewsDone || 0);
  const wotd = wordOfTheDay();
  const wotdLearned = (L.wotd && L.wotd.day === todayStr() && L.wotd.learned);
  const boostN = Shop.inventory(store).boosts.double_xp || 0;

  const node = h(`
    <div class="screen">
      <h1 class="sr-only">MzansiLingo — ${esc(meta.name)} home</h1>
      <header class="topbar">
        <button class="topbar__lang" id="switchLang">${esc(meta.name)} ▾</button>
        <div class="topbar__stats">
          ${showPlanReview ? `<span class="stat stat--streak" id="streakBtn" role="button" tabindex="0" aria-label="Day streak ${L.streak}. Open league.">🔥 ${L.streak}</span>
          <span class="stat stat--gems" id="gemsBtn" role="button" tabindex="0" aria-label="${G.gems(store)} gems. Open shop.">💎 ${G.gems(store)}</span>` : ''}
          <span class="stat stat--hearts" id="heartsBtn" role="button" tabindex="0" aria-label="${store.state.premium ? 'Unlimited hearts' : `${L.hearts} of ${MAX_HEARTS} hearts`}">${store.state.premium ? '❤️∞' : `${'❤️'.repeat(L.hearts)}${'🤍'.repeat(MAX_HEARTS - L.hearts)}`}</span>
          <button class="stat" id="settingsBtn" aria-label="Settings" style="background:none;border:none;font-size:18px">⚙️</button>
        </div>
      </header>

      <section class="home-hero">
        <span class="home-hero__mascot">${mascotImg(buddy, { size: 84 })}</span>
        <div class="home-hero__text">
          <strong class="home-hero__greet">${esc(mascotGreeting(buddy, greetSeed))}</strong>
          <p class="${statusClass}">${esc(homeStatus(L, due, pct, goal))}</p>
          ${boostN ? `<span class="boost-chip">⚡ ${boostN} Double XP ready</span>` : ''}
        </div>
        <div class="goal__ring goal__ring--hero" style="--pct:${pct}" aria-label="${L.xpToday} of ${goal} XP today">
          <span>${L.xpToday}/${goal}</span>
        </div>
      </section>

      <section class="home-overview">
        <div class="home-overview__card">
          <div class="home-overview__head"><strong>Learning now</strong><span>${Math.round(m.retention * 100)}% retention</span></div>
          <div class="home-overview__stats">
            <span><b>${m.mastered}</b><small>mastered</small></span>
            <span><b>${m.learning}</b><small>drilling</small></span>
            <span><b>${unseen}</b><small>still ahead</small></span>
          </div>
        </div>
        ${weekly ? `<div class="home-overview__card home-overview__card--warm">
          <div class="home-overview__head"><strong>This week</strong><span>${weekly.retentionPct}% recall</span></div>
          <p class="home-overview__note">${weekly.hasHistory ? `+${weekly.masteredGain} mastered · +${weekly.introducedGain} new in play` : 'Your weekly rhythm will show up here as you practice.'}</p>
        </div>` : ''}
      </section>

      ${lessonsDone >= 1 ? `<button class="plan-card plan-card--resume" id="${nextAction.id}">
        <span class="plan-card__l">${nextAction.icon} <b>${esc(nextAction.title)}</b></span>
        <span class="plan-card__r">${esc(nextAction.sub)} ›</span>
      </button>` : ''}

      ${showPlanReview ? (L.plan
    ? `<button class="plan-card" id="planBtn"><span class="plan-card__l">📅 <b>Day ${L.plan.day}/90</b> · today's loop</span><span class="plan-card__r">${Object.values(L.plan.done).filter(Boolean).length}/4 ›</span></button>`
    : '<button class="plan-card plan-card--start" id="planBtn"><span class="plan-card__l">📅 <b>Start your 90-day plan</b></span><span class="plan-card__r">guided daily path ›</span></button>') : ''}

      ${showPlanReview && due ? `<button class="btn btn--review" id="reviewBtn">
        🔁 Review <span class="badge">${due} due</span>
      </button>` : ''}

      ${showMinis ? `<div class="mini-row">
        <button class="mini" id="questsBtn">
          <span class="mini__top">🎯 Quests <b>${questsDone}/${quests.length}</b></span>
          <span class="qbar"><span style="width:${Math.round((questsDone / quests.length) * 100)}%"></span></span>
        </button>
        <button class="mini" id="leagueBtn">
          <span class="mini__top">${G.leagueIcon(G.LEAGUES[lg.tier])} ${esc(G.LEAGUES[lg.tier])} <b>#${lgRank.rank}</b></span>
          <span class="qbar qbar--gold"><span style="width:${Math.round(((G.LEAGUE_SIZE - lgRank.rank + 1) / G.LEAGUE_SIZE) * 100)}%"></span></span>
        </button>
      </div>` : ''}

      ${showMinis && wotd ? `<button class="wotd-strip" id="wotdBtn">
        🗓️ <span class="muted">Word of the day:</span> <b>${esc(wotd.term)}</b> — ${esc(wotd.translation)} ${wotdLearned ? '✓' : '🔊'}
      </button>` : ''}

      ${showPractice ? `<h3 class="sec sec--home">Practice</h3>
      <div class="act-grid">
        ${(course.grammar || []).length ? `<button class="act act--grammar" id="grammarBtn">
          <span class="act__ic">🧩</span><span class="act__l"><b>Grammar</b><small>patterns</small></span></button>` : ''}
        ${(course.dialogues || []).length ? `<button class="act act--convo" id="dialogueBtn">
          <span class="act__ic">💬</span><span class="act__l"><b>Conversations</b><small>real chats</small></span></button>` : ''}
        <button class="act act--speak" id="speakBtn">
          <span class="act__ic">🎤</span><span class="act__l"><b>Speaking</b><small>out loud</small></span></button>
        <button class="act act--listen" id="listenBtn">
          <span class="act__ic">👂</span><span class="act__l"><b>Listening</b><small>understand by ear</small></span></button>
        <button class="act act--blitz" id="blitzBtn">
          <span class="act__ic">⚡</span><span class="act__l"><b>Lightning</b><small>fast recall</small></span></button>
        <button class="act act--words" id="glossaryBtn">
          <span class="act__ic">📒</span><span class="act__l"><b>Word list</b><small>all ${Object.keys(vocabIndex(course)).length} words</small></span></button>
      </div>` : ''}

      ${lessonsDone >= 1 && !showMinis ? '<p class="footnote">More tools unlock as you learn 🔓</p>' : ''}
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
  node.querySelectorAll('[data-warmup]').forEach((b) =>
    b.addEventListener('click', () => { sound.tap(); startWarmup(); }));
  node.querySelectorAll('[data-testout]').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); confirmTestOut(b.dataset.testout); }));
  // several widgets only exist past certain progress — wire whatever rendered
  const on = (sel, fn) => { const el = node.querySelector(sel); if (el) el.addEventListener('click', fn); };
  on('#switchLang', () => renderLanguageSelect(false));
  on('#reviewBtn', startReview);
  on('#resumeReview', startReview);
  on('#resumePlan', renderPlan);
  on('#resumeLesson', () => startLesson(nextLesson.id));
  on('#resumeStory', nextAction.action);
  on('#resumeSpeak', startSpeaking);
  on('#planBtn', renderPlan);
  on('#storiesNav', renderLibrary);
  on('#glossaryBtn', () => renderGlossary());
  on('#speakBtn', startSpeaking);
  on('#listenBtn', startListening);
  on('#blitzBtn', startBlitz);
  on('#grammarBtn', renderGrammar);
  on('#dialogueBtn', renderDialogues);
  on('#shopNav', renderShop);
  on('#questsBtn', renderQuests);
  on('#leagueBtn', renderLeague);
  on('#achBtn', renderAchievements);
  on('#progressBtn2', renderProgress);
  on('#gemsBtn', renderShop);
  on('#streakBtn', renderLeague);
  on('#heartsBtn', () => { if (store.lang().hearts < MAX_HEARTS) renderHeartsModal(); });
  on('#settingsBtn', renderSettings);
  on('#wotdBtn', renderWotd);
  wireKeyActivation(node);
  mount(node);
  // keep the reminder state fresh for the service worker, and arm a same-session
  // nudge in case the learner leaves the tab open without practising
  Notify.syncState(store);
  Notify.armSessionFallback(store);
}

// The situational status line under the buddy's greeting — what to do right now.
// The buddy's own voice carries the warmth (see mascotGreeting); this line keeps
// the learner oriented: what's due, the streak, or XP left to the daily goal.
function homeStatus(L, due, pct, goal) {
  const profile = learnerProfile();
  // brand-new learner: one clear pointer, no jargon about streaks or reviews
  if (!L.completedLessons.length) {
    return L.warmupDone ? 'Your first lesson is ready below 👇' : 'Start with the warm-up below 👇';
  }
  if (pct >= 100) return 'Done for today — well played! 🎉';
  if (due > 0 && missedDaysSince(L.lastStudyDay, todayStr()) >= 2 && L.lastRepairDay !== todayStr()) return 'Welcome back — start with a short confidence reset 🌱';
  if (due > 0) return `${due} word${due === 1 ? '' : 's'} ready to review 🔒`;
  if (profile.goal === 'conversation' || profile.goal === 'travel') return 'Keep speaking and listening — that’s your fastest path now';
  if (profile.goal === 'school') return 'A little every day makes the school stuff stick';
  if ((L.streak || 0) >= 3) return `🔥 ${L.streak}-day streak — keep it going!`;
  return `${goal - L.xpToday} XP to keep your streak`;
}

function weeklyMomentum() {
  const snaps = ((store.state.progressSnapshots || {})[store.state.activeLang] || []).slice(-2);
  const cur = snaps[snaps.length - 1];
  if (!cur) return null;
  const prev = snaps[snaps.length - 2];
  return {
    masteredGain: Math.max(0, cur.mastered - (prev ? prev.mastered : 0)),
    introducedGain: Math.max(0, cur.introduced - (prev ? prev.introduced : 0)),
    retentionPct: Math.round((cur.retention || 0) * 100),
    hasHistory: !!prev,
  };
}

function planStepHint(key) {
  return ({
    review: 'Warm up with words your memory is about to drop.',
    lesson: 'Add a small set of new words and patterns.',
    input: 'Read or listen where you already know most of the words.',
    output: 'Say or use the language so it becomes recall, not recognition.',
  })[key] || '';
}

function exerciseStage(ex) {
  const newLabel = '🌱 New — build the first strong memory';
  const vids = exerciseVocabIds(ex, session.lesson);
  const primary = vids.find(Boolean);
  const item = primary ? store.lang().items[primary] : null;
  if (!primary || !item) return { label: newLabel, tone: 'new' };
  if (item.mastered) return { label: '⭐ Mastered — keep it fluent under pressure', tone: 'mastered' };
  if (item.seen > 0 || item.encountered) return { label: '🔁 Review — pull it back before it fades', tone: 'learning' };
  return { label: newLabel, tone: 'new' };
}

function learningPaceInfo(retention = store.state.settings.desiredRetention || 0.9) {
  if (retention >= 0.95) {
    return {
      title: 'Challenge pace',
      body: 'More frequent reviews, stronger retention, and the heaviest daily load.',
      detail: 'Best when you want the fastest recall growth and can handle more practice touches.',
    };
  }
  if (retention <= 0.85) {
    return {
      title: 'Relaxed pace',
      body: 'Fewer reviews and a lighter day, with slower reinforcement to mastery.',
      detail: 'Good for busy learners who still want steady progress without as much review volume.',
    };
  }
  return {
    title: 'Balanced pace',
    body: 'The recommended middle ground: enough review to make words stick without overload.',
    detail: 'Best for most learners aiming to build conversation skill over the 90-day journey.',
  };
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
    store.encounter(w.id); // enters the SRS schedule; the first review tests it for real
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

// ---------- speaking practice (spoken sentence production) ----------
// Output practice toward spoken fluency, built on the production effect: words
// said aloud IN SENTENCES stick far better than typed single words. The flow is
// recall-first — see the English, formulate and SAY it, then reveal the model
// and self-rate honestly (with a real "not quite" that counts as a lapse).
// No speech recognition (unreliable for SA languages) — honest self-assessment,
// works offline. Self-rating reinforces the review schedule but does NOT grant
// production mastery (that still needs typing).
function speakingItems() {
  const idx = vocabIndex(course);
  const items = [];
  // sentence-first: full sentences from phrases, dialogues and stories
  // outrank single-word cards (chunks are how fluent speech is retrieved)
  for (const s of shuffle(sentencePool(course))) {
    const ids = [...(s.phraseId ? [s.phraseId] : []), ...memberVocabIds(s.t, idx)];
    items.push({ text: s.t, meaning: s.en, phonetic: '', ids });
    if (items.length >= 7) break;
  }
  const L = store.lang();
  const pickIds = [...new Set([...store.dueItems(), ...shuffle(Object.keys(L.items).filter((id) => L.items[id].seen > 0))])].filter((id) => idx[id]).slice(0, 3);
  for (const id of pickIds) { const v = idx[id]; items.push({ text: v.term, meaning: v.translation, phonetic: v.phonetic || '', ids: [id] }); }
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
  const isSentence = /\s/.test(it.text.trim());
  const node = h(`
    <div class="screen ex">
      <header class="ex__top">
        <button class="ex__quit" id="quitBtn" aria-label="Quit">✕</button>
        <div class="ex__bar"><div class="ex__bar-fill" style="width:${Math.round((s.idx / s.items.length) * 100)}%"></div></div>
        <span class="muted">${s.idx + 1}/${s.items.length}</span>
      </header>
      <div class="ex__body">
        <h2 class="ex__q">Say it in ${esc(course.name)} 🎤</h2>
        <div class="wotd-big">
          <span class="wotd-big__tr">${esc(it.meaning)}</span>
          <div id="target" hidden>
            <strong>${esc(it.text)}</strong>
            ${it.phonetic ? `<span class="wotd-big__phon muted">${esc(it.phonetic)}</span>` : ''}
          </div>
        </div>
        <p class="muted" id="coach" style="text-align:center">${isSentence ? 'Say the whole sentence out loud from memory — then check yourself.' : 'Say it out loud from memory — then check yourself.'}</p>
        <div class="spk-rec" id="recArea" hidden>
          <button class="play-btn" id="hearBtn">🔊 Hear it again</button>
          ${recordSupported() ? '<button class="btn btn--ghost" id="recBtn">🎤 Record yourself</button>' : ''}
        </div>
      </div>
      <div class="ex__foot" id="foot">
        <button class="btn btn--primary" id="revealBtn">🎤 I said it — show the answer</button>
      </div>
    </div>`);
  node.querySelector('#quitBtn').addEventListener('click', () => { speakSession = null; renderHome(); });
  const rate = (good) => {
    // honest self-rating: "not quite" is a real lapse signal, and even "got it"
    // never grants production mastery (that still needs typing/real recall)
    for (const id of it.ids) srsReview(store.item(id), gradeFor(good, 'multiple_choice'), 'multiple_choice');
    store.recordExercise('speak', good);
    if (good) { store.addXp(5); s.done += 1; sound.correct(); haptic(12); } else { sound.wrong(); haptic([10, 40, 10]); }
    store.save();
    s.idx += 1;
    renderSpeaking();
  };
  node.querySelector('#revealBtn').addEventListener('click', () => {
    node.querySelector('#target').hidden = false;
    node.querySelector('#recArea').hidden = false;
    node.querySelector('#coach').textContent = 'Compare with the model. Say it again out loud — then rate yourself honestly.';
    speak(it.text, course.code);
    const foot = node.querySelector('#foot');
    foot.innerHTML = `
      <button class="btn btn--primary" id="goodBtn">✓ I said it right</button>
      <button class="btn btn--ghost" id="missBtn">🔁 Not yet — review it for me</button>`;
    foot.querySelector('#goodBtn').addEventListener('click', () => rate(true));
    foot.querySelector('#missBtn').addEventListener('click', () => rate(false));
    node.querySelector('#hearBtn').addEventListener('click', () => tryHear(it.text, course.code));
    wireRecorder(node);
  });
  mount(node);
}

// Record & compare (shadowing): optional mic capture so learners can hear
// themselves against the model.
function wireRecorder(node) {
  const recBtn = node.querySelector('#recBtn');
  if (!recBtn) return;
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

function renderSpeakingDone() {
  const done = speakSession ? speakSession.done : 0;
  speakSession = null;
  G.track(store, 'speaking');
  markPlan('output');
  confetti({ count: 60, duration: 1100 }); sound.complete(); haptic([15, 30, 15]);
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 110, className: 'mascot-img--cheer' })}</div>
      <h1>Speaking practice done!</h1>
      <p class="muted">You used your voice on ${done} ${done === 1 ? 'item' : 'items'}. Saying words out loud is how spoken fluency grows.</p>
      <button class="btn btn--primary" id="doneBtn">Continue</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', afterActivityNav);
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
    announce(ok ? 'Correct!' : `It was ${it.text}, meaning ${it.answer}`);
    for (const id of it.ids) srsReview(store.item(id), gradeFor(ok, 'multiple_choice'), 'multiple_choice');
    store.recordExercise('listen', ok);
    if (ok) { store.addXp(5); s.done += 1; }
    store.save();
    // auto-advance, but always give a Continue button so nobody races the timer
    const seq = mountSeq;
    let advanced = false;
    const go = () => {
      if (advanced || mountSeq !== seq || !listenSession) return;
      advanced = true;
      s.idx += 1; renderListening();
    };
    setTimeout(go, ok ? 1500 : 3000);
    const foot = node.querySelector('#foot');
    foot.innerHTML = '<button class="btn btn--primary" id="next">Continue</button>';
    foot.querySelector('#next').addEventListener('click', () => { sound.tap(); go(); });
    foot.querySelector('#next').focus();
  }));
  mount(node);
}

function renderListeningDone() {
  const done = listenSession ? listenSession.done : 0;
  listenSession = null;
  G.track(store, 'listening');
  markPlan('input');
  confetti({ count: 60, duration: 1100 }); sound.complete(); haptic([15, 30, 15]);
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 110, className: 'mascot-img--cheer' })}</div>
      <h1>Listening practice done!</h1>
      <p class="muted">You understood ${done} from sound. Training your ear is how real comprehension grows.</p>
      <button class="btn btn--primary" id="doneBtn">Continue</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', afterActivityNav);
  mount(node);
}

// ---------- lightning round (fluency under time pressure) ----------
// The fluency strand: rapid retrieval of words you ALREADY know, against the
// clock. Time pressure pushes retrieval from slow-and-deliberate towards
// automatic — the missing step between "knowing" a word and using it in real
// conversation. Reuses learned content only, so it's pure consolidation.
const BLITZ_SECONDS = 60;
let blitz = null;

function blitzPool() {
  const idx = vocabIndex(course);
  const L = store.lang();
  return Object.keys(L.items).filter((id) => L.items[id].seen > 0 && idx[id]).map((id) => idx[id]);
}

function startBlitz() {
  const pool = blitzPool();
  if (pool.length < 5) return flashToast('Learn a few more words first — Lightning uses words you already know.');
  const best = store.lang().blitzBest || 0;
  const node = h(`
    <div class="screen screen--center">
      <div class="result__emoji">⚡</div>
      <h1>Lightning round</h1>
      <p class="onb__body">${BLITZ_SECONDS} seconds. As many words as you can — fast recall is what makes real conversation possible. Only words you've already learned, no hearts.</p>
      ${best ? `<p class="muted">Your best: <strong>${best}</strong> correct</p>` : ''}
      <div class="onb__actions">
        <button class="btn btn--primary" id="go">Start ⚡</button>
        <button class="btn btn--ghost" id="back">Back</button>
      </div>
    </div>`);
  node.querySelector('#go').addEventListener('click', runBlitz);
  node.querySelector('#back').addEventListener('click', renderHome);
  mount(node);
}

function runBlitz() {
  const pool = blitzPool();
  blitz = { pool: shuffle(pool), i: 0, answered: 0, correct: 0, ends: Date.now() + BLITZ_SECONDS * 1000, timer: null };
  const node = h(`
    <div class="screen ex">
      <header class="ex__top">
        <button class="ex__quit" id="quitBtn" aria-label="Quit">✕</button>
        <div class="ex__bar"><div class="ex__bar-fill ex__bar-fill--blitz" id="timeBar" style="width:100%"></div></div>
        <span class="muted" id="blitzScore">⚡ 0</span>
      </header>
      <div class="ex__body" id="qArea"></div>
    </div>`);
  const stop = () => { if (blitz && blitz.timer) clearInterval(blitz.timer); };
  node.querySelector('#quitBtn').addEventListener('click', () => { stop(); blitz = null; renderHome(); });
  mount(node);
  blitz.timer = setInterval(() => {
    if (!blitz) return;
    const left = blitz.ends - Date.now();
    const bar = document.getElementById('timeBar');
    if (bar) bar.style.width = `${Math.max(0, (left / (BLITZ_SECONDS * 1000)) * 100)}%`;
    if (left <= 0) { stop(); finishBlitz(); }
  }, 100);
  blitzQuestion(node);
}

function blitzQuestion(node) {
  if (!blitz) return;
  if (blitz.i >= blitz.pool.length) { blitz.pool = shuffle(blitz.pool); blitz.i = 0; }
  const v = blitz.pool[blitz.i]; blitz.i += 1;
  const toEn = Math.random() < 0.5;
  const all = blitzPool();
  const key = toEn ? 'translation' : 'term';
  const seen = new Set([normalize(v[key])]);
  const opts = [v[key]];
  for (const o of shuffle(all)) {
    const k = normalize(o[key]);
    if (o.id === v.id || seen.has(k)) continue;
    seen.add(k); opts.push(o[key]);
    if (opts.length >= 4) break;
  }
  const q = node.querySelector('#qArea');
  q.innerHTML = `
    <h2 class="ex__q">${toEn ? `“${esc(v.term)}” means:` : `How do you say “${esc(v.translation)}”?`}</h2>
    <div class="opts">${shuffle(opts).map((o) => `<button class="opt" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  q.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
    if (!blitz) return;
    const ok = normalize(b.dataset.val) === normalize(v[key]);
    blitz.answered += 1;
    if (ok) { blitz.correct += 1; sound.correct(); haptic(8); } else { sound.wrong(); haptic([10, 30, 10]); }
    // answered under time pressure is still real evidence — grade it honestly
    srsReview(store.item(v.id), gradeFor(ok, 'multiple_choice'), 'multiple_choice');
    const sc = document.getElementById('blitzScore');
    if (sc) sc.textContent = `⚡ ${blitz.correct}`;
    b.classList.add(ok ? 'opt--ok' : 'opt--bad');
    q.querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
    setTimeout(() => blitzQuestion(node), ok ? 140 : 450);
  }));
}

function finishBlitz() {
  if (!blitz) return;
  const { answered, correct } = blitz;
  blitz = null;
  const L = store.lang();
  const isBest = correct > (L.blitzBest || 0);
  if (isBest) L.blitzBest = correct;
  const xp = Math.min(40, correct * 2);
  if (xp) { store.addXp(xp); G.track(store, 'xp', { amount: xp }); }
  store.save();
  sound.complete(); haptic([15, 30, 15]);
  if (isBest) confetti({ count: 90, duration: 1200 });
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 110, className: 'mascot-img--cheer' })}</div>
      <h1>${isBest ? 'New record! ⚡' : 'Time!'}</h1>
      <div class="result__row">
        <div class="kpi"><span class="kpi__v">${correct}</span><span class="kpi__k">Correct</span></div>
        <div class="kpi"><span class="kpi__v">${answered}</span><span class="kpi__k">Answered</span></div>
        <div class="kpi"><span class="kpi__v">+${xp}</span><span class="kpi__k">XP</span></div>
      </div>
      <p class="muted">Fast recall turns words you know into words you can USE mid-conversation.</p>
      <button class="btn btn--primary" id="again">⚡ Go again</button>
      <button class="btn btn--ghost" id="doneBtn">Done</button>
    </div>`);
  node.querySelector('#again').addEventListener('click', runBlitz);
  node.querySelector('#doneBtn').addEventListener('click', renderHome);
  mount(node);
}

// ---------- 90-day guided curriculum ----------
// A structured daily loop — interleaved review → new lesson → comprehensible
// input → pushed output — the research-backed sequence, tracked over 90 days.

// Which loop step (if any) the learner launched from the plan screen. Steps are
// only ticked off — and the learner is only returned to the plan afterwards —
// when the activity was started here, so unrelated practice elsewhere doesn't
// silently complete today's loop. Cleared whenever we land on home or the plan.
let planLaunch = null;
// Where to go when a finished activity's "Continue" is tapped: back to the plan
// if it was part of today's loop, otherwise home.
function afterActivityNav() {
  const fromPlan = planLaunch;
  planLaunch = null;
  return fromPlan ? renderPlan() : renderHome();
}

function markPlan(type) {
  const L = store.lang();
  if (!L.plan || L.plan.completed) return;
  // credit a step only when the learner actually started it from the plan
  if (type && type === planLaunch && !L.plan.done[type]) L.plan.done[type] = true;
  if (!L.plan.done.review && store.dueItems().length === 0) L.plan.done.review = true; // nothing to review
  const d = L.plan.done;
  if (d.review && d.lesson && d.input && d.output) {
    const finished = L.plan.day;
    if (L.plan.day >= 90) { L.plan.completed = true; store.save(); flashToast('🎉 You finished the 90-day plan!'); }
    else { L.plan.day += 1; L.plan.done = { review: false, lesson: false, input: false, output: false }; store.save(); flashToast(`Day ${finished} complete! 🎉`); }
  } else { store.save(); }
}

function planActivities() {
  const profile = learnerProfile();
  const done = store.lang().plan.done;
  const lessons = allLessons(course);
  const nextLesson = lessons.find((l) => !store.isLessonComplete(l.id));
  const due = store.dueItems().length;
  const hasReading = (course.reading || []).length > 0;
  const hasDialogue = (course.dialogues || []).length > 0;
  const repairPending = due > 0 && missedDaysSince(store.lang().lastStudyDay, todayStr()) >= 2 && store.lang().lastRepairDay !== todayStr();
  const timeLabel = profile.dailyTime === '5' ? 'quick' : profile.dailyTime === '30' ? 'deeper' : 'steady';
  const lessonSub = profile.goal === 'school'
    ? 'build the next school-ready topic'
    : profile.goal === 'travel' ? 'pick up useful real-world phrases'
      : profile.goal === 'conversation' ? 'learn phrases you can actually use'
        : 'a new lesson';
  const inputSub = profile.goal === 'school'
    ? 'read and lock in what you’re learning'
    : profile.goal === 'travel' ? 'train your ear for real-world listening'
      : 'understand real language';
  const outputSub = profile.confidence === 'new'
    ? 'guided speaking, one small step at a time'
    : profile.goal === 'conversation' ? 'use it out loud in real replies'
      : 'use it out loud';
  return [
    { key: 'review', icon: '🔁', label: repairPending ? 'Confidence reset review' : 'Warm-up review', sub: due > 0 ? `${timeLabel} session · ${due} words due${repairPending ? ' · we’ll start gentle' : ''}` : 'nothing due — auto-done', done: done.review, action: due > 0 ? () => startReview() : null },
    { key: 'lesson', icon: '📘', label: nextLesson ? `Learn: ${nextLesson.title}` : 'Learn: all lessons done!', sub: nextLesson ? lessonSub : 'try grammar or review', done: done.lesson, action: nextLesson ? () => startLesson(nextLesson.id) : () => ((course.grammar || []).length ? renderGrammar() : startReview()) },
    { key: 'input', icon: '📖', label: 'Input: read or listen', sub: inputSub, done: done.input, action: () => ((profile.goal === 'travel' || profile.goal === 'conversation') ? startListening() : (hasReading ? renderLibrary() : startListening())) },
    { key: 'output', icon: '🗣️', label: 'Output: speak or converse', sub: outputSub, done: done.output, action: () => ((profile.goal === 'conversation' || profile.goal === 'travel') ? (hasDialogue ? renderDialogues() : startSpeaking()) : startSpeaking()) },
  ];
}

function renderPlanIntro() {
  const node = h(`
    <div class="screen screen--center">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 130, className: 'mascot-img--bob' })}</div>
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
  const pct = Math.round((doneCount / acts.length) * 100); // today's progress, not the 90-day bar
  // a friendly, plain-language cue instead of the old jargon paragraph
  const cue = allDone
    ? 'All done for today! 🎉'
    : doneCount === 0 ? 'Four little steps today — tap Start! 🌟'
      : `Nice — ${acts.length - doneCount} step${acts.length - doneCount === 1 ? '' : 's'} to go! 💪`;
  const rows = acts.map((a, i) => `
    <div class="pstep pstep--${a.key} ${a.done ? 'pstep--done' : ''}">
      <span class="pstep__num">${a.done ? '✓' : a.icon}</span>
      <div class="pstep__body"><strong>${esc(a.label)}</strong><span class="muted">${esc(a.sub)}</span><span class="pstep__desc">${esc(planStepHint(a.key))}</span></div>
      ${a.done ? '<span class="pstep__ok">Done</span>' : `<button class="pstep__go" data-act="${a.key}">Start</button>`}
    </div>`).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>90-Day Plan</strong><span></span></header>
      <section class="plan-hero">
        <span class="plan-hero__mascot">${mascotImg(currentBuddy(), { size: 84 })}</span>
        <div class="plan-hero__main">
          <span class="plan-hero__day">${p.completed ? 'Plan complete! 🎉' : `Day ${p.day} <small>of 90</small>`}</span>
          <div class="plan-hero__bar"><div class="plan-hero__fill" style="width:${pct}%"></div></div>
          <span class="plan-hero__cue">${p.completed ? 'You finished — keep the habit going' : `${doneCount}/${acts.length} done · ${cue}`}</span>
        </div>
      </section>
      <h3 class="sec">Today's steps</h3>
      <div class="plan-steps">${rows}</div>
      ${allDone ? '<div class="plan-complete">🎉 Come back tomorrow — a little every day is what makes 90 days work!</div>' : ''}
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = acts.find((x) => x.key === b.dataset.act);
    if (a && a.action) { planLaunch = a.key; a.action(); }
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
// Where a turn id lives in the turns array ('end' finishes the conversation).
// Turn ids + option `next` pointers are what make dialogues genuinely branch:
// different replies can lead to different NPC responses before converging.
function dialogueJump(next) {
  if (next === 'end') return dlg.d.turns.length;
  const i = dlg.d.turns.findIndex((t) => t.id === next);
  return i >= 0 ? i : dlg.idx + 1;
}
function advanceDialogueNpc() {
  const turns = dlg.d.turns;
  while (dlg.idx < turns.length && turns[dlg.idx].speaker === 'npc') {
    const t = turns[dlg.idx];
    dlg.log.push({ who: 'npc', name: t.name || '', t: t.t, en: t.en });
    dlg.idx = t.next != null ? dialogueJump(t.next) : dlg.idx + 1;
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
        dlg.idx = choice.next != null ? dialogueJump(choice.next) : dlg.idx + 1;
        advanceDialogueNpc();
        renderDialogue();
      } else {
        dlg.mistakes += 1;
        sound.wrong(); haptic([10, 40, 10]);
        b.classList.add('opt--bad'); b.disabled = true;
        // corrective feedback — the highest-impact ingredient of interaction:
        // say WHY the reply doesn't work, not just that it doesn't
        const why = choice.why || 'Not quite — try a different reply.';
        let fb = node.querySelector('#dlgWhy');
        if (!fb) { fb = h('<p class="dlg-why" id="dlgWhy" role="alert"></p>'); node.querySelector('#foot').prepend(fb); }
        fb.textContent = `💡 ${why}`;
        announce(why);
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
  // input-first: the conversation's vocabulary enters the review schedule —
  // honestly (encountered, due now), not as fake correct recalls.
  const idx = vocabIndex(course);
  const byTerm = {}; for (const v of Object.values(idx)) byTerm[normalize(v.term)] = v.id;
  const text = normalize(d.turns.map((t) => t.t || (t.options || []).map((o) => o.t).join(' ')).join(' '));
  for (const [term, id] of Object.entries(byTerm)) {
    if (term && (text === term || text.includes(` ${term} `) || text.startsWith(`${term} `) || text.endsWith(` ${term}`))) store.encounter(id);
  }
  const perfect = dlg.mistakes === 0;
  const xp = perfect ? 25 : 15;
  store.addXp(xp); store.state.gems = (store.state.gems || 0) + 5;
  G.track(store, 'xp', { amount: xp }); G.checkAchievements(store); store.save(); markPlan('output');
  dlg = null;
  confetti({ count: 80, duration: 1200 }); sound.complete(); haptic([15, 30, 15]);
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 120, className: 'mascot-img--cheer' })}</div>
      <h1>Conversation complete! 💬</h1>
      <p class="muted">${perfect ? 'Flawless — you handled the whole conversation!' : 'Nicely done — you got through it!'}</p>
      <div class="result__row"><div class="kpi"><span class="kpi__v">+${xp}</span><span class="kpi__k">XP</span></div><div class="kpi"><span class="kpi__v">+💎5</span><span class="kpi__k">Gems</span></div></div>
      <button class="btn btn--primary" id="doneBtn">Continue</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', afterActivityNav);
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
  node.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
    const gid = b.dataset.g;
    // inquiry-based learning: the FIRST time you meet a pattern, notice it
    // yourself before being told the rule — noticing a pattern is a stronger,
    // more durable form of higher-order learning than being handed it.
    (store.grammarState(gid) === 'new') ? renderGrammarInquiry(gid) : renderGrammarTip(gid);
  }));
  mount(node);
}

// "Spot the pattern": three worked examples, then a "now you try" guess of a
// fourth, before the formal rule is revealed. Falls back straight to the tip
// for patterns without a generative frame (nothing to induce from) or without
// enough combinations to hold one back as the guess.
function renderGrammarInquiry(gid) {
  const g = (course.grammar || []).find((x) => x.id === gid);
  if (!g) return renderGrammar();
  const inquiry = g.frames ? genPatternInquiry(g.frames) : null;
  if (!inquiry) return renderGrammarTip(gid);
  const exRows = inquiry.examples.map((e) => `<li><span class="muted">${esc(e.en)}</span> → <strong>${esc(e.chunk)}</strong></li>`).join('');
  const opts = shuffle(inquiry.options).map((o) => `<button class="opt" data-val="${esc(o)}">${esc(o)}</button>`).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Grammar</button><strong>Spot the pattern</strong><span></span></header>
      <p class="muted">Look at these examples. What's the pattern?</p>
      <ul class="inquiry-list">${exRows}</ul>
      <h2 class="ex__q">Now you try: how would you say “${esc(inquiry.prompt)}”?</h2>
      <div class="opts">${opts}</div>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderGrammar);
  node.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
    const ok = normalize(b.dataset.val) === normalize(inquiry.answer);
    node.querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
    b.classList.add(ok ? 'opt--ok' : 'opt--bad');
    if (!ok) node.querySelectorAll('.opt').forEach((x) => { if (normalize(x.dataset.val) === normalize(inquiry.answer)) x.classList.add('opt--ok'); });
    ok ? sound.correct() : sound.wrong();
    setTimeout(() => renderGrammarTip(gid), 1400);
  }));
  mount(node);
}

function renderGrammarTip(gid) {
  const g = (course.grammar || []).find((x) => x.id === gid);
  if (!g) return renderGrammar();
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Grammar</button><strong>${esc(g.title)}</strong><span></span></header>
      <div class="gram-tip"><span class="gram-tip__icon">💡</span><p>${esc(g.tip)}</p></div>
      ${g.frames ? '<p class="muted">Drills for this pattern are generated fresh every time from real course verbs — you\'re learning the frame, not memorising a list.</p>' : ''}
      <button class="btn btn--primary" id="practise">Practise this pattern${g.frames ? ' · fresh drills each time' : ` · ${g.drills.length} drills`}</button>
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
  // generative: a frames spec produces fresh whole-chunk drills from course
  // verbs every session (subject prefix + stem drilled as one unit); a couple
  // of hand-authored drills are kept in the mix for curated coverage
  const generated = g.frames ? genFrameDrills(g.frames, 6) : [];
  const authored = shuffle(g.drills || []).slice(0, generated.length ? 3 : (g.drills || []).length);
  const queue = shuffle([...authored, ...generated]).map((d) => (d.options
    ? { type: 'multiple_choice', prompt: d.prompt, answer: d.answer, options: d.options }
    : { type: 'translate', prompt: d.prompt, answer: d.answer, accept: [d.answer.toLowerCase()] }));
  session = { mode: 'grammar', grammarId: gid, lesson: null, queue, idx: 0, mistakes: 0, total: 0 };
  renderExercise();
}

// ---------- gentle warm-up (learning mode — before anything test-like) ----------
// For someone starting from absolutely nothing, even Lesson 1 can feel like a
// test. The warm-up is LEARNING first: each word is taught (see it, hear it,
// read the meaning) before one friendly tap about it — no hearts, no typing,
// and a miss gets a warm "no stress" note instead of a buzzer, because at this
// stage nothing has been learned yet, so nothing can be failed. Words still
// enter the real review schedule, graded honestly. With firstRun=true it IS
// the first-run experience (straight after picking a language).
const WARMUP_WORDS = 5;

function startWarmup(firstRun = false) {
  const first = allLessons(course)[0];
  const words = (first.vocab || []).slice(0, WARMUP_WORDS);
  if (words.length < 3) return firstRun ? finishOnboarding() : startLesson(first.id);
  renderWarmupStep({ words, i: 0, firstLessonId: first.id, firstRun });
}

function quitWarmup(w) {
  // leaving mid-way is fine — on a first run, still land somewhere sensible
  if (w.firstRun) return finishOnboarding();
  renderHome();
}

function renderWarmupStep(w) {
  const { words, i } = w;
  if (i >= words.length) return renderWarmupDone(w);
  const word = words[i];
  const lead = w.firstRun && i === 0
    ? 'Nothing to get wrong here — just meet the word and try saying it out loud.'
    : 'Just meet the word — try saying it out loud once.';
  const node = h(`
    <div class="screen onb">
      <header class="ex__top" style="align-self:stretch">
        <button class="ex__quit" id="quitBtn" aria-label="Quit warm-up">✕</button>
        <span class="muted">${w.firstRun ? 'Your first words' : 'Warm-up'} · ${i + 1} of ${words.length}</span>
      </header>
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 96 })}</div>
      <div class="wotd-big">
        <strong>${esc(word.term)}</strong>
        <span class="wotd-big__phon muted">${esc(word.phonetic || '')}</span>
        <span class="wotd-big__tr">${esc(word.translation)}</span>
      </div>
      <button class="play-btn" id="hear">🔊 Hear it</button>
      <p class="onb__body">${lead}</p>
      <div class="onb__actions"><button class="btn btn--primary" id="next">Got it →</button></div>
    </div>`);
  node.querySelector('#quitBtn').addEventListener('click', () => quitWarmup(w));
  node.querySelector('#hear').addEventListener('click', () => tryHear(word.term, course.code));
  speak(word.term, course.code);
  node.querySelector('#next').addEventListener('click', () => { sound.tap(); renderWarmupCheck(w); });
  mount(node);
}

function renderWarmupCheck(w) {
  const { words, i } = w;
  const word = words[i];
  const others = shuffle(words.filter((x) => x.id !== word.id)).slice(0, 2).map((x) => x.translation);
  const options = shuffle([word.translation, ...others]);
  const node = h(`
    <div class="screen onb">
      <header class="ex__top" style="align-self:stretch">
        <button class="ex__quit" id="quitBtn" aria-label="Quit warm-up">✕</button>
        <span class="muted">${w.firstRun ? 'Your first words' : 'Warm-up'} · ${i + 1} of ${words.length}</span>
      </header>
      <h2 class="ex__q">Quick tap — what does “${esc(word.term)}” mean?</h2>
      <div class="opts" style="width:100%">${options.map((o) => `<button class="opt" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <p class="onb__body" id="gentle" hidden></p>
    </div>`);
  node.querySelector('#quitBtn').addEventListener('click', () => quitWarmup(w));
  node.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
    const ok = normalize(b.dataset.val) === normalize(word.translation);
    node.querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
    if (ok) {
      b.classList.add('opt--ok');
      sound.correct(); haptic(15);
      announce('Correct!');
    } else {
      // learning mode: no buzzer, no red X — just kindly show the answer
      node.querySelectorAll('.opt').forEach((x) => { if (normalize(x.dataset.val) === normalize(word.translation)) x.classList.add('opt--ok'); });
      const g = node.querySelector('#gentle');
      g.textContent = `💛 No stress — “${word.term}” means “${word.translation}”. You'll meet it again.`;
      g.hidden = false;
      sound.tap(); haptic(8);
      announce(`No stress — it means ${word.translation}`);
    }
    // honest crediting: the word enters the real schedule graded by this try
    srsReview(store.item(word.id), gradeFor(ok, 'multiple_choice'), 'multiple_choice');
    store.save();
    const seq = mountSeq;
    setTimeout(() => { if (mountSeq === seq) renderWarmupStep({ ...w, i: i + 1 }); }, ok ? 900 : 2400);
  }));
  mount(node);
}

function renderWarmupDone(w) {
  const L = store.lang();
  if (!L.warmupDone) { L.warmupDone = true; store.addXp(10); }
  store.save();
  confetti({ count: 70, duration: 1100 }); sound.complete(); haptic([15, 30, 15]);
  const chips = w.words.map((p) => `<span class="win-word">${esc(p.term)}</span>`).join('');
  const body = w.firstRun
    ? 'That\'s the whole trick — see it, hear it, tap it. A lesson is just a little more of this.'
    : 'You\'ve met your first words, so Lesson 1 will feel familiar. Ready?';
  const node = h(`
    <div class="screen onb">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 140, className: 'mascot-img--cheer' })}</div>
      <h1 class="onb__title">You just learned ${w.words.length} words! 🎉</h1>
      <div class="win-words">${chips}</div>
      <p class="onb__body">${body}</p>
      <div class="onb__actions">
        ${w.firstRun
          ? '<button class="btn btn--primary" id="go">Keep going →</button>'
          : `<button class="btn btn--primary" id="go">Start Lesson 1</button>
        <button class="btn btn--ghost" id="home">Back home</button>`}
      </div>
    </div>`);
  node.querySelector('#go').addEventListener('click', () => {
    sound.tap();
    if (w.firstRun) renderSetupQuestions();
    else startLesson(w.firstLessonId);
  });
  const hb = node.querySelector('#home');
  if (hb) hb.addEventListener('click', renderHome);
  mount(node);
}

// ---------- session engine ----------
function startLesson(lessonId) {
  if (store.lang().hearts <= 0) return renderHeartsModal();
  const lesson = findLesson(course, lessonId);
  // Teach before testing: words this learner has never met are shown as cards
  // first, so no exercise ever asks about something that was never taught —
  // getting quizzed on the unknown is what makes beginners feel bad.
  const items = store.lang().items;
  const fresh = (lesson.vocab || []).filter((v) => { const it = items[v.id]; return !it || (!it.seen && !it.encountered); });
  if (fresh.length) return renderLessonIntro(lesson, fresh, 0);
  beginLesson(lesson);
}

function beginLesson(lesson) {
  session = {
    mode: 'lesson',
    lesson,
    queue: buildLessonSession(lesson, course, store.dueItems(), { recentTypes: store.lang().recentExerciseTypes || [] }),
    idx: 0,
    mistakes: 0,
    total: 0,
  };
  renderExercise();
}

// A quick teaching card per new word — see it, hear it, read the meaning —
// before the lesson's exercises begin. Skippable for confident learners.
function renderLessonIntro(lesson, words, i) {
  if (i >= words.length) return beginLesson(lesson);
  const w = words[i];
  const node = h(`
    <div class="screen onb">
      <header class="ex__top" style="align-self:stretch">
        <button class="ex__quit" id="quitBtn" aria-label="Quit">✕</button>
        <span class="muted">New words · ${i + 1} of ${words.length}</span>
      </header>
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 96 })}</div>
      <div class="wotd-big">
        <strong>${esc(w.term)}</strong>
        <span class="wotd-big__phon muted">${esc(w.phonetic || '')}</span>
        <span class="wotd-big__tr">${esc(w.translation)}</span>
        ${w.note ? `<span class="muted">(${esc(w.note)})</span>` : ''}
      </div>
      <button class="play-btn" id="hear">🔊 Hear it</button>
      <div class="onb__actions">
        <button class="btn btn--primary" id="next">${i === words.length - 1 ? 'Start practising →' : 'Next word →'}</button>
        <button class="btn btn--ghost" id="skip">Skip to practice</button>
      </div>
    </div>`);
  node.querySelector('#quitBtn').addEventListener('click', renderHome);
  node.querySelector('#hear').addEventListener('click', () => tryHear(w.term, course.code));
  speak(w.term, course.code);
  node.querySelector('#next').addEventListener('click', () => { sound.tap(); renderLessonIntro(lesson, words, i + 1); });
  node.querySelector('#skip').addEventListener('click', () => { sound.tap(); beginLesson(lesson); });
  mount(node);
}

// Feynman technique, woven into ordinary review: once in a while, swap in an
// "explain it" prompt for a word the learner has already MASTERED — proving
// they can teach it back, not just recognise or type it. Never for words
// still being learned (they need more straightforward practice first).
function withExplainPrompt(queue, dueIds) {
  const idx = vocabIndex(course);
  const masteredDue = dueIds.filter((id) => { const it = store.item(id); return it && it.mastered && idx[id]; });
  if (!masteredDue.length || Math.random() > 0.3) return queue;
  const v = idx[masteredDue[Math.floor(Math.random() * masteredDue.length)]];
  const ex = { ...genExplainPrompt(v), _review: true };
  const pos = Math.floor(Math.random() * (queue.length + 1));
  return [...queue.slice(0, pos), ex, ...queue.slice(pos)];
}

function startReview() {
  if (store.lang().hearts <= 0) return renderHeartsModal();
  const L = store.lang();
  const due = store.dueItems();
  if (!due.length) return renderHome();
  const repairMode = missedDaysSince(L.lastStudyDay, todayStr()) >= 2 && L.lastRepairDay !== todayStr();
  const queue = withExplainPrompt(buildReviewSession(course, due, 15, {
    recentTypes: L.recentExerciseTypes || [],
    itemStats: L.items || {},
    repairMode,
  }), due);
  session = {
    mode: 'review', lesson: null, queue, idx: 0, mistakes: 0, total: 0,
    repairMode, startedDueIds: due.slice(), toughWordId: toughestWordId(),
  };
  renderExercise();
}

function baselineSample() {
  const idx = vocabIndex(course);
  const all = Object.values(idx).slice().sort((a, b) => a.id.localeCompare(b.id));
  if (all.length <= 10) return all;
  const code = store.state.activeLang;
  const anchorsByLang = store.state.progressAnchors || (store.state.progressAnchors = {});
  let anchorIds = anchorsByLang[code];
  if (!anchorIds || !anchorIds.length) {
    const want = Math.min(6, all.length);
    const step = want > 1 ? (all.length - 1) / (want - 1) : 0;
    anchorIds = [];
    for (let i = 0; i < want; i++) {
      anchorIds.push(all[Math.round(i * step)].id);
    }
    anchorsByLang[code] = [...new Set(anchorIds)];
    store.save();
  }
  const anchorSet = new Set(anchorIds);
  const anchors = anchorIds.map((id) => idx[id]).filter(Boolean);
  const fillers = all.filter((v) => !anchorSet.has(v.id));
  const monthKey = new Date().toISOString().slice(0, 7);
  let start = 0;
  for (let i = 0; i < monthKey.length; i++) start = (start * 31 + monthKey.charCodeAt(i)) >>> 0; // 31 = small prime used in simple string hashes
  const picked = [];
  for (let i = 0; i < fillers.length && picked.length < 4; i++) picked.push(fillers[(start + i) % fillers.length]);
  return [...anchors.slice(0, 6), ...picked].slice(0, 10);
}

function startBaseline(isRetest) {
  const all = Object.values(vocabIndex(course));
  const pick = baselineSample();
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
function confirmTestOut(unitId, onboarding = false) {
  const unit = course.units.find((u) => u.id === unitId);
  if (!unit) return;
  const node = h(`
    <div class="screen screen--center">
      <div class="result__emoji">⏭️</div>
      <h1>Test out of ${esc(unit.title.replace(/^Unit \d+:\s*/, ''))}?</h1>
      <p class="muted">${onboarding ? 'Already know some of this language? Take a quick placement quiz. If you score 80%+ we\'ll skip the basics for you.' : 'Already know this? Take a quick quiz. Score 80%+ and we\'ll mark the whole unit done so you can skip ahead — no time wasted on what you know.'}</p>
      <button class="btn btn--primary" id="go">Start the quiz</button>
      <button class="btn btn--ghost" id="back">Back</button>
    </div>`);
  node.querySelector('#go').addEventListener('click', () => startTestOut(unitId, onboarding));
  node.querySelector('#back').addEventListener('click', onboarding ? renderFirstRunChoice : renderHome);
  mount(node);
}

function startTestOut(unitId, onboarding = false) {
  const unit = course.units.find((u) => u.id === unitId);
  if (!unit) return renderHome();
  const all = Object.values(vocabIndex(course));
  const unitVocab = unit.lessons.flatMap((l) => l.vocab || []);
  const pick = shuffle(unitVocab).slice(0, Math.min(10, unitVocab.length));
  const prod = pick.length ? [{ type: 'translate', prompt: pick[0].translation, answer: pick[0].term, accept: [pick[0].term.toLowerCase()], vocabId: pick[0].id, _test: true }] : [];
  const queue = [...prod, ...pick.slice(prod.length).map((v) => {
    const distractors = shuffle(all.filter((o) => o.translation !== v.translation)).slice(0, 3);
    return { type: 'multiple_choice', prompt: `"${v.term}" means:`, answer: v.translation, options: shuffle([v.translation, ...distractors.map((d) => d.translation)]), vocabId: v.id, _test: true };
  })];
  session = { mode: 'testout', unitId, lesson: null, queue, idx: 0, mistakes: 0, total: 0, score: 0, onboardingTest: onboarding };
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
    syncCompletedUnits();
    G.checkAchievements(store);
    store.save();
    confetti({ count: 80 }); sound.complete();
  } else { sound.wrong(); }
  const node = h(`
    <div class="screen screen--center result">
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 110, className: passed ? 'mascot-img--cheer' : 'mascot-img--sad' })}</div>
      <h1>${passed ? 'Tested out! ⏭️' : 'Not quite yet'}</h1>
      <div class="result__row"><div class="kpi"><span class="kpi__v">${session.score}/${session.queue.length}</span><span class="kpi__k">Score</span></div><div class="kpi"><span class="kpi__v">${Math.round(pct * 100)}%</span><span class="kpi__k">Accuracy</span></div></div>
      <p class="muted">${passed ? `${esc(unit.title)} is marked complete — jump ahead to what's next!` : 'You need 80% to skip this unit. Work through the lessons and you\'ll master it.'}</p>
      <button class="btn btn--primary" id="doneBtn">${passed ? 'Continue' : 'Back to lessons'}</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', session.onboardingTest ? renderSetupQuestions : renderHome);
  mount(node);
}

function endSession() {
  if (session.mode === 'testout') return finishTestOut();
  const isTest = session.mode === 'baseline' || session.mode === 'retest';
  if (isTest) {
    const result = { score: session.score, total: session.queue.length, date: new Date().toISOString().slice(0, 10) };
    if (session.mode === 'baseline') store.lang().baseline = result; else store.lang().retest = result;
    recordWeeklySnapshot();
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
    syncCompletedUnits();
    merge(G.track(store, 'lesson', { mistakes: session.mistakes }));
  } else if (session.mode === 'review') {
    store.lang().reviewsDone += session.total;
    if (session.repairMode) store.lang().lastRepairDay = todayStr();
    merge(G.track(store, 'review'));
    if (session.repairMode) merge(G.track(store, 'recovery'));
    if (session.masteredDueIds && session.masteredDueIds.length) merge(G.track(store, 'mastered_due', { amount: session.masteredDueIds.length }));
    if (session.fixedToughWord) merge(G.track(store, 'tough_word'));
  } else if (session.mode === 'reading') {
    const r = session.reading;
    if (r && !store.lang().completedReadings.includes(r.id)) store.lang().completedReadings.push(r.id);
    // input-first: words encountered in the story enter the review schedule
    // (due now) — but reading past a word is NOT a recall, so it never counts
    // as a correct review or inflates retention. The first real review will.
    if (r) {
      const idx = vocabIndex(course);
      const byTerm = {};
      for (const v of Object.values(idx)) byTerm[normalize(v.term)] = v.id;
      const text = normalize(r.lines.map((ln) => ln.t).join(' '));
      for (const [term, id] of Object.entries(byTerm)) {
        if (term && (text === term || text.includes(` ${term} `) || text.startsWith(`${term} `) || text.endsWith(` ${term}`))) store.encounter(id);
      }
    }
    merge(G.track(store, 'reading'));
    if (correct / Math.max(1, session.total) >= 0.9) merge(G.track(store, 'story_sharp'));
  } else if (session.mode === 'grammar') {
    // grade the whole pattern by this drill set; spaced like a vocab item
    const git = store.grammarItem(session.grammarId);
    srsReview(git, gradeFor(session.mistakes <= 1, 'translate'), 'translate');
    merge(G.track(store, 'review'));
  }
  merge({ quests: [], achievements: G.checkAchievements(store), gems: 0 });
  recordWeeklySnapshot();
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
  store.recordExercise(ex.type, wasCorrect);
  if (session.mode === 'baseline' || session.mode === 'retest' || session.mode === 'testout') {
    if (wasCorrect) session.score += 1;
  } else {
    // credit SRS for each item id this exercise touched. Match grades per
    // pair: only the words the learner actually paired first-try count as
    // correct — the pairs they mixed up are honest lapses.
    const missed = ex.type === 'match' ? new Set(ex._missedTerms || []) : null;
    const byId = missed ? vocabIndex(course) : null;
    // capture BEFORE grading below increments each item's `seen` count
    const learningGrace = stillLearningEx(ex);
    for (const vid of exerciseVocabIds(ex, session.lesson)) {
      const it = store.item(vid);
      const wasMastered = !!it.mastered;
      const itemCorrect = missed ? !(byId[vid] && missed.has(normalize(byId[vid].term))) : wasCorrect;
      srsReview(it, gradeFor(itemCorrect, ex.type), ex.type);
      if (itemCorrect && session.toughWordId && vid === session.toughWordId) session.fixedToughWord = true;
      if (!wasMastered && it.mastered && session.startedDueIds && session.startedDueIds.includes(vid)) {
        if (!session.masteredDueIds) session.masteredDueIds = [];
        if (!session.masteredDueIds.includes(vid)) session.masteredDueIds.push(vid);
      }
    }
    // Match is the lesson's first-exposure intro, and mispairs are already
    // corrected in place — it counts against accuracy/stars but not hearts.
    if (!wasCorrect && HEART_MODES.includes(session.mode) && ex.type !== 'match' && ex.type !== 'explain') {
      // hearts guard the recall of things already TAUGHT; missing material
      // you're still learning is part of learning and stays free
      if (!learningGrace) store.loseHeart();
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
  const stage = exerciseStage(ex);
  let body = '';
  switch (ex.type) {
    case 'match': body = renderMatch(ex); break;
    case 'multiple_choice': body = renderChoice(ex, ex.prompt); break;
    case 'fill_blank': body = renderFill(ex); break;
    case 'listen': body = renderListenExercise(ex); break;
    case 'speak': body = renderSpeakExercise(ex); break;
    case 'translate': body = renderTranslate(ex); break;
    case 'word_bank': body = renderWordBank(ex); break;
    case 'explain': body = renderExplain(ex); break;
    default: body = '<p>Unknown exercise</p>';
  }
  const node = h(`<div class="screen ex">${progressBar()}<div class="ex__srs-badge ex__srs-badge--${stage.tone}">${esc(stage.label)}</div><div class="ex__body">${body}</div><div class="ex__foot" id="foot"></div></div>`);
  mount(node);
  node.querySelector('#quitBtn').addEventListener('click', () => { if (confirm('Quit this session? Progress in this session is lost.')) renderHome(); });
  wireExercise(ex, node);
}

function footFor(node) { return node.querySelector('#foot'); }

// True while any item this exercise touches has been met fewer than two times
// — material the learner is still LEARNING. Missing it then is simply how
// learning works, so it earns grace (no heart lost), not punishment.
function stillLearningEx(ex) {
  const ids = exerciseVocabIds(ex, session.lesson);
  return ids.length > 0 && ids.some((vid) => (store.item(vid).seen || 0) < 2);
}

function showFeedback(node, ok, ex, correctText, typoNote = '') {
  // sound + haptics first so they land with the visual (the miss cue is a soft
  // low note and a single gentle tick — informative, never a punishment buzz)
  if (ok) { sound.correct(); haptic(15); } else { sound.wrong(); haptic(10); }
  const foot = footFor(node);
  foot.className = `ex__foot ${ok ? 'ex__foot--ok' : 'ex__foot--learn'}`;
  const note = ex.meaning ? `<div class="fb__meaning">${esc(ex.meaning)}</div>` : '';
  // a typo-accepted answer gets a gentle spelling nudge instead of a penalty
  const spell = (ok && typoNote) ? `<div class="fb__answer">${esc(typoNote)}</div>` : '';
  // track the correct-in-a-row streak so praise can build instead of resetting
  session.combo = ok ? (session.combo || 0) + 1 : 0;
  // A miss is a LEARNING MOMENT, not a failure: warm title, the answer with
  // its pronunciation, and the promise that it comes back — because it does.
  const title = ok ? (typoNote ? 'Almost perfect!' : cheerLine(session.total, session.combo)) : learnLine(session.total);
  const v = (!ok && ex.vocabId) ? vocabIndex(course)[ex.vocabId] : null;
  // pronunciation only when it belongs to exactly what's shown as the answer
  const phon = (v && v.phonetic && normalize(v.term) === normalize(correctText)) ? ` <span class="muted">(${esc(v.phonetic)})</span>` : '';
  const answer = ok ? '' : `<div class="fb__answer">${ex.type === 'match' ? esc(correctText) : `It's: <strong>${esc(correctText)}</strong>${phon}`}</div>`;
  const requeues = !ok && HEART_MODES.includes(session.mode) && ex.type !== 'match' && ex.type !== 'explain';
  const spared = requeues && stillLearningEx(ex);
  const again = requeues
    ? `<div class="fb__again">🔁 It comes round again in a bit — that's how it sticks${spared ? ' · 🌱 still learning, no heart lost' : ''}</div>`
    : '';
  // Auto-advance so a clean correct still flows without a forced tap, but a
  // "Continue" button is ALWAYS present so nobody is racing a timer to read
  // the feedback — tapping it just jumps the queued auto-advance forward.
  const instant = ok && !typoNote;
  const delay = feedbackDelay(instant ? 1100 : ok ? 1800 : 2800, `${title} ${correctText || ''} ${ex.meaning || ''}`);
  foot.innerHTML = `
    <div class="fb">
      <span class="fb__mascot">${mascotImg(currentBuddy(), { size: 52 })}</span>
      <div class="fb__text">
        <div class="fb__title">${title}</div>
        ${answer}
        ${spell}
        ${note}
        ${again}
      </div>
    </div>
    <button class="btn btn--primary" id="continueBtn">Continue</button>`;
  const seq = mountSeq;
  let advanced = false;
  const go = () => {
    if (advanced || mountSeq !== seq) return; // screen changed (quit) — stand down
    advanced = true;
    advance(ok, ex);
  };
  setTimeout(go, delay);
  const cont = foot.querySelector('#continueBtn');
  if (cont) cont.addEventListener('click', () => { sound.tap(); go(); });
  // lock inputs
  node.querySelectorAll('.opt, .ex__input, .check, .wb-tok').forEach((e) => { e.disabled = true; });
  // a11y: announce the result (and where focus should wait when there's a button)
  announce(ok ? (typoNote ? `Correct, but ${typoNote}` : 'Correct!') : (ex.type === 'match' ? correctText : `The answer is ${correctText}.`));
  if (cont) cont.focus();
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

function renderListenExercise(ex) {
  return `<h2 class="ex__q">${esc(ex.prompt || 'Tap what you hear')}</h2>
    <button class="play-btn" id="playBtn">🔊 Play it</button>
    <div class="lst-reveal" id="listenReveal" hidden><strong>${esc(ex.answer)}</strong>${ex.meaning ? ` <span class="muted">= ${esc(ex.meaning)}</span>` : ''}</div>
    <div class="opts">${shuffle(ex.options).map((o) => `<button class="opt" data-val="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    <button class="btn btn--ghost" id="showText">Show the text</button>`;
}

function renderSpeakExercise(ex) {
  return `<h2 class="ex__q">Say it in ${esc(course.name)} 🎤</h2>
    <p class="ex__prompt-big">${esc(ex.meaning)}</p>
    <div class="lst-reveal" id="speakReveal" hidden><strong>${esc(ex.text)}</strong></div>
    <p class="ex__hint muted" id="speakCoach">${srSupported() ? 'Try saying it first. You can check with the microphone or rate yourself.' : 'Say it out loud from memory, then rate yourself honestly.'}</p>
    <div class="spk-rec" id="speakTools" hidden>
      <button class="play-btn" id="hearModel">🔊 Hear the model</button>
      ${recordSupported() ? '<button class="btn btn--ghost" id="recBtn">🎤 Record yourself</button>' : ''}
    </div>
    <div class="onb__actions">
      ${srSupported() ? '<button class="btn btn--primary" id="speakCheck">Use mic to check</button>' : ''}
      <button class="btn btn--ghost" id="speakRevealBtn">Show the answer</button>
    </div>`;
}

function renderWordBank(ex) {
  const bank = ex.tokens.map((w, i) => `<button class="wb-tok" data-i="${i}">${esc(w)}</button>`).join('');
  return `<h2 class="ex__q">Build the sentence</h2>
    <p class="ex__hint muted">${esc(ex.prompt)}</p>
    <div class="wb-build" id="wbBuild" aria-label="Your sentence"></div>
    <div class="wb-bank" id="wbBank">${bank}</div>
    <button class="btn btn--primary check" id="checkBtn" disabled>Check</button>`;
}

// Feynman technique: "teach it back". No typing to grade — self-rated
// honestly, like Speaking, and never costs a heart, so it stays low-stakes.
function renderExplain(ex) {
  return `<h2 class="ex__q"><span aria-hidden="true">🦫</span> Teach Themba</h2>
    <p class="ex__hint muted">Themba half-remembers <strong>${esc(ex.prompt)}</strong> — explain it in your own words. When would you use it? What does it remind you of?</p>
    <textarea class="ex__input ex__textarea" id="explainInput" rows="3" placeholder="Explain it to Themba…"></textarea>
    <p class="ex__hint muted" id="explainNudge" hidden>Write a sentence or two first — then we'll ask you to rate it.</p>
    <button class="btn btn--primary" id="explainSubmit">I'm done explaining</button>
    <div class="explain-rate" id="explainRate" hidden>
      <p class="muted">Be honest — could you really explain it?</p>
      <button class="btn btn--primary" id="explainGood">✅ Yes, I explained it well</button>
      <button class="btn btn--ghost" id="explainMeh">🤔 Not really — review it again</button>
    </div>`;
}

function renderMatch(ex) {
  const left = ex.pairs.map((p, i) => `<button class="opt match-opt" data-side="L" data-i="${i}">${esc(p[0])}</button>`).join('');
  const right = shuffle(ex.pairs.map((p, i) => ({ i, t: p[1] }))).map((o) => `<button class="opt match-opt" data-side="R" data-i="${o.i}">${esc(o.t)}</button>`).join('');
  return `<h2 class="ex__q">Match the pairs</h2>
    <div class="match"><div class="match__col">${left}</div><div class="match__col">${right}</div></div>`;
}

// --- wiring per exercise type ---
function wireExercise(ex, node) {
  if (ex.type === 'multiple_choice' || ex.type === 'fill_blank' || ex.type === 'listen') {
    if (ex.type === 'listen') {
      node.querySelector('#playBtn').addEventListener('click', () => tryHear(ex.text || ex.answer, course.code));
      node.querySelector('#showText').addEventListener('click', () => { const r = node.querySelector('#listenReveal'); if (r) r.hidden = false; });
      speak(ex.text || ex.answer, course.code);
    }
    node.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
      const ok = checkAnswer(ex, b.dataset.val);
      node.querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
      b.classList.add(ok ? 'opt--ok' : 'opt--bad');
      if (!ok) node.querySelectorAll('.opt').forEach((x) => { if (normalize(x.dataset.val) === normalize(ex.answer)) x.classList.add('opt--ok'); });
      if (ex.type === 'listen') {
        const r = node.querySelector('#listenReveal');
        if (r) r.hidden = false;
      }
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

  if (ex.type === 'explain') {
    const input = node.querySelector('#explainInput');
    const submitBtn = node.querySelector('#explainSubmit');
    const rate = node.querySelector('#explainRate');
    const nudge = node.querySelector('#explainNudge');
    input.focus();
    submitBtn.addEventListener('click', () => {
      if (!input.value.trim()) { nudge.hidden = false; input.focus(); return; }
      nudge.hidden = true;
      sound.tap();
      submitBtn.hidden = true;
      input.disabled = true;
      rate.hidden = false;
      rate.querySelector('#explainGood').focus();
    });
    rate.querySelector('#explainGood').addEventListener('click', () => showFeedback(node, true, ex, ex.answer));
    rate.querySelector('#explainMeh').addEventListener('click', () => showFeedback(node, false, ex, ex.answer));
  }

  if (ex.type === 'match') {
    let firstPick = null;
    let solved = 0;
    const total = ex.pairs.length;
    // honesty: a mispairing is a real miss. Track which pairs were ever paired
    // wrongly so the scheduler hears the truth per word instead of a blanket
    // "success" just because the exercise was eventually completed.
    const missed = new Set();
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
        if (solved === total) {
          ex._missedTerms = [...missed];
          const ok = missed.size === 0;
          showFeedback(node, ok, ex, ok ? '' : `you mixed up ${missed.size} pair${missed.size === 1 ? '' : 's'} — they'll come round again`);
        }
      } else {
        const a = firstPick;
        if (!sameSide) {
          // both words involved in the wrong pairing were missed
          missed.add(normalize(ex.pairs[a.dataset.i][0]));
          missed.add(normalize(ex.pairs[b.dataset.i][0]));
        }
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
      <div class="onb__art">${mascotImg(currentBuddy(), { size: 120, className: 'mascot-img--cheer' })}</div>
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
      ${session.mistakes ? '<p class="muted">💡 The tricky ones will come back at just the right moment — that\'s how they stick.</p>' : ''}
      <button class="btn btn--primary" id="doneBtn">Continue</button>
    </div>`);
  node.querySelector('#doneBtn').addEventListener('click', () => {
    sound.tap();
    const firstLessonGuestWin = session.mode === 'lesson'
      && isGuestLearner()
      && !((store.state.onboarding || {}).accountPrompted)
      && store.lang().completedLessons.length === 1;
    if (firstLessonGuestWin) return renderAccountPrompt(afterActivityNav);
    afterActivityNav();
  });
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
      <h1>Time for a breather</h1>
      <p class="muted">Hearts are resting — they refill on their own. You can keep practising heart-free right now; nothing you've learned is lost.</p>
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
  recordWeeklySnapshot();
  const m = store.metrics();
  const L = store.lang();
  const totalVocab = Object.keys(vocabIndex(course)).length;
  const masteredPct = totalVocab ? Math.round((m.mastered / totalVocab) * 100) : 0;
  const retPct = Math.round(m.retention * 100);
  const snaps = ((store.state.progressSnapshots || {})[store.state.activeLang] || []).slice(-8);
  const trendMax = Math.max(1, ...snaps.map((s) => s.mastered));
  const skillRows = [
    ['Recognition', m.skills.recognition],
    ['Production', m.skills.production],
    ['Listening', m.skills.listening],
    ['Speaking', m.skills.speaking],
  ];

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
      <p class="${delta >= 0 ? 'gain' : 'muted'}">${delta >= 0 ? `📈 ▲ +${delta}% improvement — measured on the same anchor items plus a few rotating fillers.` : `📉 ▼ ${Math.abs(delta)}% right now — keep reviewing daily.`}</p>
    </div>`;
  } else if (baseline) {
    compare = `<div class="proof">
      <h3>Your measured progress</h3>
      <p class="muted">Baseline recorded (${Math.round((baseline.score / baseline.total) * 100)}%). It uses a stable anchor set so your next re-test is a fair month-on-month comparison.</p>
      <button class="btn btn--ghost" id="retestBtn">Take the 1-month re-test</button>
    </div>`;
  } else {
    compare = `<div class="proof">
      <h3>Prove your progress</h3>
      <p class="muted">Take a 60-second baseline test now. We keep most items anchored between tests so the next comparison is meaningful, not noisy.</p>
      <button class="btn btn--primary" id="baselineBtn">Take baseline test</button>
    </div>`;
  }

  const trend = snaps.length ? `
    <div class="proof">
      <h3>Retention trend</h3>
      <div class="trend-bars" aria-label="Last ${snaps.length} weekly snapshots">
        ${snaps.map((s) => `<div class="trend-bar"><span style="height:${Math.max(12, Math.round((s.mastered / trendMax) * 100))}%"></span><small>${esc(s.week.slice(5))}</small></div>`).join('')}
      </div>
      <p class="muted">Weekly snapshots of mastered words over the last ${snaps.length} week${snaps.length === 1 ? '' : 's'}.</p>
    </div>` : '';

  const skillHtml = `
    <div class="proof">
      <h3>Skills breakdown</h3>
      <div class="skill-split">
        ${skillRows.map(([label, stat]) => `<div class="skill-row"><span>${label}</span><div class="qbar"><div style="width:${Math.round(stat.accuracy * 100)}%"></div></div><b>${stat.seen ? `${Math.round(stat.accuracy * 100)}%` : '&mdash;'}</b></div>`).join('')}
      </div>
    </div>`;

  const nextUnit = course.units.find((u) => !(u.lessons || []).every((l) => store.isLessonComplete(l.id)));
  const milestone = (() => {
    if (!nextUnit) return 'You’ve completed every current unit in this course. 🎉';
    const ids = [...new Set(nextUnit.lessons.flatMap((l) => (l.vocab || []).map((v) => v.id)))];
    const mastered = ids.filter((id) => (store.lang().items[id] || {}).mastered).length;
    const remain = Math.max(0, ids.length - mastered);
    return `~${remain} more mastered word${remain === 1 ? '' : 's'} to finish ${nextUnit.title.replace(/^Unit \d+:\s*/, '')}.`;
  })();

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
        <div class="dcard"><span class="dcard__v">${m.phrases.mastered}</span><span class="dcard__k">Phrase chunks</span><div class="dcard__sub">of ${m.phrases.introduced} practised</div></div>
        <div class="dcard"><span class="dcard__v">${retPct}%</span><span class="dcard__k">Retention</span><div class="dcard__sub">recall accuracy</div></div>
        <div class="dcard"><span class="dcard__v">${m.lessonsCompleted}</span><span class="dcard__k">Lessons done</span></div>
        <div class="dcard"><span class="dcard__v">🔥 ${m.streak}</span><span class="dcard__k">Day streak</span><div class="dcard__sub">best ${m.bestStreak}</div></div>
        <div class="dcard"><span class="dcard__v">⭐ ${m.xp}</span><span class="dcard__k">Total XP</span></div>
      </div>

      <div class="mastery-bar">
        <div class="mastery-bar__fill" style="width:${masteredPct}%"></div>
        <span>${m.mastered} / ${totalVocab} words mastered</span>
      </div>

      <div class="proof">
        <h3>Next milestone</h3>
        <p class="muted">${esc(milestone)}</p>
      </div>

      <h3 class="sec">What you can do</h3>
      <p class="muted" style="margin:0 4px">Real-world "can-do" goals — complete a unit's lessons to unlock each.</p>
      <div class="cando-list">${canDoRows}</div>

      ${trend}
      ${skillHtml}
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
  applyColorScheme();
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
  const acc = Auth.currentAccount();
  const pace = learningPaceInfo();
  const accountRow = acc
    ? `<div class="set-row">
        <div class="set-row__label"><b>${esc(acc.avatar)} ${esc(acc.name)}</b><small>Signed in · ${esc(acc.email)}</small></div>
        <button class="btn btn--ghost" id="signOut" style="width:auto;padding:8px 14px">Sign out</button>
      </div>`
    : `<div class="set-row">
        <div class="set-row__label"><b>👤 Guest</b><small>Progress saved on this device only</small></div>
        <button class="btn btn--ghost" id="createAcc" style="width:auto;padding:8px 14px">Create account</button>
      </div>`;
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Home</button><strong>Settings</strong><span></span></header>
      ${accountRow}
      <button class="set-row set-row--btn" id="profBtn" style="width:100%;text-align:left">
        <div class="set-row__label"><b>${esc(prof.avatar)} ${esc(prof.name)}</b><small>Active learner · tap to switch or add</small></div>
        <span class="muted" style="font-size:22px">›</span>
      </button>
      <div class="set-list">
        <div class="set-row">
          <div class="set-row__label"><b>Appearance</b><small>Light unless you choose otherwise</small></div>
          <select id="themeSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[['light', 'Light'], ['dark', 'Dark'], ['system', 'Match device']].map(([v, label]) => `<option value="${v}" ${(store.state.settings.theme || 'light') === v ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>Sound effects</b><small>Chimes on correct answers and lessons</small></div>
          <label class="switch"><input type="checkbox" id="soundTgl" ${soundOn ? 'checked' : ''}><span class="switch__track"></span></label>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>Daily reminders</b><small>${remSupported ? (remDenied ? 'Blocked in your browser settings' : 'A gentle nudge to keep your streak') : 'Not supported on this device'}</small></div>
          <label class="switch"><input type="checkbox" id="remTgl" ${remOn ? 'checked' : ''} ${remSupported && !remDenied ? '' : 'disabled'}><span class="switch__track"></span></label>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>Reminder time</b><small>Best time window for your nudge</small></div>
          <select id="remWindowSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[['morning', 'Morning'], ['after_school', 'After school'], ['evening', 'Evening'], ['anytime', 'Anytime']].map(([v, label]) => `<option value="${v}" ${(store.state.settings.reminderWindow || 'after_school') === v ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>Daily goal</b><small>XP target per day</small></div>
          <select id="goalSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[20, 30, 50, 80].map((g) => `<option value="${g}" ${store.state.settings.dailyGoalXP === g ? 'selected' : ''}>${g} XP</option>`).join('')}
          </select>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>Learning pace</b><small>How much review support you want before words feel automatic</small></div>
          <select id="retSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[['0.85', 'Relaxed'], ['0.9', 'Balanced'], ['0.95', 'Challenge']].map(([v, label]) => `<option value="${v}" ${Math.abs((store.state.settings.desiredRetention || 0.9) - Number(v)) < 0.001 ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="retention-note">
          <strong>${esc(pace.title)}</strong>
          <span>${esc(pace.body)}</span>
          <small>${esc(pace.detail)}</small>
        </div>
        <div class="set-row">
          <div class="set-row__label"><b>Feedback pace</b><small>How quickly answer feedback fades</small></div>
          <select id="fbSel" class="btn btn--ghost" style="width:auto;padding:8px 12px">
            ${[['quick', 'Quick'], ['comfortable', 'Comfortable'], ['slow', 'Slow']].map(([v, label]) => `<option value="${v}" ${(store.state.settings.feedbackPace || 'comfortable') === v ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
      </div>
      <h3 class="sec">Premium</h3>
      <button class="card" id="prem" style="text-align:left"><strong>⭐ MzansiLingo Premium</strong><span class="muted">Unlimited hearts, all languages, no ads.</span></button>
      <p class="footnote">MzansiLingo v1 · Works offline · Made for South Africa 🇿🇦</p>
    </div>`);
  node.querySelector('#back').addEventListener('click', renderHome);
  node.querySelector('#themeSel').addEventListener('change', (e) => {
    store.state.settings.theme = e.target.value;
    store.save();
    applyColorScheme();
    Shop.applyTheme(store); // accents are tuned per scheme — re-pick the variant
  });
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
      else { await Notify.syncState(store); flashToast('Daily reminders on 🔔'); }
    } else {
      await Notify.disable(store);
    }
  });
  node.querySelector('#remWindowSel').addEventListener('change', async (e) => {
    store.state.settings.reminderWindow = e.target.value;
    store.save();
    await Notify.syncState(store);
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
    renderSettings();
  });
  node.querySelector('#fbSel').addEventListener('change', (e) => {
    store.state.settings.feedbackPace = e.target.value;
    store.save();
  });
  node.querySelector('#prem').addEventListener('click', renderPremium);
  node.querySelector('#profBtn').addEventListener('click', renderProfiles);
  const soBtn = node.querySelector('#signOut');
  if (soBtn) soBtn.addEventListener('click', () => {
    if (confirm('Sign out? Your progress stays saved on this device.')) { Auth.clearAuth(); renderAuthLanding(); }
  });
  const caBtn = node.querySelector('#createAcc');
  if (caBtn) caBtn.addEventListener('click', renderSignup);
  mount(node);
}

// ---------- stories / reading library ----------
async function renderLibrary() {
  if (!LIBRARY) { try { LIBRARY = await (await fetch('data/library.json')).json(); } catch (e) { LIBRARY = { sources: [] }; } }
  const readings = course.reading || [];
  const L = store.lang();
  // comprehensible input: how much of each story does this learner already
  // know? Research targets ~95% known words for reading to teach — surface
  // the fit and recommend the best next story instead of a blind list.
  const idx = vocabIndex(course);
  const known = new Set();
  for (const [id, it] of Object.entries(L.items)) {
    if ((it.seen > 0 || it.encountered) && idx[id]) for (const tok of normalize(idx[id].term).split(' ')) known.add(tok);
  }
  const cov = {};
  for (const r of readings) cov[r.id] = readingCoverage(r.lines, known);
  const unread = readings.filter((r) => !(L.completedReadings || []).includes(r.id));
  const rec = unread.sort((a, b) => cov[b.id].pct - cov[a.id].pct)[0];
  const covChip = (r) => {
    const pct = Math.round(cov[r.id].pct * 100);
    const band = pct >= 90 ? 'ok' : pct >= 60 ? 'mid' : 'low';
    const label = pct >= 90 ? 'just right' : pct >= 60 ? 'a stretch' : 'tough for now';
    return `<span class="story__cov story__cov--${band}">${pct}% known · ${label}</span>`;
  };
  const cards = readings.map((r) => {
    const done = (L.completedReadings || []).includes(r.id);
    return `<button class="story ${done ? 'story--done' : ''}" data-read="${r.id}">
        <span class="story__icon">${done ? '✅' : '📖'}</span>
        <div class="story__body"><strong>${esc(r.title)}${rec && r.id === rec.id ? ' <span class="story__rec">★ best fit</span>' : ''}</strong>
          <span class="muted">${esc(r.level)} · ${r.lines.length} lines</span>${done ? '' : covChip(r)}</div>
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
      <p class="muted">Read the story, tap a line to hear it, then answer a few questions. The % shows how many of the words you already know — around 90%+ is the sweet spot where reading teaches best.</p>
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
  // words the learner already knows (seen or encountered), for highlighting the
  // NEW words in the story — making comprehensible input visible
  const idx = vocabIndex(course);
  const L = store.lang();
  const known = new Set();
  for (const [id, it] of Object.entries(L.items)) {
    if ((it.seen > 0 || it.encountered) && idx[id]) for (const tok of normalize(idx[id].term).split(' ')) known.add(tok);
  }
  const highlight = (t) => t.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok)) return tok;
    const n = normalize(tok);
    return `<span class="rword${n && !known.has(n) ? ' rword--new' : ''}">${esc(tok)}</span>`;
  }).join('');
  const cov = readingCoverage(r.lines, known);
  const newWords = new Set();
  for (const ln of r.lines) for (const tok of normalize(ln.t).split(' ')) if (tok && !known.has(tok)) newWords.add(tok);
  const newCount = newWords.size;
  const lines = r.lines.map((ln, i) => `
    <button class="rline" data-line="${i}">
      <span class="rline__t">${highlight(ln.t)}</span>
      <span class="rline__en muted">${esc(ln.en)}</span>
    </button>`).join('');
  const node = h(`
    <div class="screen">
      <header class="topbar"><button class="topbar__lang" id="back">← Stories</button><strong>${esc(r.title)}</strong><span></span></header>
      <p class="muted">${esc(r.intro || '')}</p>
      <p class="reading-legend">${Math.round(cov.pct * 100)}% known · <span class="rword--new">${newCount} new word${newCount === 1 ? '' : 's'}</span> highlighted — meet them here, then they join your reviews.</p>
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
