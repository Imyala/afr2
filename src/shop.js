// shop.js — the rewards economy. Learners earn gems (from quests, badges, daily
// logins and finishing lessons) and spend them here on power-ups and cosmetics.
// This is the "earn it, then spend it" incentive loop.

// Consumable power-ups.
export const POWERUPS = [
  { id: 'streak_freeze', name: 'Streak Freeze', icon: '❄️', cost: 50, desc: 'Saves your streak if you miss a day.' },
  { id: 'heart_refill', name: 'Heart Refill', icon: '❤️', cost: 30, desc: 'Instantly refill all your hearts.' },
  { id: 'double_xp', name: 'Double XP', icon: '⚡', cost: 40, desc: 'Doubles the XP from your next session.' },
];

// Cosmetic buddies — buy once, then equip. Shown cheering you on at home.
// Buddies you can equip. Every entry is a real member of the illustrated cast
// in src/mascots.js with art in assets/mascots/ — the catalogue used to list a
// springbok and a penguin that had no artwork and could never be shown.
// "Surprise me" keeps the daily-rotating cast for learners who like the
// variety; anything else pins that buddy everywhere in the app.
export const MASCOTS = [
  { id: 'zebra', name: 'Ziba the Zebra', icon: '🦓', cost: 0, desc: 'Your starter buddy.' },
  { id: 'random', name: 'Surprise me', icon: '🎲', cost: 0, desc: 'A different buddy each day.' },
  { id: 'meerkat', name: 'Themba the Meerkat', icon: '🦫', cost: 80, desc: 'Always keeping watch.' },
  { id: 'lion', name: 'Leo the Lion', icon: '🦁', cost: 150, desc: 'King of the savanna.' },
  { id: 'giraffe', name: 'Gigi the Giraffe', icon: '🦒', cost: 170, desc: 'Sees how it all connects.' },
  { id: 'elephant', name: 'Zola the Elephant', icon: '🐘', cost: 200, desc: 'Never forgets a word.' },
  { id: 'antelope', name: 'Ayanda the Antelope', icon: '🦌', cost: 220, desc: 'Quick and proudly SA.' },
  { id: 'cheetah', name: 'Chipo the Cheetah', icon: '🐆', cost: 240, desc: 'Fastest learner alive.' },
  { id: 'hippo', name: 'Hodi the Hippo', icon: '🦛', cost: 260, desc: 'Steady wins the day.' },
  { id: 'crocodile', name: 'Kroko the Crocodile', icon: '🐊', cost: 280, desc: 'Patient, then decisive.' },
  { id: 'leopard', name: 'Lebo the Leopard', icon: '🐅', cost: 300, desc: 'Quiet and precise.' },
  { id: 'gorilla', name: 'Gugu the Gorilla', icon: '🦍', cost: 330, desc: 'Gentle and strong.' },
  { id: 'buffalo', name: 'Bheki the Buffalo', icon: '🐃', cost: 360, desc: 'Never studies alone.' },
  { id: 'mandrill', name: 'Mandla the Mandrill', icon: '🐒', cost: 380, desc: 'Bold and colourful.' },
  { id: 'rhino', name: 'Rendani the Rhino', icon: '🦏', cost: 400, desc: 'Tough and rare.' },
];

// Colour themes — buy once, then equip. Overrides the accent palette.
// `vars` are tuned for light backgrounds; `darkVars` are brightened so the
// same accents stay readable on the dark theme (the app reads one or the
// other based on the OS colour scheme — see applyTheme).
// Colour themes — buy once, then equip. A theme repaints the HUE TOKENS the
// whole stylesheet is built on (see "UMBALA WARM" in styles/main.css), not a
// handful of legacy aliases, so buying one recolours every screen instead of
// four elements. Each entry supplies a fill / ink / tint / edge quartet for the
// two hues that carry the brand, plus the accent used for links and info.
// `darkVars` are the brightened equivalents for the dark theme, where the fill
// must be light enough to carry near-black --on-fill text.
export const THEMES = [
  { id: 'savanna', name: 'Savanna', icon: '🌳', cost: 0,
    vars: {
      '--c-aloe': '#0b7139', '--c-aloe-ink': '#0b7139', '--c-aloe-tint': '#e7eee4', '--c-aloe-edge': '#054b27',
      '--c-marula': '#7f5709', '--c-marula-ink': '#7f5709', '--c-marula-tint': '#f2ecdf', '--c-marula-edge': '#553903', '--c-marula-glow': '#e9a71c',
      '--c-ocean': '#0a66a2', '--c-ocean-ink': '#0a66a2', '--c-ocean-tint': '#e6edee', '--c-ocean-edge': '#04456e',
    },
    darkVars: {
      '--c-aloe': '#3ed584', '--c-aloe-ink': '#3ed584', '--c-aloe-tint': '#253928', '--c-aloe-edge': '#12844f',
      '--c-marula': '#e9aa22', '--c-marula-ink': '#e9aa22', '--c-marula-tint': '#403219', '--c-marula-edge': '#9a6c0c', '--c-marula-glow': '#f2be44',
      '--c-ocean': '#6fbcfd', '--c-ocean-ink': '#6fbcfd', '--c-ocean-tint': '#2d353c', '--c-ocean-edge': '#1a70ae',
    } },
  { id: 'ocean', name: 'Two Oceans', icon: '🌊', cost: 120,
    vars: {
      '--c-aloe': '#0a66a2', '--c-aloe-ink': '#0a66a2', '--c-aloe-tint': '#e6edee', '--c-aloe-edge': '#04456e',
      '--c-marula': '#0b6c6a', '--c-marula-ink': '#0b6c6a', '--c-marula-tint': '#e7eee9', '--c-marula-edge': '#054846', '--c-marula-glow': '#17b3b0',
      '--c-ocean': '#0b7139', '--c-ocean-ink': '#0b7139', '--c-ocean-tint': '#e7eee4', '--c-ocean-edge': '#054b27',
    },
    darkVars: {
      '--c-aloe': '#6fbcfd', '--c-aloe-ink': '#6fbcfd', '--c-aloe-tint': '#2d353c', '--c-aloe-edge': '#1a70ae',
      '--c-marula': '#2acfcb', '--c-marula-ink': '#2acfcb', '--c-marula-tint': '#223834', '--c-marula-edge': '#0e807d', '--c-marula-glow': '#4fdedb',
      '--c-ocean': '#3ed584', '--c-ocean-ink': '#3ed584', '--c-ocean-tint': '#253928', '--c-ocean-edge': '#12844f',
    } },
  { id: 'sunset', name: 'Kalahari Sunset', icon: '🌅', cost: 150,
    vars: {
      '--c-aloe': '#a1470a', '--c-aloe-ink': '#a1470a', '--c-aloe-tint': '#f6eadf', '--c-aloe-edge': '#6b2c04',
      '--c-marula': '#7f5709', '--c-marula-ink': '#7f5709', '--c-marula-tint': '#f2ecdf', '--c-marula-edge': '#553903', '--c-marula-glow': '#e9a71c',
      '--c-ocean': '#b72232', '--c-ocean-ink': '#b72232', '--c-ocean-tint': '#f8e6e3', '--c-ocean-edge': '#7b0c18',
    },
    darkVars: {
      '--c-aloe': '#fd9860', '--c-aloe-ink': '#fd9860', '--c-aloe-tint': '#432f23', '--c-aloe-edge': '#b25626',
      '--c-marula': '#e9aa22', '--c-marula-ink': '#e9aa22', '--c-marula-tint': '#403219', '--c-marula-edge': '#9a6c0c', '--c-marula-glow': '#f2be44',
      '--c-ocean': '#fd9290', '--c-ocean-ink': '#fd9290', '--c-ocean-tint': '#432e2a', '--c-ocean-edge': '#b04a49',
    } },
  { id: 'protea', name: 'Protea Pink', icon: '🌸', cost: 150,
    vars: {
      '--c-aloe': '#a82a7e', '--c-aloe-ink': '#a82a7e', '--c-aloe-tint': '#f6e7eb', '--c-aloe-edge': '#71104f',
      '--c-marula': '#7f5709', '--c-marula-ink': '#7f5709', '--c-marula-tint': '#f2ecdf', '--c-marula-edge': '#553903', '--c-marula-glow': '#e9a71c',
      '--c-ocean': '#7245c4', '--c-ocean-ink': '#7245c4', '--c-ocean-tint': '#f1eaf2', '--c-ocean-edge': '#4a2596',
    },
    darkVars: {
      '--c-aloe': '#fd86ce', '--c-aloe-ink': '#fd86ce', '--c-aloe-tint': '#432c34', '--c-aloe-edge': '#b04188',
      '--c-marula': '#e9aa22', '--c-marula-ink': '#e9aa22', '--c-marula-tint': '#403219', '--c-marula-edge': '#9a6c0c', '--c-marula-glow': '#f2be44',
      '--c-ocean': '#bba4fd', '--c-ocean-ink': '#bba4fd', '--c-ocean-tint': '#39313c', '--c-ocean-edge': '#6d4fc0',
    } },
];

export function findItem(id) {
  return [...POWERUPS, ...MASCOTS, ...THEMES].find((x) => x.id === id) || null;
}

export function inventory(store) {
  if (!store.state.inventory) {
    store.state.inventory = {
      owned: { zebra: true, savanna: true },
      equipped: { mascot: 'zebra', theme: 'savanna' },
      boosts: { double_xp: 0 },
    };
    store.save();
  }
  const inv = store.state.inventory;
  inv.owned = inv.owned || { zebra: true, savanna: true };
  inv.equipped = inv.equipped || { mascot: 'zebra', theme: 'savanna' };
  inv.boosts = inv.boosts || { double_xp: 0 };
  return inv;
}

export function owns(store, id) { return !!inventory(store).owned[id]; }

// Attempt a purchase. Returns { ok, reason }.
export function buy(store, id) {
  const item = findItem(id);
  if (!item) return { ok: false, reason: 'Unknown item' };
  const gems = store.state.gems || 0;
  if (gems < item.cost) return { ok: false, reason: 'Not enough gems' };

  // consumables apply immediately; cosmetics are added to inventory
  const isPowerup = POWERUPS.some((p) => p.id === id);
  if (!isPowerup && owns(store, id)) return { ok: false, reason: 'Already owned' };

  store.state.gems = gems - item.cost;
  const inv = inventory(store);

  if (isPowerup) {
    if (id === 'streak_freeze') store.lang().streakFreezes = (store.lang().streakFreezes || 0) + 1;
    else if (id === 'heart_refill') store.refillHearts();
    else if (id === 'double_xp') inv.boosts.double_xp = (inv.boosts.double_xp || 0) + 1;
  } else {
    inv.owned[id] = true;
    // auto-equip a freshly bought cosmetic
    if (MASCOTS.some((m) => m.id === id)) inv.equipped.mascot = id;
    if (THEMES.some((t) => t.id === id)) inv.equipped.theme = id;
  }
  store.save();
  return { ok: true, item };
}

export function equip(store, id) {
  const inv = inventory(store);
  if (!inv.owned[id]) return false;
  if (MASCOTS.some((m) => m.id === id)) inv.equipped.mascot = id;
  else if (THEMES.some((t) => t.id === id)) inv.equipped.theme = id;
  else return false;
  store.save();
  return true;
}

export function equippedMascot(store) {
  const inv = inventory(store);
  return MASCOTS.find((m) => m.id === inv.equipped.mascot) || MASCOTS[0];
}

// Apply the equipped colour theme to the document. Picks the brightened
// `darkVars` when the app is in dark mode — read from <html data-theme="…">,
// which the app stamps from the learner's Appearance setting (light by
// default) — so accents (headings, links, the "Beginner" level tag, region
// names…) keep enough contrast to stay legible.
export function applyTheme(store, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  const inv = inventory(store);
  const theme = THEMES.find((t) => t.id === inv.equipped.theme) || THEMES[0];
  const el = doc.documentElement;
  const dark = !!(el.dataset && el.dataset.theme === 'dark');
  const vars = (dark && theme.darkVars) ? theme.darkVars : theme.vars;
  // Clear every property any theme could have set, so switching themes never
  // leaves a stray hue behind from the one before it.
  if (typeof el.style.removeProperty === 'function') {
    for (const t of THEMES) {
      for (const k of Object.keys(t.vars)) el.style.removeProperty(k);
      for (const k of Object.keys(t.darkVars || {})) el.style.removeProperty(k);
    }
  }
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}

// Consume one Double XP boost if active. Returns the (possibly doubled) amount
// and whether a boost was applied.
export function applyXpBoost(store, amount) {
  const inv = inventory(store);
  if ((inv.boosts.double_xp || 0) > 0) {
    inv.boosts.double_xp -= 1;
    store.save();
    return { amount: amount * 2, boosted: true };
  }
  return { amount, boosted: false };
}
