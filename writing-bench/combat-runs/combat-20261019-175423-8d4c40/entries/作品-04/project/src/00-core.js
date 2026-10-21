'use strict';
/* ============================================================
   CRIMSON EDGE — core utilities
   ============================================================ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInCubic = t => t * t * t;
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutQuad = t => 1 - (1 - t) * (1 - t);
const sign = v => v < 0 ? -1 : 1;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r + amt), 0, 255);
  g = clamp(Math.round(g + amt), 0, 255);
  b = clamp(Math.round(b + amt), 0, 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/* Deterministic hash noise for background scenery */
function hash1(n) { const s = Math.sin(n * 127.1) * 43758.5453123; return s - Math.floor(s); }

/* ============================================================
   Input — held / pressed / released, pointer-safe, focus-safe
   ============================================================ */
const BIND = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  atk: ['KeyJ'],
  heavy: ['KeyK'],
  dash: ['KeyL'],
  special: ['KeyI'],
  restart: ['KeyR'],
  start: ['Enter', 'NumpadEnter'],
  mute: ['KeyM'],
  skill1: ['KeyU'],
  skill2: ['KeyY'],
  skill3: ['KeyH'],
  skill4: ['KeyO']
};
const BLOCK_KEYS = new Set(Object.values(BIND).flat());

const Input = {
  held: Object.create(null),
  pressed: Object.create(null),
  released: Object.create(null),
  anyPressed: false,
  init() {
    window.addEventListener('keydown', e => {
      if (BLOCK_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (!this.held[e.code]) { this.pressed[e.code] = true; this.anyPressed = true; }
      this.held[e.code] = true;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      Audio_.unlock();
      if (e.code === 'KeyM') Audio_.toggleMute();
    }, { passive: false });
    window.addEventListener('keyup', e => {
      if (BLOCK_KEYS.has(e.code)) e.preventDefault();
      this.held[e.code] = false;
      this.released[e.code] = true;
    }, { passive: false });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
  },
  clear() {
    for (const k in this.held) this.held[k] = false;
    for (const k in this.pressed) this.pressed[k] = false;
  },
  down(action) { return BIND[action].some(c => this.held[c]); },
  hit(action) { return BIND[action].some(c => this.pressed[c]); },
  endFrame() {
    for (const k in this.pressed) this.pressed[k] = false;
    for (const k in this.released) this.released[k] = false;
    this.anyPressed = false;
  }
};
