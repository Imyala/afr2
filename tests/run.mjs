// Pure-logic tests: SRS engine, answer checking, and content integrity.
// No dependencies. Run from the repo root:  node tests/run.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newItem, review, gradeFor } from '../src/srs.js';
import {
  normalize, checkAnswer, buildLessonSession, buildReviewSession, exerciseVocabIds, checkTyped, editDistance,
  phraseIndex, sentencePool, readingCoverage, frameChunk, genFrameDrills, genExplainPrompt, genPatternInquiry,
} from '../src/lessons.js';

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

// fill_blank is rendered as pick-from-options, so it must count as recognition:
// a word can never be "mastered" through fill-in-the-blank taps alone
let itFb = newItem();
for (let i = 0; i < 8; i++) review(itFb, gradeFor(true, 'fill_blank'), 'fill_blank');
ok(itFb.mastered === false, 'fill_blank (pick-from-options) does NOT master');
ok(gradeFor(true, 'fill_blank') === gradeFor(true, 'multiple_choice'), 'fill_blank graded as recognition');

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
ok(exerciseVocabIds({ type: 'word_bank', answer: 'umama uyahamba', phraseId: 'ph:x:0' }, { vocab: [] }).includes('ph:x:0'), 'a phrase exercise credits its phrase chunk');
ok(exerciseVocabIds({ type: 'translate', vocabIds: ['a', 'b'], phraseId: 'ph:x:1' }).sort().join(',') === 'a,b,ph:x:1', 'explicit vocabIds + phraseId are credited');

// --- generative frame drills (chunks, not words) ---
const zuFrames = {
  join: '', link: 'ya',
  subjects: [{ p: 'ngi', en: 'I' }, { p: 'u', en: 'you' }, { p: 'si', en: 'we' }, { p: 'ba', en: 'they' }],
  verbs: [{ stem: 'sebenza', en: 'work' }, { stem: 'dla', en: 'eat' }],
};
ok(frameChunk(zuFrames, zuFrames.subjects[0], zuFrames.verbs[0]) === 'Ngiyasebenza', 'agglutinative chunk = prefix+link+stem');
ok(frameChunk({ join: ' ', subjects: [], verbs: [] }, { p: 'ek', en: 'I' }, { stem: 'werk', en: 'work' }) === 'Ek werk', 'separate-word chunk for Afrikaans');
const fd = genFrameDrills(zuFrames, 6);
ok(fd.length === 6, 'frame drills sample the requested count');
ok(fd.every((d) => d.prompt && d.answer), 'every frame drill has prompt+answer');
ok(fd.filter((d) => d.options).every((d) => d.options.includes(d.answer)), 'frame drill options contain the answer');
ok(fd.some((d) => !d.options), 'frame drills include typed production (no options)');

// --- Feynman "teach it back" explain prompt ---
const explainV = { id: 'zu-sawubona', term: 'Sawubona', translation: 'Hello' };
const ep = genExplainPrompt(explainV);
ok(ep.type === 'explain', 'explain prompt has type explain');
ok(ep.vocabId === explainV.id, 'explain prompt is tied to the vocab item');
ok(ep.prompt === explainV.term && ep.answer === explainV.translation, 'explain prompt shows the term and the answer is the translation');
ok(gradeFor(true, 'explain') === 5 && gradeFor(false, 'explain') === 1, 'explain is graded as production (deep recall)');

// --- inquiry-based pattern learning ("spot the pattern" before the rule) ---
const inquiry = genPatternInquiry(zuFrames);
ok(inquiry && inquiry.examples.length === 3, 'pattern inquiry holds back 3 worked examples');
ok(inquiry.options.includes(inquiry.answer), 'pattern inquiry options contain the right answer');
ok(inquiry.examples.every((e) => e.en && e.chunk), 'every worked example has an English gloss and a chunk');
ok(genPatternInquiry({ subjects: [{ p: 'ngi', en: 'I' }], verbs: [{ stem: 'dla', en: 'eat' }] }) === null, 'pattern inquiry needs at least 4 combinations, else null');

// --- comprehensible-input coverage ---
const covLines = [{ t: 'umama uyahamba' }, { t: 'ubaba uyadla' }];
const cov = readingCoverage(covLines, new Set(['umama', 'uyahamba', 'ubaba']));
ok(cov.total === 4 && cov.known === 3 && Math.abs(cov.pct - 0.75) < 1e-9, 'coverage counts known tokens over total');
ok(readingCoverage([], new Set()).pct === 0, 'empty reading coverage is 0');

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
    // - quiz EVERY vocab word
    // - give each word a recognition exposure before its production exposure
    // - produce valid multiple-choice (answer present, options unique)
    for (let iter = 0; iter < 25; iter++) {
      const session = buildLessonSession(l, course);
      const recAt = {}, prodAt = {}, covered = new Set();
      session.forEach((ex, i) => {
        for (const vid of exerciseVocabIds(ex, l)) {
          covered.add(vid);
          if (ex.type === 'translate' || ex.type === 'speak') { if (prodAt[vid] === undefined) prodAt[vid] = i; }
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
  // grammar pattern integrity
  const gids = (course.grammar || []).map((g) => g.id);
  ok(gids.length === new Set(gids).size, `${c} grammar ids are unique`);
  for (const g of (course.grammar || [])) {
    ok(g.id && g.title && g.tip, `${g.id} has id/title/tip`);
    ok(Array.isArray(g.drills) && g.drills.length >= 1, `${g.id} has drills`);
    for (const d of g.drills) {
      ok(d.answer && d.prompt, `${g.id} drill has answer + prompt`);
      if (d.options) {
        ok(d.options.map(normalize).includes(normalize(d.answer)), `${g.id} drill answer in options`);
        ok(new Set(d.options.map(normalize)).size === d.options.length, `${g.id} drill options unique`);
      }
    }
  }
  // dialogue integrity
  const dids = (course.dialogues || []).map((x) => x.id);
  ok(dids.length === new Set(dids).size, `${c} dialogue ids are unique`);
  for (const dia of (course.dialogues || [])) {
    ok(dia.id && dia.title && dia.goal && Array.isArray(dia.turns) && dia.turns.length >= 2, `${dia.id} has id/title/goal/turns`);
    const turnIds = new Set(dia.turns.filter((t) => t.id).map((t) => t.id));
    let youTurns = 0;
    for (const t of dia.turns) {
      if (t.next != null) ok(t.next === 'end' || turnIds.has(t.next), `${dia.id} turn next '${t.next}' resolves`);
      if (t.speaker === 'npc') { ok(t.t && t.en, `${dia.id} npc turn has t+en`); }
      else if (t.speaker === 'you') {
        youTurns += 1;
        ok(Array.isArray(t.options) && t.options.length >= 2, `${dia.id} you-turn has options`);
        // branching: one or MORE acceptable replies (different replies may lead
        // to different responses)
        ok(t.options.filter((o) => o.ok).length >= 1, `${dia.id} you-turn has a correct reply`);
        for (const o of t.options) {
          ok(o.t && o.en, `${dia.id} option has t+en`);
          // interaction needs CORRECTIVE feedback: every wrong reply explains why
          if (!o.ok) ok(!!o.why, `${dia.id} wrong option '${o.t}' has corrective feedback (why)`);
          if (o.next != null) ok(o.next === 'end' || turnIds.has(o.next), `${dia.id} option next '${o.next}' resolves`);
        }
      } else ok(false, `${dia.id} turn has a valid speaker`);
    }
    ok(youTurns >= 1, `${dia.id} has at least one learner turn`);
  }
  // generative frames integrity (chunks, not words)
  for (const g of (course.grammar || [])) {
    if (!g.frames) continue;
    ok(Array.isArray(g.frames.subjects) && g.frames.subjects.length >= 3, `${g.id} frames have >=3 subjects`);
    ok(Array.isArray(g.frames.verbs) && g.frames.verbs.length >= 3, `${g.id} frames have >=3 verbs`);
    for (const s of g.frames.subjects) ok(s.p && s.en, `${g.id} frame subject has p+en`);
    for (const v of g.frames.verbs) ok(v.stem && v.en, `${g.id} frame verb has stem+en`);
    for (let i = 0; i < 5; i++) {
      const drills = genFrameDrills(g.frames, 6);
      if (drills.length !== 6 || !drills.every((d) => d.prompt && d.answer && (!d.options || d.options.includes(d.answer)))) {
        ok(false, `${g.id} generated frame drills invalid (iter ${i})`); break;
      }
    }
    ok(true, `${g.id} frame drills generate validly`);
  }
  ok((course.grammar || []).some((g) => g.frames), `${c} has at least one generative frame pattern`);
  // phrase chunks are reviewable items
  const phrases = phraseIndex(course);
  const phraseIds = Object.keys(phrases);
  ok(phraseIds.length > 0, `${c} has phrase chunks`);
  ok(phraseIds.every((id) => id.startsWith('ph:') && phrases[id].t && phrases[id].en), `${c} phrase ids/content well-formed`);
  for (let i = 0; i < 10; i++) {
    const rev = buildReviewSession(course, phraseIds.slice(0, 6), 15);
    if (!rev.length || !rev.every((ex) => ex.phraseId && exerciseVocabIds(ex, null).includes(ex.phraseId))) {
      ok(false, `${c} phrase review session invalid (iter ${i})`); break;
    }
  }
  ok(true, `${c} phrase reviews credit the chunk`);
  // the sentence pool (speaking practice + review sentences) is well-formed
  const sp = sentencePool(course);
  ok(sp.length >= 10, `${c} sentence pool has enough sentences (${sp.length})`);
  ok(sp.every((s) => s.t && s.en), `${c} sentence pool entries have t+en`);

  const audioLesson = course.units.flatMap((u) => u.lessons).find((l) => (l.exercises || []).some((e) => e.type === 'listen' || e.type === 'speak'));
  if (audioLesson) {
    const balanced = buildLessonSession(audioLesson, course, [], { recentTypes: Array(16).fill('multiple_choice').concat(Array(8).fill('translate')) });
    ok(balanced.some((ex) => ex.type === 'listen'), `${audioLesson.id} can surface authored listen items`);
    ok(balanced.some((ex) => ex.type === 'speak'), `${audioLesson.id} can surface authored speak items`);
  }

  const fakeIds = Array.from(vocabIds).slice(0, 8);
  const fakeStats = Object.fromEntries(fakeIds.map((id, i) => [id, {
    seen: 4, correct: i < 6 ? 4 : 2, mastered: i < 2,
  }]));
  const repair = buildReviewSession(course, Object.keys(fakeStats).slice(0, 4), 10, {
    recentTypes: Array(12).fill('multiple_choice'),
    itemStats: fakeStats,
    repairMode: true,
  });
  ok(repair.some((ex) => ex._repairBoost), `${c} repair mode adds confidence-building boosters`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
