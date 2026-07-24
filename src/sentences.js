// sentences.js — the generative sentence engine.
//
// This is the bridge from "knowing words" to "saying what you want": instead
// of replaying authored phrases, it GENERATES novel, grammatically correct
// sentences from real morphology — subject concords, tense markers and
// negation wrapping for isiZulu/isiXhosa; word order (verb-final futures and
// pasts, the double "nie", question inversion) for Afrikaans. The learner
// assembles each sentence from morpheme and word tiles, watching the word
// build up live — so they learn how the machine works, not just what one
// fixed phrase sounds like.
//
// Every token is tagged with a ROLE (subj / tense / verb / obj / time / neg /
// q) and a WHY note, so the UI can show the sentence's anatomy — the "why is
// it built this way" — right when curiosity peaks: just after an answer.
//
// Tile model: { t, glue, role, why } — glue tiles attach to whatever precedes
// them with no space (ngi + ya + sebenza -> "Ngiyasebenza"); non-glue tiles
// start a new word.

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Join placed tiles into the sentence they spell.
export function assemble(tokens) {
  let s = '';
  tokens.forEach((tok, i) => { s += (i > 0 && !tok.glue ? ' ' : '') + tok.t; });
  return cap(s);
}

// Tense menu for the Sentence Lab (ids are the internal tense names).
export const TENSES = [
  { id: 'present', label: 'Now', icon: '☀️' },
  { id: 'question', label: 'Ask it', icon: '❓' },
  { id: 'neg', label: 'Not…', icon: '🚫' },
  { id: 'future', label: 'Will…', icon: '⏭️' },
  { id: 'past', label: 'Did…', icon: '⏮️' },
];

// ---------------------------------------------------------------------------
// Language data
//
// Nguni verbs: { stem, en, en3, enPast?, neg (present-negative stem, -a -> -i),
//               past? (perfect stem, only where safe), objs: [{t, en}] }
// Objects include LOCATIVE phrases (ekhaya, esikoleni…) — grammatically they
// sit after the verb exactly like objects, and they teach the e-…-ini system.
// The grammar encoded here:
//   present + object:  SC + stem, object follows        (Ngifuna amanzi)
//   present, no object: SC + ya + stem (long form)      (Ngiyasebenza)
//   future:            SC + FUT + stem                  (Ngizosebenza [kusasa])
//   past (perfect):    SC + stem-ile                    (Ngisebenzile [izolo])
//   negative present:  NEG-SC + neg stem (+ object)     (Angisebenzi / Angifuni amanzi)
//   question:          the same sentence + rising tone  (Uyasebenza?)
// ---------------------------------------------------------------------------

const NGUNI = {
  zu: {
    name: 'isiZulu',
    subjects: [
      { p: 'ngi', neg: 'angi', en: 'I', third: false, q: false },
      { p: 'u', neg: 'awu', en: 'you', third: false, q: true },
      { p: 'si', neg: 'asi', en: 'we', third: false, q: false },
      { p: 'ba', neg: 'aba', en: 'they', third: false, q: true },
    ],
    fut: 'zo',
    long: 'ya',
    futSplit: false,
    adverbs: { future: { t: 'kusasa', en: 'tomorrow' }, past: { t: 'izolo', en: 'yesterday' } },
    hints: {
      present_obj: 'With something after the verb, there\'s no -ya-.',
      present_long: 'Nothing after the verb? Slot in -ya-.',
      future: 'The future marker -zo- slides in after the subject.',
      past: 'The past swaps the final -a for -ile.',
      neg: 'Negatives wrap the verb: a- in front, final -a becomes -i.',
      question: 'A question is the same sentence with a rising tone — just add the ?',
    },
    whys: {
      long: 'present marker — used only when nothing follows the verb',
      fut: 'future marker',
      q: 'the words don\'t change — only the tone rises',
    },
    verbs: [
      { stem: 'sebenza', en: 'work', en3: 'works', enPast: 'worked', neg: 'sebenzi', past: 'sebenzile', objs: [{ t: 'ekhaya', en: 'at home' }, { t: 'edolobheni', en: 'in town' }] },
      { stem: 'hlala', en: 'stay', en3: 'stays', neg: 'hlali', objs: [{ t: 'ekhaya', en: 'at home' }, { t: 'edolobheni', en: 'in town' }, { t: 'phandle', en: 'outside' }] },
      { stem: 'funda', en: 'study', en3: 'studies', enPast: 'studied', neg: 'fundi', past: 'fundile', objs: [{ t: 'isiZulu', en: 'Zulu' }, { t: 'esikoleni', en: 'at school' }] },
      { stem: 'hamba', en: 'go', en3: 'goes', enPast: 'went', neg: 'hambi', past: 'hambile', objs: [] },
      { stem: 'lala', en: 'sleep', en3: 'sleeps', neg: 'lali', objs: [] },
      { stem: 'dla', en: 'eat', en3: 'eats', neg: 'dli', objs: [{ t: 'isinkwa', en: 'bread' }, { t: 'inyama', en: 'meat' }] },
      { stem: 'phuza', en: 'drink', en3: 'drinks', neg: 'phuzi', objs: [{ t: 'amanzi', en: 'water' }, { t: 'itiye', en: 'tea' }, { t: 'ikhofi', en: 'coffee' }] },
      { stem: 'pheka', en: 'cook', en3: 'cooks', neg: 'pheki', objs: [{ t: 'ukudla', en: 'food' }] },
      { stem: 'bhala', en: 'write', en3: 'writes', neg: 'bhali', objs: [{ t: 'incwadi', en: 'a letter' }] },
      { stem: 'thanda', en: 'like', en3: 'likes', neg: 'thandi', noFut: true, objs: [{ t: 'ukudla', en: 'food' }, { t: 'umculo', en: 'music' }, { t: 'itiye', en: 'tea' }] },
      { stem: 'funa', en: 'want', en3: 'wants', neg: 'funi', noFut: true, objs: [{ t: 'amanzi', en: 'water' }, { t: 'ukudla', en: 'food' }, { t: 'usizo', en: 'help' }] },
      { stem: 'thenga', en: 'buy', en3: 'buys', neg: 'thengi', objs: [{ t: 'isinkwa', en: 'bread' }, { t: 'ukudla', en: 'food' }] },
      { stem: 'khuluma', en: 'speak', en3: 'speaks', neg: 'khulumi', objs: [{ t: 'isiZulu', en: 'Zulu' }, { t: 'isiNgisi', en: 'English' }] },
      { stem: 'bona', en: 'see', en3: 'sees', neg: 'boni', objs: [{ t: 'umngane', en: 'a friend' }] },
    ],
  },
  xh: {
    name: 'isiXhosa',
    subjects: [
      { p: 'ndi', neg: 'andi', en: 'I', third: false, q: false },
      { p: 'u', neg: 'awu', en: 'you', third: false, q: true },
      { p: 'si', neg: 'asi', en: 'we', third: false, q: false },
      { p: 'ba', neg: 'aba', en: 'they', third: false, q: true },
    ],
    fut: 'za',        // ndi + za  ->  "Ndiza", then "ku" + stem as its own word
    long: 'ya',
    futSplit: true,   // future is two words: Ndiza kusebenza
    adverbs: { future: { t: 'ngomso', en: 'tomorrow' }, past: { t: 'izolo', en: 'yesterday' } },
    hints: {
      present_obj: 'With something after the verb, there\'s no -ya-.',
      present_long: 'Nothing after the verb? Slot in -ya-.',
      future: 'The future is two words: -za, then ku- + the verb.',
      past: 'The past swaps the final -a for -ile.',
      neg: 'Negatives wrap the verb: a- in front, final -a becomes -i.',
      question: 'A question is the same sentence with a rising tone — just add the ?',
    },
    whys: {
      long: 'present marker — used only when nothing follows the verb',
      fut: 'future marker — pairs with ku- on the verb',
      q: 'the words don\'t change — only the tone rises',
    },
    verbs: [
      { stem: 'sebenza', en: 'work', en3: 'works', enPast: 'worked', neg: 'sebenzi', past: 'sebenzile', objs: [{ t: 'ekhaya', en: 'at home' }, { t: 'edolophini', en: 'in town' }] },
      { stem: 'hlala', en: 'stay', en3: 'stays', neg: 'hlali', objs: [{ t: 'ekhaya', en: 'at home' }, { t: 'edolophini', en: 'in town' }] },
      { stem: 'funda', en: 'study', en3: 'studies', enPast: 'studied', neg: 'fundi', past: 'fundile', objs: [{ t: 'isiXhosa', en: 'Xhosa' }, { t: 'esikolweni', en: 'at school' }] },
      { stem: 'hamba', en: 'go', en3: 'goes', enPast: 'went', neg: 'hambi', past: 'hambile', objs: [] },
      { stem: 'lala', en: 'sleep', en3: 'sleeps', neg: 'lali', objs: [] },
      { stem: 'tya', en: 'eat', en3: 'eats', neg: 'tyi', objs: [{ t: 'isonka', en: 'bread' }, { t: 'inyama', en: 'meat' }] },
      { stem: 'sela', en: 'drink', en3: 'drinks', neg: 'seli', objs: [{ t: 'amanzi', en: 'water' }, { t: 'ikofu', en: 'coffee' }] },
      { stem: 'pheka', en: 'cook', en3: 'cooks', neg: 'pheki', objs: [{ t: 'ukutya', en: 'food' }] },
      { stem: 'bhala', en: 'write', en3: 'writes', neg: 'bhali', objs: [{ t: 'incwadi', en: 'a letter' }] },
      { stem: 'thanda', en: 'like', en3: 'likes', neg: 'thandi', noFut: true, objs: [{ t: 'ukutya', en: 'food' }, { t: 'umculo', en: 'music' }] },
      { stem: 'funa', en: 'want', en3: 'wants', neg: 'funi', noFut: true, objs: [{ t: 'amanzi', en: 'water' }, { t: 'ukutya', en: 'food' }, { t: 'uncedo', en: 'help' }] },
      { stem: 'thetha', en: 'speak', en3: 'speaks', neg: 'thethi', objs: [{ t: 'isiXhosa', en: 'Xhosa' }, { t: 'isiNgesi', en: 'English' }] },
    ],
  },
};

// Afrikaans: word-order grammar. Verbs never conjugate; the interesting parts
// are the verb-final future ("Ek gaan koffie drink"), the past with het + ge-
// ("Ek het brood gekoop"), the double negative ("Ek drink nie koffie nie"),
// and questions by inversion ("Werk jy?").
const AF = {
  name: 'Afrikaans',
  subjects: [
    { p: 'ek', en: 'I', third: false, q: false },
    { p: 'jy', en: 'you', third: false, q: true },
    { p: 'hy', en: 'he', third: true, q: true },
    { p: 'sy', en: 'she', third: true, q: true },
    { p: 'ons', en: 'we', third: false, q: false },
    { p: 'hulle', en: 'they', third: false, q: true },
  ],
  adverbs: {
    present: [{ t: 'nou', en: 'now' }, { t: 'vandag', en: 'today' }],
    future: { t: 'môre', en: 'tomorrow' },
    past: { t: 'gister', en: 'yesterday' },
  },
  hints: {
    present: 'Afrikaans verbs never change — same word for everyone.',
    future: 'After "gaan", the action verb jumps to the END.',
    past: 'The past is het + ge- verb, and the ge- verb goes LAST.',
    neg: 'Afrikaans wraps the sentence in a double "nie".',
    question: 'Questions flip the order: verb first, then the subject.',
  },
  verbs: [
    { stem: 'werk', en: 'work', en3: 'works', enPast: 'worked', ge: 'gewerk', objs: [{ t: 'by die huis', en: 'at home' }, { t: 'in die dorp', en: 'in town' }] },
    { stem: 'woon', en: 'live', en3: 'lives', enPast: 'lived', ge: 'gewoon', objs: [{ t: 'by die see', en: 'by the sea' }, { t: 'in die dorp', en: 'in town' }] },
    { stem: 'leer', en: 'learn', en3: 'learns', enPast: 'learned', ge: 'geleer', objs: [{ t: 'Afrikaans', en: 'Afrikaans' }] },
    { stem: 'lees', en: 'read', en3: 'reads', enPast: 'read', ge: 'gelees', objs: [{ t: "'n boek", en: 'a book' }] },
    { stem: 'slaap', en: 'sleep', en3: 'sleeps', enPast: 'slept', ge: 'geslaap', objs: [] },
    { stem: 'eet', en: 'eat', en3: 'eats', objs: [{ t: 'brood', en: 'bread' }, { t: 'vleis', en: 'meat' }] },
    { stem: 'drink', en: 'drink', en3: 'drinks', enPast: 'drank', ge: 'gedrink', objs: [{ t: 'koffie', en: 'coffee' }, { t: 'tee', en: 'tea' }, { t: 'water', en: 'water' }] },
    { stem: 'koop', en: 'buy', en3: 'buys', enPast: 'bought', ge: 'gekoop', objs: [{ t: 'brood', en: 'bread' }, { t: 'melk', en: 'milk' }] },
    { stem: 'praat', en: 'speak', en3: 'speaks', enPast: 'spoke', ge: 'gepraat', objs: [{ t: 'Afrikaans', en: 'Afrikaans' }, { t: 'Engels', en: 'English' }] },
    { stem: 'speel', en: 'play', en3: 'plays', enPast: 'played', ge: 'gespeel', objs: [{ t: 'sokker', en: 'soccer' }] },
    { stem: 'sien', en: 'see', en3: 'sees', enPast: 'saw', ge: 'gesien', objs: [{ t: 'die see', en: 'the sea' }] },
  ],
};

export function supportsSentences(code) { return code === 'af' || !!NGUNI[code]; }

// English rendering ---------------------------------------------------------
function enVerb(subj, verb, tense) {
  if (tense === 'future') return `will ${verb.en}`;
  if (tense === 'past') return verb.enPast || `${verb.en}ed`;
  if (tense === 'neg') return `${subj.third ? 'doesn\'t' : 'don\'t'} ${verb.en}`;
  return subj.third ? verb.en3 : verb.en;
}
function enSentence(subj, verb, tense, obj, adverb) {
  if (tense === 'question') {
    const parts = [subj.third ? 'Does' : 'Do', subj.en, verb.en];
    if (obj) parts.push(obj.en);
    if (adverb) parts.push(adverb.en);
    return `${parts.join(' ')}?`;
  }
  const parts = [subj.en, enVerb(subj, verb, tense)];
  if (obj) parts.push(obj.en);
  if (adverb) parts.push(adverb.en);
  return cap(parts.join(' '));
}

// Token helpers (role + why power the anatomy view) -------------------------
const T = (t, role, why, glue = false) => ({ t, glue, role, why });

// ---------------------------------------------------------------------------
// composeSentence: deterministic builder — the heart of the engine AND the
// Sentence Lab. Returns null when the combo isn't grammatically supported
// (e.g. Nguni past with an object, "will want", questions about "I").
// ---------------------------------------------------------------------------
export function composeSentence(code, { subj, verb, tense, obj = null, adverb = null }) {
  if (!supportsSentences(code)) return null;
  if (code === 'af') return composeAf(subj, verb, tense, obj, adverb);
  return composeNguni(code, subj, verb, tense, obj, adverb);
}

function composeNguni(code, subj, verb, tense, obj, adverb) {
  const L = NGUNI[code];
  const tokens = [];
  let pattern = tense;
  if (tense === 'future' && verb.noFut) return null;
  if (tense === 'past' && (!verb.past || obj)) return null;
  if (tense === 'question' && !subj.q) return null;
  if (obj && !verb.objs.includes(obj)) return null;
  if (adverb && obj) return null;
  if (adverb && tense !== 'future' && tense !== 'past') return null;

  if (tense === 'present' || tense === 'question') {
    if (obj) {
      pattern = tense === 'question' ? 'question' : 'present_obj';
      tokens.push(T(subj.p, 'subj', `'${subj.en}'`), T(verb.stem, 'verb', `'${verb.en}'`, true), T(obj.t, 'obj', `'${obj.en}'`));
    } else {
      pattern = tense === 'question' ? 'question' : 'present_long';
      tokens.push(T(subj.p, 'subj', `'${subj.en}'`), T(L.long, 'tense', L.whys.long, true), T(verb.stem, 'verb', `'${verb.en}'`, true));
    }
    if (tense === 'question') tokens.push(T('?', 'q', L.whys.q, true));
  } else if (tense === 'future') {
    if (L.futSplit) {
      tokens.push(T(subj.p, 'subj', `'${subj.en}'`), T(L.fut, 'tense', L.whys.fut, true), T('ku', 'tense', 'ku- links the future to the verb'), T(verb.stem, 'verb', `'${verb.en}'`, true));
    } else {
      tokens.push(T(subj.p, 'subj', `'${subj.en}'`), T(L.fut, 'tense', L.whys.fut, true), T(verb.stem, 'verb', `'${verb.en}'`, true));
    }
    if (obj) tokens.push(T(obj.t, 'obj', `'${obj.en}'`));
    if (adverb) tokens.push(T(adverb.t, 'time', `'${adverb.en}'`));
  } else if (tense === 'past') {
    tokens.push(T(subj.p, 'subj', `'${subj.en}'`), T(verb.past, 'verb', `'${verb.en}' + -ile = past`, true));
    if (adverb) tokens.push(T(adverb.t, 'time', `'${adverb.en}'`));
  } else if (tense === 'neg') {
    tokens.push(T(subj.neg, 'neg', `not + '${subj.en}' — a- wraps the front`), T(verb.neg, 'verb', `'${verb.en}' — final -a becomes -i in the negative`, true));
    if (obj) tokens.push(T(obj.t, 'obj', `'${obj.en}'`));
  } else return null;

  return finishSentence(code, L, tokens, pattern, subj, verb, tense, obj, adverb);
}

function composeAf(subj, verb, tense, obj, adverb) {
  const L = AF;
  const tokens = [];
  if (tense === 'future' && verb.noFut) return null;
  if (tense === 'past' && !verb.ge) return null;
  if (tense === 'question' && !subj.q) return null;
  if (obj && !verb.objs.includes(obj)) return null;
  if (adverb && obj) return null;
  const pushObj = (o) => o.t.split(' ').forEach((w, i) => tokens.push(T(w, 'obj', i === 0 ? `'${o.en}'` : '…')));

  if (tense === 'present') {
    tokens.push(T(subj.p, 'subj', `'${subj.en}'`), T(verb.stem, 'verb', `'${verb.en}' — same form for every subject`));
    if (obj) pushObj(obj);
    if (adverb) tokens.push(T(adverb.t, 'time', `'${adverb.en}'`));
  } else if (tense === 'question') {
    tokens.push(T(verb.stem, 'verb', `'${verb.en}' — the verb moves FIRST to ask`), T(subj.p, 'subj', `'${subj.en}'`));
    if (obj) pushObj(obj);
    if (adverb) tokens.push(T(adverb.t, 'time', `'${adverb.en}'`));
    tokens.push(T('?', 'q', 'verb before subject = a question', true));
  } else if (tense === 'future') {
    tokens.push(T(subj.p, 'subj', `'${subj.en}'`), T('gaan', 'tense', '\'going to\' — sends the action verb to the END'));
    if (obj) pushObj(obj);
    if (adverb) tokens.push(T(adverb.t, 'time', `'${adverb.en}'`));
    tokens.push(T(verb.stem, 'verb', `'${verb.en}' — waits at the end`));
  } else if (tense === 'past') {
    tokens.push(T(subj.p, 'subj', `'${subj.en}'`), T('het', 'tense', 'past helper — pairs with the ge- verb at the end'));
    if (adverb) tokens.push(T(adverb.t, 'time', `'${adverb.en}'`));
    if (obj) pushObj(obj);
    tokens.push(T(verb.ge, 'verb', `ge- + '${verb.en}' = past form, always last`));
  } else if (tense === 'neg') {
    tokens.push(T(subj.p, 'subj', `'${subj.en}'`), T(verb.stem, 'verb', `'${verb.en}'`), T('nie', 'neg', 'first \'nie\' — right after the verb'));
    if (obj) { pushObj(obj); tokens.push(T('nie', 'neg', 'second \'nie\' closes the sentence')); }
  } else return null;

  return finishSentence('af', L, tokens, tense, subj, verb, tense, obj, adverb);
}

function finishSentence(code, L, tokens, pattern, subj, verb, tense, obj, adverb) {
  const sent = {
    code, tokens, pattern,
    level: pattern === 'past' ? 3 : (pattern === 'present' || pattern === 'present_obj' || pattern === 'present_long') ? 1 : 2,
    text: assemble(tokens),
    en: enSentence(subj, verb, tense, obj, adverb),
    hint: L.hints[pattern] || L.hints[tense],
  };
  sent.distractors = makeDistractors(code, L, pattern, subj, verb);
  return sent;
}

// Distractor tiles: the classic beginner traps — but NEVER a tile that could
// build a correct alternative rendering of the same English prompt.
function makeDistractors(code, L, pattern, subj, verb) {
  const d = [];
  const nguni = code !== 'af';
  const otherSubj = pick(L.subjects.filter((s) => s !== subj));
  d.push({ t: pattern === 'neg' && nguni ? otherSubj.neg : otherSubj.p });
  if (nguni) {
    if (pattern === 'present_obj') d.push({ t: L.long, glue: true });          // tempting -ya- that doesn't belong
    else if (pattern === 'present_long') d.push({ t: L.fut, glue: true });      // wrong tense marker
    else if (pattern === 'neg') d.push({ t: verb.stem, glue: true });           // the -a form that must become -i
    else if (pattern === 'question') d.push({ t: L.fut, glue: true });
    else {
      const otherVerb = pick(L.verbs.filter((v) => v !== verb));
      d.push({ t: pattern === 'past' && otherVerb.past ? otherVerb.past : otherVerb.stem, glue: true });
    }
  } else {
    if (pattern === 'past') d.push({ t: verb.stem });        // bare stem when ge- form is needed
    // NB: never offer 'sal' — "Ek sal werk" would be a CORRECT alternative
    // future, and a trap that marks a right sentence wrong is a broken trap.
    else if (pattern === 'future') d.push({ t: verb.ge || pick(L.verbs.filter((v) => v !== verb)).stem });
    else if (pattern === 'question') d.push({ t: 'gaan' });
    else if (pattern === 'neg') d.push({ t: 'nie' });
    else d.push({ t: pick(L.verbs.filter((v) => v !== verb)).stem });
  }
  return d;
}

// ---------------------------------------------------------------------------
// Random generation (lessons / reviews / studio) — picks valid combos and
// hands them to composeSentence, so there is exactly ONE grammar authority.
// ---------------------------------------------------------------------------
function randomSentence(code, level) {
  const L = code === 'af' ? AF : NGUNI[code];
  const nguni = code !== 'af';
  const pool = level >= 3 ? ['present', 'future', 'neg', 'question', 'past']
    : level >= 2 ? ['present', 'future', 'neg', 'question']
      : ['present'];
  const tense = pick(pool);
  let subj = pick(L.subjects);
  if (tense === 'question') {
    const qs = L.subjects.filter((s) => s.q);
    if (!qs.length) return null;
    subj = pick(qs);
  }
  let verb = pick(L.verbs);
  if (tense === 'future' && verb.noFut) verb = pick(L.verbs.filter((v) => !v.noFut));
  if (tense === 'past') {
    const ok = L.verbs.filter((v) => (nguni ? v.past : v.ge));
    if (!ok.length) return null;
    verb = pick(ok);
  }
  let obj = null; let adverb = null;
  const objAllowed = verb.objs.length && !(nguni && tense === 'past');
  if (objAllowed && Math.random() < (tense === 'present' ? 0.65 : 0.5)) obj = pick(verb.objs);
  if (!obj) {
    if (tense === 'future' && Math.random() < 0.5) adverb = L.adverbs.future;
    else if (tense === 'past' && Math.random() < 0.6) adverb = L.adverbs.past;
    else if (!nguni && tense === 'present' && Math.random() < 0.4) adverb = pick(L.adverbs.present);
  }
  return composeSentence(code, { subj, verb, tense, obj, adverb });
}

// Public API ----------------------------------------------------------------

// Expose the menu data the Sentence Lab needs (read-only).
export function langMeta(code) {
  if (!supportsSentences(code)) return null;
  const L = code === 'af' ? AF : NGUNI[code];
  return { name: L.name, subjects: L.subjects, verbs: L.verbs, nguni: code !== 'af' };
}

// Generate n unique novel sentences for a language at (up to) the given level:
// level 1 = present, 2 = + future/negatives/questions, 3 = + past.
export function generateSentences(code, n = 8, level = 1) {
  if (!supportsSentences(code)) return [];
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < n && guard < n * 40) {
    guard += 1;
    const s = randomSentence(code, level);
    if (!s || seen.has(s.text)) continue;
    seen.add(s.text);
    out.push(s);
  }
  return out;
}

// Turn a generated sentence into a 'build' exercise: tiles = target tokens +
// distractors, shuffled. Distractors that duplicate a needed tile are dropped.
// `anatomy` carries the role/why breakdown for the post-answer explanation.
export function buildExercise(sent) {
  const needed = new Set(sent.tokens.map((t) => t.t.toLowerCase()));
  const extras = (sent.distractors || []).filter((d) => !needed.has(d.t.toLowerCase()));
  return {
    type: 'build',
    prompt: sent.en,
    answer: sent.text,
    meaning: sent.en,
    hint: sent.hint,
    anatomy: sent.tokens,
    tiles: shuffle([...sent.tokens.map((t) => ({ t: t.t, glue: !!t.glue })), ...extras.map((d) => ({ t: d.t, glue: !!d.glue }))]),
    pattern: sent.pattern,
  };
}
