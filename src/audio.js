// audio.js — listening (text-to-speech) and speaking (speech recognition)
//
// Offline note: SA-language TTS voices are not guaranteed on every device.
// We try the best matching voice, fall back to a generic voice, and always
// show phonetics on screen so a learner is never blocked when offline.

const SA_LOCALE = { zu: 'zu-ZA', xh: 'xh-ZA', af: 'af-ZA' };

let voicesCache = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return [];
  voicesCache = window.speechSynthesis.getVoices();
  return voicesCache;
}
if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export function ttsSupported() {
  return 'speechSynthesis' in window;
}

function pickVoice(langCode) {
  const want = SA_LOCALE[langCode] || langCode;
  const voices = voicesCache.length ? voicesCache : loadVoices();
  return (
    voices.find((v) => v.lang === want) ||
    voices.find((v) => v.lang && v.lang.startsWith(langCode)) ||
    voices.find((v) => v.lang && v.lang.startsWith('en')) ||
    voices[0] ||
    null
  );
}

// Speak `text` in the given SA language. Returns a promise that resolves when done.
export function speak(text, langCode, rate = 0.85) {
  return new Promise((resolve) => {
    if (!ttsSupported()) { resolve(false); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(langCode);
      if (v) u.voice = v;
      u.lang = SA_LOCALE[langCode] || langCode;
      u.rate = rate;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      window.speechSynthesis.speak(u);
    } catch (e) { resolve(false); }
  });
}

export function srSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

// Listen for one utterance and return the recognised transcript (lowercased).
// Resolves with null on error / no match so callers can fall back to self-rating.
export function listenOnce(langCode, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { resolve(null); return; }
    let settled = false;
    const rec = new SR();
    rec.lang = SA_LOCALE[langCode] || langCode;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    const done = (val) => { if (!settled) { settled = true; try { rec.stop(); } catch (e) {} resolve(val); } };
    rec.onresult = (ev) => {
      const alts = [];
      for (let i = 0; i < ev.results[0].length; i++) alts.push(ev.results[0][i].transcript.toLowerCase().trim());
      done(alts);
    };
    rec.onerror = () => done(null);
    rec.onend = () => done(null);
    try { rec.start(); } catch (e) { done(null); }
    setTimeout(() => done(null), timeoutMs);
  });
}
