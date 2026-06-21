# 🇿🇦 MzansiLingo

**Learn real South African languages for real conversations — offline, with proof that you're actually learning.**

MzansiLingo is an offline-first, installable web app (PWA) for learning South
African languages. It's built for **classrooms and school kids**, so the two
things that matter most are:

1. **It works offline.** After the first load, the whole app — lessons,
   audio prompts, progress — works with no internet and no data cost.
2. **It produces real, measurable learning.** Unlike apps that reward taps,
   MzansiLingo is built on **spaced repetition** and **mastery gating**, so
   words are reviewed exactly when they're about to be forgotten and only
   count as "learned" once you can *produce* them, not just recognise them.

## Languages

**Available now (MVP):** isiZulu, isiXhosa, Afrikaans
**Coming soon:** Sesotho, Setswana, Sepedi, Tshivenda, Xitsonga, isiNdebele, siSwati

The Zulu course ships with 10 lessons across two units; Xhosa and Afrikaans
ship with 6 beginner lessons each. All content is real, culturally grounded
vocabulary with phonetics and cultural notes (respect terms, taxi phrases,
click sounds, formal vs casual speech).

## Why this isn't "just Duolingo for SA"

This is the core of the project. See **[docs/PEDAGOGY.md](docs/PEDAGOGY.md)**
for the full explanation. In short:

| Proven method | How MzansiLingo uses it |
|---|---|
| **Spaced repetition (SM-2)** | Every word is scheduled for review at the moment you're about to forget it (`src/srs.js`). |
| **Active recall / production** | Recognition (multiple choice) is the *weakest* signal. A word only becomes **mastered** once you've typed or spoken it correctly *and* it survived a spaced review. |
| **Mastery-based progress** | The Progress page reports **words mastered**, **retention %**, and **still learning** — honest learning metrics, not just XP. |
| **Measured outcomes** | A **baseline test** records where you start. After ~1 month of daily practice, a **re-test** shows your exact improvement. This is the "real progress in 1 month" proof. |
| **Engagement that serves learning** | XP, streaks, hearts and a daily goal keep kids coming back — but they're wrapped around the spaced-repetition core, not a substitute for it. |

## Features

- 📚 Daily lessons with a unit-based lesson path
- 🔁 Spaced-repetition **Review** sessions driven by what's actually due
- 🗣️ Speaking practice (speech recognition where available, phonetics always)
- 🎧 Listening practice (text-to-speech where available)
- ✍️ Translation, multiple choice, match-the-pairs, fill-in-the-blank
- 🏫 Cultural notes in every lesson
- 🔥 XP, day streaks, hearts/lives, daily goal ring
- 📊 Progress dashboard with real retention metrics + baseline/re-test
- 💳 Premium tier (demo): all languages, unlimited hearts, no ads
- 📶 **Full offline use** via service worker — install to home screen

## Run it

It's a static PWA — no build step. Serve the folder over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Open it on a phone, then "Add to Home Screen" to install it. After the first
load it works offline. (A plain `file://` open won't work because the app uses
ES modules and `fetch` for lesson data — use a local server.)

## Tests

Pure-logic tests (SRS engine, answer checking, content integrity) and a
browser smoke test are described in [docs/TESTING.md](docs/TESTING.md). The
content-integrity test checks that every exercise answer is reachable and
every vocabulary reference resolves — run it after editing any course file.

## Project structure

```
index.html              App shell
manifest.webmanifest    PWA manifest (installable)
sw.js                   Service worker (offline caching)
styles/main.css         Mobile-first styles
src/
  app.js                Screens, routing, exercise rendering
  store.js              Progress, hearts, XP, streaks (localStorage)
  srs.js                Spaced-repetition engine (SM-2 + learning steps)
  lessons.js            Course loading, grading, session building
  audio.js              TTS (listening) + speech recognition (speaking)
data/
  languages.json        Language catalogue
  courses/{zu,xh,af}.json   Course content
docs/
  PEDAGOGY.md           The learning science behind the app
  CONTENT_GUIDE.md      How to add lessons/languages
  TESTING.md            How to run the tests
```

## Adding content

Courses are plain JSON. To add a lesson or a language, follow
[docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md). No code changes are needed for
new lessons — just edit the JSON and add the file to the service-worker cache
list in `sw.js`.

## Roadmap

- Recorded native-speaker audio (current audio uses on-device TTS where
  available, with phonetics as the reliable offline fallback)
- Units 3+: "Real South Africa" packs (taxi, shop, workplace, church, dating)
- Teacher dashboard: per-class progress and printable reports
- The remaining six official languages
- Cloud sync (optional) so progress follows a learner across devices
