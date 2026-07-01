// auth.js — DEMO account system (client-side only).
//
// This is an offline-first static PWA with no server, so "accounts" are a
// local demonstration: credentials live in this browser's localStorage, and
// each account maps to its own progress profile (see store.ensureProfile).
// Passwords are hashed (SHA-256) rather than stored in plain text, but this is
// NOT production-grade auth — there is no server, no email verification, and no
// cross-device sync. A "Try without an account" guest path skips it entirely.

const ACCOUNTS_KEY = 'mzansilingo.accounts';
const AUTH_KEY = 'mzansilingo.auth';

export function loadAccounts() {
  try { const a = JSON.parse(localStorage.getItem(ACCOUNTS_KEY)); if (a && Array.isArray(a.list)) return a; } catch (e) { /* none */ }
  return { list: [] };
}
function saveAccounts(a) { try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } }

export function getAuth() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; } }
export function setAuth(a) { try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } }
export function clearAuth() { try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ } }

// SHA-256 where available (secure context); a non-crypto fallback otherwise so
// the demo still works. Both are deterministic and salted with a fixed prefix.
export async function hashPassword(pw) {
  const input = `mz:${pw}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* fall through */ }
  let h = 0; for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return `f${h.toString(16)}`;
}

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || '').trim());

export function findAccountByEmail(email) {
  const e = (email || '').trim().toLowerCase();
  return loadAccounts().list.find((a) => a.email.toLowerCase() === e);
}
export function accountById(id) { return loadAccounts().list.find((a) => a.id === id); }
export function currentAccount() { const a = getAuth(); return a && a.mode === 'account' ? accountById(a.accountId) : null; }
export function isGuest() { const a = getAuth(); return !!(a && a.mode === 'guest'); }

export async function createAccount(name, email, password, avatar) {
  name = (name || '').trim();
  email = (email || '').trim();
  if (!name) return { error: 'Please enter your name.' };
  if (!validEmail(email)) return { error: 'Please enter a valid email address.' };
  if ((password || '').length < 4) return { error: 'Password must be at least 4 characters.' };
  if (findAccountByEmail(email)) return { error: 'An account with this email already exists.' };
  const passHash = await hashPassword(password);
  const id = `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const account = { id, name: name.slice(0, 30), email, passHash, avatar: avatar || '🦫', createdAt: new Date().toISOString().slice(0, 10) };
  const a = loadAccounts(); a.list.push(account); saveAccounts(a);
  return { account };
}

export async function login(email, password) {
  const acc = findAccountByEmail(email);
  if (!acc) return { error: 'No account found with that email.' };
  const h = await hashPassword(password);
  if (h !== acc.passHash) return { error: 'Incorrect password.' };
  return { account: acc };
}
