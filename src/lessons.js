// lessons.js — course loading, answer grading, and session building

let coursesCache = {};

export async function loadCourse(code) {
  if (coursesCache[code]) return coursesCache[code];
  const res = await fetch(`data/courses/${code}.json`);
  if (!res.ok) throw new Error(`Could not load course ${code}`);
  const course = await res.json();
  coursesCache[code] = course;
  return course;
}

export async function loadLanguages() {
  const res = await fetch('data/languages.json');
  return res.json();
}

// Flatten all lessons in a course in order.
export function allLessons(course) {
  return course.units.flatMap((u) => u.lessons.map((l) => ({ ...l, unitTitle: u.title, level: u.level })));
}

export function findLesson(course, lessonId) {
  return allLessons(course).find((l) => l.id === lessonId);
}

// Build a flat lookup of every vocab item in a course: term/translation -> vocab.
export function vocabIndex(course) {
  const byId = {};
  for (const u of course.units) for (const l of u.lessons) for (const v of (l.vocab || [])) byId[v.id] = v;
  return byId;
}

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[.,!?'"-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns true if the learner's response is correct for this exercise.
export function checkAnswer(ex, response) {
  switch (ex.type) {
    case 'multiple_choice':
    case 'listen':
    case 'fill_blank':
      return normalize(response) === normalize(ex.answer);
    case 'translate': {
      const accepted = [ex.answer, ...(ex.accept || [])].map(normalize);
      return accepted.includes(normalize(response));
    }
    case 'match':
      // response is a boolean indicating all pairs were matched correctly
      return response === true;
    case 'speak': {
      // response is an array of recognised alternatives, or a self-rating boolean
      if (typeof response === 'boolean') return response;
      if (Array.isArray(response)) {
        const target = normalize(ex.text);
        return response.some((alt) => {
          const n = normalize(alt);
          return n === target || target.includes(n) || n.includes(target);
        });
      }
      return false;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Exercise generation
//
// Rather than depending on a fixed, hand-authored list per lesson, sessions are
// generated from the vocabulary. This guarantees every word is quizzed, builds
// in repetition (each word gets a recognition AND a production exposure, spaced
// apart), and keeps things from feeling scripted (types, question direction,
// distractors and order are randomised every run). Hand-authored contextual
// fill-in-the-blank items are mixed in as flavour. On-device speech I/O for SA
// languages is unreliable, so listen/speak items are never generated.
// ---------------------------------------------------------------------------

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

function distractors(target, pool, n, key) {
  const seen = new Set([normalize(target[key])]);
  const out = [];
  for (const v of shuffle(pool)) {
    const k = normalize(v[key]);
    if (v.id === target.id || seen.has(k)) continue;
    seen.add(k); out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

// Recognition: randomly term->meaning or meaning->term multiple choice.
function genRecognition(v, pool) {
  if (Math.random() < 0.5) {
    const opts = shuffle([v.translation, ...distractors(v, pool, 3, 'translation').map((d) => d.translation)]);
    return { type: 'multiple_choice', prompt: `“${v.term}” means:`, answer: v.translation, options: opts, vocabId: v.id };
  }
  const opts = shuffle([v.term, ...distractors(v, pool, 3, 'term').map((d) => d.term)]);
  return { type: 'multiple_choice', prompt: `How do you say “${v.translation}”?`, answer: v.term, options: opts, vocabId: v.id };
}

// Production: type the target word from its meaning.
function genProduction(v) {
  return { type: 'translate', prompt: v.translation, answer: v.term, accept: [v.term.toLowerCase()], vocabId: v.id };
}

function genMatch(words) {
  return { type: 'match', pairs: shuffle(words).map((v) => [v.term, v.translation]) };
}

// Build a lesson session: covers every word with recognition + production,
// optionally warmed up with a couple of due words from earlier lessons.
export function buildLessonSession(lesson, course = null, dueIds = []) {
  const vocab = lesson.vocab || [];
  const byId = course ? vocabIndex(course) : Object.fromEntries(vocab.map((v) => [v.id, v]));
  const pool = Object.values(byId);

  // recognition phase: one intro match over a random subset, MC for the rest
  const matchWords = shuffle(vocab).slice(0, Math.min(4, vocab.length));
  const inMatch = new Set(matchWords.map((v) => v.id));
  const recognition = vocab.length >= 3 ? [genMatch(matchWords)] : [];
  for (const v of vocab) if (!inMatch.has(v.id)) recognition.push(genRecognition(v, pool));

  // production phase: every word
  const production = vocab.map((v) => genProduction(v));

  // flavour: 1-2 authored contextual fill-in-the-blanks (kept from content)
  const authoredFill = (lesson.exercises || []).filter((e) => e.type === 'fill_blank');
  const flavour = shuffle(authoredFill).slice(0, Math.min(2, authoredFill.length));

  // cross-lesson repetition: up to 2 due words that aren't in this lesson
  const lessonIds = new Set(vocab.map((v) => v.id));
  const warmup = (dueIds || [])
    .map((id) => byId[id])
    .filter((v) => v && !lessonIds.has(v.id))
    .slice(0, 2)
    .map((v) => ({ ...genRecognition(v, pool), _review: true }));

  const queue = [
    ...warmup,
    ...shuffle([...recognition, ...flavour]),
    ...shuffle(production),
  ];
  return queue.map((ex, i) => ({ ...ex, _i: i }));
}

// Build a review session from due vocab ids, with randomised, varied items.
export function buildReviewSession(course, dueIds, max = 15) {
  const byId = vocabIndex(course);
  const pool = Object.values(byId);
  const picked = shuffle(dueIds.map((id) => byId[id]).filter(Boolean)).slice(0, max);
  // production is the stronger test, so bias towards it but keep variety
  return picked.map((v) => {
    const ex = Math.random() < 0.6 ? genProduction(v) : genRecognition(v, pool);
    return { ...ex, _review: true };
  });
}

// Map exercises to the vocab ids they exercise (for SRS crediting).
export function exerciseVocabIds(ex, lesson) {
  if (ex.vocabId) return [ex.vocabId];
  if (ex.type === 'match' && lesson) {
    // credit any lesson vocab whose term appears in the pairs
    const terms = new Set(ex.pairs.map((p) => normalize(p[0])));
    return (lesson.vocab || []).filter((v) => terms.has(normalize(v.term))).map((v) => v.id);
  }
  return [];
}
