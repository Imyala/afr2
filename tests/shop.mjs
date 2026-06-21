// Shop / rewards economy tests. Run from repo root:  node tests/shop.mjs
import './_setup.mjs';
import { store } from '../src/store.js';
import * as Shop from '../src/shop.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

store.reset();
store.setActiveLang('zu');

// starter inventory
const inv = Shop.inventory(store);
ok(inv.owned.zebra && inv.owned.savanna, 'starts with the free zebra + savanna theme');
ok(inv.equipped.mascot === 'zebra' && inv.equipped.theme === 'savanna', 'starter cosmetics equipped');

// cannot buy without gems
store.state.gems = 0;
ok(Shop.buy(store, 'lion').ok === false, 'cannot buy a mascot with no gems');

// buy a power-up (heart refill) and a Double XP
store.state.gems = 200;
store.lang().hearts = 1;
ok(Shop.buy(store, 'heart_refill').ok, 'can buy heart refill');
ok(store.lang().hearts === 5, 'heart refill restores hearts');
ok(Shop.buy(store, 'double_xp').ok, 'can buy double XP');
ok(Shop.inventory(store).boosts.double_xp === 1, 'double XP boost stored');

// double XP applies once then is consumed
const boosted = Shop.applyXpBoost(store, 50);
ok(boosted.amount === 100 && boosted.boosted, 'double XP doubles the next XP amount');
ok(Shop.applyXpBoost(store, 50).boosted === false, 'double XP is consumed after one use');

// buy + equip a mascot
store.state.gems = 500;
ok(Shop.buy(store, 'lion').ok, 'can buy the lion mascot');
ok(Shop.owns(store, 'lion'), 'lion now owned');
ok(Shop.inventory(store).equipped.mascot === 'lion', 'newly bought mascot auto-equips');
ok(Shop.buy(store, 'lion').ok === false, 'cannot buy the same cosmetic twice');
Shop.equip(store, 'zebra');
ok(Shop.equippedMascot(store).id === 'zebra', 're-equip a previously owned mascot');

// theme purchase changes the applied palette
const docStub = { documentElement: { style: { _v: {}, setProperty(k, v) { this._v[k] = v; } } } };
ok(Shop.buy(store, 'ocean').ok, 'can buy the ocean theme');
Shop.equip(store, 'ocean');
Shop.applyTheme(store, docStub);
ok(docStub.documentElement.style._v['--green'] === '#1d6fb8', 'applying ocean theme overrides the primary colour');

// gems never go negative
ok((store.state.gems || 0) >= 0, 'gems never negative after purchases');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
