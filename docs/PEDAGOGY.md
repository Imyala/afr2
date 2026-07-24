# The learning science behind MzansiLingo

The brief was explicit: *"unlike Duolingo which you don't learn, we need to
make sure there is real progress in 1 month."* This document explains the
design choices that make MzansiLingo a teaching tool, not just a game.

## The problem with tap-to-win apps

Many language apps optimise for **engagement metrics** (daily active users,
session length) rather than **retention**. They lean heavily on multiple-choice
recognition, which feels easy and rewarding but is the weakest form of memory.
Learners rack up streaks and XP while forgetting most of what they "covered".

MzansiLingo keeps the motivating game layer (streaks, XP, hearts) **but
subordinates it to five evidence-based mechanisms.**

## 1. Spaced repetition (the core)

Implemented in `src/srs.js` as an **FSRS-style target-retention scheduler**
(an upgrade over classic SM-2 fixed multipliers) with short same-session
*learning steps* before a card graduates to day-scale intervals.

- Each item carries a memory record: **stability** (days until recall decays
  to ~90%), **difficulty**, and a due date. Words *and* phrase chunks are
  scheduled this way.
- When you answer, the item is rescheduled at the point where predicted recall
  drops to your desired retention. Production grows stability more than
  recognition; a wrong answer (a *lapse*) shrinks stability and resets the
  learning steps.
- Words met passively (in a story, a dialogue, Word of the Day) enter the
  schedule as *encountered* — due for review immediately, but **never counted
  as a correct recall**. Reading past a word is not evidence you can retrieve
  it; the first real review is what grades it.
- The **Review** button surfaces exactly the items that are *due* — the words
  you're about to forget. This is the single most important difference from a
  linear lesson-only app: review is driven by your memory, not by a syllabus.

This directly targets the **forgetting curve**: reviewing just before you
forget is what moves vocabulary into long-term memory.

## 2. Production over recognition (active recall)

Recognising the right option in a list is far easier than recalling a word
from scratch. So MzansiLingo weights exercise types by how much they prove:

| Exercise | What it proves | Grade signal |
|---|---|---|
| Match / Multiple choice / Listen / Fill-in-blank / Word bank | recognition | weaker (quality 4) |
| **Translate (typed) / Speak** | **production / recall** | **strong (quality 5)** |

Fill-in-the-blank sits in the *recognition* row on purpose: it is rendered as
pick-from-options, so counting it as production would let a word be "mastered"
through multiple choice alone. Likewise, **match grades per pair** — the pairs
you mix up are recorded as misses even though the exercise lets you finish.

A word is only marked **mastered** when it has been **produced correctly at
least twice** *and* has survived to a spaced interval of 7+ days
(`srs.js` → `review()`). You cannot "master" a word just by clicking the right
bubble. This is enforced in code, not just encouraged.

## 3. Honest progress metrics

The Progress dashboard (`renderProgress` in `app.js`) reports what actually
matters for learning:

- **Words mastered** (of the course total) — real, retained vocabulary.
- **Still learning** — introduced but not yet secured.
- **Retention %** — correct recalls ÷ total reviews across all words.
- Lessons completed, streak, and XP are shown too, but framed as effort, not
  achievement.

Contrast this with apps where the headline number is XP — a measure of time
spent, not knowledge gained.

## 4. Measured outcomes: baseline → 1-month re-test

To make "real progress in 1 month" provable rather than a slogan:

- On day 1 a learner takes a **baseline test** (a quick 10-item recall check
  across the course). The score is stored.
- After roughly a month of daily practice they take the **same-format
  re-test**. The Progress page shows baseline vs re-test side by side with the
  percentage-point improvement.

For a classroom, this is the artefact a teacher can point to: a measured,
per-learner gain over a defined period.

## 5. The five strands of a real speaking skill

Spaced retrieval is one strand of language ability, not the whole skill. The
app implements the five methods with the strongest evidence in second-language
acquisition research:

1. **Massive comprehensible input** — graded stories and audio-first listening
   at a high proportion of known words (extensive-reading meta-analyses:
   d ≈ 0.5–0.8). Every story shows **how many of its words you already know**
   and the library recommends the best-fit story; ~90%+ known is the sweet spot
   where reading teaches. Words met in input enter the review schedule
   (honestly — see §1).
2. **Spoken, sentence-level production** — the production effect: words said
   aloud in sentences stick far better than typed single words. Speaking
   practice is recall-first (see the English → say it → reveal the model) and
   sentence-first, with an honest "not quite" self-rating that counts as a
   lapse.
3. **Chunks, not words** — fluent speech is retrieved as prefabricated
   multi-word frames. Phrase chunks are first-class spaced items reviewed as
   whole sentences, and the grammar engine **generates** frame drills
   (ngi-/u-/si-/ba- + stem for isiZulu/isiXhosa; pronoun + invariant verb for
   Afrikaans) fresh each session from real course verbs.
4. **Interaction with corrective feedback** — the largest effect sizes in all
   of SLA (d ≈ 0.75–1.13). Dialogue practice explains *why* a wrong reply
   doesn't work (not just that it doesn't), and conversations genuinely
   branch: different valid replies lead to different responses.
5. **Fluency practice under time pressure** — the Lightning round: rapid
   retrieval of *already-known* words against a 60-second clock, pushing
   retrieval from deliberate to automatic. It reuses learned content only, so
   it is pure consolidation, and answers still feed the scheduler honestly.

## 6. Inquiry-based, higher-order pattern learning

Grammar isn't taught rule-first. The first time a learner opens a pattern
that has a generative frame (subject prefixes, verb frames), they meet
**"Spot the pattern"**: three worked examples (English gloss → the actual
chunk), then a "now you try" question that asks them to predict a *fourth*
combination from the same rule, before the formal tip is ever shown
(`genPatternInquiry` in `src/lessons.js`). Noticing a relationship yourself —
induction — is a more durable route to higher-order understanding (rules,
relationships, generalisable structure, not just memorised instances) than
being handed the rule first. Once a pattern is no longer brand-new, its tip
is shown directly so the learner isn't re-taught something they already
worked out.

## 7. The Feynman technique: teach it back

Recognising and typing a word are still shallower than genuinely
*explaining* it. Once a word has reached **mastered** status, review
sessions occasionally swap in **"Teach Themba"** (`genExplainPrompt` in
`src/lessons.js`): the learner writes, in their own words, when they'd use
the word or what it reminds them of — teaching it to the mascot rather than
being tested. There's no strict grader for free text, so — exactly like
Speaking — the learner **self-rates honestly** ("I explained it well" /
"not really"), and that rating feeds the same spaced-repetition scheduler as
every other exercise. Because generating an explanation requires deeper,
more elaborative processing than recall or typing, it's graded as a
production-strength signal (`gradeFor` in `src/srs.js`). It's reserved for
already-mastered words and never costs a heart, so it stays a low-stakes
comprehension check, not a new way to fail.

## 8. Generative sentence production: say what YOU want

Replaying authored phrases — however well spaced — never teaches a learner to
say a sentence nobody taught them. That requires internalising the *system*:
which concord goes with which subject, where the tense marker slots in, what
negation does to the verb, where Afrikaans sends the verb after "gaan".

The sentence engine (`src/sentences.js`) encodes exactly that morphology and
**generates novel sentences on demand**: isiZulu/isiXhosa subject concords +
tense infixes + the a-…-i negative wrap; Afrikaans SVO with verb-final futures
and pasts and the double *nie*. Each sentence becomes a **build exercise**: the
learner assembles it from morpheme and word tiles while a live preview fuses
*ngi + ya + sebenza* into *Ngiyasebenza* — operating the grammar machine, not
reciting its output. Distractor tiles are the real beginner traps (the wrong
concord, a -ya- that doesn't belong before an object, a bare stem where the
ge- form is needed) — and the engine is careful never to offer a tile that
would let a *correct* alternative sentence be marked wrong.

These exercises appear inside ordinary lessons and reviews (difficulty grows
with progress: present → future/negatives → past) and in the dedicated
**Say It Your Way** studio, where every third sentence must be *spoken* aloud
and every correct build is spoken back by TTS. Because a missed build is
learning a system rather than forgetting a fact, builds never cost a heart.
The permanent **"sentences you can say on your own"** counter is arguably the
app's most honest fluency metric: it counts self-expression, which is the
actual goal of language learning.

## How the game layer supports (not replaces) learning

- **Daily goal + streak**: drive the *daily* practice that spaced repetition
  depends on. Spacing only works if the learner returns regularly.
- **Hearts/lives**: create mild stakes so learners slow down and think, rather
  than mashing answers. They never block *practice* of already-seen words
  (the "practise old words" path is always free), so a child is never locked
  out of learning.
- **XP**: visible effort reward, deliberately decoupled from the mastery
  metric so it can't be mistaken for proof of learning.

## What's deliberately conservative

- **Audio**: native-recorded audio is the gold standard. Until that content is
  produced, listening/speaking use on-device text-to-speech and speech
  recognition *where available*, and **always** show phonetics so an offline
  learner on any device can still complete the exercise. Speaking is treated as
  low-stakes practice and never costs a heart.
- **Number/noun-class complexity**: Zulu and Xhosa numbers and nouns change
  with grammatical class. The MVP teaches the common counting/citation forms
  and flags this in cultural notes, rather than overwhelming beginners.

## Summary

Spaced repetition decides *what* to study and *when*; production exercises
decide *whether you really know it*; the dashboard and baseline/re-test
*prove* it. The streaks and XP are there to get a school kid to show up every
day — because daily turn-up is exactly what the underlying method needs.
