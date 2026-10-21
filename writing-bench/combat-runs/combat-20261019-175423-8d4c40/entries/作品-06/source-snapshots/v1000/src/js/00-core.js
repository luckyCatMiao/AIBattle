'use strict';
/* ============================================================
   RIFTBLADE 断刃 — core utilities, input, camera, audio
   ============================================================ */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sign = v => v < 0 ? -1 : 1;
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;
const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const smooth = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// Deterministic-ish RNG helpers for decorative randomness
function rngSeed(s) {
  let a = s >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Input ---------------- */
const GAME_KEYS = new Set([
  'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'KeyI',
  'KeyR', 'Enter', 'KeyM', 'Escape', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS',
  'KeyU', 'KeyO', 'KeyP', 'KeyH'
]);

const Input = {
  down: Object.create(null),
  pressed: Object.create(null),
  released: Object.create(null),
  anyKey: false,
  lastActivity: 0,
  init() {
    addEventListener('keydown', e => {
      if (GAME_KEYS.has(e.code)) {
        // These keys belong to the game; never let the page scroll.
        e.preventDefault();
        if (e.repeat) return;
        this.down[e.code] = true;
        this.pressed[e.code] = true;
        this.anyKey = true;
        Sfx.unlock();
        Sfx.press();
        if (e.code === 'Enter' && !Game.playing && !Game.paused) {
          if (Game.state === 'dead') Game.restart();
          else Game.begin();
        }
      }
    }, { passive: false });

    addEventListener('keyup', e => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.down[e.code] = false;
      this.released[e.code] = true;
    }, { passive: false });

    // Losing focus must never leave a key stuck down.
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); Game.autoPause(); } });
    // Guard against context menus stealing focus.
    addEventListener('contextmenu', e => e.preventDefault());
  },
  clear() {
    for (const k in this.down) this.down[k] = false;
    this.pressed = Object.create(null);
    this.released = Object.create(null);
    this.anyKey = false;
  },
  isDown(...codes) { for (const c of codes) if (this.down[c]) return true; return false; },
  hit(...codes) { for (const c of codes) if (this.pressed[c]) return true; return false; },
  up(...codes) { for (const c of codes) if (this.released[c]) return true; return false; },
  axis() {
    let a = 0;
    if (this.isDown('KeyA', 'ArrowLeft')) a -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) a += 1;
    return a;
  },
  endFrame() {
    this.pressed = Object.create(null);
    this.released = Object.create(null);
  }
};

/* ---------------- Camera ---------------- */
const Camera = {
  x: 0, y: 0, zoom: 1,
  sx: 0, sy: 0,          // shake offset
  tx: 0, ty: 0, tz: 1,   // targets
  shakeMag: 0, shakeT: 0,
  kickX: 0, kickY: 0,
  baseW: 1280, baseH: 720,
  update(dt) {
    this.kickX = approach(this.kickX, 0, dt * 260);
    this.kickY = approach(this.kickY, 0, dt * 260);
    this.x = lerp(this.x, this.tx, 1 - Math.pow(0.0008, dt));
    this.y = lerp(this.y, this.ty, 1 - Math.pow(0.0012, dt));
    this.zoom = lerp(this.zoom, this.tz, 1 - Math.pow(0.004, dt));
    this.shakeT -= dt;
    if (this.shakeT > 0) {
      const m = this.shakeMag * Math.min(1, this.shakeT / 0.12);
      this.sx = rand(-m, m);
      this.sy = rand(-m, m) * 0.7;
    } else { this.sx = 0; this.sy = 0; this.shakeMag = 0; }
  },
  shake(mag, dur) {
    if (mag > this.shakeMag || this.shakeT <= 0.02) {
      this.shakeMag = mag; this.shakeT = dur;
    }
  },
  kick(x, y) { this.kickX += x; this.kickY += y; },
  reset() { this.x = this.tx; this.y = this.ty; this.zoom = this.tz; }
};

/* ---------------- Audio (all synthesized, no assets) ---------------- */
const Sfx = {
  ctx: null, master: null, muted: false, unlocked: false, noiseBuf: null,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 24; comp.ratio.value = 8;
      comp.attack.value = 0.003; comp.release.value = 0.22;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      // one second of white noise, reused by every impact
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, sr, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch (e) { this.ctx = null; }
  },
  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.unlocked = true;
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  ready() { return this.ctx && !this.muted; },

  // generic tone with pitch envelope
  tone(freq, dur, opts = {}) {
    if (!this.ready()) return;
    const { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.004, pan = 0, detune = 0 } = opts;
    const t = this.now() + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      o.connect(g); g.connect(p); node = p;
    } else { o.connect(g); }
    node.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },
  noise(dur, opts = {}) {
    if (!this.ready()) return;
    const { vol = 0.3, filter = 'lowpass', f0 = 2000, f1 = 0, Q = 1, delay = 0, attack = 0.002, pan = 0 } = opts;
    const t = this.now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filter;
    flt.frequency.setValueAtTime(f0, t);
    if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    flt.Q.value = Q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g);
    let node = g;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      g.connect(p); node = p;
    }
    node.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.03);
  },

  press() { this.tone(1300, 0.03, { type: 'square', vol: 0.025 }); },

  // ---- combat sounds ----
  swing(heavy = false) {
    if (!this.ready()) return;
    if (heavy) {
      this.noise(0.28, { vol: 0.34, f0: 2400, f1: 260, Q: 0.8 });
      this.tone(180, 0.22, { type: 'sawtooth', vol: 0.07, slide: 0.4 });
    } else {
      this.noise(0.14, { vol: 0.2, f0: 4200, f1: 700, Q: 1.2 });
    }
  },
  hit(power = 1) {
    if (!this.ready()) return;
    const p = clamp(power, 0.5, 2.5);
    // metallic body of the cut
    this.noise(0.16 * p, { vol: 0.22 * p, filter: 'bandpass', f0: 3200, f1: 900, Q: 1.6 });
    // punchy low thump
    this.tone(150 / p, 0.13 * p, { type: 'sine', vol: 0.24 * p, slide: 0.55 });
    // ringing steel
    const base = rand(680, 860) / Math.sqrt(p);
    this.tone(base, 0.34 * p, { type: 'triangle', vol: 0.075, slide: 0.9 });
    this.tone(base * 1.51, 0.26 * p, { type: 'sine', vol: 0.05, delay: 0.012, slide: 0.92 });
    if (p > 1.6) this.noise(0.3, { vol: 0.16, filter: 'highpass', f0: 600, f1: 3000, delay: 0.01 });
  },
  slashBig() {
    if (!this.ready()) return;
    this.noise(0.36, { vol: 0.3, f0: 3800, f1: 180, Q: 0.7 });
    this.tone(90, 0.4, { type: 'sawtooth', vol: 0.1, slide: 0.5 });
  },
  parry() {
    if (!this.ready()) return;
    [1, 1.5, 2.02, 2.71].forEach((m, i) => {
      this.tone(1400 * m, 0.5 - i * 0.08, { type: 'triangle', vol: 0.11 / (i + 1), slide: 0.94 });
    });
    this.tone(120, 0.25, { type: 'sine', vol: 0.25, slide: 0.5 });
    this.noise(0.35, { vol: 0.22, filter: 'highpass', f0: 2400, f1: 9000 });
  },
  deflect() {
    if (!this.ready()) return;
    this.tone(1900, 0.09, { type: 'square', vol: 0.05, slide: 0.7 });
    this.noise(0.12, { vol: 0.18, filter: 'highpass', f0: 3000 });
  },
  breakLimb() {
    if (!this.ready()) return;
    this.noise(0.3, { vol: 0.3, filter: 'bandpass', f0: 1800, f1: 280, Q: 2.5 });
    this.tone(70, 0.42, { type: 'sine', vol: 0.3, slide: 0.45 });
    this.tone(320, 0.16, { type: 'square', vol: 0.05, slide: 0.5, delay: 0.02 });
    this.noise(0.5, { vol: 0.1, filter: 'highpass', f0: 2000, f1: 6000, delay: 0.05 });
  },
  death() {
    if (!this.ready()) return;
    this.tone(220, 0.9, { type: 'sawtooth', vol: 0.11, slide: 0.28 });
    this.tone(110, 1.1, { type: 'sine', vol: 0.18, slide: 0.5, delay: 0.03 });
    this.noise(0.8, { vol: 0.24, f0: 1400, f1: 90, Q: 0.7 });
  },
  dash() {
    if (!this.ready()) return;
    this.noise(0.2, { vol: 0.16, filter: 'bandpass', f0: 900, f1: 3400, Q: 1.1 });
    this.tone(420, 0.12, { type: 'sine', vol: 0.05, slide: 0.6 });
  },
  jump() {
    this.tone(260, 0.13, { type: 'triangle', vol: 0.06, slide: 1.9 });
    this.noise(0.12, { vol: 0.07, filter: 'highpass', f0: 900 });
  },
  land(hard = false) {
    if (!this.ready()) return;
    this.noise(0.1 + (hard ? 0.08 : 0), { vol: 0.09 + (hard ? 0.09 : 0), f0: 700, f1: 120 });
  },
  hurt() {
    if (!this.ready()) return;
    this.tone(160, 0.3, { type: 'sawtooth', vol: 0.13, slide: 0.45 });
    this.noise(0.25, { vol: 0.18, f0: 1600, f1: 200 });
    this.tone(55, 0.4, { type: 'sine', vol: 0.22, slide: 0.6 });
  },
  enemyTell() {
    if (!this.ready()) return;
    this.tone(520, 0.16, { type: 'triangle', vol: 0.05, slide: 1.4 });
  },
  enemySwing() {
    if (!this.ready()) return;
    this.noise(0.18, { vol: 0.13, f0: 1800, f1: 400, Q: 0.9 });
  },
  armorClank() {
    if (!this.ready()) return;
    this.tone(2400, 0.1, { type: 'square', vol: 0.05, slide: 0.85 });
    this.noise(0.08, { vol: 0.14, filter: 'bandpass', f0: 4000, Q: 2 });
  },
  chargeStart() {
    this.tone(110, 0.35, { type: 'sawtooth', vol: 0.06, slide: 1.6 });
  },
  chargeTick(p) {
    this.tone(300 + p * 700, 0.08, { type: 'sine', vol: 0.05 });
  },
  charged() {
    if (!this.ready()) return;
    this.tone(180, 0.5, { type: 'sawtooth', vol: 0.08, slide: 2.2 });
    this.tone(900, 0.5, { type: 'triangle', vol: 0.05, slide: 1.6, delay: 0.02 });
  },
  counter() {
    if (!this.ready()) return;
    this.noise(0.5, { vol: 0.26, f0: 5000, f1: 100, Q: 0.8 });
    this.tone(880, 0.7, { type: 'triangle', vol: 0.09, slide: 0.3 });
    this.tone(60, 0.6, { type: 'sine', vol: 0.3, slide: 0.7 });
  },
  /* ---- skill sounds ---- */
  iaiCharge() {
    if (!this.ready()) return;
    this.tone(220, 0.5, { type: 'sawtooth', vol: 0.05, slide: 2.6 });
    this.noise(0.5, { vol: 0.08, filter: 'bandpass', f0: 400, f1: 2400, Q: 3 });
  },
  iaiSlash() {
    if (!this.ready()) return;
    this.noise(0.42, { vol: 0.36, f0: 9000, f1: 120, Q: 0.6 });
    this.tone(1600, 0.5, { type: 'triangle', vol: 0.09, slide: 0.22 });
    this.tone(70, 0.55, { type: 'sine', vol: 0.34, slide: 0.45 });
    this.noise(0.6, { vol: 0.14, filter: 'highpass', f0: 1800, f1: 9000, delay: 0.03 });
  },
  vortexCast() {
    if (!this.ready()) return;
    this.tone(140, 0.4, { type: 'sawtooth', vol: 0.07, slide: 2.2 });
    this.noise(0.3, { vol: 0.14, filter: 'highpass', f0: 1200, f1: 6000 });
  },
  vortexLoop() {
    if (!this.ready()) return;
    this.noise(0.72, { vol: 0.14, filter: 'bandpass', f0: 2600, f1: 4200, Q: 6 });
    this.tone(620, 0.7, { type: 'square', vol: 0.025, slide: 1.3, detune: 16 });
  },
  vortexBurst() {
    if (!this.ready()) return;
    this.noise(0.4, { vol: 0.3, f0: 5200, f1: 200, Q: 1 });
    this.tone(90, 0.5, { type: 'sine', vol: 0.3, slide: 0.4 });
    this.tone(1250, 0.32, { type: 'triangle', vol: 0.07, slide: 0.5 });
  },
  skyCharge() {
    if (!this.ready()) return;
    this.tone(90, 0.28, { type: 'sawtooth', vol: 0.09, slide: 2.4 });
  },
  skySlash() {
    if (!this.ready()) return;
    this.noise(0.4, { vol: 0.3, f0: 600, f1: 7000, Q: 0.9 });
    this.tone(120, 0.5, { type: 'sawtooth', vol: 0.14, slide: 3.4 });
    this.tone(48, 0.6, { type: 'sine', vol: 0.3, slide: 1.4 });
  },
  riftCast() {
    if (!this.ready()) return;
    this.tone(180, 0.4, { type: 'sine', vol: 0.09, slide: 0.6 });
  },
  riftOpen() {
    if (!this.ready()) return;
    [1, 1.26, 1.5, 2.0, 2.52].forEach((m, i) => {
      this.tone(520 * m, 1.5 - i * 0.15, { type: 'triangle', vol: 0.09 / (1 + i * 0.5), slide: 0.55, delay: i * 0.04 });
    });
    this.tone(64, 1.6, { type: 'sine', vol: 0.26, slide: 0.8 });
    this.noise(1.2, { vol: 0.16, filter: 'bandpass', f0: 3200, f1: 400, Q: 2.5 });
  },
  riftClose() {
    if (!this.ready()) return;
    this.tone(320, 0.6, { type: 'triangle', vol: 0.07, slide: 0.35 });
    this.noise(0.5, { vol: 0.1, filter: 'lowpass', f0: 2400, f1: 200 });
  },
  skillReady() {
    if (!this.ready()) return;
    this.tone(880, 0.18, { type: 'triangle', vol: 0.05, slide: 1.4 });
    this.tone(1320, 0.22, { type: 'sine', vol: 0.035, slide: 1.2, delay: 0.05 });
  },
  uiStart() {
    if (!this.ready()) return;
    this.tone(330, 0.6, { type: 'triangle', vol: 0.09, slide: 2.0 });
    this.noise(0.5, { vol: 0.1, filter: 'highpass', f0: 500, f1: 5000 });
  }
};
