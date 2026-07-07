// mascot.js — answer-feedback voice lines.
//
// The illustrated buddy cast (mascots.js) carries the visuals; this module
// keeps the short, warm lines that accompany answer feedback. The cheer pool
// is deliberately large so a single session rarely repeats a line —
// repetition is what makes praise stop landing.

const CHEERS = [
  'Sharp sharp! 🎉', 'Yebo! You nailed it!', 'Halala! Well played!',
  'Lekker! Spot on. 👏', 'Kwaai — that\'s the one!', 'Mooi! Exactly right.',
  'Aweh! You got it. ⭐', 'Too good! Nailed it.', 'Boom — correct!',
  'Yhu, clean answer!', 'Spot on, star!', 'That\'s it exactly! 🙌',
  'Grootman! Perfect.', 'Ncaa, beautiful!', 'On the money! 💯',
  'Eish, you\'re sharp!',
];

// Titles for a miss, framed as LEARNING rather than failure — never "wrong",
// never a red ✗. The answer (shown beneath) is the payoff of the moment.
const LEARNS = [
  'Good try — here\'s the trick 💡', 'Ooh, sneaky one!', 'So close!',
  'Now you know 💡', 'New one — no stress 🌱', 'Tricky! Let\'s learn it',
  'Take a look 👀', 'Every miss teaches 🌱',
];
export function learnLine(seed = 0) {
  return LEARNS[Math.abs(seed) % LEARNS.length];
}

// Praise for a correct answer. `seed` keeps the choice stable for one render
// (pass an ever-incrementing counter so consecutive answers differ); `combo`
// is the current run of correct-in-a-row so a streak gets its own escalating
// call-out at milestones instead of yet another generic line.
export function cheerLine(seed = 0, combo = 0) {
  if (combo >= 3 && (combo === 3 || combo % 5 === 0)) {
    return combo >= 5 ? `🔥 ${combo} in a row — unstoppable!` : '🔥 Three in a row!';
  }
  return CHEERS[Math.abs(seed) % CHEERS.length];
}
