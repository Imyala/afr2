// Pure-logic tests: SRS engine, answer checking, and content integrity.
// No dependencies. Run from the repo root:  node tests/run.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newItem, review, gradeFor } from '../src/srs.js';
import { normalize, checkAnswer, buildLessonSession, exerciseVocabIds, checkTyped, editDistance } from '../src/lessons.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// --- SRS engine (FSRS-style target-retention scheduler) ---
let it = newItem();
let prevInterval = 0, monotonic = true;
for (let i = 0; i < 6; i++) {
  review(it, gradeFor(true, 'translate'), 'translate');
  if (it.learning === null) { if (it.intervalDays < prevInterval) monotonic = false; prevInterval = it.intervalDays; }
}
ok(it.mastered === true, 'masters after enough production corrects');
ok(it.stability >= 7, 'stability grows past the mastery threshold');
ok(monotonic, 'intervals grow monotonically across successful reviews');
ok(it.intervalDays >= 6, 'interval grows to several days');

let it2 = newItem();
for (let i = 0; i < 8; i++) review(it2, gradeFor(true, 'multiple_choice'), 'multiple_choice');
ok(it2.mastered === false, 'recognition-only does NOT master (needs production)');

// higher desired retention => shorter interval for the same stability
let itA = newItem(); for (let i = 0; i < 5; i++) review(itA, gradeFor(true, 'translate'), 'translate', Date.now(), 0.85);
let itB = newItem(); for (let i = 0; i < 5; i++) review(itB, gradeFor(true, 'translate'), 'translate', Date.now(), 0.95);
ok(itB.intervalDays < itA.intervalDays, 'higher desired retention schedules sooner');

let it3 = newItem(); it3.learning = null; it3.reps = 3; it3.stability = 20; it3.difficulty = 4; it3.intervalDays = 20;
review(it3, gradeFor(false, 'translate'), 'translate');
ok(it3.reps === 0 && it3.intervalDays === 0, 'lapse resets reps and interval');
ok(it3.stability < 20, 'lapse shrinks stability');
ok(it3.difficulty > 4, 'lapse raises difficulty');
ok(it3.mastered === false, 'lapse clears mastery');

// --- answer checking ---
ok(checkAnswer({ type: 'translate', answer: 'Ngiyaphila', accept: ['ngiyaphila'] }, '  ngiyaphila '), 'translate trims/normalizes');
ok(checkAnswer({ type: 'translate', answer: 'umama', accept: ['umama', 'mama'] }, 'Mama'), 'translate accepts alternatives');
ok(!checkAnswer({ type: 'translate', answer: 'amanzi', accept: [] }, 'water'), 'translate rejects wrong');
ok(checkAnswer({ type: 'multiple_choice', answer: 'Hello' }, 'Hello'), 'multiple choice correct');
ok(checkAnswer({ type: 'match' }, true), 'match resolves on all-pairs');
ok(checkAnswer({ type: 'speak', text: 'Ngiyaphila wena' }, ['ngiyaphila wena']), 'speak matches transcript');
ok(checkAnswer({ type: 'speak', text: 'x' }, true), 'speak self-rating');
ok(normalize('Wéna?') === 'wena', 'normalize strips accents + punctuation');

// --- typo tolerance (typed answers) ---
ok(editDistance('ngiyaphila', 'ngiyaphila') === 0, 'edit distance 0 for identical');
ok(editDistance('ngiyaphilla', 'ngiyaphila', 2) === 1, 'edit distance counts one extra letter');
ok(checkTyped({ type: 'translate', answer: 'ngiyaphila', accept: [] }, 'ngiyaphila').correct === true, 'exact typed answer is correct, not flagged as typo');
ok(checkTyped({ type: 'translate', answer: 'ngiyaphila', accept: [] }, 'ngiyaphila').typo === false, 'exact answer is not a typo');
const near = checkTyped({ type: 'translate', answer: 'ngiyaphila', accept: [] }, 'ngiyaphilla');
ok(near.correct === true && near.typo === true, 'one-letter slip on a long word is accepted but flagged');
ok(checkTyped({ type: 'translate', answer: 'kune', accept: [] }, 'kunye').correct === false, 'short minimal pairs (four vs one) are NOT auto-corrected');
ok(checkTyped({ type: 'translate', answer: 'amanzi', accept: [] }, 'water').correct === false, 'a totally wrong word is still wrong');
ok(checkAnswer({ type: 'translate', answer: 'sawubona', accept: [] }, 'sawubna'), 'checkAnswer(translate) accepts a near-miss');

// --- word bank (sentence building) ---
const wb = { type: 'word_bank', answer: 'Igama lami nguThabo' };
ok(checkAnswer(wb, 'Igama lami nguThabo') === true, 'word bank correct in right order');
ok(checkAnswer(wb, 'lami Igama nguThabo') === false, 'word bank wrong order fails');
ok(exerciseVocabIds({ type: 'word_bank', answer: 'umama uyahamba' }, { vocab: [{ id: 'zu-umama', term: 'umama' }] }).includes('zu-umama'), 'word bank credits a lesson word it contains');

// --- content integrity ---
for (const c of ['zu', 'xh', 'af']) {
  const course = JSON.parse(fs.readFileSync(path.join(root, `data/courses/${c}.json`), 'utf8'));
  const vocabIds = new Set();
  const allIds = [];
  for (const u of course.units) for (const l of u.lessons) for (const v of (l.vocab || [])) { vocabIds.add(v.id); allIds.push(v.id); }
  // every vocab id must be unique across the whole course — a duplicate id would
  // silently merge two words' SRS state and skew the "words mastered" count.
  ok(allIds.length === vocabIds.size, `${c} has no duplicate vocab ids (${allIds.length - vocabIds.size} dup)`);
  for (const u of course.units) for (const l of u.lessons) {
    ok(l.vocab && l.vocab.length > 0, `${l.id} has vocab`);
    for (const v of l.vocab) ok(v.phonetic, `${v.id} has phonetics (offline fallback)`);
    for (const ex of l.exercises) {
      if (ex.vocabId) ok(vocabIds.has(ex.vocabId), `${l.id} vocabId ${ex.vocabId} resolves`);
      if (['multiple_choice', 'listen', 'fill_blank'].includes(ex.type)) {
        ok(ex.options.map(normalize).includes(normalize(ex.answer)), `${l.id} ${ex.type} answer in options`);
        ok(new Set(ex.options.map(normalize)).size === ex.options.length, `${l.id} ${ex.type} options unique`);
      }
      if (ex.type === 'translate') ok(ex.answer && ex.prompt, `${l.id} translate has answer+prompt`);
      if (ex.type === 'match') ok(ex.pairs.length >= 3, `${l.id} match has >=3 pairs`);
    }
    // generated sessions (run several times because generation is randomised):
    // - never contain audio exercises
    // - quiz EVERY vocab word
    // - give each word a recognition exposure before its production exposure
    // - produce valid multiple-choice (answer present, options unique)
    for (let iter = 0; iter < 25; iter++) {
      const session = buildLessonSession(l, course);
      if (session.some((ex) => ex.type === 'listen' || ex.type === 'speak')) { ok(false, `${l.id} generated audio exercise`); break; }
      const recAt = {}, prodAt = {}, covered = new Set();
      session.forEach((ex, i) => {
        for (const vid of exerciseVocabIds(ex, l)) {
          covered.add(vid);
          if (ex.type === 'translate') { if (prodAt[vid] === undefined) prodAt[vid] = i; }
          else if (recAt[vid] === undefined) recAt[vid] = i;
        }
        if (ex.type === 'multiple_choice') {
          if (!ex.options.map(normalize).includes(normalize(ex.answer))) ok(false, `${l.id} generated MC missing answer`);
          if (new Set(ex.options.map(normalize)).size !== ex.options.length) ok(false, `${l.id} generated MC dup options`);
        }
      });
      for (const v of l.vocab) {
        if (!covered.has(v.id)) { ok(false, `${l.id} word ${v.id} not quizzed (iter ${iter})`); continue; }
        if (prodAt[v.id] === undefined) { ok(false, `${l.id} word ${v.id} has no production`); continue; }
        if (recAt[v.id] === undefined || recAt[v.id] > prodAt[v.id]) ok(false, `${l.id} word ${v.id} production before recognition`);
      }
    }
    ok(true, `${l.id} generated sessions valid across 25 runs`);
  }
  // reading content integrity
  for (const r of (course.reading || [])) {
    ok(r.id && r.title, `${c} reading has id+title`);
    ok(Array.isArray(r.lines) && r.lines.length >= 2, `${r.id} has lines`);
    for (const ln of r.lines) ok(ln.t && ln.en, `${r.id} line has target + english`);
    ok(Array.isArray(r.questions) && r.questions.length >= 1, `${r.id} has questions`);
    for (const q of r.questions) {
      if (['multiple_choice', 'fill_blank'].includes(q.type)) {
        ok(q.options.map(normalize).includes(normalize(q.answer)), `${r.id} question answer in options`);
      }
      if (q.type === 'translate') ok(q.answer, `${r.id} translate question has answer`);
      if (q.vocabId) ok(vocabIds.has(q.vocabId), `${r.id} question vocabId ${q.vocabId} resolves`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
