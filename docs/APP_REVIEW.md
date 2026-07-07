# MzansiLingo — Product & Design Review

*A full review of the app as it stands, compared against the major language-learning
apps (Duolingo, Babbel, Memrise, Pod101-style) and the flashcard/study apps (Anki,
Quizlet), with a prioritized plan for (a) making it genuinely teach a language and
(b) making the appearance friendly, soft, calm, and easy to read.*

*Reviewed from source (all `file:line` references are real), the docs, and live
walkthrough screenshots of the running app — auth, onboarding, first-win, home,
lessons, feedback, stories, shop, league, badges, and progress screens.*

---

## 1. Verdict

**The learning engine is the real thing — better-founded than most commercial apps.
The two things holding it back from "amazing" are (1) sound and (2) sentences.**
The pedagogy (FSRS-style spaced repetition, production-gated mastery, comprehensible-
input stories, honest metrics) is exactly right and is genuinely enforced in code,
not just claimed. But today a learner can finish the whole course having almost never
*heard* isiZulu spoken (no recorded audio; device TTS for zu/xh rarely exists) and
having mostly practised *single words* (dialogues, stories, and grammar are 1–3 items
per language against 200+ words). Those are the gaps between "an excellent vocabulary
trainer" and "an app that teaches you a language."

On appearance: the foundation is good (light palette, dark mode, mascots, reduced-
motion support), but the current surface reads **bright, chunky, and busy** rather
than soft and calm — hard "toy-button" shadows, six saturated accent colors, tight
negative letter-spacing, lots of 10–13px text, and a few outright contrast failures
(gold text on white). All fixable with a focused design-token pass; a concrete spec
is in §7.

### Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Learning science / SRS engine | ★★★★★ | FSRS-style, production-gated mastery, honest grading — best-in-class design |
| Vocabulary training | ★★★★☆ | Strong; needs per-word example sentences and audio |
| Listening & speaking | ★☆☆☆☆ | No recorded audio; TTS mostly unavailable for zu/xh; ASR code exists but unused |
| Grammar & sentences | ★★☆☆☆ | Great generative frame-drill idea, but only 2 patterns per language |
| Comprehensible input (stories/dialogues) | ★★☆☆☆ | Excellent mechanism (coverage %), far too little content (2–3 stories, 1–2 dialogues) |
| Engagement layer | ★★★★☆ | Complete Duolingo-grade loop, all offline — impressive |
| Honest progress measurement | ★★★★☆ | Mastery metric is honest; baseline test and test-out are recognition-only (see §6.5) |
| Offline / classroom fit | ★★★★★ | True offline PWA, no data cost, installable — a genuine moat |
| Visual design: friendly | ★★★★☆ | Mascot cast, warm lines ("Sharp sharp!", "Yebo!") land well |
| Visual design: soft & calm | ★★☆☆☆ | Chunky hard shadows, saturated multi-accent palette, cramped details |
| Readability | ★★☆☆☆ | Gold-on-white failures, 10–13px muted text, px-only sizing, no font scaling |

---

## 2. What the app already does better than the big apps

These are the differentiators to protect and market — several beat Duolingo, Anki,
and Quizlet at their own game:

1. **Production-gated mastery** (`src/srs.js:153`). A word only counts as "mastered"
   after ≥2 correct *typed* recalls **and** surviving a 7+ day interval. Duolingo and
   Quizlet will happily mark words "learned" from multiple-choice taps. Even the
   fill-in-the-blank honesty (`src/srs.js:44` — deliberately *not* counted as
   production because it renders as pick-from-options) is a level of intellectual
   honesty none of the competitors have.
2. **A real FSRS-style scheduler** (`src/srs.js`) — target-retention scheduling with
   stability/difficulty, desirable-difficulty overdue bonus, learning steps. This is
   Anki-grade scheduling inside a kid-friendly app. Duolingo's spaced repetition is
   opaque and subordinated to its lesson path; Quizlet barely has one.
3. **Honest input handling**: words met in stories/dialogues/Word-of-the-Day enter
   the schedule as *encountered*, due immediately, but never counted as a correct
   recall (`src/store.js:275`). That's textbook-correct and rare.
4. **Comprehensible-input coverage %** on every story (`src/lessons.js:75`,
   `src/app.js:2123`): "17% known · tough for now", best-fit recommendation, ~90%+
   sweet-spot guidance. LingQ does this; Duolingo doesn't surface it this clearly.
5. **Generated grammar frame drills** (`src/lessons.js:294-320`): ngi-/u-/si-/ba- +
   real course verb stems, fresh each session. Generative drills from data — this is
   a scalable mechanism most apps don't have.
6. **Match graded per pair** (`src/app.js:1532-1537`): mixed-up pairs are recorded as
   misses even though the exercise lets you finish. Duolingo's match gives full credit.
7. **Fully offline, including the whole engagement economy** — quests, leagues,
   shop, streak freezes, daily rewards, all with zero server (`src/gamify.js`). For
   the SA classroom/no-data context this is a moat no major competitor addresses.
8. **Baseline → 1-month re-test** (`src/app.js:1382,1835-1862`): a measured
   before/after artefact for teachers. No mainstream app offers this.
9. **Typo tolerance done right** (`src/lessons.js:98-131`): bounded edit distance by
   word length, accepted-with-a-spelling-nudge, no heart lost — kind *and* honest.
10. **Underserved languages.** isiZulu and isiXhosa are not on Duolingo/Babbel/
    Memrise in any serious form. This is a category-defining position, not a clone.

---

## 3. Comparison — language-learning apps

### vs Duolingo

| | Duolingo | MzansiLingo today |
|---|---|---|
| Audio | Recorded/neural TTS on every sentence; listening exercises throughout | **None recorded; device TTS usually missing for zu/xh** (`src/audio.js:54-64` falls back to an *English* voice); listening/speaking exercise types authored but filtered out of lessons (`src/lessons.js:341`) |
| Sentences | Sentence-based from day 1 (translate, word bank, listen-and-type) | Mostly single words; word-bank/fill-blank exist but phrase pool is thin (10–24 phrases per language vs 200+ words) |
| Speaking | ASR-graded "say this sentence" | Record-and-compare shadowing + honest self-rating; ASR helpers implemented but never called (`src/audio.js:84-110`) |
| SRS honesty | Opaque, engagement-first | **Better** — transparent, production-gated |
| Stories | Hundreds, voiced | 2–3 per language, unvoiced |
| Engagement loop | Streaks, hearts, leagues, quests, shop | Feature-complete equivalent, fully offline |
| Progress truth | XP/crowns (time-spent proxies) | **Better** — words mastered, retention %, baseline→re-test |
| Design | Bright, bouncy, big type, heavily illustrated, very consistent design system | Same genre but less consistent; smaller type; harsher shadows; mixed mascot styles |

**Takeaway:** MzansiLingo already out-teaches Duolingo *per exercise*. Duolingo
out-teaches MzansiLingo *per hour* because every minute is soaked in audio and full
sentences. Closing the audio + sentence gap flips this comparison decisively.

### vs Babbel

Babbel's core is **dialogue-first lessons with explicit grammar explanations** and
recorded native audio, aimed at adults. MzansiLingo's dialogue engine
(`src/app.js:1176-1308`) is actually *better designed* — genuinely branching, with
authored "why that's wrong" corrective feedback (`why` fields), which SLA research
says has the largest effect sizes (docs/PEDAGOGY.md §5.4). But Babbel ships ~10–15
dialogues *per unit*; MzansiLingo ships **1–2 per language**. The engine is built;
it's starved of content. Same story for grammar: the tips + frames mechanism is good,
but 2 patterns per language vs Babbel's full curriculum.

### vs Memrise / Pod101

Memrise's differentiator is **native-speaker video clips** — faces, mouths, real
voices. Pod101's is a huge **audio dialogue library** (already analyzed in
docs/COMPETITOR_NOTES.md). Both compete on *authentic audio exposure*, which is
MzansiLingo's weakest axis. The COMPETITOR_NOTES roadmap items (audio review track,
topical decks) are right; recorded audio is the prerequisite for all of them.

---

## 4. Comparison — Anki and Quizlet

### vs Anki

| | Anki | MzansiLingo |
|---|---|---|
| Scheduler | FSRS (state of the art, tunable) | FSRS-inspired simplification — same core ideas (stability, difficulty, target retention, `src/srs.js`) |
| Content | None — bring your own decks | Curated, native-reviewed course with phonetics and cultural notes |
| Exercise variety | Flashcard self-rating only | MC, match, typed production, word bank, fill-blank, dialogues, stories, blitz |
| Grading honesty | Self-rated (users lie to themselves) | **Objectively graded** — arguably more honest than Anki in practice |
| Media | Audio/images on cards (user-supplied) | None yet |
| UX | Notoriously utilitarian; brutal for kids | Friendly, gamified, kid-appropriate |
| Stats | Deep (retention graphs, forecast) | Honest but shallow — no review forecast, no per-day workload view |

**Takeaway:** MzansiLingo is essentially "Anki's scheduler with objective grading,
curated content, and a game around it" — a stronger product for the target user.
Two things worth borrowing from Anki: **a review forecast** ("tomorrow: 12 words,
Thursday: 30") so learners/teachers can see the workload coming, and **per-item
audio on the card**.

### vs Quizlet

Quizlet's strengths are friendly clean UI, user-generated sets, and multiple study
modes. Its weakness is that its modes are recognition-heavy and its "mastery" is
shallow. MzansiLingo beats it on learning science across the board. Worth borrowing:
1. **Clean, calm visual language** — Quizlet is the best reference among these apps
   for the "soft, easy to read" goal (generous white space, one accent color, large
   type, soft shadows).
2. **Teacher-created sets / class features** — Quizlet lives in classrooms because
   teachers can make and assign content. The content pipeline
   (docs/CONTENT_PIPELINE.md) plus the teacher-dashboard proposal are the right
   ingredients; a lightweight "teacher makes a wordlist, class studies it" flow
   would displace Quizlet in SA classrooms specifically.

---

## 5. Does it really teach a language? — gap analysis

Ordered by impact on the "really teaches you" promise.

### 5.1 Audio is the #1 gap (blocking)

A language is a *sound system* first — especially isiZulu/isiXhosa with clicks,
tone, and prosody that phonetics like "sah-woo-BOH-nah" can only approximate.
Today:

- There is **no recorded audio at all**; course JSON has no audio fields.
- Playback is device TTS (`src/audio.js:67`), and zu/xh voices essentially don't
  exist on the devices schoolkids have — the code falls back to *an English voice
  mangling Zulu* (`src/audio.js:54-64`) or a "no audio" toast (`src/app.js:568`).
- Authored `listen`/`speak` exercises exist in the course JSON (10 in zu) but are
  **deliberately filtered out of lessons** (`src/lessons.js:182,341`) because TTS
  is unreliable — rational, but it means the course has effectively zero listening.

**Recommendation:** bundle pre-generated audio, don't wait for live TTS. The
pipeline: generate once at build time (native recordings are the gold standard;
a high-quality cloud TTS pass is an acceptable v1), compress to Opus/AAC mono
(~3–5KB per word), ship in the PWA cache. ~640 vocab items across 3 languages ≈
2–4MB — fine for an offline-first app. This single change unblocks: listening
exercises in every lesson, audio on every flashcard/option, voiced stories and
dialogues, the Pod101-style hands-free audio-review mode, and honest "listen and
pick/type" grading. Every competitor comparison in §3 flips once this ships.

### 5.2 Words are taught out of context (no example sentences)

A vocab entry is `{id, term, translation, phonetic, note}` — **no example
sentence**. The learner meets "ikhanda = head" as an isolated pair. The app's own
pedagogy doc (§5.3, "chunks not words") argues against this. Phrases exist but
only 10–24 per language. **Add `example: {t, en}` to every vocab entry** (a
content-pipeline task, per docs/CONTENT_PIPELINE.md) and show it on the feedback
panel after each answer + in the glossary. This is the cheapest large pedagogical
win available.

### 5.3 The communicative engines are starved of content

The best-designed features have the least content:

| Feature | Engine quality | Content today (zu/xh/af) | Needed |
|---|---|---|---|
| Branching dialogues + "why" feedback | Excellent | 2 / 1 / 1 | ≥1 per unit |
| Stories with coverage % | Excellent | 3 / 2 / 2 | ≥1 per unit, leveled so early ones hit 90%+ coverage after unit 1 |
| Grammar patterns + generative frames | Excellent | 2 / 2 / 2 | ~1 per unit (noun classes, negation, past tense, questions…) |

Note the live-app symptom in the screenshots: a brand-new learner opens Stories and
every story says "17% known · tough for now" — the mechanism is honest but there is
no story a beginner *can* read. Story #1 should be readable straight after the
first-win flow (i.e., built from unit-1 vocab).

### 5.4 Authored content and code that never reaches the learner

- **`culturalNote` exists on all 36 zu lessons and is never rendered anywhere**
  (no references in `src/`). This was a selling point in the README. Show it on
  the lesson-complete screen or as a pre-lesson card — it's already written.
- **Speech recognition is fully implemented and never called**
  (`listenOnce`/`srSupported`, `src/audio.js:84-110`). Where a device does have
  ASR, "say it and get graded" could exist today behind a capability check, with
  the current self-rating as fallback.
- **`vocab.note` only surfaces in Word-of-the-Day** (`src/app.js:587`) — show it in
  glossary and feedback too.

### 5.5 Measurement honesty gaps (by the app's own standard)

The app's bar is "recognition is the weakest signal" — hold the tests to it:

- **Baseline/re-test is 10 multiple-choice items** (`src/app.js:1382`) — pure
  recognition. The headline "proof of learning" should include typed production
  (even 5 MC + 5 typed) or it's measuring the thing the pedagogy doc disavows.
- **Test-out marks a whole unit complete from ≤10 MC questions at 80%**
  (`src/app.js:1416-1430`) and seeds vocab as *correct*. By the app's own rules,
  test-out should require some production before granting that credit.
- **League rivals are simulated** (`src/gamify.js:99-117`). Fine for offline — but
  kids will believe Sibusiso and Nomvula are real. A small "practice league"
  label keeps the app's honesty brand intact.

### 5.6 Structural gaps

- **Accounts are demo-only, local storage** (`src/auth.js`) — no sync, so a broken
  or shared device loses a learner's history (fatal in a classroom). The teacher
  dashboard (docs/TEACHER_DASHBOARD.md) depends on solving this; even
  export/import of progress as a file/QR code would be a meaningful offline-first v1.
- **No review forecast** — teachers and learners can't see tomorrow's workload.
- **No placement** for learners who already know some of the language other than
  unit-by-unit test-out.

---

## 6. Appearance review — against "friendly, soft, calm, easy to read"

### 6.1 What already works — keep it

- **Light, green-tinted base** (`--bg:#f3f7f4`, white cards) with a soft radial glow —
  the right starting canvas for "calm".
- **The mascot cast** (14 illustrated buddies + buddy-of-the-day with distinct
  voices, `src/mascots.js`) and warm SA-flavored praise lines ("Sharp sharp!",
  "Yebo!", "Lekker!", `src/mascot.js:66-94`) — this is the app's personality and
  it genuinely lands as friendly.
- **Dark mode via `prefers-color-scheme`** with per-component overrides, and
  **excellent `prefers-reduced-motion` discipline** in both CSS and JS
  (`styles/main.css:434-470`, `src/fx.js:85-141`) — rare and commendable.
- Strong `:focus-visible` ring, `aria-live` answer announcements, decorative
  mascots correctly `aria-hidden`.
- Good mobile hygiene: `100dvh`, safe-area insets, 520px column.

### 6.2 What reads harsh, busy, or hard to read today

Ranked by how much they fight the "soft, calm, easy to read" goal:

1. **Readability: too much tiny text.** No base font-size or line-height is set;
   body copy defaults to 16px/~1.2, and a large share of UI text sits at
   **10–13px** (`.footnote` 13px, `.quest__prog` 11px, `.dcard__sub` 11px,
   `.badge-card__date` 10px…). Everything is **px, no rem** — the layout ignores a
   user's OS "larger text" setting entirely, and there's no in-app text-size
   control. For children (and low-end 5" screens) this is the single biggest
   readability problem.
2. **Contrast failures: gold text on white** (~1.6:1) — the fill-blank word
   (`styles/main.css:251`), story "best fit" tag (`:712`), stars. Legally-failing
   WCAG and genuinely hard to read. `--muted #5e6e66` at 10–13px is also
   borderline.
3. **Chunky hard-edged shadows** — the `0 4px 0` / `0 3px 0` solid "toy button"
   shadows on buttons, cards, options, bars (`styles/main.css:65,202,216,275,290,
   428…`). This is the Duolingo "clacky" look; it reads playful-but-hard, not soft.
4. **Too many saturated accents at once.** The home practice grid alone uses orange
   `#e8823a`, violet `#8b5cf6`, teal `#14a08f`, green, blue, gold; gamification
   adds purple `#7c3aed` and red. Busy = not calm.
5. **Tight negative letter-spacing** on all headings and brand (`-.3px`–`-.5px`,
   `styles/main.css:33,83`) — works against the rounded/friendly intent.
6. **Cramped details:** hearts squeezed with `letter-spacing:-2px/-3px`
   (`:115,245`) so the emoji overlap; several touch targets under 44px (nav
   buttons ≈30px tall, quit ✕, settings gear).
7. **Inconsistent component system:** ~8 near-duplicate card patterns with mixed
   border widths (1px/2px), radii (8–22px), and shadows; five different
   progress-bar implementations; progress track colors hardcoded (`#e3e9e4`)
   beside the `--line` token; purple hardcoded in light mode but tokenized in dark.
8. **Two clashing mascot styles:** Themba is a crisp inline SVG; the buddy cast is
   raster PNGs with a different shadow treatment. On screens where both appear the
   app looks like two products.
9. **The rounded font never loads for most users.** The stack leads with
   `ui-rounded`/`SF Pro Rounded` (Apple-only) and `Nunito` (only if installed) —
   on the Android devices SA schools actually use it falls back to plain Roboto.
   The friendly typography is currently an Apple-only Easter egg.
10. **Desktop is a phone column.** Zero width-based media queries — on a laptop the
    app is a 520px strip on a gradient. Fine for MVP, but classrooms have laptops.
11. **The exercise screen is sparse to a fault** (see screenshot): question + 4
    options in the top third, then a sea of empty space. No phonetic hint, no
    audio button, no mascot presence until you answer. Calm ≠ empty; the moment of
    learning is the least-designed screen in the app.

### 6.3 Concrete design direction — a "soft & calm" spec

A focused token + component pass, no redesign-from-scratch needed:

**Typography**
- Bundle **Nunito** (or Quicksand/Baloo 2 for a rounder feel) as woff2 in the PWA —
  2 weights (500, 800), ~100KB, cached offline like everything else. The friendly
  look then works on every device, not just iPhones.
- Set `html { font-size: 100% }` and convert to **rem**; base body 1.0625rem (17px),
  `line-height: 1.5` globally (1.25 for headings).
- Type scale of five sizes only, e.g. 0.8125 / 0.9375 / 1.0625 / 1.375 / 1.75rem.
  Nothing below 13px; secondary text becomes 15px, not 11px.
- Remove all negative letter-spacing.
- Add a text-size setting (S/M/L multiplies the root) alongside the existing
  retention setting in Settings.

**Color**
- Keep the green identity. Reduce accents to **green (brand/success) + gold
  (reward, backgrounds only) + blue (info/focus)**; drop the orange/violet/teal
  activity accents — differentiate practice tiles by icon, not by color.
- Soften tints: card tint backgrounds at ~6–8% opacity of the accent instead of
  saturated fills; `--red` reserved for wrong answers only.
- **Never use gold as text on light backgrounds** — swap to `#8a6400`-style amber
  text or a gold *chip with dark text* (the pattern already used in `.btn--review`).
- Tokenize everything currently hardcoded (purple, ambers, track colors), and add
  the missing light-mode `--purple`.
- Bump `--muted` to ≥`#54645c` where used under 15px.

**Shape & depth**
- Replace all `0 Npx 0` hard shadows with one soft two-layer shadow token
  (e.g. `0 1px 2px rgba(22,36,29,.05), 0 6px 16px rgba(22,36,29,.07)`); keep the
  satisfying press-down `translateY(2px)` interaction without the hard ledge, or
  keep the ledge on the primary CTA only if some playfulness should stay.
- Three radius tokens: `--r-sm:12px`, `--r-md:16px`, `--r-lg:24px`, plus pill. One
  **single card primitive** (`.card` + modifier classes) replacing the ~8 variants;
  one progress-bar component replacing the 5.
- Un-squeeze the hearts (spaced SVG hearts or a `♥ 4/5` chip); ≥44px on nav
  buttons, quit, and gear.

**Mascots & moments**
- Unify on one illustration style (the PNG cast is the stronger asset — redraw
  Themba to match, one shared shadow treatment).
- Bring warmth to the exercise screen: mascot peeking during questions, phonetic
  hint under the term, audio button on the prompt, content vertically centered.
  Keep generous space — but *composed* space, not leftover space.

**Layout**
- Add a single `min-width: 768px` breakpoint: wider (~680px) column, two-column
  home (path left, practice/quests right), roomier reading view.
- Add a manual light/dark toggle (system/light/dark) in Settings — kids often
  can't change OS settings on school devices.

---

## 7. Prioritized roadmap

**P0 — makes it "really teach a language"**
1. **Bundled audio for all vocab, phrases, story lines, dialogue turns**
   (pre-generated, compressed, offline-cached). Unblocks listening exercises,
   voiced stories/dialogues, audio-on-cards, audio review mode. (§5.1)
2. **Example sentence on every vocab item** via the content pipeline; shown on
   feedback + glossary. (§5.2)
3. **Content scale-up: 1 dialogue + 1 story + 1 grammar pattern per unit**, with
   unit-1 stories built to hit ≥90% coverage for a fresh learner. (§5.3)
4. **Surface the dead content:** render `culturalNote`; show `vocab.note` beyond
   Word-of-the-Day. (§5.4)
5. **Honesty fixes:** add typed production to baseline/re-test and test-out; label
   the league as a practice league. (§5.5)

**P1 — makes it soft, calm, and readable**
6. The **design-token pass** of §6.3: bundled rounded font, rem-based 5-step type
   scale with 1.5 line-height, soft shadow token, 3 radii, single card + bar
   primitives, accent reduction, gold-text and muted-text contrast fixes,
   un-squeezed hearts, 44px targets.
7. **Exercise-screen warmth pass** (mascot, phonetics, audio, centered layout).
8. **Settings: theme toggle + text size**; desktop breakpoint.
9. **Review forecast** ("tomorrow: 12 words") on Home/Progress — Anki's best idea.
10. **Wire up ASR where available** for graded speaking, self-rating fallback. (§5.4)

**P2 — makes it a classroom platform**
11. Progress **export/import (file or QR)** as the offline-first path to the
    teacher dashboard; then real accounts/sync when a server exists.
12. **Teacher dashboard** per docs/TEACHER_DASHBOARD.md, with the printable
    baseline→re-test class report as the headline artefact.
13. **Teacher-authored wordlists** (Quizlet-displacer) through the existing
    content pipeline.
14. **Hands-free audio review mode** (hear → pause → say → hear answer), per
    COMPETITOR_NOTES roadmap — cheap once P0-1 audio exists.

---

## 8. Bottom line

MzansiLingo's engine is already what Duolingo pretends to be and what Anki wishes
it looked like. The honest-mastery + offline + SA-languages combination is a real,
defensible identity. To become an app that *teaches a language*, it needs sound
(bundled audio end-to-end) and sentences (examples, dialogues, stories at unit
scale) far more than it needs any new mechanics. To *feel* the way you want —
friendly, soft, calm, easy to read — it needs one disciplined design-token pass:
bigger, rounder, fewer colors, softer depth, and no text under 13px. Both are
well-scoped, and neither requires touching the excellent core.
