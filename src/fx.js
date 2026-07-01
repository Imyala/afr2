// fx.js — feel & feedback: sound, haptics, confetti, count-up animations.
//
// Everything here is generated at runtime (Web Audio, canvas, Web Animations),
// so there are NO asset files to download and it all works fully offline. This
// is the "juice" that makes the app feel alive and rewarding without bloating
// the offline cache. Respects the user's sound setting and prefers-reduced-motion.

let soundEnabled = true;
export function setSoundEnabled(on) { soundEnabled = !!on; }

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- sound (Web Audio, no files) ----------
let actx = null;
function ctx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!actx) actx = new AC();
  // browsers suspend audio until a user gesture — resume on first use
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}

// Play a short tone. `type` is an oscillator wave; gain ramps in/out so it never clicks.
function tone(freq, start, dur, { type = 'sine', vol = 0.18 } = {}) {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sound = {
  // bright rising two-note "ding" for a correct answer
  correct() {
    if (!soundEnabled) return;
    tone(659.25, 0, 0.12, { type: 'triangle' });        // E5
    tone(987.77, 0.09, 0.18, { type: 'triangle' });      // B5
  },
  // soft low "thunk" for a wrong answer — gentle, never harsh on kids
  wrong() {
    if (!soundEnabled) return;
    tone(196, 0, 0.18, { type: 'sine', vol: 0.16 });     // G3
    tone(155.56, 0.05, 0.22, { type: 'sine', vol: 0.14 });
  },
  // celebratory arpeggio for finishing a lesson
  complete() {
    if (!soundEnabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];      // C E G C
    notes.forEach((f, i) => tone(f, i * 0.1, 0.26, { type: 'triangle', vol: 0.2 }));
  },
  // subtle tick for navigation / taps
  tap() {
    if (!soundEnabled) return;
    tone(880, 0, 0.05, { type: 'sine', vol: 0.08 });
  },
  // warm chime for claiming a reward
  reward() {
    if (!soundEnabled) return;
    tone(783.99, 0, 0.14, { type: 'triangle' });
    tone(1174.66, 0.1, 0.22, { type: 'triangle', vol: 0.2 });
  },
};

// ---------- haptics ----------
export function haptic(pattern = 12) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
}

// ---------- count-up number animation ----------
// Animates an element's text from 0 (or `from`) up to `to` over `ms`.
export function countUp(el, to, { from = 0, ms = 700, prefix = '', suffix = '' } = {}) {
  if (!el) return;
  if (reduceMotion()) { el.textContent = `${prefix}${to}${suffix}`; return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = `${prefix}${Math.round(from + (to - from) * eased)}${suffix}`;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- confetti (canvas, self-removing) ----------
export function confetti({ count = 90, duration = 1500 } = {}) {
  if (typeof document === 'undefined' || reduceMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999`;
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const colors = ['#1b7a43', '#f0b323', '#1d6fb8', '#d64545', '#7c3aed', '#38c46e'];
  const parts = Array.from({ length: count }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 120,
    y: H / 3 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -11 - 4,
    size: Math.random() * 7 + 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  const frame = (now) => {
    const elapsed = now - t0;
    g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.35;            // gravity
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save();
      g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = p.color;
      g.globalAlpha = Math.max(0, 1 - elapsed / duration);
      g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      g.restore();
    }
    if (elapsed < duration) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// ---------- one-shot pop animation on an element ----------
export function pop(el, scale = 1.12) {
  if (!el || reduceMotion() || !el.animate) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }],
    { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' },
  );
}
