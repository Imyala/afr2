# 🇿🇦 MzansiLingo

**Learn real South African languages for real conversations — offline, with proof that you're actually learning.**

🌐 **Live (GitHub Pages):** https://imyala.github.io/afr2/

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

The Zulu course ships with ~218 words, Xhosa ~187, and Afrikaans ~236 — real,
culturally grounded vocabulary with phonetics and cultural notes (greetings,
respect terms, taxi phrases, click sounds, days, colours, feelings, body,
animals, health, time, jobs, school, verbs, home, clothing, nature, question
words, food, kitchen, numbers, transport, family, sport, connectors, helpful
phrases). Vocabulary grows toward a ~1,000-word core via a native-reviewed
content pipeline — see **[docs/CONTENT_PIPELINE.md](docs/CONTENT_PIPELINE.md)**.

## Why this isn't "just Duolingo for SA"

This is the core of the project. See **[docs/PEDAGOGY.md](docs/PEDAGOGY.md)**
for the full explanation. In short:

| Proven method | How MzansiLingo uses it |
|---|---|
| **Spaced repetition (FSRS-style)** | Every word *and phrase chunk* is scheduled for review at the moment you're about to forget it, targeting your desired retention (`src/srs.js`). |
| **Generated, interleaved practice** | Sessions are generated from the vocab (`buildLessonSession`): every word is quizzed with a recognition *and* a spaced production exposure, plus a short cross-lesson review warm-up. Types/order/distractors are randomised so it reinforces without feeling scripted. |
| **Active recall / production** | Recognition (multiple choice, fill-in-the-blank, match) is the *weakest* signal. A word only becomes **mastered** once you've produced it from memory *and* it survived a spaced review. Match grades per pair; a mixed-up pair counts as a miss. |
| **Comprehensible input** | Stories show **how many of their words you already know** and the library recommends the best fit — ~90%+ known is where reading teaches. Words met in input enter the schedule *without* being counted as recalls. |
| **Chunks, not words** | Phrase chunks are spaced items of their own, reviewed as whole sentences; the grammar engine generates frame drills (subject prefix + stem) fresh each session from real course verbs. |
| **Interaction + corrective feedback** | Branching dialogues where every wrong reply explains *why* it doesn't work — the largest effect sizes in SLA research. |
| **Fluency under time pressure** | The ⚡ Lightning round drills fast recall of words you already know against the clock — the step from "knowing" a word to using it mid-conversation. |
| **Inquiry-based, higher-order pattern learning** | The first time you open a grammar pattern, **"Spot the pattern"** shows three worked examples and asks you to predict a fourth *before* the rule is revealed — noticing a relationship yourself, not being handed it. |
| **Feynman technique (teach it back)** | Once a word is mastered, review occasionally asks you to **"Teach Themba"** — explain the word in your own words, then self-rate honestly. Deeper than recall or typing; never costs a heart. |
| **Mastery-based progress** | The Progress page reports **words mastered**, **retention %**, and **still learning** — honest learning metrics, not just XP. |
| **Measured outcomes** | A **baseline test** records where you start. After ~1 month of daily practice, a **re-test** shows your exact improvement. This is the "real progress in 1 month" proof. |
| **Engagement that serves learning** | XP, streaks, hearts and a daily goal keep kids coming back — but they're wrapped around the spaced-repetition core, not a substitute for it. |

## Features

**Learning**
- 📅 **Guided 90-day plan** — a structured daily loop that interleaves the
  research-backed sequence (warm-up **review** → new **lesson** → **input**:
  read/listen → **output**: speak/converse) and tracks your journey to
  conversational level over ~3 months
- 📚 Daily lessons with a unit-based lesson path
- 🔁 Spaced-repetition **Review** sessions driven by what's actually due
- 📖 **Reading exercises** — graded stories with comprehension questions, each
  labelled with **how many of its words you already know** (comprehensible
  input: ~90%+ known is the sweet spot) and a "best fit" recommendation
- ✍️ Translation, multiple choice, match-the-pairs, fill-in-the-blank, plus
  three **sentence-level** exercises — "build the sentence" (word bank),
  "what does it mean?" (sentence comprehension), and sentence fill-in-the-blank
- 🧱 **Phrase chunks as first-class cards** — authored phrases are spaced items
  of their own, reviewed as whole sentences (build it, type it, or pick its
  meaning), because fluent speech is retrieved in multi-word chunks
- 🙂 **Typo-tolerant typed answers** — a near-miss is accepted with a gentle
  spelling nudge instead of costing a heart (short minimal pairs stay strict)
- 🧩 **Grammar / pattern engine** — short "tip" cards teach the *system*, and
  frame patterns **generate fresh drills every session** from real course verbs
  (ngi-/u-/si-/ba- + stem for isiZulu/isiXhosa; pronoun + invariant verb for
  Afrikaans) — whole chunks, drilled as units. Patterns are spaced like
  vocabulary. (Community-reviewed content.)
- 🔍 **"Spot the pattern"** — the first time you open a grammar pattern, three
  worked examples are shown and you predict a fourth *before* the rule is
  revealed — inquiry-based, higher-order learning (notice the relationship,
  don't just be told it)
- 🦫 **"Teach Themba" (Feynman technique)** — once a word is mastered, review
  occasionally asks you to explain it in your own words, then self-rate
  honestly — a deeper check than recall or typing, never costs a heart
- 💬 **Task-based conversations** — branching real-life dialogues (spaza shop,
  meeting a friend) where the other person speaks and you choose how to reply.
  Wrong replies get **corrective feedback explaining why**, and different valid
  replies can genuinely branch the conversation. Feeds the review schedule.
- 🎤 **Speaking** — recall-first, sentence-first spoken production: see the
  English, say it aloud, reveal the model (record & compare optional), then
  self-rate honestly ("not quite" counts as a lapse)
- 👂 **Listening** — audio-first comprehension practice
- ⚡ **Lightning round** — 60 seconds of rapid recall over words you already
  know: fluency practice under time pressure, the bridge from "knowing" a word
  to using it mid-conversation
- 📒 **Searchable glossary** — browse every word with phonetics and mastery
  status, see your **toughest words**, and one-tap practise them
- 🔤 **Phonetics on every word** so pronunciation is learnable offline
- 🏫 Cultural notes in every lesson
- ⏭️ **Test out** of any unit you already know — score 80%+ on a quick quiz
  and the whole unit is marked done, so no time is wasted on known material
- 📊 Progress dashboard with real retention metrics + baseline/re-test

> **Audio status:** dedicated *listening* and *speaking* exercises are
> temporarily disabled. On-device text-to-speech / speech-recognition for
> Zulu/Xhosa/Afrikaans is unreliable or absent, which left learners with no way
> to know the answer. Optional "tap to hear" remains where the text is on screen
> (stories, Word of the Day). Recorded native-speaker audio is the planned fix —
> see the roadmap.

**Engagement / retention** (gets kids back daily — see [docs/ENGAGEMENT.md](docs/ENGAGEMENT.md))
- 🦫 **Themba the meerkat** — a friendly SVG mascot who reacts to your answers, cheers your wins and greets you each day
- ✨ **Juicy feedback** — generated sound effects, confetti, count-up score animations and haptic buzzes (all offline, zero asset downloads)
- 👋 **Warm onboarding** — a short welcome and a guaranteed "you just learned 3 words" first win before any commitment
- 🔔 **Daily streak reminders** — opt-in local notifications (via periodic background sync on installed PWAs) so learners come back
- 🔥 Day streaks with ❄️ **streak freezes** to protect them
- 🎯 **Daily quests** with 💎 gem rewards
- 🏅 **Achievement badges** (12 milestones)
- 🏆 **Living weekly leaderboard** — a cohort of 15 with named rivals whose XP climbs through the week; top 5 promote, bottom 5 demote (Bronze → Diamond). Fully offline and deterministic, so the race feels alive with no server.
- 🎁 **Daily login reward** that grows with consecutive days
- 🗓️ **Word of the Day** (Pod101-inspired) — one tap to add it to your reviews
- 🛒 **Rewards shop**: spend earned gems on power-ups (⚡ Double XP, ❄️ Streak Freeze, ❤️ Heart Refill) and cosmetics (🐾 SA-animal buddies, 🎨 colour themes)

**Platform**
- 🔐 **Accounts (demo)** — create an account or log in to save progress, or
  **"try without an account"** as a guest. Client-side only (no server):
  credentials live in the browser, passwords are hashed, and each account maps
  to its own progress profile. A demonstration of the sign-up/login/guest flow.
- 🛡️ **Breached-password check** — sign-up rejects passwords found in the
  [Have I Been Pwned](https://haveibeenpwned.com/) database using **k-anonymity**
  (only the first 5 chars of the password's SHA-1 hash are sent; it never leaves
  the device), and skips gracefully when offline.
- 📶 **Full offline use** via service worker — install to home screen
- ♿ **Accessibility** — screen-reader announcements for screen changes and
  answer feedback (ARIA live region), focus moved to each screen's heading,
  keyboard-operable controls with labels, and visible focus rings
- 👥 **Multiple learner profiles** — a shared classroom tablet can hold many
  learners, each with their own streak, words and progress (no accounts needed)
- ⚙️ **Settings** — toggle sound, daily reminders and your daily XP goal
- 💳 Premium tier (demo): all languages, unlimited hearts, no ads
- 📚 In-app **Library** linking to free, openly-licensed book collections (see below)

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
  app.js                Screens, routing, exercise rendering, onboarding
  store.js              Progress, hearts, XP, streaks (localStorage)
  srs.js                Spaced-repetition engine (FSRS-style + learning steps)
  lessons.js            Course loading, grading, session building
  audio.js              TTS (listening) + speech recognition (speaking)
  fx.js                 Sound (Web Audio), haptics, confetti, count-up — no assets
  mascot.js             Themba, the inline-SVG brand mascot + reactions
  notify.js             Opt-in daily streak reminders (offline, no server)
data/
  languages.json        Language catalogue
  courses/{zu,xh,af}.json   Course content
docs/
  PEDAGOGY.md           The learning science behind the app
  CONTENT_GUIDE.md      How to add lessons/languages
  TESTING.md            How to run the tests
```

## Reading & free book libraries

MzansiLingo ships **original graded reading passages** (no licensing concerns,
and they reuse taught vocabulary so they feed the spaced-repetition engine).
The in-app **Library** also links to large collections of **free, openly
Creative-Commons-licensed** children's books in SA languages, credited in
`data/library.json`:

- [African Storybook](https://www.africanstorybook.org/) (Saide) — CC BY / CC BY-NC
- [Book Dash](https://bookdash.org/books/) — CC BY 4.0, ~500 SA-language titles
- [Nal'ibali](https://nalibali.org/) — national reading-for-enjoyment campaign
- [Global Digital Library](https://digitallibrary.io/) — open early-grade readers

Because these are CC BY, specific titles can later be **bundled into the app
for offline reading with attribution** — a roadmap item.

## Adding content

Courses are plain JSON. To add a lesson, reading passage, or a language, follow
[docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md). No code changes are needed for
new content — just edit the JSON and add the file to the service-worker cache
list in `sw.js`.

## Roadmap

- Recorded native-speaker audio (current audio uses on-device TTS where
  available, with phonetics as the reliable offline fallback)
- Units 3+: "Real South Africa" packs (taxi, shop, workplace, church, dating)
- Teacher dashboard: per-class progress and printable reports
- The remaining six official languages
- Cloud sync (optional) so progress follows a learner across devices
