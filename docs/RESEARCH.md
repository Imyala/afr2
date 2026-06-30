# How language apps teach vs. spaced repetition — and what's optimal

A research synthesis to ground MzansiLingo's design decisions. Compiled from a
multi-source, fact-checked review: **70 of 75 extracted claims survived 3-vote
adversarial verification**; the 5 that were killed were over-reaches and are
called out below. ⚠️ marks contested or vendor-funded claims.

## 1. How the big consumer apps teach

Method descriptions are well-documented public knowledge; the efficacy/algorithm
claims are research-verified and cited in §2–§3.

| App | Core method | Main learning lever |
|---|---|---|
| **Duolingo** | Bite-size lessons on a linear path; heavy gamification (streaks, leagues, XP, hearts); translation/match/MC; "Birdbrain" personalization; newer generative-AI roleplay (Max) | Gamified habit + adaptive spacing |
| **Babbel** | Conversation-first dialogues, ~15 min, **explicit grammar explanations**, review manager | Grammar + dialogue |
| **Busuu** | **CEFR-aligned** syllabus; speaking/writing corrected by a **native-speaker community** | Output + human feedback |
| **Memrise** | **Native-speaker video clips** ("learn with locals") + spaced repetition; AI conversation | Authentic input + spacing |
| **Pimsleur** | Audio-only; **graduated-interval recall** (a fixed-schedule SRS precursor); constant listening + spoken output | Listening + pushed output |
| **Rosetta Stone** | **Immersion, no translation**, image↔word/audio association, speech recognition | Comprehensible input |
| **Mondly / Drops / Lingvist** | Phrase/dialogue + chatbot/AR (Mondly); visual 5-min vocab (Drops); adaptive in-sentence vocab (Lingvist) | Vocabulary + context |

**Verified efficacy evidence (Duolingo):**
- Smith, Jiang & Peters, *Language Learning & Technology* 28(1), 2024 (n=48, ~27 hrs / 3 months): significant gains across all four skills, **large effect r=0.61**, Novice-Mid → Novice-High. ⚠️ **Duolingo-funded.**
- Kim, Payant, Skalicky & Namkung, *Studies in Second Language Acquisition* (16 weeks, French): Duolingo-only, classroom-only, and both were **"comparably effective for beginning learners"** — i.e. *beginner* parity, not evidence of fluency.

## 2. SRS-first tools and their algorithms (heavily verified)

- **Duolingo Half-Life Regression** (Settles & Meeder, **ACL 2016**, 13M traces): a **trainable** model estimating each word's memory "half-life" from item difficulty + personal history; **~45%+ lower recall-prediction error** than fixed Leitner/Pimsleur intervals (MAE 0.128 vs 0.235). The basis of "Birdbrain."
- **Neural forgetting curves** (Zaidi, Caines et al., **AIED 2020**, 4.28M datapoints): word complexity is informative and learnable by a neural net (MAE 0.129→0.105). ✗ *Refuted over-reach:* vanilla HLR *can't* use complexity — actually it can, after a hand-modified loss function.
- **FSRS** (modern open-source; now in Anki): models memory as **Difficulty / Stability / Retrievability**. *Stability* = days for recall to fall to ~90%; fits **21 parameters via gradient descent** and schedules each review at a **user-chosen target retention** (e.g. 90%). A real upgrade over **SM-2's fixed ease factor** (what MzansiLingo uses today).

**Limit of SRS-first tools:** they optimise *when to review what you already met*. They don't teach grammar, listening, speaking, or meaning-in-context. A retention engine, not a course.

## 3. What the learning science says is optimal

- **Spacing & retrieval work — but conditionally.** A 2024 nine-course meta-analysis (Bego et al., *Int. J. STEM Education*) found a significant spacing effect overall, but **significant in only 2 of 9 courses, and gone when calculus was excluded.** Real, not magic.
- **Repeated *spaced* testing beats massed** across ages; short-lag repeated retrieval gives consistent gains (Maddox & Balota, *Memory & Cognition* 2015) — the **testing effect / desirable difficulty**.
- **Spacing ≠ interleaving** (Chen, Paas & Sweller, *Educ. Psych. Review* 2021): interleaving is a **discriminative-contrast (perceptual)** effect, not cognitive load. ✗ *Refuted over-reach:* spacing "is explained by" working-memory depletion — that mechanism is a **contested hypothesis**, not settled.
- **Interleaving can backfire early** (Hwang, *Language Learning* 2025): for low-achieving/early learners it's an **"undesirable difficulty"; initial blocked practice builds new knowledge, and block-then-interleave (hybrid) is best.**
- **Output matters, not just input.** Swain's **Output Hypothesis**: production drives acquisition via **noticing the gap, hypothesis-testing, and metalinguistic reflection**, within collaborative dialogue. Complements Krashen's comprehensible input — **you need both rich input and pushed production.**
- **Gamification helps via motivation** (Shen, Lai & Wang, *Frontiers in Psychology* 2024): significant positive effect on achievement, **mediated by motivation**. ⚠️ Self-report/SEM, not a hard causal learning gain. Risk: **"XP without learning"** when decoupled from real recall.

## 4. Where each falls short

- **Consumer apps:** recognition over production; strong evidence only at *beginner* level; engagement can crowd out mastery; much "evidence" is vendor-funded.
- **Pure SRS (Anki/SuperMemo):** no context, listening, speaking, or grammar; steep setup; high drop-off. Great for *retaining* what you learn elsewhere, weak as a standalone path.

## 5. Synthesis → implications for MzansiLingo

Evidence-optimal = comprehensible **input** + pushed **output** + **spaced retrieval** + **interleaving after initial blocking** + **motivation wrapped around mastery** + **listening/speaking**.

| # | Implication | Evidence | Status in app |
|---|---|---|---|
| 1 | **Audio (listening + speaking) is the biggest gap** | Krashen input; Swain output; Pimsleur | ❌ None yet |
| 2 | **Keep production-gated mastery** | Testing effect; Output Hypothesis | ✅ Done |
| 3 | **Early lessons blocked, interleave in Review** | Hwang 2025 | ✅ Aligned |
| 4 | **Pair spacing with rich context/sentences — don't lean on spacing alone** | Bego 2024; comprehensible input | 🟡 Started (word-bank/sentences) |
| 5 | **Typo tolerance = desirable, not punishing, difficulty** | Desirable difficulties | ✅ Done |
| 6 | **Gamification wraps the SRS; keep mastery metrics visible** | Shen 2024; "XP without learning" | ✅ Aligned |
| 7 | **Upgrade path: SM-2 → FSRS-style target-retention scheduling** | FSRS / HLR | 🟡 SM-2 today |
| 8 | **CEFR "can-do" outcomes + baseline/re-test** | Busuu/CEFR; measured outcomes | 🟡 Have baseline/re-test |

**Bottom line:** MzansiLingo is already on the correct side of the research on what most apps get wrong — production-gated mastery, honest retention metrics, spacing wrapped by (not replaced by) gamification, and block-then-interleave sequencing. The two evidence-backed gaps are **(1) audio/listening/speaking** and **(4) depth of contextual/sentence/reading content**, with **(7) FSRS-style scheduling** as an optional upgrade.

## Key sources

Settles & Meeder, *A Trainable Spaced Repetition Model for Language Learning*, ACL 2016 · Zaidi/Caines et al., *Adaptive Forgetting Curves*, AIED 2020 · FSRS (open-spaced-repetition) docs · Smith/Jiang/Peters, *LL&T* 28(1) 2024 ⚠️Duolingo-funded · Kim et al., *SSLA* · Bego et al., *Int. J. STEM Education* 2024 · Chen/Paas/Sweller, *Educ. Psych. Review* 2021 · Hwang, *Language Learning* 2025 · Maddox & Balota, *Memory & Cognition* 2015 · Shen/Lai/Wang, *Frontiers in Psychology* 2024 · Swain, *Output Hypothesis*.
