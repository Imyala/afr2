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
export const MASCOTS = [
  { id: 'zebra', name: 'Zee the Zebra', icon: '🦓', cost: 0, desc: 'Your starter buddy.' },
  { id: 'lion', name: 'Leo the Lion', icon: '🦁', cost: 150, desc: 'King of the savanna.' },
  { id: 'elephant', name: 'Ellie the Elephant', icon: '🐘', cost: 200, desc: 'Never forgets a word.' },
  { id: 'springbok', name: 'Bok the Springbok', icon: '🦌', cost: 250, desc: 'Fast and proudly SA.' },
  { id: 'penguin', name: 'Pip the Penguin', icon: '🐧', cost: 300, desc: 'A real African penguin.' },
  { id: 'rhino', name: 'Riri the Rhino', icon: '🦏', cost: 400, desc: 'Tough and rare.' },
];

// Colour themes — buy once, then equip. Overrides the accent palette.
export const THEMES = [
  { id: 'savanna', name: 'Savanna', icon: '🌳', cost: 0, vars: { '--green': '#1b7a43', '--green-dark': '#0f5e33', '--gold': '#f0b323', '--blue': '#1d6fb8' } },
  { id: 'ocean', name: 'Two Oceans', icon: '🌊', cost: 120, vars: { '--green': '#1d6fb8', '--green-dark': '#155a96', '--gold': '#00a3a3', '--blue': '#1b7a43' } },
  { id: 'sunset', name: 'Kalahari Sunset', icon: '🌅', cost: 150, vars: { '--green': '#e2711d', '--green-dark': '#b85a14', '--gold': '#f0b323', '--blue': '#d64545' } },
  { id: 'protea', name: 'Protea Pink', icon: '🌸', cost: 150, vars: { '--green': '#c0397b', '--green-dark': '#97275f', '--gold': '#f0b323', '--blue': '#1d6fb8' } },
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

// Apply the equipped colour theme to the document.
export function applyTheme(store, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  const inv = inventory(store);
  const theme = THEMES.find((t) => t.id === inv.equipped.theme) || THEMES[0];
  for (const [k, v] of Object.entries(theme.vars)) doc.documentElement.style.setProperty(k, v);
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
