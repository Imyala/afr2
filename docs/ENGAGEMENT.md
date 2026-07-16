# Engagement & retention design

The goal is to get learners — especially school kids — to come back **every
day**, because daily practice is exactly what the spaced-repetition engine
needs to produce real retention (see [PEDAGOGY.md](PEDAGOGY.md)). The
engagement layer is built to *serve* the learning, never to replace it.

## The retention mechanics (all offline)

| Mechanic | What it does | Where |
|---|---|---|
| **Daily streak** | Counts consecutive days studied; the headline "don't break it" motivator. | `store.js` |
| **Streak freeze** ❄️ | Buyable with gems; automatically saves a streak across one missed day so a single bad day doesn't wipe weeks of effort (reduces rage-quitting). | `store.markStudiedToday`, `gamify.buyStreakFreeze` |
| **Daily quests** 🎯 | 3 fresh, achievable goals each day, now mixed between classic goals and learner-specific ones like recovery missions, overdue-word mastery, toughest-word repair, or a high-accuracy story finish. Gives a reason to open the app *today* without fake urgency. | `gamify.js` |
| **Achievement badges** 🏅 | Milestone badges plus unit/theme-completion badges, so progress is tied to real chunks of the curriculum, not only raw XP totals. | `gamify.js` → `ACHIEVEMENTS` |
| **Weekly leagues** 🏆 | Bronze → Diamond. Earn weekly XP to advance; fall back if you go quiet. A weekly progression arc. | `gamify.js` → `LEAGUES` |
| **Daily login reward** 🎁 | A gem chest that grows with consecutive logins, then resets — a simple "come back tomorrow" loop. | `gamify.claimDailyReward` |
| **Gems economy** 💎 | Earned from quests/badges/logins; spent on streak freezes and heart refills. Ties all the loops together. | `gamify.js` |
| **Hearts/lives** ❤️ | Mild stakes that make learners slow down and think; never block *practice* of old words. | `store.js` |
| **Repair mode** 🌱 | After a learner misses 2+ days, the first review session shrinks the backlog and mixes in easier wins before returning to the full queue. This keeps re-entry encouraging instead of punishing. | `app.js`, `lessons.js` |
| **Targeted reminders** 🔔 | Reminder timing is learner-configurable, and the copy changes based on what is actually true: streak at risk, reviews due, unfinished plan, quest still open, or a gentle win-back after a couple of missed days. | `notify.js`, `sw.js` |

Each loop operates on a different timescale — **per-session** (XP, hearts),
**daily** (quests, streak, login reward), and **weekly** (leagues) — so there's
always a near-term and a longer-term reason to return.

## Reading as engagement *and* learning

Stories are intrinsically motivating ("what happens next?") and also build real
comprehension. Reading completion drives a quest and a badge, and the
comprehension questions feed the same spaced-repetition engine as lessons. The
in-app Library points to thousands more free, openly-licensed books so a keen
reader never runs out.

## A note on "addictive" — done responsibly

The app is aimed at children, so the engagement design deliberately uses
**healthy habit-formation** patterns and avoids manipulative dark patterns:

- **No pay-to-win pressure or fake urgency.** Hearts refill over time for free;
  practice of already-learned words is always free and never gated.
- **No fake social pressure.** Leagues are a single-player progression target,
  not bots pretending to be classmates beating the child.
- **The streak forgives.** Streak freezes exist specifically so one missed day
  doesn't punish a child into quitting.
- **Missed days trigger gentleness, not guilt.** Recovery quests and win-back
  reminders frame the next session as a small restart, not a scolding backlog.
- **The "win" metric is learning.** XP/gems are framed as effort and currency;
  the Progress page's headline number is *words mastered* and *retention*, not
  XP — so the rewards point back at real learning.

The intent is "a habit kids enjoy keeping", not compulsion. For a classroom
deployment, a teacher can also lean on the streak/quests as a gentle daily
homework nudge.
