# Content pipeline — adding vocabulary at scale

The app's engines (lessons, spaced repetition, glossary, exercises, grammar,
dialogues, the 90-day plan) are all **data-driven**. Growing a course toward a
full ~1,000-word core is therefore a *content* task, not an engineering one —
and this pipeline makes it a one-file job for a native speaker or reviewer.

> **Why this matters:** isiZulu and isiXhosa have noun-class systems where a
> wrong prefix makes a word incorrect. Vocabulary must be **native-reviewed** —
> shipping wrong words teaches learners errors. This pipeline exists so a
> reviewer only edits a plain wordlist and never touches code.

## 1. Write a wordlist

Create a file under `content/wordlists/`, e.g. `content/wordlists/zu-food.json`:

```json
{
  "code": "zu",
  "units": [
    {
      "title": "Unit 10: At the Market",
      "level": "Travel",
      "lessons": [
        {
          "title": "Fruit & veg",
          "note": "Optional cultural note shown in the lesson.",
          "vocab": [
            ["ibhanana", "banana", "ee-BAH-nah-nah"],
            ["iklabishi", "cabbage", "ee-klah-BEE-shee", "optional per-word note"]
          ]
        }
      ]
    }
  ]
}
```

Each vocab row is `[term, translation, phonetic]` with an optional 4th `note`.
Rules the reviewer should follow:

- **Phonetics are required** (offline pronunciation fallback).
- **≥ 4 words per lesson** (the exercise generator needs distractors).
- Keep translations **distinct within a lesson** (they become answer options).
- Order lessons/units by **frequency** where possible — teach the most common
  words first for the fastest comprehension gains.

## 2. Build

```bash
python3 tools/build_content.py content/wordlists/zu-food.json   # one file
python3 tools/build_content.py --all                            # every wordlist
```

The tool:
- assigns stable ids (`zu-<slug>`, de-duplicated against the whole course),
- numbers the new unit(s) after the existing ones,
- **generates the exercises** (match + two multiple-choice + a typed production)
  in the exact shape the app and tests expect,
- validates (unique ids, every MC answer reachable in its options),
- appends the units to `data/courses/<code>.json`.

It is **idempotent** — a unit whose title already exists is skipped, so you can
extend a wordlist and re-run safely.

## 3. Verify

```bash
node tests/run.mjs      # content-integrity + generation tests must stay green
```

The integrity suite checks every new word has phonetics, every exercise answer
is reachable, ids are unique, and generated sessions quiz every word with
recognition-before-production across 25 randomised runs.

Then bump the service-worker cache version in `sw.js` (e.g. `v15` → `v16`) so
returning learners get the new content offline.

## Toward 1,000 words per language

- **Source a frequency list.** Public corpora / academic frequency lists exist
  for isiZulu and isiXhosa — start from the most frequent ~1,000 lemmas so the
  vocabulary earns its keep.
- **Native review every batch** before it ships.
- **Sentences too:** add example sentences per lesson via the `phrases` field
  (see `data/courses/*.json`) — they power the build-the-sentence, sentence-
  meaning, and sentence fill-in-the-blank exercises. Reuse already-taught words.
- Everything else (scheduling, glossary, the 90-day plan, speaking/listening
  practice) picks up new content automatically.
