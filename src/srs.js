// srs.js — Spaced Repetition System.
//
// This is the heart of MzansiLingo's "real learning" promise: every vocabulary
// item is scheduled for review at the moment it is about to be forgotten.
//
// The scheduler is FSRS-inspired (target-retention), an upgrade over classic
// SM-2's fixed ease/interval multipliers. Each item carries a memory STABILITY
// (how many days until recall probability decays to 90%) and a DIFFICULTY. We
// schedule the next review at the point where predicted recall drops to the
// learner's DESIRED RETENTION (default 90%). Reviewing an item when it is more
// forgotten grows stability more (the desirable-difficulty effect), and
// production (typing) builds memory faster than recognition (multiple choice).
//
// References: Settles & Meeder (HLR, ACL 2016); open-spaced-repetition FSRS.
//
// Each item's memory record:
//   {
//     stability:   days until recall probability decays to ~90% (0 until graduated)
//     difficulty:  1..10 (higher = harder to stabilise)
//     intervalDays:last scheduled interval in days (derived, for display)
//     due:         epoch ms when next due
//     learning:    index into LEARNING_STEPS while still being learned (or null)
//     reps:        successful reviews since last lapse
//     seen, correct, prodCorrect: lifetime stats for the progress report
//     mastered:    true once reliably recalled in production AND well-stabilised
//   }

export const LEARNING_STEPS_MIN = [1, 10]; // minutes: same-session reps before graduating
const DAY = 24 * 60 * 60 * 1000;
const MIN_STABILITY = 1;        // days, assigned at graduation
const MASTER_STABILITY = 7;     // a word counts as "mastered" once it survives ~a week
const GROWTH_K = 1.0;           // stability-growth tuning constant
const BASE_RETENTION = 0.9;     // stability is defined at this recall probability

let desiredRetention = 0.9;     // configurable target (see setDesiredRetention)
export function setDesiredRetention(r) {
  if (typeof r === 'number' && r > 0.5 && r < 0.99) desiredRetention = r;
}
export function getDesiredRetention() { return desiredRetention; }

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
// Only exercises where the learner GENERATES the answer count as production.
// fill_blank is deliberately NOT here: it is rendered as pick-from-options, so
// counting it as production would let a word reach "mastered" through multiple
// choice alone — exactly the dishonesty the README promises against.
const PRODUCTION = ['translate', 'speak'];

export function newItem(now = Date.now()) {
  return {
    stability: 0,
    difficulty: 5,
    intervalDays: 0,
    due: now,
    learning: 0,
    reps: 0,
    seen: 0,
    correct: 0,
    prodCorrect: 0, // correct answers on production exercises (translate/speak)
    mastered: false,
    firstSeen: now,
    lastReview: now,
  };
}

// quality: 0..5 (SM-2 scale), derived from outcome + type for backward compat.
export function gradeFor(correct, exerciseType) {
  const isProduction = PRODUCTION.includes(exerciseType);
  if (!correct) return isProduction ? 1 : 2; // a missed production item is a stronger lapse signal
  return isProduction ? 5 : 4;
}

// Convert a stability (defined at 90% recall) into the interval for the learner's
// desired retention. Higher desired retention => review sooner.
function intervalForStability(stability, retention) {
  return Math.max(1, stability * (Math.log(retention) / Math.log(BASE_RETENTION)));
}

// Predicted probability of recall right now, given time since last review.
export function retrievability(item, now = Date.now()) {
  if (!item || !item.stability || !item.lastReview) return 1;
  const t = (now - item.lastReview) / DAY;
  return Math.pow(BASE_RETENTION, t / item.stability);
}

// Older saved records (pre-FSRS) lack stability/difficulty — derive them so the
// model upgrades seamlessly without resetting anyone's progress.
function normalize(item) {
  if (item.difficulty == null) item.difficulty = 5;
  if (item.stability == null) {
    item.stability = item.learning === null ? Math.max(MIN_STABILITY, item.intervalDays || MIN_STABILITY) : 0;
  }
}

// Update an item with a review outcome. Returns the mutated item.
export function review(item, quality, exerciseType, now = Date.now(), retention = desiredRetention) {
  normalize(item);
  item.seen += 1;
  const isProduction = PRODUCTION.includes(exerciseType);
  if (quality >= 3) {
    item.correct += 1;
    if (isProduction) item.prodCorrect += 1;
  }
  const R = retrievability(item, now); // measured BEFORE we move lastReview

  if (quality < 3) {
    // Lapse: back to learning, lose stability, get harder.
    item.reps = 0;
    item.learning = 0;
    item.intervalDays = 0;
    item.due = now + LEARNING_STEPS_MIN[0] * 60 * 1000;
    item.difficulty = clamp(item.difficulty + 1.5, 1, 10);
    item.stability = Math.max(0.5, (item.stability || MIN_STABILITY) * 0.5);
    item.mastered = false;
    item.lastReview = now;
    return item;
  }

  // Correct — getting it right makes it a little easier.
  item.difficulty = clamp(item.difficulty - (isProduction ? 0.6 : 0.3), 1, 10);

  if (item.learning !== null) {
    // Still in the same-session learning phase.
    const nextStep = item.learning + 1;
    if (nextStep < LEARNING_STEPS_MIN.length) {
      item.learning = nextStep;
      item.due = now + LEARNING_STEPS_MIN[nextStep] * 60 * 1000;
      item.lastReview = now;
      return item;
    }
    // Graduate to spaced reviews.
    item.learning = null;
    item.reps = 1;
    item.stability = MIN_STABILITY;
    item.intervalDays = intervalForStability(item.stability, retention);
    item.due = now + item.intervalDays * DAY;
    item.lastReview = now;
    return item;
  }

  // Graduated card — grow stability. Production and reviewing-when-more-forgotten
  // (low R) both grow memory more; higher difficulty grows it less.
  const diffFactor = (11 - item.difficulty) / 10;   // 0.1 .. 1.0
  const prodFactor = isProduction ? 1.0 : 0.5;
  const overdueBonus = 1 + (1 - R);                 // 1 .. 2
  const growth = 1 + prodFactor * diffFactor * overdueBonus * GROWTH_K;
  item.stability = Math.max(MIN_STABILITY, item.stability * growth);
  item.reps += 1;
  item.intervalDays = intervalForStability(item.stability, retention);
  item.due = now + item.intervalDays * DAY;
  item.lastReview = now;

  // Mastery: recalled in production at least twice AND stabilised to ~a week+.
  if (item.prodCorrect >= 2 && item.stability >= MASTER_STABILITY) item.mastered = true;
  return item;
}

export function isDue(item, now = Date.now()) {
  return item.due <= now;
}

// Lifetime recall accuracy (an honest measure of learning).
export function retention(item) {
  return item.seen ? item.correct / item.seen : 0;
}
