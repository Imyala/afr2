// Demo account/auth logic tests. Run: node tests/auth.mjs
import './_setup.mjs';
import { createHash } from 'node:crypto';
import * as Auth from '../src/auth.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// Default: stub the network so the breach check treats passwords as safe and
// the account tests never touch the real Have I Been Pwned API.
const sha1suffix = (pw) => createHash('sha1').update(pw).digest('hex').toUpperCase().slice(5);
const stubRange = (body) => { globalThis.fetch = async () => ({ ok: true, text: async () => body }); };
stubRange('');

// email validation
ok(Auth.validEmail('a@b.co'), 'accepts a valid email');
ok(!Auth.validEmail('nope'), 'rejects a bad email');
ok(!Auth.validEmail('a@b'), 'rejects email with no TLD');

// deterministic password hashing, and it is not the plain text
const h1 = await Auth.hashPassword('secret');
const h2 = await Auth.hashPassword('secret');
ok(h1 === h2, 'hashPassword is deterministic');
ok(h1 !== 'secret' && !h1.includes('secret'), 'hash does not contain the plaintext');
ok((await Auth.hashPassword('other')) !== h1, 'different passwords hash differently');

// create account
const r1 = await Auth.createAccount('Thabo', 'thabo@example.com', 'pass1');
ok(r1.account && r1.account.id, 'creates an account');
ok(r1.account.email === 'thabo@example.com' && !('password' in r1.account), 'stores email but not a plaintext password field');
ok(r1.account.passHash && r1.account.passHash !== 'pass1', 'stores a hashed password');

// validation failures
ok((await Auth.createAccount('', 'x@y.co', 'pass1')).error, 'rejects empty name');
ok((await Auth.createAccount('N', 'bad', 'pass1')).error, 'rejects bad email');
ok((await Auth.createAccount('N', 'n@y.co', '12')).error, 'rejects short password');
ok((await Auth.createAccount('Dup', 'thabo@example.com', 'pass1')).error, 'rejects duplicate email');

// Have I Been Pwned k-anonymity check (stubbed range responses)
stubRange(`${sha1suffix('hunter2')}:9999\r\n0000000000000000000000000000000000:0`);
ok((await Auth.pwnedCount('hunter2')) === 9999, 'pwnedCount returns breach count for a matching suffix');
stubRange('0000000000000000000000000000000000:5');
ok((await Auth.pwnedCount('hunter2')) === 0, 'pwnedCount returns 0 when the suffix is not in the range');
globalThis.fetch = async () => { throw new Error('offline'); };
ok((await Auth.pwnedCount('hunter2')) === -1, 'pwnedCount returns -1 when the check cannot run (offline)');
// createAccount blocks a breached password
stubRange(`${sha1suffix('breachedpw')}:1000000`);
const rp = await Auth.createAccount('Sipho', 'sipho@example.com', 'breachedpw');
ok(rp.error && /breach/i.test(rp.error), 'createAccount rejects a password found in breaches');
ok(!Auth.findAccountByEmail('sipho@example.com'), 'the breached-password account was not created');
// offline (-1) should NOT block account creation
globalThis.fetch = async () => { throw new Error('offline'); };
const rOffline = await Auth.createAccount('Ayanda', 'ayanda@example.com', 'localpass');
ok(rOffline.account, 'offline breach-check does not block account creation');
stubRange(''); // restore safe stub

// login
ok((await Auth.login('thabo@example.com', 'pass1')).account, 'logs in with correct credentials');
ok((await Auth.login('thabo@example.com', 'wrong')).error, 'rejects wrong password');
ok((await Auth.login('nobody@example.com', 'pass1')).error, 'rejects unknown email');
ok((await Auth.login('THABO@EXAMPLE.COM', 'pass1')).account, 'login is case-insensitive on email');

// auth session state
Auth.setAuth({ mode: 'account', accountId: r1.account.id });
ok(Auth.currentAccount() && Auth.currentAccount().id === r1.account.id, 'currentAccount reflects the session');
Auth.setAuth({ mode: 'guest' });
ok(Auth.isGuest() && !Auth.currentAccount(), 'guest mode has no current account');
Auth.clearAuth();
ok(!Auth.getAuth(), 'clearAuth removes the session');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
