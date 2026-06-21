# Content guide — adding lessons and languages

All learning content lives in `data/` as plain JSON. You do **not** need to
touch the app code to add lessons. After editing, run the content-integrity
test (see `docs/TESTING.md`) to catch mistakes.

## Course file shape

`data/courses/<code>.json`:

```jsonc
{
  "code": "zu",
  "name": "isiZulu",
  "englishName": "Zulu",
  "units": [
    {
      "id": "zu-u1",
      "title": "Unit 1: Basics",
      "level": "Beginner",            // one of the progress levels
      "lessons": [ /* lesson objects */ ]
    }
  ]
}
```

## Lesson shape

```jsonc
{
  "id": "zu-u1-l1",                   // globally unique
  "title": "Greetings",
  "culturalNote": "Short paragraph shown in the lesson.",
  "vocab": [
    {
      "id": "zu-sawubona",            // unique; referenced by exercises & SRS
      "term": "Sawubona",            // the target-language word
      "translation": "Hello",        // English meaning
      "phonetic": "sah-woo-BOH-nah", // always provide — the offline fallback
      "note": "to one person"        // optional usage note
    }
  ],
  "exercises": [ /* exercise objects, in teaching order */ ]
}
```

**You mostly only need to add vocab.** Lesson sessions are **generated** from
the `vocab` list (`buildLessonSession` in `src/lessons.js`): every word is
automatically quizzed with a *recognition* exposure (match / multiple choice)
and a later *production* exposure (translate), with randomised types, question
direction, distractors and order — so lessons cover everything, repeat each
word, and don't feel scripted. Add a word to `vocab` and it's taught.

The `exercises` array is now **optional flavour**. Only `fill_blank` items are
used (1–2 are mixed in per session for sentence context); authored `match` /
`multiple_choice` / `translate` items are ignored because generation covers
them. `listen` / `speak` are never used pending recorded audio. You can still
author `fill_blank` items for cultural sentences — see below.

## Exercise types

```jsonc
// Match the pairs (recognition)
{ "type": "match",
  "pairs": [["Sawubona", "Hello"], ["Unjani?", "How are you?"]] }

// Multiple choice (recognition) — answer MUST be one of options
{ "type": "multiple_choice", "prompt": "\"Sawubona\" means:",
  "answer": "Hello", "options": ["Goodbye","Hello","Thank you","Please"],
  "vocabId": "zu-sawubona" }

// Translate (production) — accept lists alternative correct answers
{ "type": "translate", "prompt": "I am well",
  "answer": "Ngiyaphila", "accept": ["ngiyaphila"], "vocabId": "zu-ngiyaphila" }

// Fill in the missing word (production) — answer MUST be one of options
{ "type": "fill_blank", "sentence": "____, unjani?", "answer": "Sawubona",
  "options": ["Sawubona","Cha","Ngiyabonga","Wena"],
  "meaning": "Hello, how are you?", "vocabId": "zu-sawubona" }

// Listen and choose (recognition) — needs TTS; answer MUST be one of options
{ "type": "listen", "prompt": "Tap what you hear", "answer": "Ngiyaphila",
  "options": ["Ngiyaphila","Sawubona","Unjani","Wena"],
  "lang": "zu", "vocabId": "zu-ngiyaphila" }

// Speaking practice (production, never costs a heart)
{ "type": "speak", "text": "Ngiyaphila, wena?",
  "meaning": "I am well, and you?", "lang": "zu" }
```

### Rules the integrity test enforces

- Every `vocabId` on an exercise must exist in that course's vocab.
- For `multiple_choice`, `fill_blank`, `listen`: `answer` must appear in
  `options`, and options must be unique.
- `translate` needs both `prompt` and `answer`.
- `match` needs at least 3 pairs.
- Every lesson must have at least one vocab item.

## Reading passages

A course may include a top-level `reading` array (sibling of `units`). Each
passage is graded text plus comprehension questions:

```jsonc
"reading": [
  {
    "id": "zu-r1",                  // globally unique
    "title": "Sawubona, Thabo!",
    "level": "Beginner",
    "intro": "A short greeting between two friends.",
    "lines": [
      { "t": "Sawubona, igama lami nguThabo.", "en": "Hello, my name is Thabo." }
    ],
    "questions": [
      // same exercise objects as lessons; multiple_choice / translate / fill_blank
      { "type": "multiple_choice", "prompt": "What is the boy's name?",
        "answer": "Thabo", "options": ["Thabo","Nandi","Sipho","Mama"] }
    ]
  }
]
```

Guidelines: keep lines short and reuse vocabulary the learner has already met;
questions can carry a `vocabId` to feed the spaced-repetition engine. The
integrity test checks that each passage has lines (`t` + `en`) and at least one
answerable question. A passage automatically powers the "Read a story" quest
and the reading badges — no code changes needed.

## Adding a whole new language

1. Add an entry to `data/languages.json` (`code`, `name`, `englishName`,
   `ttsLocale`, etc.). Move it out of `comingSoon`.
2. Create `data/courses/<code>.json` following the shapes above.
3. Add the new course file path to the `ASSETS` list in `sw.js` and bump the
   `CACHE` version (e.g. `mzansilingo-v2`) so offline users get it.
4. Run the integrity test.

## After any content change

Bump the `CACHE` constant in `sw.js` whenever you change cached files, so
returning offline users receive the update instead of the stale cache.
