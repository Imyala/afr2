// srs.js — Spaced Repetition System (SM-2 with learning steps)
//
// This is the heart of MzansiLingo's "real learning" promise. Instead of
// letting learners forget words the way passive apps do, every vocabulary
// item is scheduled for review at the precise moment it is about to be
// forgotten. Recognition (multiple choice) counts for less; production
// (typing/speaking) is what proves a word is truly known.
//
// Each item's memory record:
//   {
//     reps:        number of successful reviews in a row
//     ease:        SM-2 ease factor (>= 1.3), how "easy" the item is
//     intervalDays:current scheduling interval in days
//     due:         epoch ms when the item is next due
//     learning:    index into LEARNING_STEPS while still being learned (or null)
//     seen, correct, prodCorrect: lifetime stats used for the progress report
//     mastered:    true once the item is reliably recalled in production
//   }

export const LEARNING_STEPS_MIN = [1, 10]; // minutes: same-session reps before graduating
const DAY = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;

export function newItem(now = Date.now()) {
  return {
    reps: 0,
    ease: 2.5,
    intervalDays: 0,
    due: now,
    learning: 0,
    seen: 0,
    correct: 0,
    prodCorrect: 0, // correct answers on production-type exercises (translate/speak/fill)
    mastered: false,
    firstSeen: now,
    lastReview: now,
  };
}

// quality: 0..5 (SM-2 scale). We derive it from exercise outcome + type.
// production exercises that are answered correctly give the highest signal.
export function gradeFor(correct, exerciseType) {
  const isProduction = ['translate', 'speak', 'fill_blank'].includes(exerciseType);
  if (!correct) return isProduction ? 1 : 2; // a missed production item is a stronger "lapse" signal
  return isProduction ? 5 : 4;
}

// Update an item with a review outcome. Returns the mutated item.
export function review(item, quality, exerciseType, now = Date.now()) {
  item.seen += 1;
  if (quality >= 3) item.correct += 1;
  const isProduction = ['translate', 'speak', 'fill_blank'].includes(exerciseType);
  if (quality >= 3 && isProduction) item.prodCorrect += 1;
  item.lastReview = now;

  if (quality < 3) {
    // Lapse: send the item back into learning steps.
    item.reps = 0;
    item.learning = 0;
    item.intervalDays = 0;
    item.due = now + LEARNING_STEPS_MIN[0] * 60 * 1000;
    item.ease = Math.max(MIN_EASE, item.ease - 0.2);
    item.mastered = false;
    return item;
  }

  // Correct answer.
  if (item.learning !== null) {
    // Still in the same-session learning phase.
    const nextStep = item.learning + 1;
    if (nextStep < LEARNING_STEPS_MIN.length) {
      item.learning = nextStep;
      item.due = now + LEARNING_STEPS_MIN[nextStep] * 60 * 1000;
      return item;
    }
    // Graduate to spaced reviews.
    item.learning = null;
    item.reps = 1;
    item.intervalDays = 1;
    item.due = now + DAY;
    return item;
  }

  // Graduated card — apply SM-2.
  item.ease = Math.max(MIN_EASE, item.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  item.reps += 1;
  if (item.reps === 1) item.intervalDays = 1;
  else if (item.reps === 2) item.intervalDays = 6;
  else item.intervalDays = Math.round(item.intervalDays * item.ease);
  item.due = now + item.intervalDays * DAY;

  // Mastery: recalled in production at least twice and surviving to a 6+ day interval.
  if (item.prodCorrect >= 2 && item.intervalDays >= 6) item.mastered = true;
  return item;
}

export function isDue(item, now = Date.now()) {
  return item.due <= now;
}

// Retention rate across all reviews (a real, honest measure of learning).
export function retention(item) {
  return item.seen ? item.correct / item.seen : 0;
}
