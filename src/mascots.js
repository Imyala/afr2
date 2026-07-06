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
      'Brave hearts learn best. In we go!',
      'One proud step at a time. Roar! 🦁',
      'Lead your own pride — start here.',
      'No fear today, just fun. Let\'s go!',
      'Stand tall, speak bold. Ready?',
      'The savanna\'s yours — claim a word!',
    ] },
  { id: 'elephant', name: 'Zola', animal: 'elephant', traits: 'Wise · Patient · Strong',
    personality: 'a calm, wise elder who never rushes and never forgets',
    lines: [
      'Zola here 🐘 Slow and steady — we never forget.',
      'Patience, my friend. One word at a time.',
      'Big memory, big heart. Let\'s practise.',
      'Wisdom grows daily. Shall we begin?',
      'Every word you meet, you keep. 🐘',
      'No rush — deep roots grow strong.',
      'Breathe, focus, learn. Together now.',
      'Old words, new words — all welcome.',
      'A calm mind remembers everything.',
      'Little by little fills the calabash.',
    ] },
  { id: 'zebra', name: 'Ziba', animal: 'zebra', traits: 'Focused · Fast · Determined',
    personality: 'a sporty, focused sprinter who earns every stripe',
    lines: [
      'Ziba here 🦓 Eyes on the stripes — focus!',
      'No shortcuts, just sprint. Let\'s go!',
      'Every stripe earned. Ready to run?',
      'Quick and sharp today — come on!',
      'On your marks… learn, set, go! 🦓',
      'Focus wins races. Eyes forward!',
      'One dash a day keeps you sharp.',
      'Black, white, and bright — let\'s move!',
      'Determined stripes never quit. Come!',
      'Warm up those words — sprint time!',
    ] },
  { id: 'giraffe', name: 'Gigi', animal: 'giraffe', traits: 'Insightful · Calm · Curious',
    personality: 'a gentle, curious dreamer who sees how it all connects',
    lines: [
      'Gigi here 🦒 From up here, it all connects.',
      'Stay curious — new words await!',
      'Head high, heart calm. Let\'s explore.',
      'A big view starts with small steps.',
      'Reach a little higher today. 🦒',
      'Curiosity is your superpower!',
      'See the whole story, one word up.',
      'Gentle and steady, we grow tall.',
      'What will we discover today?',
      'The best view is worth the climb.',
    ] },
  { id: 'hippo', name: 'Hodi', animal: 'hippo', traits: 'Steady · Reliable · Hardworking',
    personality: 'a chilled, dependable grafter who just keeps showing up',
    lines: [
      'Hodi here 🦛 Steady wins — splash in!',
      'Show up, do the work. That\'s the secret.',
      'One splash at a time, we get there.',
      'Reliable as the river. Let\'s practise.',
      'Warm water, warm welcome. Dive in! 🦛',
      'Slow river, steady progress. Come!',
      'A little daily beats big cramming.',
      'I\'m here, you\'re here — let\'s work.',
      'Splash by splash, you\'re getting good.',
      'Nothing fancy, just solid practice.',
    ] },
  { id: 'crocodile', name: 'Kroko', animal: 'crocodile', traits: 'Strategic · Adaptable · Sharp',
    personality: 'a sly, clever tactician with a toothy grin',
    lines: [
      'Kroko here 🐊 Snap! Let\'s outsmart these words.',
      'Sharp mind, sharp smile. Ready?',
      'Patience… then strike. Let\'s learn!',
      'Adapt and win — come on!',
      'Lurk, learn, leap. Let\'s go! 🐊',
      'Clever beats strong. Think with me.',
      'Every word\'s a puzzle — snap it up!',
      'Cool water, hot streak. Ready?',
      'Outsmart today, one word at a time.',
      'Grin and grind — we\'ve got this.',
    ] },
  { id: 'cheetah', name: 'Chipo', animal: 'cheetah', traits: 'Quick · Agile · Ambitious',
    personality: 'a hyped, ambitious speedster who loves a fast win',
    lines: [
      'Chipo here 🐆 Fastest cat, fastest learner!',
      'Blink and you\'ll level up. Go go go!',
      'Speed plus practice equals champion. Run!',
      'Big dreams, quick paws. Let\'s dash!',
      'Ready, set, sprint to a win! 🐆',
      'Quick wins add up fast. Let\'s move!',
      'Chase that streak — full speed!',
      'No time to lose, lots to gain. Go!',
      'Fast paws, big dreams. Come on!',
      'Catch a word before it runs!',
    ] },
  { id: 'leopard', name: 'Lebo', animal: 'leopard', traits: 'Stealthy · Precise · Independent',
    personality: 'a cool, precise loner who never wastes a move',
    lines: [
      'Lebo here 🐆 Quiet focus. Every word on target.',
      'Cool and precise — let\'s nail it.',
      'One clean move at a time. Ready?',
      'Stealthy and sharp. Let\'s go.',
      'Calm, quiet, ready. Let\'s begin. 🐆',
      'Aim for one, land it clean.',
      'No noise, just progress. Come.',
      'Precision beats hurry every time.',
      'Focus like a hunter — eyes on the word.',
      'Smooth and steady wins the night.',
    ] },
  { id: 'gorilla', name: 'Gugu', animal: 'gorilla', traits: 'Strong · Protective · Loyal',
    personality: 'a warm, protective big friend who has your back',
    lines: [
      'Gugu here 🦍 I\'ve got your back — let\'s go!',
      'Strong together. One word at a time.',
      'No worries, friend. We\'ll get it.',
      'Big strength, bigger heart. Come!',
      'Lean on me — we learn as a team. 🦍',
      'Gentle giant, big cheer for you!',
      'Mistakes? No stress. I\'m right here.',
      'Strong hearts practise together.',
      'You\'ve got this — and you\'ve got me.',
      'One family, one goal. Let\'s go!',
    ] },
  { id: 'antelope', name: 'Ayanda', animal: 'antelope', traits: 'Graceful · Alert · Resilient',
    personality: 'a graceful bouncer-back who treats mistakes as practice',
    lines: [
      'Ayanda here 🦌 Leap in — mistakes are practice!',
      'Light on your feet, sharp in your mind.',
      'Fall, bounce, learn. Let\'s go!',
      'Grace and grit today — ready?',
      'Every leap makes you braver. 🦌',
      'Stumble, spring back, keep going!',
      'Graceful and gutsy — that\'s you.',
      'Small hops become big journeys.',
      'Alert and ready — let\'s bound in!',
      'You\'re quicker than you think. Go!',
    ] },
  { id: 'meerkat', name: 'Themba', animal: 'meerkat', traits: 'Observant · Clever · Team-first',
    personality: 'a chirpy, watchful teammate who learns best together',
    lines: [
      'Themba here 🐾 Eyes up! Let\'s learn together.',
      'Spot the words — I\'ll help you catch them!',
      'Clever and quick, as a team. Come!',
      'Standing tall for you. Ready to start?',
      'Lookout\'s ready — let\'s go, team! 🐾',
      'Two sets of eyes beat one. Come!',
      'On watch for you. Let\'s practise.',
      'Little but mighty — just like us!',
      'Spot it, learn it, keep it. Ready?',
      'Together we don\'t miss a thing.',
    ] },
  { id: 'mandrill', name: 'Mandla', animal: 'mandrill', traits: 'Intelligent · Bold · Natural leader',
    personality: 'a bold, colourful showman with brains to match',
    lines: [
      'Mandla here 🐒 Bold colours, bold moves!',
      'Smart and fearless — let\'s shine.',
      'Lead with brains today. Ready?',
      'Stand out, speak up. Let\'s go!',
      'Show your colours — learn out loud! 🐒',
      'Clever and colourful. Let\'s dazzle.',
      'Big brain, bigger confidence. Come!',
      'Be bold, be bright, be brilliant.',
      'Fearless minds learn fastest. Go!',
      'Shine today — you\'ve earned it.',
    ] },
  { id: 'rhino', name: 'Rendani', animal: 'rhino', traits: 'Tough · Focused · Unstoppable',
    personality: 'a tough, no-nonsense charger that nothing slows down',
    lines: [
      'Rendani here 🦏 Charge in — nothing stops us!',
      'Tough word? Watch me. Watch you!',
      'Head down, horn up. Let\'s push!',
      'Unstoppable today. Come on!',
      'Full charge ahead — let\'s learn! 🦏',
      'Thick skin, sharp focus. Ready?',
      'Push through — you\'re tougher than that word.',
      'One horn, one goal. Straight ahead!',
      'No backing down. Let\'s go!',
      'Steady power beats every wall.',
    ] },
  { id: 'buffalo', name: 'Bheki', animal: 'buffalo', traits: 'Determined · Strong · United',
    personality: 'a steadfast herd-leader who believes in team strength',
    lines: [
      'Bheki here 🐃 Together, we\'re unstoppable!',
      'Strong herd, strong learner. Let\'s go!',
      'Steady and united — we\'ve got this.',
      'One team, one goal. Ready?',
      'Move with the herd — learn as one! 🐃',
      'Strength in numbers, strength in you.',
      'Shoulder to shoulder, we push on.',
      'Slow, strong, and sure. Let\'s go!',
      'The herd believes in you. Come!',
      'United we win. In we go!',
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
