// Minimal localStorage + window polyfill so store.js / gamify.js can be tested
// under Node. Imported first by gamify.mjs so the side effect runs before the
// store module is evaluated.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
globalThis.window = globalThis;
