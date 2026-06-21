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
subordinates it to four evidence-based mechanisms.**

## 1. Spaced repetition (the core)

Implemented in `src/srs.js` using a variant of the **SM-2** algorithm with
short same-session *learning steps* before a card graduates to day-scale
intervals.

- Each vocabulary item carries a memory record: ease factor, repetition count,
  interval, and a due date.
- When you answer, the item is rescheduled. Correct answers push the next
  review further out (1 day → 6 days → 6×ease …); a wrong answer (a *lapse*)
  resets the schedule and lowers the ease factor.
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
| Match / Multiple choice / Listen | recognition | weaker (quality 4) |
| **Translate / Fill-in-blank / Speak** | **production / recall** | **strong (quality 5)** |

A word is only marked **mastered** when it has been **produced correctly at
least twice** *and* has survived to a spaced interval of 6+ days
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
