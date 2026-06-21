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

// On-device speech synthesis/recognition for SA languages is unreliable or
// absent, which made "listen" and "speak" exercises impossible to answer
// offline. Until we ship recorded native-speaker audio:
//   - "speak" exercises are dropped from the graded flow, and
//   - "listen" exercises are converted into a text multiple-choice
//     ("How do you say X?") so the word is still practised and the answer is
//     always knowable. (The authored audio items stay in the content files so
//     they can be re-enabled once real audio exists.)
export function buildLessonSession(lesson) {
  const vById = {};
  for (const v of (lesson.vocab || [])) vById[v.id] = v;
  const out = [];
  for (const ex of (lesson.exercises || [])) {
    if (ex.type === 'speak') continue;
    if (ex.type === 'listen') {
      const v = vById[ex.vocabId];
      if (!v) continue; // can't reframe without the meaning — skip
      out.push({
        type: 'multiple_choice',
        prompt: `How do you say “${v.translation}”?`,
        answer: ex.answer,
        options: ex.options,
        vocabId: ex.vocabId,
      });
      continue;
    }
    out.push(ex);
  }
  return out.map((ex, i) => ({ ...ex, _i: i }));
}

// Generate review exercises for a set of due vocab ids, drawing distractors
// from the wider course. Mixes recognition and production for honest testing.
export function buildReviewSession(course, dueIds, max = 15) {
  const byId = vocabIndex(course);
  const all = Object.values(byId);
  const picked = dueIds.map((id) => byId[id]).filter(Boolean).slice(0, max);
  const exercises = [];
  picked.forEach((v, idx) => {
    const distractors = all
      .filter((o) => o.id !== v.id && o.translation !== v.translation)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    if (idx % 2 === 0) {
      // production: translate English -> target
      exercises.push({
        type: 'translate',
        prompt: v.translation,
        answer: v.term,
        accept: [v.term.toLowerCase()],
        vocabId: v.id,
        _review: true,
      });
    } else {
      // recognition: choose the meaning
      const options = [v, ...distractors].map((x) => x.translation).sort(() => Math.random() - 0.5);
      exercises.push({
        type: 'multiple_choice',
        prompt: `"${v.term}" means:`,
        answer: v.translation,
        options,
        vocabId: v.id,
        _review: true,
      });
    }
  });
  return exercises;
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
