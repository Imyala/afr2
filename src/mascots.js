// mascots.js — the illustrated companion cast.
//
// A troop of Southern African characters (art by the MzansiLingo team) that the
// learner meets around the app. Rather than showing the same face every time, a
// different buddy greets them — chosen once per app open and cycled through the
// whole cast, so it feels like a rotating companion, not a random flicker.
//
// These are the friendly headline characters. The expressive line-drawn meerkat
// in mascot.js still handles answer feedback (it can smile, cheer and frown);
// this cast is for the warm "hello" spots — the home and plan heroes.

export const MASCOT_CAST = [
  { id: 'lion',      name: 'Leo',     animal: 'lion',       traits: 'Brave · Proud · Leader' },
  { id: 'elephant',  name: 'Zola',    animal: 'elephant',   traits: 'Wise · Patient · Strong' },
  { id: 'zebra',     name: 'Ziba',    animal: 'zebra',      traits: 'Focused · Fast · Determined' },
  { id: 'giraffe',   name: 'Gigi',    animal: 'giraffe',    traits: 'Insightful · Calm · Curious' },
  { id: 'hippo',     name: 'Hodi',    animal: 'hippo',      traits: 'Steady · Reliable · Hardworking' },
  { id: 'crocodile', name: 'Kroko',   animal: 'crocodile',  traits: 'Strategic · Adaptable · Sharp' },
  { id: 'cheetah',   name: 'Chipo',   animal: 'cheetah',    traits: 'Quick · Agile · Ambitious' },
  { id: 'leopard',   name: 'Lebo',    animal: 'leopard',    traits: 'Stealthy · Precise · Independent' },
  { id: 'gorilla',   name: 'Gugu',    animal: 'gorilla',    traits: 'Strong · Protective · Loyal' },
  { id: 'antelope',  name: 'Ayanda',  animal: 'antelope',   traits: 'Graceful · Alert · Resilient' },
  { id: 'meerkat',   name: 'Themba',  animal: 'meerkat',    traits: 'Observant · Clever · Team-first' },
  { id: 'mandrill',  name: 'Mandla',  animal: 'mandrill',   traits: 'Intelligent · Bold · Natural leader' },
  { id: 'rhino',     name: 'Rendani', animal: 'rhino',      traits: 'Tough · Focused · Unstoppable' },
  { id: 'buffalo',   name: 'Bheki',   animal: 'buffalo',    traits: 'Determined · Strong · United' },
];

export function mascotById(id) {
  return MASCOT_CAST.find((m) => m.id === id) || MASCOT_CAST[0];
}

// Pick a cast member by a stable numeric seed (e.g. a rotation counter).
export function mascotBySeed(seed = 0) {
  return MASCOT_CAST[Math.abs(seed | 0) % MASCOT_CAST.length];
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
