# Roadmap: what's still between MzansiLingo and "best language app"

An honest gap analysis after the 2026-07 improvement round (generative
sentence engine, Sentence Lab, sentence anatomy, questions/places, +138
words, combo/chaining loops). Ordered by learning impact per unit of effort.

## Tier 1 — highest impact, do next

**1. Native-speaker audio.**
The single biggest gap. Device TTS for isiZulu/isiXhosa is missing or robotic
on most phones, and clicks (q, x, c) *cannot* be learned from text. Plan:
record a native speaker reading every vocab item, phrase and generated-engine
building block (~600 short clips per language), ship as compressed audio in
the PWA cache. Chunked morphemes (ngi/ya/sebenza) can be concatenated for the
engine's novel sentences, or record the ~40 stems + concords separately.
Until then: a "click coach" screen with recorded minimal pairs (qa/xa/ca)
would be the cheapest big win.

**2. Frequency-ordered vocabulary.**
Course order is currently thematic. The best apps front-load the ~1,000 most
frequent words (which cover ~85% of everyday speech). Action: tag every vocab
item with a frequency band (corpus lists exist for all three languages via
SADiLaR), surface band coverage on the Progress page ("you know 62% of the
top 500 words"), and bias review + new-lesson order toward high-band words.

**3. Noun classes taught as a system (Nguni).**
Zulu/Xhosa grammar is driven by ~15 noun classes; the app teaches words but
not yet the class system that makes plurals, concords and adjectives
predictable. Extend the sentence engine so each noun carries its class, and
generate subject-concord sentences for class 1a/2/5/9 nouns ("Inja iyagijima"
— the dog runs). This unlocks "the machine" for the whole language, exactly
like -ya-/-zo- did for tense.

**4. Listening at natural speed.**
All listening is single words or slow TTS. Add a "fast ears" mode: the same
generated sentences played at 1.0× then 0.75×, tap-what-you-heard from tiles.
The engine already generates the material; this is mostly UI.

## Tier 2 — strong differentiators

**5. Conversation goals ("can-do" missions).**
Wrap existing dialogues + the engine into missions: "Order tea and bread at a
spaza shop" — a 3-turn exchange the learner must complete producing, not
picking. CEFR can-do statements give the checklist; the engine generates the
required sentences.

**6. Story engine (comprehensible input at scale).**
3 stories per language is far too few — extensive reading needs dozens. The
sentence engine can co-author: template-driven micro-stories (5–8 lines)
constrained to known vocab, human-reviewed, shipped in batches. Target: a
story for every unit at 90%+ known-word coverage.

**7. Writing practice with feedback.**
"Prove it" typing exists; add dictation (hear → type) and picture-prompted
free production ("describe this scene in 3 sentences" self-checked against
engine-generated model answers).

**8. Verb extensions (Nguni) / modals (Afrikaans).**
Next grammar tier for the engine: -ela (for), -isa (cause), uku…-a
infinitive chains ("Ngifuna ukudla" I want *to eat*); Afrikaans kan/moet/wil
("Ek wil koffie drink"). Each adds huge expressive range from small data.

## Tier 3 — platform & ecosystem

**9. More languages.** Sesotho/Setswana/Sepedi templates — the engine's
Nguni/Afrikaans split shows the pattern; Sotho languages need their own
concord tables but reuse the whole exercise/SRS/anatomy machinery.

**10. Teacher dashboard** (docs/TEACHER_DASHBOARD.md) — class code, per-pupil
mastery/retention export, offline-first. Big for the classroom mission.

**11. Real social.** Current leagues are deterministic rivals (honest, but
synthetic). Optional class-scoped leaderboards via a tiny sync server — or
QR-code "challenge a friend" packs that stay fully offline.

**12. Native-review pipeline at scale.** All generated + authored content
should pass a native speaker. The CONTENT_PIPELINE doc has the process; fund
it. Everything above multiplies its value.

## Explicitly not recommended

- **Ads or engagement dark patterns** — the app's trust with schools is worth
  more than any DAU bump.
- **AI chat tutor before audio exists** — text chat in a language you can't
  yet *hear* cements bad pronunciation.
- **More gamification layers** — the loop stack (streaks, quests, leagues,
  combos, chaining, gems) is at healthy saturation; the next retention gains
  come from content depth, not more meters.
