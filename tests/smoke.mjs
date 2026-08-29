// Browser smoke test: boot the real app in headless Chromium and walk the
// first-run path (welcome → language select → first-run choice), then a
// returning learner's home (hero, practice rail, lesson trail, Units screen).
// Any uncaught page error fails the run.
//
// Requires the `playwright` package plus a Chromium build:
//   npm i playwright && npx playwright install --with-deps chromium
// Set CHROMIUM_PATH to use a preinstalled browser binary instead.
// Run from the repo root:  node tests/smoke.mjs
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  try {
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(join(ROOT, p)));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗', m); } };

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

async function newPage(ctx) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  return page;
}

// --- first-run path: welcome → language select → first-run choice ---
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, serviceWorkers: 'block' });
  const page = await newPage(ctx);
  await page.goto(base);
  await page.waitForSelector('#guest', { timeout: 15000 });
  ok(true, 'welcome screen renders');
  await page.click('#guest');
  // the intro carousel sits between welcome and language select — skip it
  await page.waitForSelector('#skip, .lang-card', { timeout: 15000 });
  if (await page.locator('#skip').count()) await page.click('#skip');
  await page.waitForSelector('.lang-card', { timeout: 15000 });
  ok((await page.locator('.lang-card').count()) >= 3, 'language select lists the courses');
  await page.locator('.lang-card').first().click();
  await page.waitForSelector('#warmup', { timeout: 15000 });
  ok(true, 'first-run choice renders after picking a language');
  ok(page.errors.length === 0, `no page errors on first run (${page.errors[0] || ''})`);
  await ctx.close();
}

// --- returning learner: home, trail, Units screen ---
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    localStorage.setItem('mzansilingo.auth', JSON.stringify({ mode: 'guest' }));
    // minimal onboarded save — the store fills in every other default
    localStorage.setItem('mzansilingo.v1', JSON.stringify({
      version: 1,
      activeLang: 'af',
      settings: { onboarded: true },
      onboarding: { setupDone: true, accountPrompted: true },
      learnerProfile: { goal: 'conversation', dailyTime: 10, confidence: 'some', date: '2026-01-01' },
      dailyReward: { lastClaim: new Date().toISOString().slice(0, 10), streak: 1 },
      langs: {},
    }));
  });
  const page = await newPage(ctx);
  await page.goto(base);
  await page.waitForSelector('.hero-cta', { timeout: 15000 });
  ok(true, 'home hero renders for a returning learner');
  ok((await page.locator('.node').count()) >= 2, 'lesson trail shows stepping stones');
  await page.waitForSelector('#allUnitsBtn');
  await page.click('#allUnitsBtn');
  await page.waitForSelector('.unit-acc', { timeout: 15000 });
  ok((await page.locator('.unit-acc').count()) >= 5, 'Units screen lists the course units');
  await page.click('#back');
  await page.waitForSelector('.hero-cta', { timeout: 15000 });
  ok(true, 'back returns to home');
  ok(page.errors.length === 0, `no page errors on home/units (${page.errors[0] || ''})`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
