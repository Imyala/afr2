// mascots.js — the illustrated companion cast.
//
// A troop of Southern African characters (art by the MzansiLingo team) that the
// learner meets around the app. A "buddy of the day" greets them on the home and
// plan heroes — the same character all day, rotating through the whole troop day
// by day, so it's a familiar companion that still keeps changing.
//
// Each buddy has their OWN voice: a small pool of in-character greeting lines,
// drawn from their traits, so meeting Rendani the rhino feels different from
// meeting Gigi the giraffe. The expressive line-drawn meerkat in mascot.js still
// handles answer feedback (it can smile, cheer and frown); this cast is for the
// warm "hello" spots.

export const MASCOT_CAST = [
  { id: 'lion', name: 'Leo', animal: 'lion', traits: 'Brave · Proud · Leader',
    personality: 'a bold, regal motivator who leads from the front',
    lines: [
      'Leo here 🦁 Lead the day — let\'s learn!',
      'A little courage, a little practice. Roar!',
      'Kings and queens practise daily. Come!',
      'Chin up, crown on — let\'s go! 👑',
    ] },
  { id: 'elephant', name: 'Zola', animal: 'elephant', traits: 'Wise · Patient · Strong',
    personality: 'a calm, wise elder who never rushes and never forgets',
    lines: [
      'Zola here 🐘 Slow and steady — we never forget.',
      'Patience, my friend. One word at a time.',
      'Big memory, big heart. Let\'s practise.',
      'Wisdom grows daily. Shall we begin?',
    ] },
  { id: 'zebra', name: 'Ziba', animal: 'zebra', traits: 'Focused · Fast · Determined',
    personality: 'a sporty, focused sprinter who earns every stripe',
    lines: [
      'Ziba here 🦓 Eyes on the stripes — focus!',
      'No shortcuts, just sprint. Let\'s go!',
      'Every stripe earned. Ready to run?',
      'Quick and sharp today — come on!',
    ] },
  { id: 'giraffe', name: 'Gigi', animal: 'giraffe', traits: 'Insightful · Calm · Curious',
    personality: 'a gentle, curious dreamer who sees how it all connects',
    lines: [
      'Gigi here 🦒 From up here, it all connects.',
      'Stay curious — new words await!',
      'Head high, heart calm. Let\'s explore.',
      'A big view starts with small steps.',
    ] },
  { id: 'hippo', name: 'Hodi', animal: 'hippo', traits: 'Steady · Reliable · Hardworking',
    personality: 'a chilled, dependable grafter who just keeps showing up',
    lines: [
      'Hodi here 🦛 Steady wins — splash in!',
      'Show up, do the work. That\'s the secret.',
      'One splash at a time, we get there.',
      'Reliable as the river. Let\'s practise.',
    ] },
  { id: 'crocodile', name: 'Kroko', animal: 'crocodile', traits: 'Strategic · Adaptable · Sharp',
    personality: 'a sly, clever tactician with a toothy grin',
    lines: [
      'Kroko here 🐊 Snap! Let\'s outsmart these words.',
      'Sharp mind, sharp smile. Ready?',
      'Patience… then strike. Let\'s learn!',
      'Adapt and win — come on!',
    ] },
  { id: 'cheetah', name: 'Chipo', animal: 'cheetah', traits: 'Quick · Agile · Ambitious',
    personality: 'a hyped, ambitious speedster who loves a fast win',
    lines: [
      'Chipo here 🐆 Fastest cat, fastest learner!',
      'Blink and you\'ll level up. Go go go!',
      'Speed plus practice equals champion. Run!',
      'Big dreams, quick paws. Let\'s dash!',
    ] },
  { id: 'leopard', name: 'Lebo', animal: 'leopard', traits: 'Stealthy · Precise · Independent',
    personality: 'a cool, precise loner who never wastes a move',
    lines: [
      'Lebo here 🐆 Quiet focus. Every word on target.',
      'Cool and precise — let\'s nail it.',
      'One clean move at a time. Ready?',
      'Stealthy and sharp. Let\'s go.',
    ] },
  { id: 'gorilla', name: 'Gugu', animal: 'gorilla', traits: 'Strong · Protective · Loyal',
    personality: 'a warm, protective big friend who has your back',
    lines: [
      'Gugu here 🦍 I\'ve got your back — let\'s go!',
      'Strong together. One word at a time.',
      'No worries, friend. We\'ll get it.',
      'Big strength, bigger heart. Come!',
    ] },
  { id: 'antelope', name: 'Ayanda', animal: 'antelope', traits: 'Graceful · Alert · Resilient',
    personality: 'a graceful bouncer-back who treats mistakes as practice',
    lines: [
      'Ayanda here 🦌 Leap in — mistakes are practice!',
      'Light on your feet, sharp in your mind.',
      'Fall, bounce, learn. Let\'s go!',
      'Grace and grit today — ready?',
    ] },
  { id: 'meerkat', name: 'Themba', animal: 'meerkat', traits: 'Observant · Clever · Team-first',
    personality: 'a chirpy, watchful teammate who learns best together',
    lines: [
      'Themba here 🐾 Eyes up! Let\'s learn together.',
      'Spot the words — I\'ll help you catch them!',
      'Clever and quick, as a team. Come!',
      'Standing tall for you. Ready to start?',
    ] },
  { id: 'mandrill', name: 'Mandla', animal: 'mandrill', traits: 'Intelligent · Bold · Natural leader',
    personality: 'a bold, colourful showman with brains to match',
    lines: [
      'Mandla here 🐒 Bold colours, bold moves!',
      'Smart and fearless — let\'s shine.',
      'Lead with brains today. Ready?',
      'Stand out, speak up. Let\'s go!',
    ] },
  { id: 'rhino', name: 'Rendani', animal: 'rhino', traits: 'Tough · Focused · Unstoppable',
    personality: 'a tough, no-nonsense charger that nothing slows down',
    lines: [
      'Rendani here 🦏 Charge in — nothing stops us!',
      'Tough word? Watch me. Watch you!',
      'Head down, horn up. Let\'s push!',
      'Unstoppable today. Come on!',
    ] },
  { id: 'buffalo', name: 'Bheki', animal: 'buffalo', traits: 'Determined · Strong · United',
    personality: 'a steadfast herd-leader who believes in team strength',
    lines: [
      'Bheki here 🐃 Together, we\'re unstoppable!',
      'Strong herd, strong learner. Let\'s go!',
      'Steady and united — we\'ve got this.',
      'One team, one goal. Ready?',
    ] },
];

export function mascotById(id) {
  return MASCOT_CAST.find((m) => m.id === id) || MASCOT_CAST[0];
}

// Pick a cast member by a stable numeric seed (e.g. a day number).
export function mascotBySeed(seed = 0) {
  return MASCOT_CAST[Math.abs(seed | 0) % MASCOT_CAST.length];
}

// A line in this buddy's own voice. `seed` (e.g. XP + streak) rotates through
// their pool so the character stays chatty across the day without repeating.
export function mascotGreeting(idOrMascot, seed = 0) {
  const m = typeof idOrMascot === 'string' ? mascotById(idOrMascot) : (idOrMascot || MASCOT_CAST[0]);
  return m.lines[Math.abs(seed | 0) % m.lines.length];
}

// Render a cast member as an <img>. Height drives the size; width follows the
// character's own proportions (a giraffe is slim, a hippo wide) via CSS, so
// nobody gets squashed. Decorative by default — the greeting text carries the
// meaning, so screen readers skip the picture unless an explicit alt is given.
export function mascotImg(idOrMascot, { size = 96, className = '', alt = null } = {}) {
  const m = typeof idOrMascot === 'string' ? mascotById(idOrMascot) : (idOrMascot || MASCOT_CAST[0]);
  const a11y = alt == null
    ? 'alt="" aria-hidden="true"'
    : `alt="${alt || `${m.name} the ${m.animal}`}"`;
  return `<img class="mascot-img ${className}" src="assets/mascots/${m.id}.png" `
    + `style="height:${size}px" loading="lazy" decoding="async" ${a11y} />`;
}
