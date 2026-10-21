/* =========================================================
   裂帛 RIVEN — 核心
   World units: 1280 x 720 CSS-ish canvas. Ground at WORLD.groundY.
   ========================================================= */
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const rndi = (a, b) => Math.floor(b + Math.random() * (a - b + 1));
const pick = arr => arr[(Math.random() * arr.length) | 0];
const sign = v => (v < 0 ? -1 : 1);
const nowS = () => performance.now() / 1000;

const WORLD = {
  W: 1280,
  H: 720,
  groundY: 600,
  left: 40,
  right: 1240,
  gravity: 2400,
  // playfield camera clamps
  camMinX: 0,
  camMaxX: 0,
};

// ---------------------------------------------------------
// Input
// ---------------------------------------------------------
const Input = {
  down: new Set(),
  pressed: new Set(),
  released: new Set(),
  map: {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space', 'KeyW', 'ArrowUp'],
    atk: ['KeyJ'],
    heavy: ['KeyK'],
    dash: ['KeyL'],
    special: ['KeyI'],
    restart: ['KeyR'],
    start: ['Enter'],
    pause: ['Escape', 'KeyP'],
    mute: ['KeyM'],
  },
  blockedCodes: new Set([
    'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyK', 'KeyL', 'KeyI',
    'KeyR', 'Enter', 'KeyP', 'KeyM', 'Escape',
  ]),
  init() {
    window.addEventListener('keydown', e => {
      if (this.blockedCodes.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', e => {
      if (this.blockedCodes.has(e.code)) e.preventDefault();
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    const clear = () => {
      for (const c of this.down) this.released.add(c);
      this.down.clear();
    };
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  },
  anyDown(action) {
    const codes = this.map[action];
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  },
  anyPressed(action) {
    const codes = this.map[action];
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  },
  anyReleased(action) {
    const codes = this.map[action];
    for (const c of codes) if (this.released.has(c)) return true;
    return false;
  },
  axis() {
    let x = 0;
    if (this.anyDown('left')) x -= 1;
    if (this.anyDown('right')) x += 1;
    return x;
  },
  endFrame() {
    this.pressed.clear();
    this.released.clear();
  },
};

// ---------------------------------------------------------
// Util: easing
// ---------------------------------------------------------
const Ease = {
  outQuad: t => 1 - (1 - t) * (1 - t),
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
};
