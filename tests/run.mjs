// Pure-logic tests: SRS engine, answer checking, and content integrity.
// No dependencies. Run from the repo root:  node tests/run.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newItem, review, gradeFor } from '../src/srs.js';
import { normalize, checkAnswer } from '../src/lessons.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// --- SRS engine ---
let it = newItem();
review(it, gradeFor(true, 'translate'), 'translate'); // learning step
review(it, gradeFor(true, 'translate'), 'translate'); // graduate
review(it, gradeFor(true, 'translate'), 'translate'); // reps 2, interval 6
ok(it.mastered === true, 'masters after 3 production corrects');
ok(it.intervalDays >= 6, 'interval grows to >= 6 days');

let it2 = newItem();
for (let i = 0; i < 3; i++) review(it2, gradeFor(true, 'multiple_choice'), 'multiple_choice');
ok(it2.mastered === false, 'recognition-only does NOT master (needs production)');

let it3 = newItem(); it3.learning = null; it3.reps = 3; it3.intervalDays = 20; it3.ease = 2.5;
review(it3, gradeFor(false, 'translate'), 'translate');
ok(it3.intervalDays === 0 && it3.reps === 0, 'lapse resets interval and reps');
ok(it3.ease < 2.5, 'lapse lowers ease factor');

// --- answer checking ---
ok(checkAnswer({ type: 'translate', answer: 'Ngiyaphila', accept: ['ngiyaphila'] }, '  ngiyaphila '), 'translate trims/normalizes');
ok(checkAnswer({ type: 'translate', answer: 'umama', accept: ['umama', 'mama'] }, 'Mama'), 'translate accepts alternatives');
ok(!checkAnswer({ type: 'translate', answer: 'amanzi', accept: [] }, 'water'), 'translate rejects wrong');
ok(checkAnswer({ type: 'multiple_choice', answer: 'Hello' }, 'Hello'), 'multiple choice correct');
ok(checkAnswer({ type: 'match' }, true), 'match resolves on all-pairs');
ok(checkAnswer({ type: 'speak', text: 'Ngiyaphila wena' }, ['ngiyaphila wena']), 'speak matches transcript');
ok(checkAnswer({ type: 'speak', text: 'x' }, true), 'speak self-rating');
ok(normalize('Wéna?') === 'wena', 'normalize strips accents + punctuation');

// --- content integrity ---
for (const c of ['zu', 'xh', 'af']) {
  const course = JSON.parse(fs.readFileSync(path.join(root, `data/courses/${c}.json`), 'utf8'));
  const vocabIds = new Set();
  for (const u of course.units) for (const l of u.lessons) for (const v of (l.vocab || [])) vocabIds.add(v.id);
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
