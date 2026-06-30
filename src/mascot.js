// mascot.js — "Themba", MzansiLingo's brand character.
//
// A single, consistent, expressive SVG creature (a friendly meerkat — alert,
// curious and proudly Southern African). One drawn character the learner builds
// a relationship with does far more for retention than a row of static emoji.
// Rendered inline as SVG so it scales crisply, themes with the palette, and
// costs nothing to cache offline. Moods swap the eyes/mouth/arms only.

// mood: 'idle' | 'happy' | 'cheer' | 'sad' | 'wave' | 'think'
// Pass decorative:true for mascots that only accompany text (home, answer
// feedback) so screen readers skip them instead of announcing the character.
export function mascotSvg(mood = 'idle', { size = 96, className = '', decorative = false } = {}) {
  const a11y = decorative ? 'aria-hidden="true" focusable="false"' : 'role="img" aria-label="Themba the meerkat"';
  const eyes = {
    idle:  '<circle cx="40" cy="58" r="6.5" fill="#16241d"/><circle cx="72" cy="58" r="6.5" fill="#16241d"/><circle cx="42" cy="56" r="2" fill="#fff"/><circle cx="74" cy="56" r="2" fill="#fff"/>',
    happy: '<path d="M33 58q7 -8 14 0" stroke="#16241d" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M65 58q7 -8 14 0" stroke="#16241d" stroke-width="4" fill="none" stroke-linecap="round"/>',
    cheer: '<path d="M33 58q7 -9 14 0" stroke="#16241d" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M65 58q7 -9 14 0" stroke="#16241d" stroke-width="4" fill="none" stroke-linecap="round"/>',
    sad:   '<circle cx="40" cy="60" r="6" fill="#16241d"/><circle cx="72" cy="60" r="6" fill="#16241d"/><path d="M33 50l12 4M79 50l-12 4" stroke="#16241d" stroke-width="3" stroke-linecap="round"/>',
    wave:  '<circle cx="40" cy="58" r="6.5" fill="#16241d"/><circle cx="72" cy="58" r="6.5" fill="#16241d"/><circle cx="42" cy="56" r="2" fill="#fff"/><circle cx="74" cy="56" r="2" fill="#fff"/>',
    think: '<circle cx="40" cy="58" r="6.5" fill="#16241d"/><circle cx="72" cy="58" r="6" fill="#16241d"/><path d="M33 52l12 0" stroke="#16241d" stroke-width="3" stroke-linecap="round"/>',
  }[mood] || '';

  const mouth = {
    idle:  '<path d="M48 74q8 6 16 0" stroke="#16241d" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    happy: '<path d="M44 72q12 14 24 0" fill="#16241d"/><path d="M48 76q8 4 16 0" fill="#d64545"/>',
    cheer: '<path d="M42 70q14 18 28 0" fill="#16241d"/><path d="M48 76q8 5 16 0" fill="#d64545"/>',
    sad:   '<path d="M48 80q8 -6 16 0" stroke="#16241d" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    wave:  '<path d="M46 73q10 10 20 0" fill="#16241d"/>',
    think: '<path d="M50 76l12 0" stroke="#16241d" stroke-width="3.5" stroke-linecap="round"/>',
  }[mood] || '';

  // arms differ for cheer (both up) and wave (one up)
  const arms = {
    cheer: '<path d="M22 78q-8 -16 -4 -28" stroke="var(--accent,#1b7a43)" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M90 78q8 -16 4 -28" stroke="var(--accent,#1b7a43)" stroke-width="9" fill="none" stroke-linecap="round"/>',
    wave:  '<path class="mascot-wave-arm" d="M90 78q10 -10 8 -24" stroke="var(--accent,#1b7a43)" stroke-width="9" fill="none" stroke-linecap="round"/>',
    sad:   '<path d="M22 80q-6 6 -6 14" stroke="var(--accent,#1b7a43)" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M90 80q6 6 6 14" stroke="var(--accent,#1b7a43)" stroke-width="9" fill="none" stroke-linecap="round"/>',
  }[mood] || '<path d="M24 80q-4 8 -2 16" stroke="var(--accent,#1b7a43)" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M88 80q4 8 2 16" stroke="var(--accent,#1b7a43)" stroke-width="9" fill="none" stroke-linecap="round"/>';

  return `<svg class="mascot mascot--${mood} ${className}" width="${size}" height="${size}" viewBox="0 0 112 112" ${a11y} xmlns="http://www.w3.org/2000/svg">
    ${arms}
    <!-- ears -->
    <ellipse cx="34" cy="30" rx="11" ry="13" fill="#a9692f"/>
    <ellipse cx="78" cy="30" rx="11" ry="13" fill="#a9692f"/>
    <ellipse cx="34" cy="31" rx="6" ry="7" fill="#2b1c10"/>
    <ellipse cx="78" cy="31" rx="6" ry="7" fill="#2b1c10"/>
    <!-- body -->
    <ellipse cx="56" cy="84" rx="30" ry="24" fill="#c98a4b"/>
    <ellipse cx="56" cy="88" rx="18" ry="16" fill="#e7c79a"/>
    <!-- head -->
    <ellipse cx="56" cy="56" rx="34" ry="32" fill="#d59a5b"/>
    <ellipse cx="56" cy="64" rx="20" ry="18" fill="#f0d8b4"/>
    <!-- eye patches (signature meerkat look) -->
    <ellipse cx="40" cy="58" rx="10" ry="9" fill="#9c5f2a" opacity=".55"/>
    <ellipse cx="72" cy="58" rx="10" ry="9" fill="#9c5f2a" opacity=".55"/>
    ${eyes}
    <!-- nose -->
    <ellipse cx="56" cy="68" rx="4.5" ry="3.5" fill="#3a2414"/>
    ${mouth}
  </svg>`;
}

// A short, warm line of encouragement to pair with the mascot. Varied so it
// doesn't feel canned; index in by a number (e.g. streak or score) for stability.
const LINES = {
  cheer: ['Sharp sharp! 🎉', 'Yebo! You nailed it!', 'Halala! Well played!', 'Awesome — keep going!'],
  happy: ['Lekker work!', 'You\'re getting it!', 'Nice one!', 'Keep it up!'],
  sad:   ['Almost! Try again.', 'No stress — you\'ve got this.', 'Shame, close one!'],
  wave:  ['Sawubona! Ready to learn?', 'Let\'s do this!', 'Molo! Welcome back.'],
  idle:  ['Tap a lesson to start.', 'A few minutes a day adds up.', 'Your words are waiting.'],
};
export function mascotLine(mood = 'idle', seed = 0) {
  const arr = LINES[mood] || LINES.idle;
  return arr[Math.abs(seed) % arr.length];
}
