# UI/UX review — dark mode, tone, and feedback pacing

A design review requested to look at three things: dark-mode colour clashes
(especially text you can't read while typing), the overall "friendliness" of
the visual language, and exercise feedback disappearing too fast to read. This
doc records what's currently wrong and concrete fixes, ordered by impact.

## 1. Dark mode: invisible text while typing (bug, high priority)

**The problem:** `.ex__input` (the text-entry field used in fill-in-the-blank
and typed-answer exercises) hardcodes a light background:

```css
.ex__input {
  background: #fff;   /* styles/main.css:261 */
}
```

`color` is never set on `.ex__input`, so it inherits `--ink`. In dark mode
`--ink` is redefined to `#f1f7f3` (near-white body text, `main.css:468`) — so
the input keeps its hardcoded white background *and* gets near-white text.
The result is exactly the symptom reported: **typed text is close to
invisible while entering an answer in dark mode**, because it's pale text on
a pale field.

There's actually a code comment nearby (`main.css:429`) that shows the team
already fixed this exact class of bug once for `.toast`, but `.ex__input` was
missed:

```css
/* ... text would vanish on the dark theme's near-white --ink bubble) */
.toast { background: var(--ink); color: var(--bg); ... }
```

**Fix:** stop hardcoding `#fff` — use the theme tokens instead, e.g.
`background: var(--card); color: var(--ink);` on `.ex__input`, so dark mode
picks up `--card: #1c2a22` with light `--ink` text automatically, and light
mode is unaffected (`--card` is already `#fff` there). Then audit the rest of
the sheet for other stray hardcoded literals that bypass the theme tokens —
a quick search turns up several more `#fff` / near-white literals used as
backgrounds behind text that isn't guaranteed to also flip
(`.opt--ok`'s light-mode `#e7f6ec`, `.opt--bad`'s `#fff6e0`, `.fb__title`'s
learn-state `#8a5a00`, `.match__col` selections, etc.). Most of these *do*
have `[data-theme="dark"]` overrides already, but `.ex__input` shows how easy
it is for one to slip through — worth a systematic pass rather than
one-off patches.

## 2. Other dark-mode contrast risks worth checking

- `.ex__foot--learn .fb__title` is hardcoded `#8a5a00` (a brownish-gold tuned
  for the *light* cream background) with no `[data-theme="dark"]` override
  visible near it for the title colour on the learn state — worth confirming
  it's legible against the dark learn-footer gradient, not just the ok-state.
- Any future new component should reuse the existing CSS custom properties
  (`--ink`, `--card`, `--bg`, `--muted`, `--line`) instead of literal hex
  colours, so dark mode "just works" instead of needing a parallel override
  for every new hardcoded colour.

## 3. Making the app feel warmer and more welcoming

The current palette (SA-inspired green/gold/blue) and rounded font stack are
a reasonable foundation, and the "never red, never a ✗" miss-handling
(`opt--bad`, `.ex__foot--learn`) is a genuinely good, friendly choice already
in place. To push further toward "soft and welcoming":

- **Soften hard edges further.** Several elements use flat `#000`-based
  shadows (`rgba(0,0,0,.3)` on dark-mode cards, `rgba(0,0,0,.18)` badges).
  Warmer, tinted shadows (mixing in `--green` or `--ink` at low opacity
  instead of pure black) read as softer and less "corporate."
- **Reduce the amount of pure white in light mode.** `--bg: #f3f7f4` is soft,
  but `--card: #ffffff` combined with white input fields creates a lot of
  stark white surface area. A slightly warmer off-white for cards (e.g. a
  cream/mint tint consistent with the gold/green brand) would feel cosier and
  reduce the light/dark contrast jump users notice when switching.
- **Lean into the mascot more consistently.** `mascot.js`/`mascots.js`
  already exist and appear in feedback (`fb__mascot`); making sure the
  mascot shows up at more "helpful" moments (empty states, streak recovery,
  first-time hints) reinforces the friendly, tutor-like feel rather than a
  plain quiz app.
- **Consistent rounded-corner scale.** `--radius: 16px` is defined but some
  elements use ad hoc values (`14px`, `22px`, `999px` pills mixed with square
  edges elsewhere). Standardising the radius scale keeps the "soft" look
  coherent across screens.

## 4. Feedback prompts disappearing too quickly

**The problem, in `src/app.js` (`showFeedback`)**:

```js
const instant = ok && !typoNote;
const delay = instant ? 1000 : ok ? 2200 : 3500;
```

When an answer is fully correct (no typo nudge), the feedback panel — title,
mascot, streak praise — is shown for only **1 second** with *no* "Continue"
button (`instant` skips rendering it), so there is no way to pause and read
it; it auto-advances regardless of reading speed. The listening exercise has
the same pattern (`app.js:919`): a correct answer auto-advances after just
**1 second** with no button.

Even the "learning moment" (wrong-answer) path at 3.5s / 3s in the listening
flow may be too short for some learners to read the answer, its meaning, and
the "comes round again" note, especially for longer words/phrases or younger
readers — which matches the "prompts disappear too quickly" complaint.

**Fix directions:**
- Always render the "Continue" button, even on the instant/correct path, so
  a learner can dismiss the feedback at their own pace instead of racing a
  timer. The auto-advance timer can stay as a convenience for people who
  don't need to stop and read, but it shouldn't be the *only* way through —
  pressing/tapping should cancel the pending auto-advance.
- Consider scaling delay with the length of the text shown (e.g. base delay
  + a small per-character allowance) rather than one fixed number for every
  answer.
- Respect `prefers-reduced-motion`/accessibility settings or add a
  user-facing "feedback speed" setting, consistent with the app's existing
  pattern of respecting reduced-motion for animations elsewhere in
  `main.css`.

## Summary of recommended priority

1. Fix `.ex__input` background/colour so typed text is always legible in dark
   mode (small, high-impact CSS fix).
2. Always show a dismissible "Continue" control on feedback, even for
   instant/correct answers, so pacing is user-controlled, not just a fixed
   timer.
3. Do a full pass for hardcoded colours (`#fff`, `#000`-based shadows, etc.)
   that bypass the `--ink`/`--card`/`--bg` theme tokens, to prevent future
   dark-mode regressions.
4. Iterate on palette warmth (tinted shadows, less stark white, consistent
   radius scale, more mascot presence) to push the "friendly and soft"
   feeling further.
