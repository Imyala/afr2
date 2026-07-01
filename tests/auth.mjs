// Demo account/auth logic tests. Run: node tests/auth.mjs
import './_setup.mjs';
import * as Auth from '../src/auth.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

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
