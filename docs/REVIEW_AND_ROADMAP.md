# MzansiLingo — Full app review & roadmap to "best language app"

*An independent review of the app as built (July 2026), compared against the
best language-learning apps and the learning-science evidence, with a
prioritised roadmap covering: teaching the language (not just word memory),
visual design for kids, and the path to category-best.*

---

## Part 1 — Honest review of the app as it stands

### What is genuinely strong (keep and protect)

1. **The SRS engine is the real thing.** `src/srs.js` implements an
   FSRS-inspired stability/difficulty scheduler with target retention,
   same-session learning steps, production-weighted growth and an
   overdue bonus — closer to modern Anki than to Duolingo's early SM-2
   clones, and it's covered by tests.
2. **The session builder is pedagogically sound.** `buildLessonSession`
   guarantees recognition-before-production for every word, interleaves
   cross-lesson review warm-ups, and randomises type/order/distractors.
   The content-integrity test harness (25 randomised session builds,
   answers-reachable checks, phonetics-required checks) is something
   most indie apps never build.
3. **Mastery gating + honest metrics.** "Words mastered / retention % /
   baseline → re-test" is a stronger truth standard than any big consumer
   app ships. The Progress screen's CEFR-style "I can…" goals are exactly
   the right framing.
4. **Offline-first PWA for the actual market.** Zero data cost after first
   load, multi-profile classroom tablets, no build step. For South African
   schools this is a real moat — none of the big apps work this way.
5. **Responsible engagement design.** Streak freezes, no pay-to-win, free
   practice always available, XP framed as effort. The ENGAGEMENT.md
   principles are ahead of the industry.
6. **Warm onboarding.** Guest path → 3-word first win → taste quiz is a
   genuinely good first-run loop (verified in-browser).

### Where the app falls short of its own promises

These came out of a line-by-line code review; each is a gap between the
README/docs and what the code actually does.

| Promise | Reality in code | Severity |
|---|---|---|
| "Only counts as learned once you can **produce** it" | `fill_blank` is in the SRS `PRODUCTION` list (`srs.js:42`) but every fill-blank is rendered as **pick-from-4-options** — so a word can reach *mastered* through multiple choice alone | **High — breaks the core promise** |
| "Generative grammar / pattern **engine**" | 2 static tip-cards per language, each with 5 fixed drills, shuffled. Nothing is generated | High |
| "**Branching** real-life dialogues" | Linear scripts; a wrong choice flashes red and re-prompts; exactly 4 choice-points each; no state, no branches | Medium |
| "Speaking & Listening modes" | No speech recognition (self-rate only); TTS falls back to an **English voice** for Zulu/Xhosa text on nearly all devices, and "Show text" turns listening into reading | **High — no real audio skill today** |
| Sentence-level teaching | "Sentences" average **2.0 words** (zu), 2.1 (xh), 3.7 (af). Word-bank on a 2-token phrase is a trivial rearrange | High |
| ~1,000-word core | 218 / 187 / 236 words shipped; wordlist pipeline exists but hasn't moved the number | Medium |
| Rich authored exercises | **~90% of hand-authored per-lesson exercises are never rendered** — the session builder only pulls `fill_blank` from them | Medium (wasted content) |
| README says "SM-2" | Code is the (better) FSRS-style model — docs drifted | Low |

Other code findings worth fixing:

- **`match` can never be failed** — wrong pairings flash and reset, then the
  exercise reports success to the SRS. An unlosable exercise still feeding
  the scheduler distorts scheduling and retention stats.
- **Stories/dialogues auto-credit vocab as correct reviews** on completion
  (passive exposure scored as recall) — inflates retention %.
- **`store.load()` shallow-merges saved state** (`Object.assign` one level
  deep): an old save can carry `undefined` for later-added nested keys
  (e.g. `inventory.boosts`) and crash the shop path. Needs a real
  versioned migration.
- **`app.js` is a 2,130-line monolith** with four module-level mutable
  session globals. Fine today; will hurt at 2–3× the feature count.
- **Hand-maintained service-worker precache list** — one forgotten entry
  ships a partially-offline build, and `Promise.allSettled` hides it.
- **No session resume** — quitting a lesson mid-way loses progress.

### Visual/UX review (from running the app)

Verdict: **clean, coherent, competent-indie — but text-heavy and not yet a
kid magnet.**

- **Palette** (SA green/gold/blue on off-white) is on-brand and the chunky
  "candy button" with hard shadow + press-down is the one genuinely
  Duolingo-grade touch. Dark mode exists (auto only — no toggle).
- **Everything is text and emoji.** Icons are emoji (🔁🎯🧩💬📒); the only
  illustration in the entire app is Themba the meerkat SVG. Lesson nodes
  are numbered circles; locked units are grey padlock rows. A child scrolls
  a wall of near-identical white strips.
- **The home screen stacks five same-looking shortcut strips** (word list /
  speaking / listening / conversations / grammar) above a long
  mostly-padlocked path — weak hierarchy, no picture cues, and it
  advertises two modes (speaking/listening) that don't really work yet.
- **Single system font.** On the Android tablets SA classrooms actually
  use, `ui-rounded`/`SF Pro Rounded` don't exist and it degrades to plain
  `system-ui`. No display face for headings, no bundled font.
- **Stories screen is honest but sparse** — 2–3 stories of 5 lines each,
  then external links.
- Tap targets are mostly fine; the bottom-nav buttons (6px padding) and
  topbar emoji buttons are the exceptions.
- Accessibility groundwork (live region, focus management, labels) is
  present and better than most indie apps.

---

## Part 2 — How it compares to the best apps & the evidence

*(From a fresh July-2026 multi-source market/research sweep; sources at the
end. Vendor-funded efficacy studies are flagged.)*

### 2.1 The competitive map, app by app

| App | Core lever | What they do better than us | What we do better | Worth copying? |
|---|---|---|---|---|
| **Duolingo** | Gamified habit + adaptive spacing; 2025 "AI-first" pivot (148 AI-generated courses); Max: Video Call with Lily / Roleplay (~$168/yr) | Polish, character cast, single guided path, audio everywhere, A/B-tested streaks | Honest metrics, production gating, offline, no punitive "Energy" battery | Path UX, character cast, Stories/DuoRadio format |
| **Babbel** | Expert-written contrastive grammar in your L1; 10–15-min complete lessons; Babbel Speak (Sept 2025, AI voice trainer) | Explicit grammar explanation — the thing learners say makes them *understand* | Offline, SRS quality, price | **Yes — contrastive grammar notes are our #1 copy** |
| **Busuu** | CEFR-aligned course + **native-speaker community corrections** of your writing/speaking | Human feedback loop; certificates | Offline; their community model needs scale | Yes — async community corrections fit the SA diaspora |
| **Memrise** | Short native-speaker street videos + SRS | Real human mouths saying the words (this is how you teach clicks) | Structure, honest mastery | **Yes — phone-shot native videos** |
| **Pimsleur** | Audio-only graduated-interval recall; anticipation drills ("How would you say…?" → pause → answer) | Gets people speaking early, hands-free | Everything visual/textual; price | Yes — audio anticipation drills over our FSRS |
| **Rosetta Stone** | Picture immersion, no L1 | Little — method can't teach noun-class concords | Nearly everything pedagogically | Only the lifetime-price idea |
| **LingQ** | Comprehensible input; known-words tracking (blue/yellow/known words in any text) | Reading pipeline at scale | Beginner structure | **Yes — known-word colour-coding fused with our readers** |
| **Clozemaster** | Mass cloze sentences from corpora, by frequency (has Afrikaans) | Content volume for near zero cost | Course structure, mastery honesty | Yes — auto-cloze every reader/dialogue sentence |
| **Lingvist** | Frequency-ordered cloze + placement that skips known words | Placement for semi-speakers | Production, breadth | Yes — frequency placement to seed FSRS |
| **Language Reactor** | Dual subtitles + tap-to-gloss on video | Passive input tooling | Active production | Yes — tap-to-gloss inside our own stories |
| **Anki/FSRS** | The scheduling gold standard (FSRS default since Anki 23.10; ~20–30% fewer reviews for equal retention vs SM-2) | Raw scheduling | Context, course, UX | We already did — advertise it |

**Three market facts that matter more than any feature:**

1. **Duolingo's isiXhosa course was removed (~Sept 2023)** — reportedly low
   engagement and difficulty auto-teaching click consonants. isiZulu on
   Duolingo is a short A1 course. Afrikaans is served only by vocab apps.
   **The "serious course for SA languages" niche is empty.** That is the
   positioning, not "Duolingo but honest."
2. **2025's universal big-app feature was AI speaking practice** (Video
   Call with Lily, Babbel Speak, Busuu Conversations, MemBot). None supports
   isiZulu/isiXhosa, and LLM quality in Nguni languages is weak — don't
   chase this; human/community audio is the realistic substitute *and* the
   moat.
3. **All credible efficacy studies reduce to time-on-task**: ~15–27 focused
   hours ≈ one college semester (Babbel/MSU 2019, Busuu 2016, Duolingo
   2024 — all vendor-funded). The app that wins is the one that makes
   learners *want* to accumulate honest hours. Gamification retains but can
   mislead (ACM "gamification misuse" research; Duolingo's Hearts→Energy
   switch was monetization, not pedagogy).

### 2.2 Learning techniques beyond spaced repetition — what the evidence says

The app's own `docs/RESEARCH.md` synthesis remains valid. The fresh sweep
adds/confirms:

- **Spaced retrieval is necessary but not sufficient.** SRS optimises
  *retention of what you met*; it teaches no grammar, listening, or
  meaning-in-context. An app that is "SRS + word lists" is a retention
  engine, not a course. (This is precisely the word-memory trap the user
  brief names.)
- **Comprehensible input at scale** (Krashen; LingQ/Dreaming Spanish
  movement): large volumes of *understandable* reading/listening drive
  acquisition. Our 5-line stories are a seed, not a diet. The open-licensed
  African Storybook / Book Dash / **Vula Bula** corpora are a unique,
  legally bundleable input supply no competitor uses.
- **Pushed output** (Swain): production forces noticing gaps. Typing single
  words is weak output; building sentences under communicative pressure is
  strong output.
- **Task-based language teaching (TBLT)**: organise units around real tasks
  ("buy airtime", "greet the elders", "direct a taxi") with a success
  condition, not around word topics. Our dialogues gesture at this; making
  the task completable/failable is what makes it TBLT.
- **Explicit grammar instruction works** — especially for morphologically
  rich languages. Nguni noun classes + concords are exactly the case where
  discovery-learning fails (see: Duolingo's Xhosa retreat) and short
  explicit explanations with immediate generative practice win (Babbel's
  evidence base is the strongest of any consumer app).
- **Phonics-first for kids in transparent orthographies**: isiZulu/isiXhosa/
  Afrikaans have highly consistent letter-sound mapping; explicit systematic
  phonics works *faster* than in English. SA's own National Framework for
  Teaching Reading in African Languages (2020) mandates it. **Feed the
  Monster** (open-source JS phonics game, World Bank-evaluated: measurable
  reading gains, ~22h ≈ 2–3 months of schooling) and **Vula Bula** (OER
  phonics-graded readers in all 9 SA African languages, positively evaluated
  by Ardington & Spaull 2022) are both directly reusable.
- **The production effect & retrieval direction**: words spoken aloud are
  remembered better and decay slower than words read (replicated in L2);
  L1→L2 (productive) retrieval is harder but yields more usable knowledge
  than L2→L1 recognition. Validates our production gating — and says the
  next step is *spoken* and *sentence-level* production.
- **Formulaic chunks beat single words for speaking** (Wray; explicit chunk
  instruction causally improves oral fluency). Fluent speech is retrieved
  in prefabricated multi-word units. For agglutinative Nguni languages this
  means drilling **inflected frames** (subject-concord + tense + stem
  patterns: *ngiya-/uya-/siya-* + stem) as retrievable wholes — phrase and
  pattern cards should outrank single-word cards.
- **Nation's Four Strands**: a balanced course ≈ 25% meaning-focused input,
  25% meaning-focused output, 25% deliberate study (where flashcards live —
  legitimate, but capped), and 25% **fluency development** — using only
  *known* language under time pressure (timed retells, 4/3/2 shrinking-time
  speaking, speed rounds, shadowing). **Fluency development is the strand
  MzansiLingo covers 0% of today** — and it's cheap, because it reuses
  content the learner already knows.
- **Interaction + corrective feedback is the largest effect-size cluster**
  in SLA (d ≈ 0.75–1.13, including *text chat*); explicit correction and
  prompts-to-self-correct beat unmarked recasts.
- **AI conversation partners work** (meta-analytic g ≈ 0.48; lowers speaking
  anxiety, raises willingness to communicate) **but are not currently
  feasible for isiZulu/isiXhosa**: LLM fluency is weak, no major cloud has
  an isiXhosa TTS voice (Azure does have zu-ZA and af-ZA neural voices),
  and zero-shot Whisper ASR is effectively random for isiXhosa (WER ~106%)
  though fine-tuning gets it to ~5%. Afrikaans is markedly better served —
  an AI partner is realistic for Afrikaans first.
- **Blocked-then-interleaved** sequencing (Hwang 2025) — we already do this.
- **Funda Wande RCTs are the strongest in-country evidence**: +0.5 SD
  reading gains in Limpopo (2 years), +0.3 SD Eastern Cape — structured,
  in-language materials work. DBE publishes per-language oral-reading-
  fluency benchmarks we can adopt as kid-mode targets.
- **Kids' engagement ≠ adult engagement**: the leading kids' apps
  (Duolingo ABC, Khan Academy Kids, Lingokids, Studycat) use **no hearts,
  no streak loss, no leaderboards** — collection rewards (stars/stickers),
  retry-with-a-different-activity on failure, ~5-minute atomic lessons,
  audio-first navigation, and domain mascots. Parasocial research
  (Georgetown CDMC) shows children learn measurably better from characters
  they're bonded to.

### 2.3 What separates "teaches the language" from "word memory"

Concretely, the features that move a learner from recall to speech, ranked
by evidence and fit:

1. **Sentence-level production under time/communication pressure** —
   building real sentences (not 2-word phrases) from a word bank, then from
   nothing.
2. **Massive comprehensible input** — graded readers with per-word glossing
   and known-word tracking, levelled so ~95% of words are known.
3. **Listening to real human voices** — recorded native audio; no TTS
   stand-in exists for Nguni languages.
4. **Speaking with feedback** — even async human feedback beats none;
   self-record + community correction is achievable offline-first.
5. **Grammar as generative patterns** — explicit concord/noun-class
   instruction with drills that *generate* new combinations, so learners can
   say things they were never shown.
6. **Tasks with success conditions** — dialogues you can fail, with
   comprehension consequences, not retry-until-green.
7. **Scheduling all of the above with FSRS** — we already have the engine;
   the point is to feed it sentences, patterns and tasks, not just words.

---

## Part 3 — The roadmap

### Phase 0 — Restore the core promise (days, not weeks)

These are integrity fixes. The app's whole identity is "honest learning";
right now four code paths quietly violate it.

1. **Make production mean production.** Either render `fill_blank` as a
   typed answer, or remove it from `PRODUCTION` in `srs.js:42`. Today a
   word can be "mastered" by multiple choice alone.
2. **Make `match` failable** (or stop reporting it to the SRS as a correct
   review). An unlosable exercise shouldn't feed the scheduler.
3. **Stop crediting passive exposure as recall.** Stories/dialogues should
   record an *exposure* (or a low-quality grade), not `correct` — retention
   % is currently inflated.
4. **Versioned state migration.** Replace the shallow `Object.assign` in
   `store.load()` with per-version migrations + deep default fill; add a
   test that loads a v-old save.
5. **True up the README** (SM-2→FSRS, "branching," "generative," audio
   claims) — under-promise until the features catch up. Credibility is the
   moat.
6. **Decide the fate of orphaned authored exercises** (~90% never render):
   either have `buildLessonSession` mix them in, or delete them and lean
   fully on generation.
7. Auto-generate the service-worker precache list (tiny build script);
   add lesson-session resume.

### Phase 1 — Teach the language, not word memory (the next 3 months)

Ranked by evidence × feasibility for a solo/indie builder:

1. **Recorded native audio — the single highest-leverage investment.**
   Phone-recorded native speakers (the Memrise "real mouths" model) for
   every word, phrase, story line and dialogue turn. This is also the only
   way to teach clicks — the exact thing that killed Duolingo's Xhosa
   course. Bootstrap: Azure zu-ZA/af-ZA neural voices for drafts; humans
   required for isiXhosa. Ship as **per-unit downloadable audio packs**
   with visible sizes (Khan Kids "suitcase" pattern; respects SA data
   costs). Once audio exists, unlock: real listening exercises,
   **shadowing mode**, and **Pimsleur-style anticipation drills**
   ("How would you say…?" → pause → native answer) layered over FSRS.
2. **Chunk-first content model.** Add a `phrases`-as-first-class-items
   tier: high-frequency inflected frames (greet-respond pairs, SC+TAM+stem
   verb frames, possessive/locative patterns), FSRS-scheduled like words.
   Target: every lesson teaches ≥3 usable multi-word chunks, and real
   sentences of 4–8 words (current average is 2).
3. **Grammar engine v2 — actually generative.** Encode noun-class/concord
   tables and verb-frame templates per language; generate drills by
   combining known vocab × pattern (the learner produces sentences they
   were never shown). Pair each pattern with a short **contrastive
   explanation written for English/Afrikaans speakers** (the Babbel model —
   the strongest-evidenced consumer app). Schedule patterns with FSRS as
   we already do.
4. **Auto-cloze everything** (Clozemaster model): every sentence in every
   story and dialogue becomes a cloze card, frequency-sorted, feeding FSRS.
   Near-zero marginal content cost.
5. **Reading at scale + known-word tracking** (LingQ model): bundle
   CC-licensed stories (African Storybook, Book Dash, Vula Bula readers)
   with tap-to-gloss on every word, colour-coded word status
   (new/learning/known), and unlock-by-coverage (next reader opens when
   ~95% of its words are known). Nobody offers this for Nguni languages.
6. **A fluency strand** (Nation's missing 25%): timed retell of a story
   just read; 4/3/2 shrinking-time speaking; speed rounds over *mastered*
   cards only. Cheap — reuses known content — and it is the mechanism that
   converts knowledge into speech.
7. **Dialogues → real tasks (TBLT).** Give each dialogue a goal and a
   success condition ("you got the taxi to Bree Street for R20 — or you
   didn't"), genuine branches, and free-response turns where feasible.
   Pre-task planning ("here are the chunks you'll need") doubles measured
   speaking gains.
8. **Placement by frequency** (Lingvist model): binary-search a frequency
   list at onboarding to seed FSRS "known" states — critical in SA where
   many learners are semi-speakers, and it respects adults.
9. **Community corrections** (Busuu model, later): submit a recording or
   sentence; native speakers/diaspora correct asynchronously. Offline-
   queueable, cheap to build, and the realistic substitute for AI speaking
   partners (which aren't viable for zu/xh yet — revisit for Afrikaans).
10. **Grow content to the ~1,000-word core** through the existing pipeline,
    but count **chunks and sentences**, not just words.

### Phase 2 — Appearance: a design system that works for kids *and* adults

The current UI is clean but text-and-emoji; the research is unusually
consistent on what to change:

1. **Typography**: bundle two fonts (subset WOFF2, ~50KB total): a rounded
   display face for headings (Fredoka/Baloo class — the Feather Bold
   analogue) + **Lexend or Atkinson Hyperlegible** for body at ≥18px,
   line-height 1.5 (dyslexia-friendly; matters in a literacy-crisis
   market). Today Android users get plain `system-ui`.
2. **A small cast, not one mascot** (Duolingo/Khan Kids pattern): 3–4 SA
   animals, each *owning a domain* — e.g. Themba the meerkat (lessons),
   a hoopoe (stories), a pangolin (grammar), a vervet (speaking). Named in
   each target language. Characters double as navigation for pre-readers;
   parasocial-bond research shows kids measurably learn more from
   characters they love. Animate with **Rive** state machines (tiny .riv
   files, ~15× smaller than Lottie — matters at R85–150/GB data prices).
3. **Kill the emoji icon system**: one consistent SVG icon set + illustrated
   unit crests (per-unit scene: taxi rank, spaza shop, kraal, beach) so the
   path shows *places you're going*, not numbered circles and padlocks.
4. **One next action on home** (Duolingo's biggest validated UX bet):
   collapse the five same-looking shortcut strips into a single "Continue →"
   hero card fed by the 90-day plan, with everything else demoted to a
   secondary row. Remove/hide the speaking & listening strips until audio
   ships.
5. **Kids mode (the "cater for kids" answer) — a mode, not a redesign**:
   - **3–5 minute atomic lessons** (attention ≈ 2–3 min per year of age);
   - **audio-first navigation**, literal picture icons, ≤5 choices, ~64px
     targets;
   - **no hearts, no streak loss, no leaderboard** for under-9s — the
     leading kids' apps (Duolingo ABC, Khan Kids, Lingokids) use none of
     them; collection rewards instead (stickers/animal cards per lesson);
   - **failure = retry with a different activity type** (Khan Kids), never
     "wrong, minus a life";
   - every tap makes a sound — silence reads as broken to a child.
   Adults keep streaks/leagues; celebration stays context-gated (first
   lesson of the day) to protect its specialness.
6. **A literacy (phonics) track for kids**: syllable-grain phonics in the
   language's own sequence (Vula Bula's OER progression — *not* translated
   English phonics), decodable-story games in the Feed the Monster mould
   (its JS source is open — forkable), fluency targets from DBE per-language
   ORF benchmarks. This turns the app from "vocab for kids" into "learn to
   read isiXhosa," which is the actual national need (78% of Grade 4s can't
   read for meaning).
7. **POPIA before COPPA**: in SA a "child" is under **18** and processing
   their data needs guardian consent. The on-device, no-analytics
   architecture is the compliance strategy — keep it, document it, and put
   a parental gate in front of external links (Library) and any future
   purchase. It's also honest marketing to schools.
8. Small fixes: manual theme toggle (dark mode already exists), bigger
   bottom-nav tap targets, an install coach-mark for iOS.

### Phase 3 — Becoming the best language app (the strategy)

1. **Position as the serious course for SA languages, not "Duolingo but
   honest".** The niche is verifiably empty: Duolingo *removed* isiXhosa
   (~2023), its isiZulu is a short A1 course, and Afrikaans is served only
   by vocab apps. "The app that actually teaches isiXhosa" is a category
   of one.
2. **Partner for content and credibility**: Nal'ibali (already Duolingo's
   SA partner — distribution + brand), Molteno/Vula Bula (OER phonics +
   graded readers), African Storybook/Saide, Book Dash. All openly
   licensed; bundling them offline is legal and unique.
3. **Own "proof of learning" publicly.** Every credible efficacy study
   reduces to ~15–27 focused hours ≈ one semester. We already have
   baseline/re-test; aggregate (on-device, consented, anonymous) results
   into a published outcomes page — the marketing weapon no big app can
   copy, because their incentive is engagement, not measurement. Add
   CEFR-style "can-do" checkpoints (already started) and printable
   certificates.
4. **Schools are the wedge**: ship the teacher dashboard (class overview,
   struggling-words view, printable baseline/re-test reports — the design
   doc already exists), because one teacher = 30 daily learners and SA
   schools teach these languages as subjects with no digital tools.
5. **Monetise the adult/teacher side, never the child's path**: free child
   core (the Duolingo ABC / Khan Kids trust standard); one-time language
   packs (R50–R100, Gus on the Go model) and/or a parent/teacher dashboard
   subscription; a lifetime tier for subscription-fatigued adults. No
   punitive mechanics as monetisation (Duolingo's Hearts→Energy backlash
   is the cautionary tale).
6. **Say the quiet advantages out loud** in-store and in-app: "scheduled by
   FSRS, the same modern algorithm as Anki — ~20–30% fewer reviews for the
   same retention", "works offline forever", "your data never leaves the
   device", "no ads, no dark patterns."
7. **Engineering to support it**: split `app.js` into modules with a tiny
   hash router; keep the no-build ethos if desired but generate the SW
   precache; add DOM smoke tests; keep initial payload <10MB with audio as
   optional packs.

### What NOT to do

- **Don't chase AI conversation partners for zu/xh in 2026** — the TTS/ASR/
  LLM floors aren't there; community human feedback wins. Revisit for
  Afrikaans.
- **Don't add more gamification** — the loop count is already at the top of
  the healthy range; the differentiators are trust and outcomes.
- **Don't translate English pedagogy** (phonics sequences, readability
  levels) into Nguni languages — grain size and morphology differ; use the
  in-language frameworks (Vula Bula, DBE benchmarks, Funda Wande corpus).
- **Don't strand content** (Memrise's community-course purge is the
  cautionary tale) — anything learners build (starred decks, custom lists)
  must stay portable.

---

## Suggested sequencing (if you do nothing else)

| Order | Item | Why first |
|---|---|---|
| 1 | Phase 0 integrity fixes | Days of work; protects the one thing competitors can't copy — honesty |
| 2 | Recorded native audio + audio packs | Unlocks listening, speaking, shadowing, anticipation drills, and kids' audio-first mode in one stroke |
| 3 | Chunk/phrase tier + generative grammar v2 | The literal answer to "teach the language, not word memory" |
| 4 | Design system (fonts, cast, icons, one-action home) | Multiplies everything else; makes kid mode possible |
| 5 | Kids mode + phonics track | Opens the school market where the moat is |
| 6 | Reader pipeline + known-word tracking | The long-term retention engine for intermediate learners |
| 7 | Teacher dashboard + published outcomes | Distribution + the "best app" claim, backed by data |

---

## Sources

Compiled July 2026 from a multi-agent web sweep (search-extract based; the
environment's proxy blocked some direct page fetches, so vendor-page claims
were cross-checked across independent sources where possible). Key sources:

**Market:** Duolingo investor releases & blog (148 AI courses, Apr 2025;
Energy rollout; Video Call with Lily; Zulu launch with Nal'ibali 2022;
Xhosa course removal ~2023 via duolingoguides.com); TechCrunch (Apr/Aug
2025); Class Central 2025 reports; Babbel press (Babbel Speak, Sept 2025;
Babbel Live discontinuation, Jul 2025); Busuu/McGraw-Hill efficacy PDF;
MSU/Loewen et al. 2019 (Babbel oral proficiency); Vesselinov & Grego 2016
(Babbel/Busuu); Memrise blog (community-course removal 2024); Pimsleur
method docs; LingQ/Clozemaster/Lingvist/Language Reactor reviews (FluentU,
Test Prep Insight, AllLanguageResources, Lingtuitive 2025–26).

**Learning science:** Nakanishi 2015 & Jeon & Day 2016 (extensive reading
meta-analyses, d≈0.46–0.79); Swain output hypothesis + production-effect
replications (Language Teaching Research 2022); TBLT meta-analyses
(d≈0.78 speaking; TechTrends 2025 g=0.98 with pre-task planning); Wray
2002 + formulaic-sequence intervention studies; Nation 2007 *The Four
Strands*; Mackey & Goo 2007 / Ziegler 2016 (interaction d≈0.75–1.13);
Lyu 2025 (AI chatbot meta-analysis g≈0.48); shadowing systematic review
(T&F 2025); Settles & Meeder ACL 2016 (HLR); open-spaced-repetition
srs-benchmark (FSRS-6, 350M reviews); Kurnaz 2025 (gamification g=0.654,
SDT caveats); ACM Learning@Scale gamification-misuse.

**SA-specific:** Funda Wande Limpopo RCT (+0.5 SD) & Eastern Cape endline
(+0.3 SD); Ardington & Spaull 2022 (Vula Bula evaluation); DBE National
Framework for Teaching Reading in African Languages (2020) + per-language
ORF benchmarks; PIRLS 2016; Molteno Vula Bula OER; African Storybook /
Book Dash / Nal'ibali; Stellenbosch Whisper ASR studies (arXiv 2501.06478:
isiXhosa zero-shot WER ~106%, fine-tuned ~5%); Azure voice catalogue
(zu-ZA/af-ZA neural voices; no xh-ZA); Google+PanSALB AI glossary (Oct
2025); POPIA ss.34–35 + Information Regulator guidance on children's data;
data pricing (datacost.co.za, BusinessTech 2025); Transsion/Android Go
device-share data (intelpoint.co 2025).

**Design:** design.duolingo.com (Feather Bold/DIN Next Rounded; palette;
voice); Duolingo blog (path redesign Nov 2022; character cast; visemes;
Friend Streak 2025); Rive vs Lottie (~15× size reduction); Khan Academy
Kids (domain mascots, Kodi's Suitcase offline packs, retry-with-different-
activity); Duolingo ABC (5-min lessons, no punitive mechanics, EDC study);
Lingokids (on-device data, kidSAFE); Studycat; Gus on the Go (one-time
purchase model); Georgetown CDMC parasocial-learning research (Brunick et
al. 2016); NN/g children's UX; Atkinson Hyperlegible / Lexend dyslexia
guidance; WHO/AAP screen-time guidance; Apple Kids Category / kidSAFE /
COPPA rules; Headspace & Toca Boca case studies; calm-tech backlash
(Frontiers in Psychiatry 2025).
