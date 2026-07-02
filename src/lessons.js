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
  return course.units.flatMap((u) => u.lessons.map((l) => ({ ...l, unitId: u.id, unitTitle: u.title, level: u.level })));
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

// Phrase CHUNKS are first-class spaced items ("chunks, not words": fluent
// speech is retrieved as prefabricated multi-word frames, so phrase cards are
// scheduled and reviewed just like vocabulary). Ids are derived from the
// lesson id + position, which is stable as long as authored order is stable.
export function phraseIndex(course) {
  const byId = {};
  for (const u of course.units) for (const l of u.lessons) {
    (l.phrases || []).forEach((p, i) => {
      if (!p || !p.t || !p.en) return;
      const id = `ph:${l.id}:${i}`;
      byId[id] = { id, t: p.t, en: p.en, lessonId: l.id };
    });
  }
  return byId;
}

// Every authored sentence in a course — lesson phrases, dialogue lines and
// story lines — as one pool: { t, en, phraseId? }. This is where sentence-level
// practice (speaking, review word-banks) draws from, so hand-authored dialogue
// and story content is reused instead of sitting unseen.
export function sentencePool(course) {
  const out = [];
  for (const p of Object.values(phraseIndex(course))) out.push({ t: p.t, en: p.en, phraseId: p.id });
  for (const d of (course.dialogues || [])) {
    for (const turn of (d.turns || [])) {
      if (turn.t && turn.en) out.push({ t: turn.t, en: turn.en });
      for (const o of (turn.options || [])) if (o.ok && o.t && o.en) out.push({ t: o.t, en: o.en });
    }
  }
  for (const r of (course.reading || [])) for (const ln of (r.lines || [])) {
    if (ln.t && ln.en) out.push({ t: ln.t, en: ln.en });
  }
  // de-dup by normalized target text
  const seen = new Set();
  return out.filter((s) => { const k = normalize(s.t); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

// Comprehensible-input fit: what fraction of a story's word tokens does the
// learner already know? (Extensive-reading research targets ~95%+ known words
// for input to be comprehensible enough to learn from.)
export function readingCoverage(lines, knownTerms) {
  let known = 0, total = 0;
  for (const ln of (lines || [])) {
    for (const tok of normalize(ln.t || '').split(' ')) {
      if (!tok) continue;
      total += 1;
      if (knownTerms.has(tok)) known += 1;
    }
  }
  return { known, total, pct: total ? known / total : 0 };
}

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[.,!?'"-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Bounded Levenshtein edit distance. Returns max+1 once the budget is blown,
// so we never do more work than we need for "is this within N edits?".
export function editDistance(a, b, max = 2) {
  a = a || ''; b = b || '';
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + cost);
      diag = tmp;
      if (prev[j] < rowMin) rowMin = prev[j];
    }
    if (rowMin > max) return max + 1; // no cell in this row is still in budget
  }
  return prev[b.length];
}

// Tolerance (allowed typos) for a target of the given length. Short words —
// numbers, yes/no — must be exact, because a single edit there is usually a
// different word, not a typo. Longer words/phrases earn more leniency.
function typoTolerance(len) { return len <= 4 ? 0 : len <= 9 ? 1 : 2; }

// Check a typed answer with gentle typo tolerance. Returns { correct, typo }:
// a near-miss is accepted (correct) but flagged (typo) so the UI can nudge the
// spelling instead of costing the learner a heart.
export function checkTyped(ex, response) {
  const r = normalize(response);
  if (!r) return { correct: false, typo: false };
  const accepted = [ex.answer, ...(ex.accept || [])].map(normalize);
  if (accepted.includes(r)) return { correct: true, typo: false };
  for (const a of accepted) {
    const tol = typoTolerance(a.length);
    if (tol > 0 && editDistance(r, a, tol) <= tol) return { correct: true, typo: true };
  }
  return { correct: false, typo: false };
}

// Returns true if the learner's response is correct for this exercise.
export function checkAnswer(ex, response) {
  switch (ex.type) {
    case 'multiple_choice':
    case 'listen':
    case 'fill_blank':
      return normalize(response) === normalize(ex.answer);
    case 'translate': {
      // typo-tolerant, but still returns a simple boolean for callers that
      // only care whether it counts as correct (UI uses checkTyped for nuance)
      return checkTyped(ex, response).correct;
    }
    case 'word_bank':
      // response is the built sentence; word order matters
      return normalize(response) === normalize(ex.answer);
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

// Sentence building: from an authored phrase {t, en}, give the learner a word
// bank (the sentence's words plus a couple of distractors) to arrange into the
// target. This is the first real *sentence* practice — production beyond single
// words — and a fresh exercise shape to break the match/MC/translate rhythm.
function genWordBank(phrase, pool) {
  const words = phrase.t.split(/\s+/).filter(Boolean);
  const present = new Set(words.map(normalize));
  const distract = [];
  for (const v of shuffle(pool)) {
    const w = v.term.split(/\s+/)[0];
    const n = normalize(w);
    if (!n || present.has(n) || distract.some((d) => normalize(d) === n)) continue;
    distract.push(w);
    if (distract.length >= 2) break;
  }
  return { type: 'word_bank', prompt: phrase.en, answer: phrase.t, tokens: shuffle([...words, ...distract]), ...(phrase.id ? { phraseId: phrase.id } : {}) };
}

// Which course vocab items appear (as whole words) inside a sentence.
export function memberVocabIds(text, vocabById) {
  const hay = normalize(text);
  return Object.values(vocabById)
    .filter((v) => { const t = normalize(v.term); return t && (hay === t || hay.includes(` ${t} `) || hay.startsWith(`${t} `) || hay.endsWith(` ${t}`)); })
    .map((v) => v.id);
}

// Sentence comprehension: "what does this sentence mean?" — recognition at the
// sentence level. Distractor meanings come from other authored phrases.
function genPhraseChoice(phrase, enPool) {
  const distract = [];
  for (const e of shuffle(enPool)) {
    if (normalize(e) === normalize(phrase.en) || distract.some((d) => normalize(d) === normalize(e))) continue;
    distract.push(e);
    if (distract.length >= 3) break;
  }
  return { type: 'multiple_choice', prompt: `What does “${phrase.t}” mean?`, answer: phrase.en, options: shuffle([phrase.en, ...distract]), ...(phrase.id ? { phraseId: phrase.id } : {}) };
}

// Sentence fill-in-the-blank: drop one known word from the sentence and pick it
// from options. In-context practice of which word fits — a step toward grammar.
function genPhraseBlank(phrase, pool, byTerm) {
  const words = phrase.t.split(/\s+/).filter(Boolean);
  const known = words.filter((w) => byTerm[normalize(w)]);
  const pick = (known.length ? known : words)[Math.floor(Math.random() * (known.length || words.length))];
  let done = false;
  const sentence = words.map((w) => (!done && w === pick ? (done = true, '____') : w)).join(' ');
  const seen = new Set([normalize(pick)]);
  const opts = [pick];
  for (const v of shuffle(pool)) {
    if (/\s/.test(v.term)) continue;            // single-word distractors only
    const n = normalize(v.term);
    if (!n || seen.has(n)) continue;
    seen.add(n); opts.push(v.term);
    if (opts.length >= 4) break;
  }
  const vid = byTerm[normalize(pick)];
  return { type: 'fill_blank', sentence, answer: pick, options: shuffle(opts), meaning: phrase.en, ...(vid ? { vocabId: vid } : {}), ...(phrase.id ? { phraseId: phrase.id } : {}) };
}

// ---------------------------------------------------------------------------
// Generative frame drills ("chunks, not words")
//
// A frames spec on a grammar pattern generates whole-chunk conjugation drills
// from real course verbs: subject prefix (+ optional link) + stem, drilled as
// one prefabricated unit (ngi+ya+sebenza -> "ngiyasebenza"), the way fluent
// speech actually retrieves it. Every session samples fresh combinations, so
// the drills are generated, not a fixed hand-authored list.
//
//   frames: {
//     join:     '' (agglutinative: ngiyasebenza) or ' ' (separate: ek werk)
//     link:     optional infix between prefix and stem (zu/xh long present 'ya')
//     subjects: [{ p: 'ngi', en: 'I' }, ...]
//     verbs:    [{ stem: 'sebenza', en: 'work' }, ...]
//   }
// ---------------------------------------------------------------------------

export function frameChunk(frames, subj, verb) {
  const parts = frames.join === ' ' ? [subj.p, verb.stem] : [subj.p + (frames.link || '') + verb.stem];
  const s = parts.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function genFrameDrills(frames, n = 6) {
  const combos = [];
  for (const subj of frames.subjects) for (const verb of frames.verbs) combos.push({ subj, verb });
  const drills = shuffle(combos).slice(0, n).map(({ subj, verb }, i) => {
    const answer = frameChunk(frames, subj, verb);
    const en = `${subj.en} ${verb.en}`;
    // options: the same verb across all subject frames — the choice IS the frame
    const options = shuffle(frames.subjects.map((s) => frameChunk(frames, s, verb)));
    // mix shapes: pick-the-frame first, then produce the whole chunk from memory
    if (i % 2 === 0 && options.length >= 3) return { prompt: en, answer, options };
    return { prompt: en, answer };
  });
  return drills;
}

// All authored phrase meanings in a course (distractor pool for sentence MCs).
function allPhraseEns(course) {
  const out = [];
  for (const u of course.units) for (const l of u.lessons) for (const p of (l.phrases || [])) out.push(p.en);
  return out;
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

  // hand-authored contextual items: sample across every renderable type so
  // authored content actually reaches learners (match/listen/speak authored
  // items are covered by the generator / disabled audio modes instead)
  const RENDERABLE = ['multiple_choice', 'fill_blank', 'translate'];
  const authored = shuffle((lesson.exercises || []).filter((e) => RENDERABLE.includes(e.type))).slice(0, 4);
  // authored typed items are production, so they belong in the production
  // block — keeping the every-word rule "recognition before production"
  const flavour = authored.filter((e) => e.type !== 'translate');
  const flavourProd = authored.filter((e) => e.type === 'translate');

  // sentence practice: 1-2 items from any authored phrases, varied across three
  // shapes (build-the-sentence, sentence meaning, sentence fill-the-blank). Kept
  // in the pre-production block so every word still gets a recognition exposure
  // before it must be produced. Phrases carry stable ids so each phrase CHUNK
  // is also a spaced item of its own (chunks, not words).
  const phrases = (lesson.phrases || [])
    .map((p, i) => (p && p.t && p.en ? { ...p, id: `ph:${lesson.id}:${i}` } : null))
    .filter(Boolean);
  const enPool = course ? allPhraseEns(course) : phrases.map((p) => p.en);
  const byTerm = {};
  for (const v of pool) if (!/\s/.test(v.term)) byTerm[normalize(v.term)] = v.id;
  const wordbanks = shuffle(phrases).slice(0, Math.min(2, phrases.length)).map((p) => {
    const r = Math.random();
    if (r < 0.34) return genWordBank(p, pool);
    if (r < 0.67 && enPool.length >= 2) return genPhraseChoice(p, enPool);
    return genPhraseBlank(p, pool, byTerm);
  });

  // cross-lesson repetition: up to 2 due words that aren't in this lesson
  const lessonIds = new Set(vocab.map((v) => v.id));
  const warmup = (dueIds || [])
    .map((id) => byId[id])
    .filter((v) => v && !lessonIds.has(v.id))
    .slice(0, 2)
    .map((v) => ({ ...genRecognition(v, pool), _review: true }));

  const queue = [
    ...warmup,
    ...shuffle([...recognition, ...flavour, ...wordbanks]),
    ...shuffle([...production, ...flavourProd]),
  ];
  return queue.map((ex, i) => ({ ...ex, _i: i }));
}

// Build a review session from due ids (vocab AND phrase chunks), with
// randomised, varied items.
export function buildReviewSession(course, dueIds, max = 15) {
  const byId = vocabIndex(course);
  const phrases = phraseIndex(course);
  const pool = Object.values(byId);
  const enPool = allPhraseEns(course);

  // due phrase chunks: up to a third of the session, reviewed as sentences
  // (build-the-sentence or sentence-meaning), crediting the chunk AND its words
  const duePhrases = shuffle(dueIds.filter((id) => phrases[id])).slice(0, Math.floor(max / 3));
  const phraseExs = duePhrases.map((id) => {
    const p = phrases[id];
    const r = Math.random();
    // three shapes: build-the-sentence, TYPE the sentence (production — the
    // only route to phrase mastery), or sentence meaning
    const ex = r < 0.4 ? genWordBank(p, pool)
      : r < 0.7 ? { type: 'translate', prompt: p.en, answer: p.t, accept: [p.t.toLowerCase()] }
        : (enPool.length >= 2 ? genPhraseChoice(p, enPool) : genWordBank(p, pool));
    return { ...ex, phraseId: id, vocabIds: memberVocabIds(p.t, byId), _review: true };
  });

  const picked = shuffle(dueIds.map((id) => byId[id]).filter(Boolean)).slice(0, max - phraseExs.length);
  // production is the stronger test, so bias towards it but keep variety
  const wordExs = picked.map((v) => {
    const ex = Math.random() < 0.6 ? genProduction(v) : genRecognition(v, pool);
    return { ...ex, _review: true };
  });
  return shuffle([...wordExs, ...phraseExs]);
}

// Map exercises to the item ids they exercise (for SRS crediting): explicit
// lists first, then the single vocabId, plus the phrase-chunk id if the
// exercise practises a whole phrase.
export function exerciseVocabIds(ex, lesson) {
  const phrase = ex.phraseId ? [ex.phraseId] : [];
  if (ex.vocabIds) return [...new Set([...ex.vocabIds, ...phrase])];
  if (ex.vocabId) return [ex.vocabId, ...phrase];
  if (ex.type === 'match' && lesson) {
    // credit any lesson vocab whose term appears in the pairs
    const terms = new Set(ex.pairs.map((p) => normalize(p[0])));
    return (lesson.vocab || []).filter((v) => terms.has(normalize(v.term))).map((v) => v.id);
  }
  if (ex.type === 'word_bank' && lesson) {
    // credit any lesson vocab whose term appears in the built sentence
    const hay = normalize(ex.answer);
    return [...(lesson.vocab || []).filter((v) => { const t = normalize(v.term); return t && (hay === t || hay.includes(` ${t} `) || hay.startsWith(`${t} `) || hay.endsWith(` ${t}`)); }).map((v) => v.id), ...phrase];
  }
  return phrase;
}
