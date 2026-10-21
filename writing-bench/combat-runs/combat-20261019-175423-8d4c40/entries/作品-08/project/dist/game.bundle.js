(function () {
"use strict";
/* ===== 00-util.js ===== */
/* ============================================================
   绯刃 · 月下斩 — utility math, colors, tiny helpers
   ============================================================ */
const TAU = Math.PI * 2;
const PI = Math.PI;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));
const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const chance = (p) => Math.random() < p;
const hypot = (x, y) => Math.sqrt(x * x + y * y);
const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
const angLerp = (a, b, t) => {
  let d = ((b - a + PI) % TAU + TAU) % TAU - PI;
  return a + d * t;
};
const smoothstep = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const roundRect = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

/* deterministic RNG for scenery */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* color helpers */
function hexToRgb(hex) {
  if (typeof hex !== "string") return [255, 255, 255];
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function rgbStr(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r},${g},${b})`;
}
function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}
function shade(hex, t) {
  return mixHex(hex, t < 0 ? "#000000" : "#ffffff", Math.abs(t));
}

/* canvas drawing helpers */
function lineRod(ctx, a, b, w, color, cap = "round") {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = cap;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
function taperedRod(ctx, a, b, w0, w1, fill) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x) + PI / 2;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(a.x + (ca * w0) / 2, a.y + (sa * w0) / 2);
  ctx.lineTo(b.x + (ca * w1) / 2, b.y + (sa * w1) / 2);
  ctx.lineTo(b.x - (ca * w1) / 2, b.y - (sa * w1) / 2);
  ctx.lineTo(a.x - (ca * w0) / 2, a.y - (sa * w0) / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
function glowCircle(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.35, rgba(color, alpha * 0.55));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
function poly(ctx, pts, fill, stroke = null, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}
function twoBone(a, target, l1, l2, bend) {
  let dx = target.x - a.x;
  let dy = target.y - a.y;
  let d = Math.sqrt(dx * dx + dy * dy);
  const maxD = l1 + l2 - 0.5;
  const minD = Math.abs(l1 - l2) + 0.5;
  if (d < 0.001) d = 0.001;
  const base = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const off = Math.acos(cosA) * bend;
  return { x: a.x + Math.cos(base + off) * l1, y: a.y + Math.sin(base + off) * l1 };
}
function pointAlong(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
function rotatePoint(p, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
function distPointSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}
function seededRange(rng, a, b) {
  return a + rng() * (b - a);
}
function fmtNum(n) {
  return String(n);
}
const ROMAN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
function cnNum(n) {
  if (n <= 10) return ROMAN[n];
  if (n < 20) return "十" + ROMAN[n - 10];
  if (n < 100) {
    const a = Math.floor(n / 10);
    const b = n % 10;
    return ROMAN[a] + "十" + (b ? ROMAN[b] : "");
  }
  return String(n);
}

/* ===== 10-audio.js ===== */
/* ============================================================
   Procedural WebAudio sound engine — no external assets
   ============================================================ */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.ready = false;
    this.muted = false;
    this.ambientStarted = false;
    this.chargeNodes = null;
    this.lastHit = 0;
  }

  init() {
    if (this.ready) {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2.0);
      this.ready = true;
      this.startAmbient();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    } catch (err) {
      this.ready = false;
    }
  }

  makeNoise(sec) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  ok() {
    return this.ready && this.ctx && !this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.62, t, 0.025);
    }
    return this.muted;
  }

  setMuted(v) {
    if (this.muted !== v) this.toggleMute();
  }

  /* --- low level helpers --------------------------------- */
  gainNode(peak, attack = 0.005, decay = 0.1, startTime = null) {
    const ctx = this.ctx;
    const t = startTime == null ? ctx.currentTime : startTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.gain.setValueAtTime(0, t + attack + decay + 0.02);
    return g;
  }

  noiseSrc() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  }

  noiseHit(peak, dur, filterType, freqStart, freqEnd, q = 1, delay = 0) {
    if (!this.ok()) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const src = this.noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.setValueAtTime(Math.max(30, freqStart), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t + dur);
      f.Q.value = q;
      const g = this.gainNode(peak, 0.004, dur, t);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t, Math.random() * 1.2);
      src.stop(t + dur + 0.06);
    } catch (e) {}
  }

  tone(type, f0, f1, dur, peak, delay = 0, attack = 0.004) {
    if (!this.ok()) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, f0), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = this.gainNode(peak, attack, dur, t);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + attack + 0.05);
    } catch (e) {}
  }

  /* --- impacts ------------------------------------------- */
  swing(heavy = false) {
    if (!this.ok()) return;
    if (heavy) {
      this.noiseHit(0.24, 0.3, "bandpass", 240, 1250, 0.7);
      this.noiseHit(0.12, 0.18, "lowpass", 700, 220, 0.5, 0.01);
      this.tone("sine", 140, 70, 0.18, 0.09);
    } else {
      this.noiseHit(0.16, 0.13, "bandpass", 850, 3100, 1.1);
      this.noiseHit(0.07, 0.08, "highpass", 2100, 4200, 0.7, 0.01);
    }
  }

  hit(power = 1) {
    if (!this.ok()) return;
    const t = this.now();
    if (t - this.lastHit < 0.012) return;
    this.lastHit = t;
    const p = clamp(power, 0.4, 2);
    this.tone("sine", 170 + 30 * p, 52, 0.1 + 0.03 * p, 0.32 * p);
    this.tone("triangle", 430 + 90 * p, 180, 0.055, 0.11 * p);
    this.noiseHit(0.2 * p, 0.06, "highpass", 1000, 2600, 0.7);
    this.noiseHit(0.1 * p, 0.13, "bandpass", 500, 240, 1.6, 0.005);
    this.tone("sine", 1500 + 220 * Math.random(), 1050, 0.12, 0.035 * p);
  }

  heavyHit() {
    if (!this.ok()) return;
    this.hit(1.8);
    this.tone("sine", 92, 34, 0.32, 0.42);
    this.noiseHit(0.3, 0.23, "lowpass", 900, 140, 0.8);
    this.noiseHit(0.18, 0.1, "highpass", 1800, 4800, 0.5);
    this.tone("triangle", 310, 120, 0.2, 0.12);
  }

  breakLimb() {
    if (!this.ok()) return;
    this.noiseHit(0.34, 0.09, "highpass", 1600, 5200, 0.6);
    this.noiseHit(0.3, 0.2, "bandpass", 650, 300, 1.4, 0.01);
    this.tone("triangle", 520, 260, 0.16, 0.16);
    this.tone("square", 190, 70, 0.28, 0.08);
    this.noiseHit(0.2, 0.24, "lowpass", 500, 120, 0.7, 0.045);
    this.tone("sine", 1320, 620, 0.38, 0.05, 0.02);
  }

  parry() {
    if (!this.ok()) return;
    this.tone("sine", 2350, 2200, 0.55, 0.2, 0, 0.003);
    this.tone("sine", 3520, 3300, 0.34, 0.11, 0.005);
    this.tone("triangle", 1180, 1150, 0.46, 0.1);
    this.noiseHit(0.17, 0.2, "highpass", 3200, 7000, 0.8);
    this.tone("sine", 180, 80, 0.2, 0.18);
  }

  dash() {
    if (!this.ok()) return;
    this.noiseHit(0.18, 0.17, "bandpass", 2400, 340, 1.2);
    this.noiseHit(0.07, 0.2, "highpass", 3000, 1100, 0.6);
  }

  jump() {
    if (!this.ok()) return;
    this.tone("sine", 280, 480, 0.09, 0.06);
    this.noiseHit(0.045, 0.08, "bandpass", 700, 1400, 0.8);
  }

  doubleJump() {
    if (!this.ok()) return;
    this.tone("sine", 430, 880, 0.15, 0.07);
    this.tone("triangle", 700, 1300, 0.12, 0.035, 0.02);
    this.noiseHit(0.07, 0.14, "bandpass", 1400, 2600, 1.1);
  }

  land(heavy = false) {
    if (!this.ok()) return;
    this.tone("sine", heavy ? 110 : 150, 44, heavy ? 0.2 : 0.1, heavy ? 0.2 : 0.08);
    this.noiseHit(heavy ? 0.14 : 0.06, heavy ? 0.16 : 0.08, "lowpass", 900, 180, 0.7);
  }

  hurt() {
    if (!this.ok()) return;
    this.tone("sawtooth", 170, 62, 0.28, 0.14);
    this.tone("sine", 90, 45, 0.3, 0.2);
    this.noiseHit(0.18, 0.16, "bandpass", 1100, 300, 1.5);
    this.noiseHit(0.1, 0.06, "highpass", 3000, 5000, 0.6);
  }

  death() {
    if (!this.ok()) return;
    this.tone("sine", 120, 32, 1.4, 0.22, 0, 0.02);
    this.tone("triangle", 72, 38, 1.8, 0.15, 0.05);
    this.noiseHit(0.16, 0.7, "lowpass", 620, 90, 0.6, 0.02);
    this.tone("sine", 880, 420, 1.2, 0.045, 0.25);
  }

  kill() {
    if (!this.ok()) return;
    this.tone("sine", 92, 38, 0.5, 0.3);
    this.noiseHit(0.26, 0.28, "lowpass", 1300, 160, 0.7);
    this.tone("sine", 1480, 920, 0.5, 0.055, 0.02);
    this.noiseHit(0.1, 0.3, "highpass", 2400, 6800, 0.8, 0.02);
  }

  telegraph(type) {
    if (!this.ok()) return;
    const f = type === "bolt" ? 520 : type === "rend" ? 380 : 260;
    this.tone("triangle", f, f * 1.28, 0.17, 0.045, 0, 0.03);
    this.noiseHit(0.035, 0.13, "bandpass", f * 2, f * 3, 1.8);
  }

  shoot() {
    if (!this.ok()) return;
    this.tone("triangle", 740, 190, 0.18, 0.1);
    this.noiseHit(0.13, 0.12, "highpass", 2400, 800, 0.7);
    this.tone("sine", 160, 60, 0.16, 0.12);
  }

  deflect() {
    if (!this.ok()) return;
    this.tone("sine", 1700, 900, 0.18, 0.08);
    this.noiseHit(0.1, 0.14, "highpass", 2800, 6000, 0.7);
  }

  heal() {
    if (!this.ok()) return;
    this.tone("sine", 520, 520, 0.35, 0.055, 0);
    this.tone("sine", 780, 780, 0.5, 0.045, 0.09);
    this.tone("sine", 1040, 1040, 0.6, 0.03, 0.18);
  }

  waveClear() {
    if (!this.ok()) return;
    this.tone("sine", 74, 65, 1.6, 0.16, 0, 0.01);
    this.tone("sine", 110, 98, 1.4, 0.08, 0.01);
    this.noiseHit(0.08, 0.8, "lowpass", 800, 120, 0.6);
    this.tone("sine", 1560, 1540, 1.2, 0.028, 0.2);
  }

  waveStart() {
    if (!this.ok()) return;
    this.tone("sine", 88, 70, 1.2, 0.18, 0, 0.02);
    this.tone("triangle", 146, 120, 0.8, 0.06, 0.02);
    this.noiseHit(0.14, 0.5, "lowpass", 1000, 180, 0.7);
    this.tone("sine", 1960, 1900, 0.9, 0.03, 0.15);
  }

  startChime() {
    if (!this.ok()) return;
    this.tone("sine", 660, 660, 0.5, 0.05);
    this.tone("sine", 990, 990, 0.7, 0.035, 0.1);
    this.tone("sine", 1320, 1320, 0.9, 0.022, 0.2);
    this.noiseHit(0.04, 0.4, "highpass", 3000, 6500, 0.8, 0.05);
  }

  chargeStart() {
    if (!this.ok() || this.chargeNodes) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.18);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(240, t);
      f.frequency.linearRampToValueAtTime(1000, t + 0.9);
      const o1 = ctx.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.setValueAtTime(55, t);
      o1.frequency.linearRampToValueAtTime(92, t + 1.1);
      const o2 = ctx.createOscillator();
      o2.type = "triangle";
      o2.frequency.setValueAtTime(110, t);
      o2.frequency.linearRampToValueAtTime(184, t + 1.1);
      o1.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(this.master);
      o1.start(t);
      o2.start(t);
      this.chargeNodes = { g, o1, o2 };
    } catch (e) {}
  }

  chargeStop() {
    if (!this.chargeNodes || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const { g, o1, o2 } = this.chargeNodes;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0.0001, t, 0.03);
      o1.stop(t + 0.2);
      o2.stop(t + 0.2);
    } catch (e) {}
    this.chargeNodes = null;
  }

  chargeFull() {
    if (!this.ok()) return;
    this.tone("sine", 880, 1320, 0.22, 0.045);
    this.tone("sine", 1320, 1760, 0.18, 0.025, 0.02);
  }

  /* --- skill voices -------------------------------------- */
  skillDeny() {
    if (!this.ok()) return;
    this.tone("triangle", 210, 150, 0.08, 0.035);
    this.tone("square", 120, 90, 0.07, 0.02, 0.02);
  }

  skillStart(id) {
    if (!this.ok()) return;
    if (id === 1) {
      this.noiseHit(0.15, 0.34, "bandpass", 550, 2900, 0.9);
      this.tone("sine", 660, 990, 0.36, 0.045);
      this.tone("sine", 1480, 1640, 0.5, 0.022, 0.03);
      this.tone("sine", 1960, 1900, 0.42, 0.016, 0.08);
    } else if (id === 2) {
      this.noiseHit(0.17, 0.26, "bandpass", 3400, 420, 1.15);
      this.tone("sine", 1600, 420, 0.2, 0.05);
      this.tone("sine", 130, 60, 0.28, 0.15);
      this.tone("sine", 2360, 2100, 0.3, 0.018, 0.02);
    } else if (id === 3) {
      this.tone("sine", 98, 72, 1.35, 0.11, 0, 0.02);
      this.tone("sine", 1568, 1568, 1.0, 0.026, 0.12);
      this.tone("sine", 2093, 2093, 0.8, 0.016, 0.24);
      this.noiseHit(0.05, 0.55, "highpass", 3600, 7200, 0.7);
    } else if (id === 4) {
      this.tone("sawtooth", 58, 146, 0.46, 0.05);
      this.tone("sine", 88, 110, 0.5, 0.09, 0, 0.01);
      this.noiseHit(0.1, 0.5, "lowpass", 560, 120, 0.7);
      this.tone("sine", 1760, 1980, 0.35, 0.018, 0.05);
    }
  }

  blinkStep() {
    if (!this.ok()) return;
    this.noiseHit(0.14, 0.18, "highpass", 3600, 900, 0.7);
    this.tone("triangle", 1420, 520, 0.12, 0.055);
  }

  swordRift() {
    if (!this.ok()) return;
    this.tone("sine", 1800, 780, 0.22, 0.045);
    this.noiseHit(0.1, 0.18, "bandpass", 2800, 800, 1.2);
    this.tone("sine", 140, 55, 0.22, 0.17);
  }

  sakuraBloom() {
    if (!this.ok()) return;
    this.tone("sine", 87, 65, 1.5, 0.1);
    this.tone("sine", 1318, 1318, 1.1, 0.02, 0.05);
    this.tone("sine", 1976, 1976, 0.9, 0.014, 0.16);
    this.noiseHit(0.04, 0.7, "highpass", 3200, 7000, 0.7);
  }

  sakuraTick() {
    if (!this.ok()) return;
    this.tone("sine", 1046 + Math.random() * 300, 1046, 0.16, 0.025);
    this.noiseHit(0.035, 0.13, "highpass", 3000, 6000, 0.7);
  }

  sakuraFinal() {
    if (!this.ok()) return;
    this.tone("sine", 120, 48, 0.75, 0.22);
    this.tone("sine", 1568, 2093, 0.55, 0.03);
    this.noiseHit(0.12, 0.5, "bandpass", 1800, 450, 0.8);
  }

  sunderCharge() {
    if (!this.ok()) return;
    this.tone("sawtooth", 70, 170, 0.35, 0.07);
    this.noiseHit(0.08, 0.35, "lowpass", 420, 900, 0.8);
  }

  sunderRelease() {
    if (!this.ok()) return;
    this.tone("sine", 82, 28, 0.72, 0.34);
    this.tone("triangle", 150, 60, 0.5, 0.14);
    this.noiseHit(0.3, 0.42, "lowpass", 2200, 130, 0.7);
    this.noiseHit(0.16, 0.2, "highpass", 2400, 7800, 0.6);
    this.tone("sine", 2400, 1720, 0.35, 0.03);
  }

  startAmbient() {
    if (!this.ready || this.ambientStarted) return;
    this.ambientStarted = true;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, t);
      bus.gain.exponentialRampToValueAtTime(0.5, t + 3.5);
      bus.connect(this.master);
      // low sustained shadow drone
      const droneF = [55, 82.5, 110.2, 164.8];
      droneF.forEach((freq, i) => {
        const o = ctx.createOscillator();
        o.type = i < 2 ? "sine" : "triangle";
        o.frequency.value = freq;
        o.detune.value = (i - 1.5) * 4;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.052 : i === 1 ? 0.028 : i === 2 ? 0.012 : 0.006;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.045 + i * 0.017;
        const lfoG = ctx.createGain();
        lfoG.gain.value = g.gain.value * 0.35;
        lfo.connect(lfoG);
        lfoG.connect(g.gain);
        o.connect(g);
        g.connect(bus);
        o.start(t);
        lfo.start(t);
      });
      // wind bed
      const wind = ctx.createBufferSource();
      wind.buffer = this.noiseBuf;
      wind.loop = true;
      const wf = ctx.createBiquadFilter();
      wf.type = "lowpass";
      wf.frequency.value = 420;
      wf.Q.value = 0.5;
      const wg = ctx.createGain();
      wg.gain.value = 0.022;
      const wlfo = ctx.createOscillator();
      wlfo.frequency.value = 0.07;
      const wlg = ctx.createGain();
      wlg.gain.value = 0.012;
      wlfo.connect(wlg);
      wlg.connect(wg.gain);
      wind.connect(wf);
      wf.connect(wg);
      wg.connect(bus);
      wind.start(t);
      wlfo.start(t);
    } catch (e) {}
  }
}

const audio = new AudioEngine();

/* ===== 20-state.js ===== */
/* ============================================================
   Constants, shared state, canvas, input
   ============================================================ */
const GROUND_Y = 452;
const WORLD_W = 2400;
const DESIGN_W = 960;
const DESIGN_H = 540;
const STEP = 1 / 120;
const MAX_DPR_PIXELS = 6000000;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
const muteBtn = document.getElementById("mute");

const view = {
  w: 960,
  h: 540,
  dpr: 1,
  scale: 1,
  viewW: 960,
  viewH: 540,
  camY: 0,
};

const game = {
  ready: false,
  mode: "title", // title | play | over
  time: 0,
  realTime: 0,
  hitStop: 0,
  timeScale: 1,
  slowmo: 0,
  flash: 0,
  hurtVignette: 0,
  lowHpPulse: 0,

  player: null,
  enemies: [],
  attackerCount: 0,
  enemyId: 0,
  projectiles: [],
  debris: [],
  particles: [],
  particlesBack: [],
  decals: [],
  afterimages: [],
  floaters: [],
  slashes: [],
  skillFx: [],
  portals: [],
  pendingSpawns: [],
  banners: [],

  kills: 0,
  hitCount: 0,
  limbBreakCount: 0,
  combo: 0,
  comboTimer: 0,
  comboPop: 0,
  maxCombo: 0,
  rank: "",
  rankPop: 0,

  wave: 0,
  wavePhase: "none", // none | fight | clear
  waveTimer: 0,
  clearTimer: 0,
  waveRemaining: 0,
  waveHint: 0,

  camera: {
    x: 0,
    targetX: 0,
    shakeT: 0,
    shakeAmp: 0,
    shakeX: 0,
    shakeY: 0,
  },

  dying: false,
  deathTimer: 0,
  deathHold: 0,
  startFade: 0,
  introFade: 0,
  hintTimer: 0,
  lastPlayerHitAt: -99,
};


/* ---------------- input ---------------- */
const input = {
  down: Object.create(null),
  pressed: Object.create(null),
  released: Object.create(null),
  anyGesture: false,
};

const GAME_KEYS = new Set([
  "KeyA", "KeyD", "ArrowLeft", "ArrowRight",
  "Space", "KeyJ", "KeyK", "KeyL", "KeyI", "KeyR", "Enter",
  "Digit1", "Digit2", "Digit3", "Digit4",
]);

const KEY_FALLBACK = {
  a: "KeyA", d: "KeyD", j: "KeyJ", k: "KeyK", l: "KeyL", i: "KeyI", r: "KeyR",
  enter: "Enter", " ": "Space", spacebar: "Space",
  arrowleft: "ArrowLeft", arrowright: "ArrowRight",
  "1": "Digit1", "2": "Digit2", "3": "Digit3", "4": "Digit4",
};

function normalizeKeyCode(e) {
  let code = e.code;
  if (code && /^Numpad[1-4]$/.test(code)) return "Digit" + code.slice(-1);
  if (code && GAME_KEYS.has(code)) return code;
  const k = (e.key || "").toLowerCase();
  return KEY_FALLBACK[k] || code || "";
}

function clearInputState() {
  for (const k in input.down) input.down[k] = false;
  for (const k in input.pressed) input.pressed[k] = false;
  for (const k in input.released) input.released[k] = false;
}

function onFirstGesture() {
  if (!input.anyGesture) {
    input.anyGesture = true;
    audio.init();
  }
}

function requestStartIfReady() {
  if (!game.ready) {
    game.pendingStart = true;
    return;
  }
  startGame();
}

function handleMetaKey(code) {
  if (code === "Enter") {
    if (game.mode === "title" || game.mode === "over" || (game.player && game.player.dead)) {
      requestStartIfReady();
      return true;
    }
  }
  if (code === "KeyR") {
    if (game.mode === "play" || game.mode === "over" || game.mode === "title") {
      requestStartIfReady();
      return true;
    }
  }
  return false;
}

window.addEventListener("keydown", (e) => {
  const code = normalizeKeyCode(e);
  if (!GAME_KEYS.has(code)) return;
  e.preventDefault();
  onFirstGesture();
  if (e.repeat) {
    input.down[code] = true;
    return;
  }
  input.down[code] = true;
  input.pressed[code] = true;
  handleMetaKey(code);
});

window.addEventListener("keyup", (e) => {
  const code = normalizeKeyCode(e);
  if (!GAME_KEYS.has(code)) return;
  e.preventDefault();
  input.down[code] = false;
  input.released[code] = true;
});

function loseFocusReset() {
  clearInputState();
  if (audio.chargeNodes) audio.chargeStop();
  const p = game.player;
  if (p) {
    p.lightBuffer = 0;
    p.jumpBuffer = 0;
    p.heavyQueued = 0;
    p.dashQueued = 0;
    p.parryQueued = 0;
    if (p.skillQueue) p.skillQueue.length = 0;
    if (p.state === "charge") {
      p.state = "idle";
      p.chargeT = 0;
      p.chargeLevel = 0;
      p.chargeFullNotified = false;
    }
  }
}

window.addEventListener("blur", loseFocusReset);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) loseFocusReset();
});

canvas.addEventListener("pointerdown", (e) => {
  onFirstGesture();
  try { canvas.focus({ preventScroll: true }); } catch (err) {}
  if (e.button !== 0) return;
  if (game.mode === "title" || game.mode === "over" || (game.player && game.player.dead)) {
    requestStartIfReady();
  }
});

muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  audio.init();
  const m = audio.toggleMute();
  muteBtn.textContent = m ? "♪ 音效：关" : "♪ 音效：开";
  muteBtn.classList.toggle("off", m);
  muteBtn.blur();
});

registerMuteClickPreventScroll();

function registerMuteClickPreventScroll() {
  muteBtn.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") e.preventDefault();
  });
}

/* ===== 30-effects.js ===== */
/* ============================================================
   Particles, slashes, debris, camera shake, hit-stop feedback
   ============================================================ */

function addParticle(p) {
  const arr = p.back ? game.particlesBack : game.particles;
  arr.push(p);
  if (arr.length > 380) arr.splice(0, arr.length - 380);
}

function sparkBurst(x, y, dir, count, power = 1, color = "#ffb45e", back = false) {
  for (let i = 0; i < count; i++) {
    const a = rand(-1.25, 1.25) * (0.6 + power * 0.2) + (dir >= 0 ? 0 : PI);
    const speed = rand(140, 520) * power;
    addParticle({
      kind: "spark",
      x, y,
      vx: Math.cos(a) * speed + rand(-60, 60),
      vy: Math.sin(a) * speed - rand(20, 180) * power,
      life: rand(0.16, 0.42),
      maxLife: 0.42,
      size: rand(0.8, 2.2) * (0.7 + power * 0.5),
      color,
      grav: 720,
      drag: 0.9,
      rot: a,
      back,
      additive: true,
    });
  }
  // a couple of white-hot flash specks
  for (let i = 0; i < Math.ceil(count * 0.3); i++) {
    addParticle({
      kind: "glow",
      x, y,
      vx: rand(-180, 180),
      vy: rand(-240, 80),
      life: rand(0.08, 0.2),
      maxLife: 0.2,
      size: rand(1.4, 3.2),
      color: "#fff8e8",
      grav: 200,
      drag: 0.86,
      back,
      additive: true,
    });
  }
}

function emberBurst(x, y, count, color = "#ff7a5a", power = 1, back = false) {
  for (let i = 0; i < count; i++) {
    addParticle({
      kind: "ember",
      x: x + rand(-10, 10),
      y: y + rand(-8, 8),
      vx: rand(-160, 160) * power,
      vy: rand(-320, -20) * power,
      life: rand(0.4, 1.2),
      maxLife: 1.2,
      size: rand(1.1, 3.2),
      color: chance(0.5) ? color : "#ffd58a",
      grav: -40,
      drag: 0.94,
      back,
      additive: true,
      sway: rand(0.5, 2),
    });
  }
}

function dustBurst(x, y, count = 8, dir = 0, power = 1, color = "#b9a88f") {
  for (let i = 0; i < count; i++) {
    addParticle({
      kind: "dust",
      x: x + rand(-14, 14),
      y: y - rand(0, 6),
      vx: rand(-110, 110) * power + dir * 40,
      vy: rand(-80, -10) * power,
      life: rand(0.35, 0.9),
      maxLife: 0.9,
      size: rand(5, 16) * power,
      color,
      grav: -30,
      drag: 0.9,
      back: true,
    });
  }
}

function smokeBurst(x, y, count = 5, color = "#241d22", power = 1, back = true) {
  for (let i = 0; i < count; i++) {
    addParticle({
      kind: "smoke",
      x: x + rand(-10, 10),
      y: y + rand(-10, 6),
      vx: rand(-45, 45),
      vy: rand(-70, -12) * power,
      life: rand(0.5, 1.3),
      maxLife: 1.3,
      size: rand(7, 18) * power,
      color,
      grav: -20,
      drag: 0.94,
      back,
    });
  }
}

function woodBurst(x, y, dir, count = 10, power = 1, color = "#a98255") {
  for (let i = 0; i < count; i++) {
    const a = rand(-1.5, 1.5) + (dir >= 0 ? 0 : PI);
    addParticle({
      kind: "splinter",
      x, y,
      vx: Math.cos(a) * rand(120, 460) * power,
      vy: Math.sin(a) * rand(80, 380) - rand(80, 260),
      life: rand(0.5, 1.15),
      maxLife: 1.15,
      size: rand(2, 6) * (0.8 + power * 0.3),
      len: rand(6, 16),
      color: chance(0.35) ? "#d9c19a" : color,
      grav: 1500,
      drag: 0.985,
      rot: rand(0, TAU),
      vr: rand(-16, 16),
      back: false,
    });
  }
}

function metalBurst(x, y, dir, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = rand(-1.2, 1.2) + (dir >= 0 ? 0 : PI);
    addParticle({
      kind: "shard",
      x, y,
      vx: Math.cos(a) * rand(160, 480),
      vy: Math.sin(a) * rand(100, 380) - rand(60, 200),
      life: rand(0.4, 0.9),
      maxLife: 0.9,
      size: rand(2, 5),
      len: rand(5, 12),
      color: chance(0.4) ? "#d4f4ee" : "#718c8b",
      grav: 1300,
      drag: 0.985,
      rot: rand(0, TAU),
      vr: rand(-18, 18),
      back: false,
    });
  }
}

function petalBurst(x, y, count = 4, color = "#d8324c") {
  for (let i = 0; i < count; i++) {
    addParticle({
      kind: "petal",
      x: x + rand(-8, 8),
      y: y + rand(-20, 0),
      vx: rand(-60, 60),
      vy: rand(-60, 20),
      life: rand(0.7, 1.5),
      maxLife: 1.5,
      size: rand(3, 5),
      color,
      grav: 100,
      drag: 0.97,
      rot: rand(0, TAU),
      vr: rand(-7, 7),
      back: false,
    });
  }
}

function addRing(x, y, color = "#ffdca8", radius = 40, life = 0.22, width = 3, back = false) {
  addParticle({
    kind: "ring",
    x, y,
    vx: 0, vy: 0,
    life, maxLife: life,
    size: radius,
    color,
    width,
    back,
  });
}

function addShockwave(x, y, color = "#ffcf9a", radius = 110, life = 0.4, width = 5) {
  addParticle({
    kind: "shockwave",
    x, y,
    vx: 0, vy: 0,
    life, maxLife: life,
    size: radius,
    color,
    width,
    back: false,
  });
}

function addSlash(x, y, r, a0, a1, color, life = 0.18, width = 22, facing = 1, thick = 0.6) {
  game.slashes.push({
    x, y, r, a0, a1, color, life, maxLife: life, width, facing, thick,
  });
  if (game.slashes.length > 30) game.slashes.shift();
}

function addFloater(text, x, y, color = "#fff2d6", size = 13, opts = {}) {
  game.floaters.push({
    text,
    x, y,
    vx: opts.vx || rand(-20, 20),
    vy: opts.vy != null ? opts.vy : -58,
    life: opts.life || 0.8,
    maxLife: opts.life || 0.8,
    color,
    size,
    glow: opts.glow || null,
    slot: opts.slot || 0,
    pop: opts.pop || false,
  });
  if (game.floaters.length > 40) game.floaters.shift();
}

function addDecal(x, y, kind, dir = 1, scale = 1, color = "#1a0d0f", life = 7) {
  game.decals.push({ x, y, kind, dir, scale, color, life, maxLife: life, seed: Math.random() * 1000 });
  if (game.decals.length > 28) game.decals.shift();
}

function addAfterimage(pose, color = "#ff4d64", life = 0.26) {
  game.afterimages.push({ pose, color, life, maxLife: life });
  if (game.afterimages.length > 22) game.afterimages.shift();
}

function requestHitStop(t) {
  game.hitStop = Math.min(0.22, Math.max(game.hitStop, t));
}

function addShake(amp) {
  game.camera.shakeAmp = Math.min(13, Math.max(game.camera.shakeAmp, amp));
}

function screenFlash(a) {
  game.flash = Math.max(game.flash, a);
}

function setSlowmo(realSeconds, scale = 0.32) {
  game.slowmo = Math.max(game.slowmo, realSeconds);
  game.timeScale = Math.min(game.timeScale, scale);
}

/* ---------------- debris ---------------- */
function spawnDebris(opts) {
  const d = {
    kind: opts.kind || "arm",
    x: opts.x, y: opts.y,
    vx: opts.vx || 0,
    vy: opts.vy || -220,
    rot: opts.rot || rand(0, TAU),
    vr: opts.vr || rand(-10, 10),
    len: opts.len || 22,
    len2: opts.len2 || 18,
    width: opts.width || 7,
    color: opts.color || "#6b5137",
    dark: opts.dark || "#241a14",
    accent: opts.accent || "#ff9b5e",
    weapon: opts.weapon || null,
    scale: opts.scale || 1,
    life: opts.life || 4.5,
    maxLife: opts.life || 4.5,
    groundHits: 0,
    bouncing: true,
  };
  game.debris.push(d);
  if (game.debris.length > 44) game.debris.shift();
}

function updateDebris(dt) {
  for (let i = game.debris.length - 1; i >= 0; i--) {
    const d = game.debris[i];
    d.life -= dt;
    if (d.life <= 0) {
      game.debris.splice(i, 1);
      continue;
    }
    d.vy += 1500 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.rot += d.vr * dt;
    if (d.y > GROUND_Y - 2) {
      d.y = GROUND_Y - 2;
      if (d.vy > 60) {
        if (d.groundHits < 3) {
          d.vy *= -0.32;
          d.vx *= 0.63;
          d.vr *= 0.55;
          d.groundHits++;
          dustBurst(d.x, GROUND_Y, 4, sgn(d.vx), 0.7, "#8f7d68");
          if (d.groundHits === 1) metalBurst(d.x, d.y - 4, sgn(d.vx), 2);
        } else {
          d.vy = 0;
          d.vx *= 0.82;
          d.vr *= 0.6;
          d.bouncing = false;
        }
      } else {
        d.vy = 0;
        d.vx *= Math.pow(0.02, dt);
        d.vr *= Math.pow(0.01, dt);
      }
    }
    if (d.bouncing && chance(dt * 18)) {
      addParticle({
        kind: "ember",
        x: d.x, y: d.y,
        vx: rand(-30, 30), vy: rand(-80, -10),
        life: rand(0.2, 0.5), maxLife: 0.5,
        size: rand(1, 2.4), color: d.accent,
        grav: -20, drag: 0.95, back: false, additive: true,
      });
    }
  }
}

function drawDebris() {
  for (const d of game.debris) {
    const alpha = d.life < 1.1 ? d.life / 1.1 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    const s = d.scale;
    if (d.kind === "head") {
      drawDebrisHead(d, s);
    } else if (d.kind === "armUpper" || d.kind === "armLower" || d.kind === "legUpper" || d.kind === "legLower") {
      drawDebrisLimb(d, s);
    } else {
      drawDebrisLimb(d, s);
    }
    ctx.restore();
  }
}

function drawDebrisLimb(d, s) {
  const half = d.len / 2;
  // dark outline then central rod
  lineRod(ctx, { x: -half, y: 0 }, { x: half, y: 0 }, d.width + 2.2, rgba(d.dark, 0.9));
  taperedRod(ctx, { x: -half, y: 0 }, { x: half, y: 0 }, d.width, d.width * 0.8, d.color);
  ctx.strokeStyle = rgba("#f4dfb8", 0.32);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-half + 2, -d.width * 0.42);
  ctx.lineTo(half - 2, -d.width * 0.5);
  ctx.stroke();
  // dark edge / wood grain
  ctx.strokeStyle = rgba(d.dark, 0.85);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-half + 2, -d.width * 0.28);
  ctx.lineTo(half - 2, -d.width * 0.34);
  ctx.stroke();
  ctx.strokeStyle = rgba("#e2caa2", 0.22);
  ctx.beginPath();
  ctx.moveTo(-half + 2, d.width * 0.28);
  ctx.lineTo(half - 2, d.width * 0.16);
  ctx.stroke();
  // joint at left end
  circle(ctx, -half, 0, d.width * 0.62, d.dark);
  circle(ctx, -half, 0, d.width * 0.38, rgba(d.accent, 0.85));
  glowCircle(ctx, -half, 0, d.width * 1.8, d.accent, 0.2);
  if (d.kind === "legLower") {
    // foot
    poly(ctx, [
      { x: half - 2, y: -3 },
      { x: half + 10 * s, y: -2 },
      { x: half + 11 * s, y: 4 },
      { x: half - 2, y: 5 },
    ], d.dark);
  } else if (d.kind === "armLower") {
    // hand joint
    circle(ctx, half, 0, d.width * 0.62, d.dark);
    circle(ctx, half + 2, 0, d.width * 0.3, rgba(d.accent, 0.8));
    if (d.weapon === "axe") {
      ctx.save();
      ctx.translate(half, 0);
      ctx.rotate(-0.25);
      lineRod(ctx, { x: -2, y: 0 }, { x: 30 * s, y: 0 }, 3.2 * s, "#4a3524");
      poly(ctx, [
        { x: 26 * s, y: -4 * s },
        { x: 40 * s, y: -16 * s },
        { x: 47 * s, y: -1 * s },
        { x: 35 * s, y: 9 * s },
      ], "#8b8c87", rgba("#dbe7e4", 0.5), 0.8);
      ctx.restore();
    } else if (d.weapon === "crossbow") {
      ctx.save();
      ctx.translate(half + 5, 0);
      ctx.strokeStyle = "#6a5741";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, 12 * s, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = "#c7bb9b";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(12 * s, -10 * s);
      ctx.lineTo(12 * s, 10 * s);
      ctx.stroke();
      ctx.restore();
    } else if (d.weapon === "claw") {
      ctx.strokeStyle = "#cfc4ac";
      ctx.lineWidth = 1.8;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(half, i * 2.4);
        ctx.lineTo(half + 14 * s, i * 4.4 + 2);
        ctx.stroke();
      }
    }
  }
}
function drawDebrisHead(d, s) {
  ctx.fillStyle = d.dark;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9 * s, 10 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.ellipse(0, -1 * s, 8 * s, 9 * s, 0, 0, TAU);
  ctx.fill();
  // horn
  poly(ctx, [
    { x: -5 * s, y: -6 * s },
    { x: -8 * s, y: -17 * s },
    { x: -2 * s, y: -8 * s },
  ], "#d4c3a2");
  const flicker = 0.5 + 0.5 * Math.sin(performance.now() * 0.02 + d.x);
  glowCircle(ctx, 2 * s, 0, 9 * s, d.accent, 0.55 * flicker);
  circle(ctx, 2 * s, 0, 2.2 * s, "#fff6df");
}

/* ---------------- update / draw particles ---------------- */
function updateEffects(dt) {
  updateParticles(game.particles, dt);
  updateParticles(game.particlesBack, dt);
  updateDebris(dt);

  for (let i = game.slashes.length - 1; i >= 0; i--) {
    const s = game.slashes[i];
    s.life -= dt;
    if (s.life <= 0) game.slashes.splice(i, 1);
  }
  for (let i = game.decals.length - 1; i >= 0; i--) {
    const d = game.decals[i];
    d.life -= dt;
    if (d.life <= 0) game.decals.splice(i, 1);
  }
  for (let i = game.floaters.length - 1; i >= 0; i--) {
    const f = game.floaters[i];
    f.life -= dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vy += 90 * dt;
    if (f.life <= 0) game.floaters.splice(i, 1);
  }
  for (let i = game.afterimages.length - 1; i >= 0; i--) {
    const a = game.afterimages[i];
    a.life -= dt;
    if (a.life <= 0) game.afterimages.splice(i, 1);
  }
  updateSkillFx(dt);
}

function updateParticles(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.life -= dt;
    if (p.life <= 0) {
      arr.splice(i, 1);
      continue;
    }
    if (p.kind === "ring" || p.kind === "shockwave") continue;
    p.vy += (p.grav || 0) * dt;
    p.vx *= Math.pow(p.drag != null ? p.drag : 0.98, dt * 60);
    p.vy *= Math.pow(p.drag != null ? p.drag : 0.98, dt * 60);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.sway) p.x += Math.sin((p.maxLife - p.life) * 8 * p.sway) * 24 * dt;
    if (p.rot != null && p.vr) p.rot += p.vr * dt;
    if (p.kind === "splinter" || p.kind === "shard") {
      if (p.y > GROUND_Y) {
        p.y = GROUND_Y;
        p.vy *= -0.28;
        p.vx *= 0.7;
        p.vr *= 0.5;
        if (Math.abs(p.vy) < 30) {
          p.vy = 0;
          p.vx *= 0.8;
        }
      }
    }
  }
}

function drawParticlesBack() {
  drawParticleArray(game.particlesBack);
}
function drawParticlesFront() {
  drawParticleArray(game.particles);
}

function drawParticleArray(arr) {
  ctx.save();
  for (const p of arr) {
    const lt = 1 - p.life / p.maxLife;
    const alpha = p.life <= 0 ? 0 : clamp(p.life / (p.maxLife * 0.6), 0, 1);
    if (p.kind === "spark") {
      const a = Math.atan2(p.vy, p.vx);
      const len = clamp(Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 0.025, 3, 16);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
      ctx.stroke();
      if (p.size > 1.8) {
        glowCircle(ctx, p.x, p.y, p.size * 2.3, p.color, alpha * 0.22);
      }
    } else if (p.kind === "glow" || p.kind === "ember") {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      glowCircle(ctx, p.x, p.y, p.size * (p.kind === "ember" ? 4.5 : 3), p.color, alpha * 0.8);
      circle(ctx, p.x, p.y, p.size * 0.7, rgba("#fff6e0", alpha));
    } else if (p.kind === "dust") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * 0.34;
      const r = p.size * (1 + lt * 1.9);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, rgba(p.color, 0.7));
      g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    } else if (p.kind === "smoke") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * 0.25;
      const r = p.size * (1 + lt * 2.2);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, rgba(p.color, 0.9));
      g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    } else if (p.kind === "splinter" || p.kind === "shard") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      poly(ctx, [
        { x: -p.len / 2, y: -p.size / 2 },
        { x: p.len / 2, y: 0 },
        { x: -p.len / 2, y: p.size / 2 },
      ], p.color);
      ctx.restore();
    } else if (p.kind === "petal") {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * 0.9;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === "ring") {
      const r = p.size * (0.35 + lt * 0.9);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width * (1 - lt * 0.7);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.stroke();
    } else if (p.kind === "shockwave") {
      const r = p.size * easeOutCubic(lt);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width * (1 - lt) + 0.4;
      ctx.beginPath();
      ctx.ellipse(p.x, GROUND_Y - 2, r, r * 0.22, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.25;
      ctx.lineWidth = p.width * 0.4;
      ctx.beginPath();
      ctx.ellipse(p.x, GROUND_Y - 2, r * 0.7, r * 0.15, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawSlashes() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const s of game.slashes) {
    const t = 1 - s.life / s.maxLife;
    const alpha = Math.sin(Math.min(1, t * 1.2) * PI) * 0.95;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(s.facing, 1);
    const r = s.r * (0.92 + 0.1 * t);
    const inner = r * s.thick;
    const a0 = s.a0;
    const a1 = s.a1;
    // soft outer glow
    ctx.globalAlpha = alpha * 0.16;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width * 1.35;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, a0, a1);
    ctx.stroke();
    // tapered crescent body
    const grad = ctx.createRadialGradient(0, 0, inner * 0.98, 0, 0, r);
    grad.addColorStop(0, rgba(s.color, 0));
    grad.addColorStop(0.5, rgba(s.color, alpha * 0.26));
    grad.addColorStop(0.8, rgba("#fff6ec", alpha * 0.55));
    grad.addColorStop(0.94, rgba("#ffffff", alpha * 0.42));
    grad.addColorStop(1, rgba(s.color, 0));
    ctx.fillStyle = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a1);
    ctx.arc(0, 0, inner, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    // white core stroke along the leading edge
    ctx.globalAlpha = alpha * 0.75;
    ctx.strokeStyle = "rgba(255,246,236,0.85)";
    ctx.lineWidth = Math.max(0.8, s.width * 0.11);
    const mid = (a0 + a1) / 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, lerp(a0, mid, 0.45), lerp(a1, mid, 0.2));
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawDecals() {
  for (const d of game.decals) {
    const alpha = clamp(d.life / d.maxLife, 0, 1) * 0.55;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(d.dir * d.scale, 1);
    ctx.globalAlpha = alpha;
    if (d.kind === "crack") {
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(-12, 2);
      ctx.lineTo(-2, -2);
      ctx.lineTo(9, 3);
      ctx.lineTo(22, 0);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-2, 7);
      ctx.moveTo(7, 1);
      ctx.lineTo(13, -6);
      ctx.stroke();
    } else if (d.kind === "scorch") {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 42);
      g.addColorStop(0, rgba(d.color, 0.8));
      g.addColorStop(0.5, rgba(d.color, 0.35));
      g.addColorStop(1, rgba(d.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 46, 8, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba("#ff9358", 0.28);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, 18 + i * 9, 3 + i * 2, 0, 0.2, PI - 0.2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  for (const f of game.floaters) {
    const t = 1 - f.life / f.maxLife;
    const alpha = clamp(f.life / (f.maxLife * 0.45), 0, 1);
    const scale = f.pop ? 1 + Math.max(0, 0.5 - t * 3) : 1;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${f.size}px "CombatSerif","Songti SC","STSong","Noto Serif CJK SC",serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (f.glow) {
      ctx.shadowColor = f.glow;
      ctx.shadowBlur = 10;
    }
    if (f.size >= 13) {
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = "rgba(10,6,9,0.72)";
      ctx.lineJoin = "round";
      ctx.strokeText(f.text, 0, 0);
    }
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

/* ===== 40-player.js ===== */
/* ============================================================
   Player: movement, attack kit, animation skeleton, feedback
   ============================================================ */
const GRAV = 2200;
const JUMP_VY = -790;
const AIR_JUMP_VY = -710;
const MAX_RUN = 335;
const MAX_AIR = 315;

const LIGHT_GROUND = [
  {
    kind: "light", index: 0, pose: "diagDown",
    startup: 0.055, active: 0.08, recovery: 0.15,
    dmg: 9, limb: 11, poise: 11,
    hitstop: 0.045, shake: 1.5, kb: 95, launch: 0,
    ox: 45, oy: 47, r: 45, lunge: 150,
    slash: { r: 52, ox: 25, oy: 40, a0: -2.3, a1: 0.56, width: 16, life: 0.15 },
    bias: { arm: 0.8, leg: 1.3, head: 1.05 },
    sound: "light",
  },
  {
    kind: "light", index: 1, pose: "upperReverse",
    startup: 0.05, active: 0.078, recovery: 0.15,
    dmg: 10, limb: 12, poise: 12,
    hitstop: 0.05, shake: 1.8, kb: 110, launch: 0,
    ox: 48, oy: 45, r: 49, lunge: 170,
    slash: { r: 50, ox: 22, oy: 43, a0: 1.22, a1: -2.6, width: 15, life: 0.15 },
    bias: { arm: 0.9, leg: 1.15, head: 1.1 },
    sound: "light",
  },
  {
    kind: "light", index: 2, pose: "moonfall",
    startup: 0.09, active: 0.095, recovery: 0.235,
    dmg: 16, limb: 19, poise: 27,
    hitstop: 0.075, shake: 3.2, kb: 195, launch: 335,
    ox: 55, oy: 51, r: 60, lunge: 240,
    slash: { r: 62, ox: 27, oy: 40, a0: -2.7, a1: 0.92, width: 20, life: 0.17 },
    bias: { arm: 1.0, leg: 1.05, head: 0.9 },
    sound: "heavyish",
  },
];

const LIGHT_AIR = [
  {
    kind: "light", index: 0, air: true, pose: "airDiag",
    startup: 0.05, active: 0.08, recovery: 0.1,
    dmg: 9, limb: 11, poise: 10,
    hitstop: 0.045, shake: 1.4, kb: 85, launch: 145,
    ox: 43, oy: 42, r: 44, lunge: 95,
    slash: { r: 48, ox: 22, oy: 36, a0: -2.2, a1: 0.55, width: 15, life: 0.14 },
    bias: { arm: 0.8, leg: 1.2, head: 1.1 },
    sound: "light",
  },
  {
    kind: "light", index: 1, air: true, pose: "airReverse",
    startup: 0.048, active: 0.078, recovery: 0.1,
    dmg: 10, limb: 12, poise: 12,
    hitstop: 0.05, shake: 1.7, kb: 100, launch: 155,
    ox: 46, oy: 40, r: 49, lunge: 100,
    slash: { r: 48, ox: 20, oy: 38, a0: 1.15, a1: -2.55, width: 15, life: 0.14 },
    bias: { arm: 0.9, leg: 1.1, head: 1.1 },
    sound: "light",
  },
  {
    kind: "light", index: 2, air: true, pose: "airSpike",
    startup: 0.075, active: 0.09, recovery: 0.16,
    dmg: 15, limb: 18, poise: 25,
    hitstop: 0.08, shake: 3.0, kb: 140, launch: -360,
    ox: 46, oy: 34, r: 56, lunge: 120,
    slash: { r: 56, ox: 23, oy: 32, a0: -2.6, a1: 1.0, width: 19, life: 0.16 },
    bias: { arm: 1.0, leg: 1.15, head: 0.95 },
    sound: "heavyish",
  },
];

const HEAVY_DEF = {
  kind: "heavy", pose: "cleave",
  startup: 0.16, active: 0.1, recovery: 0.33,
  dmg: 32, limb: 38, poise: 52,
  hitstop: 0.1, shake: 4.6, kb: 300, launch: 280,
  ox: 51, oy: 45, r: 68, lunge: 260,
  slash: { r: 76, ox: 30, oy: 36, a0: -2.6, a1: 0.9, width: 24, life: 0.2 },
  bias: { arm: 1.0, leg: 1.05, head: 0.95 },
  sound: "heavy",
};

const AIR_HEAVY_DEF = {
  kind: "airHeavy", pose: "airSlam", air: true,
  startup: 0.1, active: 0.2, recovery: 0.24,
  dmg: 34, limb: 42, poise: 56,
  hitstop: 0.1, shake: 5.0, kb: 250, launch: -380,
  ox: 38, oy: 32, r: 60, lunge: 70,
  slash: { r: 62, ox: 24, oy: 30, a0: -2.5, a1: 1.0, width: 22, life: 0.18 },
  bias: { arm: 1.0, leg: 1.1, head: 0.95 },
  sound: "heavy",
};

const DASH_ATK_DEF = {
  kind: "dashAtk", pose: "lunge",
  startup: 0.04, active: 0.1, recovery: 0.18,
  dmg: 22, limb: 27, poise: 34,
  hitstop: 0.075, shake: 3.2, kb: 240, launch: 110,
  ox: 56, oy: 44, r: 49, lunge: 480,
  slash: { r: 68, ox: 28, oy: 37, a0: -1.05, a1: 0.36, width: 20, life: 0.16 },
  bias: { arm: 0.95, leg: 1.0, head: 1.1 },
  sound: "heavyish",
};

const AIR_SLAM_DEF = {
  dmg: 24, limb: 30, poise: 42,
  hitstop: 0.09, shake: 6.0, kb: 300, launch: 200,
  r: 108, bias: { arm: 1.0, leg: 1.0, head: 0.95 },
};

const ATTACK_POSES = {
  diagDown: {
    wind: { handR: { x: 2, y: -37 }, handL: { x: 6, y: -33 }, angle: -2.45, lean: -0.12, crouch: 2, hipShift: -2, footL: { x: -14, y: 0 }, footR: { x: 13, y: 0 }, headTilt: -0.03, twoHand: false },
    strike: { handR: { x: 20, y: -27 }, handL: { x: -8, y: -18 }, angle: 0.78, lean: 0.34, crouch: 5, hipShift: 7, footL: { x: -17, y: 0 }, footR: { x: 17, y: 0 }, headTilt: 0.08, twoHand: false },
    recover: { handR: { x: 14, y: -23 }, handL: { x: -4, y: -20 }, angle: 1.2, lean: 0.1, crouch: 2, hipShift: 2, footL: { x: -13, y: 0 }, footR: { x: 14, y: 0 }, headTilt: 0.02, twoHand: false },
  },
  upperReverse: {
    wind: { handR: { x: 16, y: -20 }, handL: { x: 2, y: -19 }, angle: 1.35, lean: 0.18, crouch: 4, hipShift: 1, footL: { x: -13, y: 0 }, footR: { x: 14, y: 0 }, headTilt: 0.04, twoHand: false },
    strike: { handR: { x: 4, y: -40 }, handL: { x: -4, y: -28 }, angle: -2.72, lean: -0.24, crouch: 1, hipShift: 2, footL: { x: -15, y: 0 }, footR: { x: 14, y: 0 }, headTilt: -0.12, twoHand: false },
    recover: { handR: { x: 8, y: -27 }, handL: { x: -5, y: -22 }, angle: -2.1, lean: -0.04, crouch: 1, hipShift: 0, footL: { x: -11, y: 0 }, footR: { x: 12, y: 0 }, headTilt: -0.03, twoHand: false },
  },
  moonfall: {
    wind: { handR: { x: -2, y: -45 }, handL: { x: 2, y: -39 }, angle: -2.95, lean: -0.2, crouch: 4, hipShift: -4, footL: { x: -16, y: 0 }, footR: { x: 15, y: 0 }, headTilt: -0.08, twoHand: true },
    strike: { handR: { x: 22, y: -27 }, handL: { x: 13, y: -30 }, angle: 1.02, lean: 0.42, crouch: 7, hipShift: 11, footL: { x: -19, y: 0 }, footR: { x: 20, y: 0 }, headTilt: 0.12, twoHand: true },
    recover: { handR: { x: 17, y: -22 }, handL: { x: 7, y: -26 }, angle: 1.24, lean: 0.16, crouch: 3, hipShift: 4, footL: { x: -15, y: 0 }, footR: { x: 16, y: 0 }, headTilt: 0.04, twoHand: true },
  },
  cleave: {
    wind: { handR: { x: -8, y: -24 }, handL: { x: -2, y: -23 }, angle: -2.72, lean: -0.16, crouch: 10, hipShift: -7, footL: { x: -17, y: 0 }, footR: { x: 14, y: 0 }, headTilt: -0.05, twoHand: true },
    strike: { handR: { x: 24, y: -25 }, handL: { x: 15, y: -27 }, angle: 0.98, lean: 0.37, crouch: 8, hipShift: 12, footL: { x: -20, y: 0 }, footR: { x: 20, y: 0 }, headTilt: 0.11, twoHand: true },
    recover: { handR: { x: 18, y: -22 }, handL: { x: 8, y: -24 }, angle: 1.22, lean: 0.12, crouch: 3, hipShift: 4, footL: { x: -15, y: 0 }, footR: { x: 15, y: 0 }, headTilt: 0.03, twoHand: true },
  },
  lunge: {
    wind: { handR: { x: 0, y: -35 }, handL: { x: -4, y: -27 }, angle: -1.35, lean: 0.32, crouch: 5, hipShift: 2, footL: { x: -18, y: 0 }, footR: { x: 15, y: 0 }, headTilt: 0.02, twoHand: false },
    strike: { handR: { x: 26, y: -29 }, handL: { x: 8, y: -22 }, angle: 0.06, lean: 0.56, crouch: 8, hipShift: 16, footL: { x: -24, y: 0 }, footR: { x: 21, y: 0 }, headTilt: 0.1, twoHand: false },
    recover: { handR: { x: 19, y: -25 }, handL: { x: 3, y: -22 }, angle: 0.7, lean: 0.22, crouch: 3, hipShift: 6, footL: { x: -16, y: 0 }, footR: { x: 16, y: 0 }, headTilt: 0.03, twoHand: false },
  },
  airDiag: {
    wind: { handR: { x: 2, y: -35 }, handL: { x: 5, y: -30 }, angle: -2.3, lean: -0.1, crouch: 0, hipShift: -1, footL: { x: -9, y: -12 }, footR: { x: 8, y: -5 }, headTilt: -0.03, twoHand: false },
    strike: { handR: { x: 19, y: -24 }, handL: { x: -7, y: -18 }, angle: 0.72, lean: 0.3, crouch: 1, hipShift: 5, footL: { x: -11, y: -8 }, footR: { x: 11, y: -12 }, headTilt: 0.08, twoHand: false },
    recover: { handR: { x: 14, y: -22 }, handL: { x: -4, y: -19 }, angle: 1.15, lean: 0.08, crouch: 0, hipShift: 2, footL: { x: -9, y: -10 }, footR: { x: 9, y: -7 }, headTilt: 0.02, twoHand: false },
  },
  airReverse: {
    wind: { handR: { x: 16, y: -17 }, handL: { x: 2, y: -16 }, angle: 1.5, lean: 0.2, crouch: 0, hipShift: 1, footL: { x: -8, y: -6 }, footR: { x: 9, y: -11 }, headTilt: 0.03, twoHand: false },
    strike: { handR: { x: 3, y: -38 }, handL: { x: -4, y: -27 }, angle: -2.6, lean: -0.22, crouch: 0, hipShift: 2, footL: { x: -11, y: -12 }, footR: { x: 8, y: -6 }, headTilt: -0.1, twoHand: false },
    recover: { handR: { x: 8, y: -27 }, handL: { x: -5, y: -23 }, angle: -2.0, lean: -0.03, crouch: 0, hipShift: 0, footL: { x: -9, y: -10 }, footR: { x: 9, y: -6 }, headTilt: -0.02, twoHand: false },
  },
  airSpike: {
    wind: { handR: { x: -1, y: -43 }, handL: { x: 2, y: -38 }, angle: -2.85, lean: -0.18, crouch: 0, hipShift: -2, footL: { x: -8, y: -14 }, footR: { x: 7, y: -10 }, headTilt: -0.08, twoHand: true },
    strike: { handR: { x: 17, y: -13 }, handL: { x: 10, y: -20 }, angle: 1.42, lean: 0.45, crouch: 0, hipShift: 7, footL: { x: -13, y: -4 }, footR: { x: 12, y: -8 }, headTilt: 0.14, twoHand: true },
    recover: { handR: { x: 15, y: -20 }, handL: { x: 4, y: -24 }, angle: 1.1, lean: 0.16, crouch: 0, hipShift: 2, footL: { x: -10, y: -7 }, footR: { x: 10, y: -9 }, headTilt: 0.03, twoHand: true },
  },
  airSlam: {
    wind: { handR: { x: 0, y: -44 }, handL: { x: 2, y: -37 }, angle: -2.7, lean: -0.15, crouch: 0, hipShift: -2, footL: { x: -8, y: -16 }, footR: { x: 8, y: -13 }, headTilt: -0.05, twoHand: true },
    strike: { handR: { x: 14, y: -12 }, handL: { x: 8, y: -19 }, angle: 1.5, lean: 0.5, crouch: 0, hipShift: 6, footL: { x: -12, y: -2 }, footR: { x: 11, y: -6 }, headTilt: 0.15, twoHand: true },
    recover: { handR: { x: 16, y: -21 }, handL: { x: 6, y: -25 }, angle: 1.12, lean: 0.14, crouch: 0, hipShift: 2, footL: { x: -9, y: -7 }, footR: { x: 9, y: -8 }, headTilt: 0.02, twoHand: true },
  },
};

function createPlayer(x) {
  const p = {
    x: x != null ? x : WORLD_W / 2,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    coyote: 0,
    jumpCount: 0,
    jumpBuffer: 0,
    jumpCutDone: false,
    hp: 100,
    maxHp: 100,
    displayHp: 100,
    hurtFlash: 0,
    iframes: 0,
    state: "idle",
    animTime: 0,
    runPhase: 0,
    landSquash: 0,

    atk: null,
    lightNext: 0,
    lightWindow: 0,
    lightBuffer: 0,
    heavyQueued: 0,
    dashQueued: 0,
    parryQueued: 0,

    dashT: 0,
    dashCd: 0,
    dashDir: 1,
    airDashUsed: false,
    airDashQueued: false,

    parryT: 0,
    parryCd: 0,

    skill: null,
    skillCd: { 1: 0, 2: 0, 3: 0, 4: 0 },
    skillQueue: [],
    skillDenyT: 0,
    skillDenyId: 0,

    chargeT: 0,
    chargeLevel: 0,
    chargeFullNotified: false,

    hurtT: 0,
    dead: false,
    deadT: 0,

    trailTick: 0,
    scarf: [],
    scarfNeck: { x: 0, y: 0 },
    ghostTick: 0,
    parryFlash: 0,
    lastAngle: 1.1,
  };
  initScarf(p);
  return p;
}

function initScarf(p) {
  p.scarf = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const x = p.x - p.facing * i * 4.6;
    const y = p.y - 60 + i * 0.5 + Math.sin(i * 0.7) * 1.5;
    p.scarf.push({ x, y, px: x, py: y });
  }
}

function updateScarf(p, dt) {
  if (!p.scarf.length) initScarf(p);
  const pts = p.scarf;
  const crouch = p.state === "charge" ? 8 : 0;
  const neckX = p.x + p.facing * 1.5;
  const neckY = p.y - 59 + crouch + Math.sin(p.animTime * 2.2) * 0.8;
  pts[0].x = neckX;
  pts[0].y = neckY;
  pts[0].px = neckX;
  pts[0].py = neckY;
  const speed = Math.abs(p.vx);
  const windX = Math.sin(game.time * 1.35) * (14 + speed * 0.05);
  const windY = Math.cos(game.time * 1.1) * 5;
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    let vx = (q.x - q.px) * 0.93;
    let vy = (q.y - q.py) * 0.93;
    const flut = Math.sin(game.time * 3.3 + i * 0.72) * (6 + speed * 0.035 + (p.state === "dash" ? 30 : 0));
    q.px = q.x;
    q.py = q.y;
    q.x += vx + (windX + flut) * dt * dt * 18;
    q.y += vy + (250 + windY) * dt * dt;
    // limit motion
    const maxStep = 9;
    const dx = q.x - pts[i - 1].x;
    const dy = q.y - pts[i - 1].y;
    const d = Math.hypot(dx, dy) || 1;
    const seg = 4.8;
    q.x = pts[i - 1].x + (dx / d) * seg;
    q.y = pts[i - 1].y + (dy / d) * seg;
  }
  for (let k = 0; k < 2; k++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const diff = (d - 4.8) / d;
      if (i === 1) {
        b.x -= dx * diff;
        b.y -= dy * diff;
      } else {
        a.x += dx * diff * 0.35;
        a.y += dy * diff * 0.35;
        b.x -= dx * diff * 0.65;
        b.y -= dy * diff * 0.65;
      }
    }
  }
}

function computePlayerPose(p) {
  let handR = { x: 10, y: -24 };
  let handL = { x: -3, y: -22 };
  let angle = 1.15;
  let lean = 0.03;
  let crouch = 1 + Math.sin(p.animTime * 2.3) * 0.8;
  let hipShift = 0;
  let footL = { x: -8, y: 0 };
  let footR = { x: 9, y: 0 };
  let headTilt = 0;
  let twoHand = false;
  let bladeLen = 57;

  const speed = Math.abs(p.vx);
  const isAir = !p.grounded;

  const base = () => {
    if (p.state === "dead" || p.dead) {
      const t = clamp(p.deadT / 0.45, 0, 1);
      return {
        handR: { x: lerp(10, 17, t), y: lerp(-24, -5, t) },
        handL: { x: lerp(-3, -16, t), y: lerp(-22, -4, t) },
        angle: lerp(1.15, 1.55, t),
        lean: lerp(0.03, -1.35, easeOutCubic(t)),
        crouch: lerp(1, 21, t),
        hipShift: lerp(0, -5, t),
        footL: { x: lerp(-8, -17, t), y: 0 },
        footR: { x: lerp(9, 13, t), y: 0 },
        headTilt: -0.15 * t,
        twoHand: false,
      };
    }
    if (p.state === "hurt") {
      const k = clamp(p.hurtT / 0.26, 0, 1);
      return {
        handR: { x: 2 - k * 3, y: -30 - k * 4 },
        handL: { x: -10, y: -32 + k * 3 },
        angle: 1.75 + k * 0.3,
        lean: -0.34 * k,
        crouch: 3,
        hipShift: -4 * k,
        footL: { x: -13, y: 0 },
        footR: { x: 15, y: 0 },
        headTilt: -0.2 * k,
        twoHand: false,
      };
    }
    if (p.state === "parry") {
      const t = clamp(p.parryT / 0.45, 0, 1);
      const guard = Math.sin(clamp(t * 3, 0, 1) * PI * 0.5);
      return {
        handR: { x: lerp(6, 13, guard), y: lerp(-28, -39, guard) },
        handL: { x: lerp(-2, 3, guard), y: lerp(-30, -43, guard) },
        angle: lerp(1.2, -1.57, guard),
        lean: 0.02,
        crouch: 4 + Math.sin(p.animTime * 15) * 0.4,
        hipShift: 1,
        footL: { x: -14, y: 0 },
        footR: { x: 12, y: 0 },
        headTilt: -0.02,
        twoHand: true,
        bladeLen: 59,
      };
    }
    if (p.state === "charge") {
      const lv = p.chargeLevel;
      const tremor = lv > 0.65 ? Math.sin(p.animTime * 53) * 0.7 : 0;
      return {
        handR: { x: -8 + tremor, y: -22 + (Math.random() - 0.5) * tremor },
        handL: { x: 1, y: -25 },
        angle: -2.65 - lv * 0.12,
        lean: -0.15 - lv * 0.05,
        crouch: 11 + lv * 2,
        hipShift: -5,
        footL: { x: -18, y: 0 },
        footR: { x: 15, y: 0 },
        headTilt: -0.05 - lv * 0.04,
        twoHand: true,
        bladeLen: 58 + lv * 9,
      };
    }
    if (p.state === "dash") {
      return {
        handR: { x: -9, y: -26 },
        handL: { x: -12, y: -18 },
        angle: 2.35,
        lean: 0.62,
        crouch: 6,
        hipShift: 3,
        footL: { x: -17, y: -5 },
        footR: { x: 16, y: -2 },
        headTilt: 0.12,
        twoHand: false,
      };
    }
    if (isAir) {
      const rising = p.vy < 0;
      return {
        handR: { x: 11, y: -26 },
        handL: { x: -8, y: -28 },
        angle: rising ? 1.95 : 0.92,
        lean: rising ? 0.04 : -0.04,
        crouch: 0,
        hipShift: 0,
        footL: { x: -9, y: rising ? -12 : -7 },
        footR: { x: 9, y: rising ? -6 : -10 },
        headTilt: rising ? 0.02 : -0.04,
        twoHand: false,
      };
    }
    if (speed > 35) {
      const k = clamp(speed / MAX_RUN, 0, 1);
      const step = Math.sin(p.runPhase);
      return {
        handR: { x: -8 - k * 3, y: -20 - Math.abs(step) * 2 },
        handL: { x: 8 + step * 2, y: -19 },
        angle: 2.18,
        lean: 0.16 + k * 0.12,
        crouch: 2 + Math.abs(step) * 1.2,
        hipShift: 1,
        footL: { x: -8 + step * 14, y: -Math.max(0, step) * 7 },
        footR: { x: 8 - step * 14, y: -Math.max(0, -step) * 7 },
        headTilt: 0.03,
        twoHand: false,
      };
    }
    // idle
    return {
      handR: { x: 10, y: -24 + Math.sin(p.animTime * 2.3) * 0.7 },
      handL: { x: -3, y: -22 },
      angle: 1.14 + Math.sin(p.animTime * 1.9) * 0.02,
      lean: 0.03,
      crouch,
      hipShift: 0,
      footL: { x: -8, y: 0 },
      footR: { x: 9, y: 0 },
      headTilt: 0.01 + Math.sin(p.animTime * 1.2) * 0.015,
      twoHand: false,
    };
  };

  let spec = base();

  if (p.state === "skill" && p.skill) {
    const sk = skillPoseSpec(p);
    if (sk) spec = sk;
  } else if (p.state === "attack" && p.atk) {
    const a = p.atk;
    const def = a.def;
    const poses = ATTACK_POSES[def.pose];
    if (poses) {
      const t = a.t;
      let blended;
      if (t < def.startup) {
        const k = easeOutCubic(clamp(t / def.startup, 0, 1));
        blended = blendPoseSpec(spec, poses.wind, k);
      } else if (t < def.startup + def.active) {
        const k = easeOutQuint(clamp((t - def.startup) / def.active, 0, 1));
        blended = blendPoseSpec(poses.wind, poses.strike, k);
      } else {
        const k = easeInOutCubic(clamp((t - def.startup - def.active) / Math.max(0.001, def.recovery), 0, 1));
        blended = blendPoseSpec(poses.strike, poses.recover, k);
      }
      spec = blended;
    }
  }

  handR = spec.handR;
  handL = spec.handL;
  angle = spec.angle;
  lean = spec.lean;
  crouch = spec.crouch;
  hipShift = spec.hipShift;
  footL = spec.footL;
  footR = spec.footR;
  headTilt = spec.headTilt;
  twoHand = spec.twoHand;

  if (p.state === "attack" && p.atk && p.atk.def.pose === "cleave") {
    bladeLen = 59 + (p.atk.def.chargeLevel || 0) * 11;
  }
  if (p.state === "attack" && p.atk && p.atk.def.pose === "moonfall") bladeLen = 62;
  if (p.state === "skill" && p.skill) {
    bladeLen = p.skill.id === 4 ? 70 : p.skill.id === 2 ? 64 : p.skill.id === 3 ? 58 : 62;
  }

  // build skeleton (local coordinates, origin at feet, +x forward)
  const hip = { x: hipShift, y: -30 + crouch };
  const torsoAng = lean;
  const chest = { x: hip.x + Math.sin(torsoAng) * 20.5, y: hip.y - Math.cos(torsoAng) * 20.5 };
  const headBase = {
    x: chest.x + Math.sin(torsoAng * 0.7 + headTilt) * 10.5 + 0.8,
    y: chest.y - Math.cos(torsoAng * 0.7 + headTilt) * 10.5,
  };
  const shoulderPad = 5.8;
  const shoulderL = { x: chest.x + Math.cos(torsoAng) * -shoulderPad, y: chest.y + Math.sin(torsoAng) * -shoulderPad - 0.5 };
  const shoulderR = { x: chest.x + Math.cos(torsoAng) * shoulderPad, y: chest.y + Math.sin(torsoAng) * shoulderPad - 0.5 };

  const armL1 = 13.2;
  const armL2 = 13.8;
  const elbowL = twoBone(shoulderL, handL, armL1, armL2, 0.85);
  const elbowR = twoBone(shoulderR, handR, armL1, armL2, 0.85);

  const hipL = { x: hip.x - 4.8, y: hip.y + 1 };
  const hipR = { x: hip.x + 4.8, y: hip.y + 1 };
  const thigh = 16.5;
  const shin = 17.5;
  const kneeL = twoBone(hipL, footL, thigh, shin, -1);
  const kneeR = twoBone(hipR, footR, thigh, shin, -1);

  return {
    x: p.x,
    y: p.y,
    facing: p.facing,
    hip, chest, head: headBase,
    shoulderL, shoulderR, elbowL, elbowR, handL, handR,
    hipL, hipR, kneeL, kneeR, footL, footR,
    bladeAngle: angle,
    bladeLen,
    lean,
    torsoAng,
    headTilt,
    twoHand,
    crouch,
    guard: p.state === "parry",
    chargeLevel: p.state === "charge" ? p.chargeLevel : 0,
    state: p.state,
    spin: p.state === "skill" && p.skill ? skillSpinValue(p) : 0,
    scarfNeck: { x: p.x + p.facing * 1.5, y: p.y - 59 + (p.state === "charge" ? 8 : 0) },
  };
}

function blendPoseSpec(a, b, t) {
  return {
    handR: { x: lerp(a.handR.x, b.handR.x, t), y: lerp(a.handR.y, b.handR.y, t) },
    handL: { x: lerp(a.handL.x, b.handL.x, t), y: lerp(a.handL.y, b.handL.y, t) },
    angle: angLerp(a.angle, b.angle, t),
    lean: lerp(a.lean, b.lean, t),
    crouch: lerp(a.crouch, b.crouch, t),
    hipShift: lerp(a.hipShift, b.hipShift, t),
    footL: { x: lerp(a.footL.x, b.footL.x, t), y: lerp(a.footL.y, b.footL.y, t) },
    footR: { x: lerp(a.footR.x, b.footR.x, t), y: lerp(a.footR.y, b.footR.y, t) },
    headTilt: lerp(a.headTilt, b.headTilt, t),
    twoHand: t < 0.5 ? a.twoHand : b.twoHand,
  };
}

function snapshotPose(pose) {
  return {
    x: pose.x, y: pose.y, facing: pose.facing,
    hip: { ...pose.hip }, chest: { ...pose.chest }, head: { ...pose.head },
    shoulderL: { ...pose.shoulderL }, shoulderR: { ...pose.shoulderR },
    elbowL: { ...pose.elbowL }, elbowR: { ...pose.elbowR },
    handL: { ...pose.handL }, handR: { ...pose.handR },
    hipL: { ...pose.hipL }, hipR: { ...pose.hipR },
    kneeL: { ...pose.kneeL }, kneeR: { ...pose.kneeR },
    footL: { ...pose.footL }, footR: { ...pose.footR },
    bladeAngle: pose.bladeAngle, bladeLen: pose.bladeLen,
    lean: pose.lean, headTilt: pose.headTilt, guard: pose.guard, state: pose.state,
    spin: pose.spin || 0, chargeLevel: pose.chargeLevel,
  };
}

/* ---------------- player update ---------------- */
function moveDir() {
  let d = 0;
  if (input.down.KeyD || input.down.ArrowRight) d += 1;
  if (input.down.KeyA || input.down.ArrowLeft) d -= 1;
  return d;
}

function updatePlayer(p, dt) {
  p.animTime += dt;
  p.iframes = Math.max(0, p.iframes - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.parryCd = Math.max(0, p.parryCd - dt);
  p.skillDenyT = Math.max(0, p.skillDenyT - dt);
  for (let si = 1; si <= 4; si++) p.skillCd[si] = Math.max(0, p.skillCd[si] - dt);
  if (p.skillQueue.length) {
    for (const q of p.skillQueue) q.ttl -= dt;
    p.skillQueue = p.skillQueue.filter((q) => q.ttl > 0);
  }
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 4.5);
  p.parryFlash = Math.max(0, p.parryFlash - dt * 6);
  p.landSquash = Math.max(0, p.landSquash - dt * 7);
  p.lightBuffer = Math.max(0, p.lightBuffer - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  p.heavyQueued = Math.max(0, p.heavyQueued - dt);
  p.dashQueued = Math.max(0, p.dashQueued - dt);
  p.parryQueued = Math.max(0, p.parryQueued - dt);
  p.lightWindow = Math.max(0, p.lightWindow - dt);
  p.displayHp = damp(p.displayHp, p.hp, 7, dt);
  if (p.lightWindow <= 0) p.lightNext = 0;

  if (input.pressed.Space) p.jumpBuffer = 0.13;
  if (input.pressed.KeyJ) p.lightBuffer = 0.19;
  if (input.pressed.KeyK) p.heavyQueued = 0.5;
  if (input.pressed.KeyL) p.dashQueued = 0.15;
  if (input.pressed.KeyI) p.parryQueued = 0.13;

  if (p.dead) {
    p.skill = null;
    p.skillQueue.length = 0;
    p.deadT += dt;
    p.vx = damp(p.vx, 0, p.grounded ? 6 : 0.6, dt);
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  // Independent skills: 1-4. They can cancel attacks/dash/charge/parry.
  // Pressing another skill during a cast queues it for a seamless chain.
  if (p.state !== "hurt") {
    for (let si = 1; si <= 4; si++) {
      if (!input.pressed["Digit" + si]) continue;
      if (p.state === "skill") {
        if (
          p.skillQueue.length < 3 &&
          !p.skillQueue.some((q) => q.id === si) &&
          !(p.skill && p.skill.id === si)
        ) {
          p.skillQueue.push({ id: si, ttl: 8.0 });
        }
      } else {
        tryStartSkill(p, si);
      }
      break;
    }
  }

  if (p.state === "skill") {
    updatePlayerSkill(p, dt);
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "hurt") {
    p.hurtT -= dt;
    p.vx = damp(p.vx, 0, p.grounded ? 4 : 1.2, dt);
    if (p.hurtT <= 0) p.state = "idle";
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "dash") {
    p.dashT += dt;
    p.vx = p.dashDir * (760 - 150 * clamp(p.dashT / 0.16, 0, 1));
    p.vy = 0;
    p.iframes = Math.max(p.iframes, 0.05);
    p.ghostTick += dt;
    if (p.ghostTick > 0.028) {
      p.ghostTick = 0;
      addAfterimage(snapshotPose(computePlayerPose(p)), "#ff4d64", 0.22);
    }
    if (chance(dt * 40)) {
      addParticle({
        kind: "spark", x: p.x - p.facing * rand(4, 20), y: p.y - rand(8, 50),
        vx: -p.facing * rand(80, 260), vy: rand(-40, 40),
        life: rand(0.12, 0.24), maxLife: 0.24, size: rand(0.7, 1.6),
        color: "#ff7b72", grav: 0, drag: 0.88, back: false, additive: true,
      });
    }
    if (p.lightBuffer > 0) {
      p.lightBuffer = 0;
      startDashAttack(p);
      updateScarf(p, dt);
      return;
    }
    if (p.dashT >= 0.16) {
      p.state = p.grounded ? "idle" : "idle";
      p.vx = p.dashDir * 255;
      p.dashCd = Math.max(p.dashCd, 0.23);
      if (!p.grounded) p.airDashUsed = true;
    }
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "parry") {
    p.parryT += dt;
    p.vx = damp(p.vx, 0, 12, dt);
    if (p.parryT > 0.34 && p.parryT - dt <= 0.34) {
      // last-moment sparkle, communicating the window closed
      p.parryFlash = Math.max(p.parryFlash, 0.3);
    }
    if (p.parryT >= 0.56) {
      p.state = "idle";
    }
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "charge") {
    p.chargeT += dt;
    const prevLevel = p.chargeLevel;
    p.chargeLevel = clamp(p.chargeT / 0.72, 0, 1);
    if (prevLevel < 1 && p.chargeLevel >= 1 && !p.chargeFullNotified) {
      p.chargeFullNotified = true;
      audio.chargeFull();
      screenFlash(0.035);
      addRing(p.x, p.y - 38, "#ff6a5c", 44, 0.22, 2.5, false);
      emberBurst(p.x, p.y - 30, 6, "#ffb060", 1.1, false);
    }
    if (chance(dt * (14 + p.chargeLevel * 34))) {
      addParticle({
        kind: "ember",
        x: p.x + rand(-28, 28), y: p.y - rand(6, 62),
        vx: rand(-18, 18), vy: -rand(30, 120) * (0.5 + p.chargeLevel),
        life: rand(0.25, 0.7), maxLife: 0.7,
        size: rand(1, 2.6), color: p.chargeLevel > 0.8 ? "#ffd9a0" : "#ff6d5e",
        grav: -30, drag: 0.96, back: false, additive: true,
      });
    }
    const dir = moveDir();
    if (dir) p.facing = dir;
    p.vx = damp(p.vx, dir * 95, 9, dt);
    if (p.dashQueued > 0 && p.dashCd <= 0) {
      p.dashQueued = 0;
      stopCharge(p);
      startDash(p);
      applyPlayerPhysics(p, dt);
      updateScarf(p, dt);
      return;
    }
    if (!input.down.KeyK) {
      const level = p.chargeLevel;
      stopCharge(p);
      startHeavyAttack(p, level);
      applyPlayerPhysics(p, dt);
      updateScarf(p, dt);
      return;
    }
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "attack" && p.atk) {
    updatePlayerAttack(p, dt);
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  // free state
  updatePlayerFree(p, dt);
  applyPlayerPhysics(p, dt);
  updateScarf(p, dt);
}

function updatePlayerFree(p, dt) {
  const dir = moveDir();
  if (dir) p.facing = dir;

  if (p.dashQueued > 0 && p.dashCd <= 0 && (p.grounded || !p.airDashUsed)) {
    p.dashQueued = 0;
    startDash(p);
    return;
  }
  if (p.parryQueued > 0 && p.parryCd <= 0) {
    p.parryQueued = 0;
    startParry(p);
    return;
  }
  if (p.jumpBuffer > 0) {
    if (p.grounded || p.coyote > 0) {
      doJump(p);
      return;
    } else if (p.jumpCount < 2) {
      doAirJump(p);
      return;
    }
  }
  if (p.heavyQueued > 0 || input.down.KeyK) {
    p.heavyQueued = 0;
    if (!p.grounded) {
      startAirHeavy(p);
    } else {
      startCharge(p);
    }
    return;
  }
  if (p.lightBuffer > 0) {
    p.lightBuffer = 0;
    const idx = p.lightWindow > 0 ? p.lightNext : 0;
    startLight(p, idx, !p.grounded);
    return;
  }

  const target = dir * (p.grounded ? MAX_RUN : MAX_AIR);
  if (dir !== 0) {
    p.vx = damp(p.vx, target, p.grounded ? 17 : 9, dt);
  } else {
    p.vx = damp(p.vx, 0, p.grounded ? 14 : 2.8, dt);
  }
}

function doJump(p) {
  p.vy = JUMP_VY;
  p.grounded = false;
  p.jumpCount = 1;
  p.coyote = 0;
  p.jumpBuffer = 0;
  p.jumpCutDone = false;
  p.jumpCutDone = false;
  if (p.state !== "charge") p.state = "idle";
  dustBurst(p.x, GROUND_Y, 7, -p.facing, 0.8);
  addRing(p.x, GROUND_Y - 2, "#cfc2a4", 26, 0.18, 1.5, true);
  audio.jump();
}

function doAirJump(p) {
  p.vy = AIR_JUMP_VY;
  p.jumpCount = 2;
  p.grounded = false;
  p.jumpBuffer = 0;
  p.jumpCutDone = false;
  if (p.state !== "attack") p.state = "idle";
  addRing(p.x, p.y - 10, "#ffd0a0", 34, 0.24, 2, false);
  for (let i = 0; i < 9; i++) {
    addParticle({
      kind: "spark",
      x: p.x + rand(-10, 10), y: p.y - rand(0, 8),
      vx: rand(-150, 150), vy: rand(80, 260),
      life: rand(0.12, 0.26), maxLife: 0.26, size: rand(0.8, 1.8),
      color: "#ffcf96", grav: 300, drag: 0.9, back: false, additive: true,
    });
  }
  audio.doubleJump();
}

function startDash(p) {
  const dir = moveDir() || p.facing;
  p.facing = dir;
  p.state = "dash";
  p.dashT = 0;
  p.dashDir = dir;
  p.iframes = Math.max(p.iframes, 0.15);
  p.dashCd = 0.26;
  p.ghostTick = 0;
  if (!p.grounded) p.airDashUsed = true;
  p.vx = dir * 760;
  p.vy = 0;
  p.hurtFlash = 0;
  dustBurst(p.x, p.y - 2, 6, -dir, 0.8);
  addRing(p.x - dir * 8, p.y - 28, "#ff8790", 30, 0.18, 2, false);
  addAfterimage(snapshotPose(computePlayerPose(p)), "#ff4d64", 0.24);
  audio.dash();
}

function startParry(p) {
  p.state = "parry";
  p.parryT = 0;
  p.parryCd = 0.64;
  p.vx *= 0.15;
  p.parryFlash = 0;
  addRing(p.x + p.facing * 12, p.y - 38, "#9fe8e0", 26, 0.18, 1.2, false);
}

function isParryActive(p) {
  // 290ms active window: readable, but still a deliberate read
  return p && !p.dead && p.state === "parry" && p.parryT >= 0.03 && p.parryT <= 0.32;
}

function startLight(p, index, air) {
  const defs = air ? LIGHT_AIR : LIGHT_GROUND;
  const def = defs[clamp(index, 0, 2)];
  p.state = "attack";
  p.atk = {
    def,
    t: 0,
    kind: "light",
    index: def.index,
    air: !!air,
    hasHit: false,
    hitSet: new Set(),
    swingDone: false,
    lungeDone: false,
    ghostTick: 0,
  };
  p.lightNext = (def.index + 1) % 3;
  p.lightWindow = 0.5;
  if (moveDir()) p.facing = moveDir();
  p.vx = p.facing * 35;
  p.vy = Math.min(p.vy, 0);
}

function startHeavyAttack(p, level) {
  const chargeLevel = clamp(level, 0, 1);
  const def = Object.assign({}, HEAVY_DEF, {
    chargeLevel,
    startup: lerp(0.19, 0.125, chargeLevel),
    active: 0.1,
    recovery: lerp(0.34, 0.36, chargeLevel),
    dmg: 30 + 24 * chargeLevel,
    limb: 37 + 25 * chargeLevel,
    poise: 52 + 66 * chargeLevel,
    hitstop: 0.095 + 0.035 * chargeLevel,
    shake: 4.4 + 2.6 * chargeLevel,
    kb: 290 + 120 * chargeLevel,
    launch: 280 + 80 * chargeLevel,
    r: 67 + 25 * chargeLevel,
    ox: 51 + 7 * chargeLevel,
    lunge: 260 + 80 * chargeLevel,
    aoeParts: chargeLevel > 0.55,
    slash: {
      r: 76 + 16 * chargeLevel, ox: 30 + 4 * chargeLevel, oy: 36,
      a0: -2.6, a1: 0.9, width: 24 + 10 * chargeLevel,
      life: 0.2 + 0.05 * chargeLevel,
    },
    sound: "heavy",
  });
  def.pose = "cleave";
  p.state = "attack";
  p.atk = {
    def, t: 0, kind: "heavy", index: 0, air: false,
    hasHit: false, hitSet: new Set(), swingDone: false, lungeDone: false, ghostTick: 0,
  };
  if (moveDir()) p.facing = moveDir();
  p.chargeT = 0;
  p.chargeLevel = chargeLevel;
  p.chargeFullNotified = false;
  if (chargeLevel > 0.5) {
    addRing(p.x, p.y - 34, "#ff7a62", 52 + chargeLevel * 30, 0.26, 3, false);
    emberBurst(p.x, p.y - 34, 8 + Math.round(chargeLevel * 8), "#ffb36a", 1.2, false);
  }
  audio.swing(true);
}

function startAirHeavy(p) {
  p.state = "attack";
  p.atk = {
    def: Object.assign({}, AIR_HEAVY_DEF),
    t: 0, kind: "airHeavy", index: 0, air: true,
    hasHit: false, hitSet: new Set(), swingDone: false, lungeDone: false, ghostTick: 0,
    slammed: false,
  };
  p.vy = Math.min(p.vy, 260);
  audio.swing(true);
}

function startDashAttack(p) {
  p.state = "attack";
  p.atk = {
    def: Object.assign({}, DASH_ATK_DEF),
    t: 0, kind: "dashAtk", index: 0, air: !p.grounded,
    hasHit: false, hitSet: new Set(), swingDone: false, lungeDone: false, ghostTick: 0,
  };
  p.iframes = Math.max(p.iframes, 0.08);
  p.vx = p.facing * 460;
  audio.swing(true);
}

function startCharge(p) {
  p.state = "charge";
  p.chargeT = 0;
  p.chargeLevel = 0;
  p.chargeFullNotified = false;
  p.vx *= 0.35;
  audio.chargeStart();
}

function stopCharge(p) {
  p.chargeT = 0;
  p.chargeLevel = 0;
  audio.chargeStop();
}

function endAttack(p) {
  const a = p.atk;
  if (!a) return;
  if (p.state === "attack") p.state = "idle";
  if (a.kind === "light") {
    p.lightNext = (a.index + 1) % 3;
    p.lightWindow = 0.48;
  }
  p.atk = null;
  p.vy = Math.min(p.vy, 260);
}

function updatePlayerAttack(p, dt) {
  const a = p.atk;
  const def = a.def;
  a.t += dt;
  const t = a.t;

  if (!a.swingDone && t >= def.startup) {
    a.swingDone = true;
    spawnAttackSlash(p, def);
    if (def.sound === "heavy") audio.swing(true);
    else if (def.sound === "heavyish") {
      audio.swing(false);
      audio.noiseHit(0.06, 0.11, "bandpass", 500, 1800, 0.9, 0.01);
    } else audio.swing(false);
    if (def.chargeLevel && def.chargeLevel > 0.55) {
      screenFlash(0.05 + def.chargeLevel * 0.03);
      addShake(2 + def.chargeLevel * 1.2);
    }
  }

  const activeStart = def.startup;
  const activeEnd = def.startup + def.active;

  if (t >= activeStart && t < activeEnd + 0.0001) {
    if (!a.lungeDone && a.kind !== "airHeavy") {
      a.lungeDone = true;
      p.vx = p.facing * def.lunge;
      if (!p.grounded) p.vy = Math.min(p.vy, -20);
    }
    playerAttackHits(p, a, def);
    a.ghostTick += dt;
    if (a.ghostTick > 0.038) {
      a.ghostTick = 0;
      addAfterimage(snapshotPose(computePlayerPose(p)), "#ff596c", 0.18);
    }
  }

  if (a.kind === "airHeavy") {
    // dive quickly; landing handled in physics
    if (!p.grounded) {
      p.vy = Math.min(p.vy + 4600 * dt, 1120);
    }
    if (t > activeEnd) {
      // still airborne: keep the dive
      if (p.grounded) endAttack(p);
    }
    return;
  }

  // chain / cancel windows once the active portion has begun
  if (t >= activeStart + def.active * 0.45) {
    if (p.lightBuffer > 0 && a.kind === "light") {
      p.lightBuffer = 0;
      p.atk = null;
      startLight(p, (a.index + 1) % 3, a.air && !p.grounded);
      return;
    }
    if (p.dashQueued > 0 && p.dashCd <= 0 && (p.grounded || !p.airDashUsed)) {
      p.dashQueued = 0;
      p.atk = null;
      p.state = "idle";
      startDash(p);
      return;
    }
    if (p.heavyQueued > 0 && a.hasHit) {
      p.heavyQueued = 0;
      p.atk = null;
      p.state = "idle";
      if (!p.grounded) startAirHeavy(p);
      else startCharge(p);
      return;
    }
  }
  if (t >= activeStart + def.active && a.hasHit && p.jumpBuffer > 0 && (p.grounded || p.jumpCount < 2)) {
    p.jumpBuffer = 0;
    p.atk = null;
    p.state = "idle";
    if (p.grounded) doJump(p);
    else doAirJump(p);
    return;
  }

  if (t >= activeStart + def.active) {
    p.vx = damp(p.vx, 0, p.grounded ? 7 : 1.5, dt);
  }

  if (t >= def.startup + def.active + def.recovery) {
    endAttack(p);
  }
}

function spawnAttackSlash(p, def) {
  const s = def.slash;
  if (!s) return;
  const y = p.y - s.oy;
  const x = p.x + p.facing * s.ox;
  addSlash(x, y, s.r, s.a0, s.a1, def.chargeLevel > 0.6 ? "#ffb26f" : "#ff6f7d", s.life || 0.2, s.width || 20, p.facing, def.chargeLevel > 0.6 ? 0.64 : 0.74);
  if (def.chargeLevel > 0.6) {
    addSlash(x, y, s.r * 0.74, s.a0 + 0.3, s.a1 - 0.24, "#ffe9c4", s.life * 0.65, s.width * 0.28, p.facing, 0.78);
  }
  if (def.sound === "heavy" || def.kind === "airHeavy") {
    dustBurst(p.x + p.facing * 20, p.y - 2, 4, p.facing, 0.6);
  }
}

/* ---------------- physics & actions ---------------- */
function applyPlayerPhysics(p, dt) {
  const wasGrounded = p.grounded;
  let gravity = GRAV;
  if (p.state === "skill") {
    gravity = 0;
    p.vy = 0;
  }
  if (p.state === "attack" && p.atk && p.atk.air && p.atk.kind !== "airHeavy") gravity = GRAV * 0.42;
  if (p.state === "parry" && !p.grounded) gravity = GRAV * 0.55;
  if (p.state !== "dash") {
    p.vy = Math.min(p.vy + gravity * dt, 1280);
  }
  if (!input.down.Space && p.vy < -150 && !p.jumpCutDone && !p.grounded) {
    p.vy *= 0.54;
    p.jumpCutDone = true;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const minX = 30;
  const maxX = WORLD_W - 30;
  if (p.x < minX) {
    p.x = minX;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > maxX) {
    p.x = maxX;
    if (p.vx > 0) p.vx = 0;
  }

  if (p.y >= GROUND_Y) {
    const fallSpeed = p.vy;
    if (!wasGrounded) {
      p.y = GROUND_Y;
      p.vy = 0;
      p.grounded = true;
      p.jumpCount = 0;
      p.airDashUsed = false;
      p.coyote = 0.1;
      p.jumpCutDone = true;
      p.landSquash = clamp(fallSpeed / 1000, 0, 1) * 0.12;
      if (fallSpeed > 340) {
        dustBurst(p.x, GROUND_Y, 8, 0, clamp(fallSpeed / 900, 0.5, 1.2));
        addRing(p.x, GROUND_Y - 2, "#d7c6a5", 22 + clamp(fallSpeed * 0.02, 0, 20), 0.18, 1.5, true);
        audio.land(fallSpeed > 750);
        if (fallSpeed > 760) addShake(1.6);
      }
      if (p.state === "attack" && p.atk && p.atk.air) {
        if (p.atk.kind === "airHeavy" && !p.atk.slammed) {
          p.atk.slammed = true;
          triggerAirSlam(p);
        } else {
          endAttack(p);
        }
      }
      if (p.state === "parry") {
        // allow parry to finish on the ground
      }
    } else {
      p.y = GROUND_Y;
      p.vy = 0;
    }
  } else {
    p.grounded = false;
    if (wasGrounded) p.coyote = 0.1;
    p.coyote = Math.max(0, p.coyote - dt);
    if (!wasGrounded && p.jumpCount === 0 && p.vy > 40) p.jumpCount = 1;
  }

  if (p.grounded) {
    p.coyote = 0.1;
    p.jumpCutDone = false;
  }

  const moveSpeed = Math.abs(p.vx);
  if (p.grounded && p.state !== "dash") {
    p.runPhase += moveSpeed * dt * 0.052;
  }
  // slow residual slide while attacking
  if (p.state === "attack" && p.grounded) {
    p.vx *= Math.pow(0.15, dt);
  }
}

function triggerAirSlam(p) {
  const def = AIR_SLAM_DEF;
  const cx = p.x + p.facing * 22;
  const cy = p.y - 20;
  let hitAny = false;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const dx = e.x - cx;
    const dy = e.y - 35 - cy;
    if (Math.sqrt(dx * dx + dy * dy * 0.6) < def.r + 18) {
      hitAny = true;
      damageEnemyFromPlayer(e, {
        dmg: def.dmg, limb: def.limb, poise: def.poise,
        kb: def.kb * sgn(dx || p.facing), launch: def.launch,
        hitstop: def.hitstop, shake: def.shake, bias: def.bias,
        partBias: def.bias, aoeParts: true, charged: true, heavy: true,
        reach: def.r, sourceX: p.x,
      }, { x: e.x, y: e.y - 35 }, p);
    }
  }
  addShockwave(cx, GROUND_Y, "#ffd2a2", 150, 0.45, 7);
  addRing(cx, GROUND_Y - 8, "#fff0d0", 60, 0.28, 4, false);
  dustBurst(cx, GROUND_Y, 16, p.facing, 1.4);
  for (let i = 0; i < 10; i++) {
    addParticle({
      kind: "spark", x: cx + rand(-40, 40), y: GROUND_Y - rand(0, 8),
      vx: rand(-380, 380), vy: -rand(80, 420), life: rand(0.2, 0.5), maxLife: 0.5,
      size: rand(1, 2.4), color: "#ffd18a", grav: 900, drag: 0.9, back: false, additive: true,
    });
  }
  addDecal(cx, GROUND_Y, "scorch", 1, 1.2, "#160c0b", 7);
  addShake(hitAny ? 7 : 2.4);
  if (hitAny) {
    requestHitStop(0.11);
    screenFlash(0.055);
    audio.heavyHit();
  } else {
    audio.land(true);
  }
  endAttack(p);
}

/* ---------------- player damage ---------------- */
function damagePlayer(amount, sourceX, opts = {}) {
  const p = game.player;
  if (!p || p.dead) return false;
  amount = Math.max(1, Math.round(amount));
  if (p.state === "dash" && p.iframes > 0) {
    if (Math.abs((sourceX || p.x) - p.x) < 180) {
      addFloater("闪", p.x + p.facing * 12, p.y - 70, "#cfe9e6", 15, { vy: -36, life: 0.55 });
      sparkBurst(p.x, p.y - 38, -p.facing, 4, 0.6, "#9fe8e0");
    }
    return false;
  }
  if (isParryActive(p)) {
    parrySuccess(opts.enemy || null);
    return false;
  }
  if (p.iframes > 0) return false;

  p.hp = Math.max(0, p.hp - amount);
  p.iframes = 0.9;
  p.hurtFlash = 1;
  p.state = "hurt";
  p.hurtT = 0.27;
  p.atk = null;
  p.parryT = 0;
  if (p.chargeT > 0) stopCharge(p);
  audio.chargeStop();
  p.chargeT = 0;
  p.chargeLevel = 0;
  p.vx = sgn(p.x - (sourceX == null ? p.x - p.facing * 20 : sourceX)) * 270;
  p.vy = -190;
  p.grounded = false;
  p.jumpCount = 1;
  game.hurtVignette = 1;
  game.combo = 0;
  game.comboTimer = 0;
  game.comboPop = 0;
  game.rank = "";
  game.lastPlayerHitAt = game.time;

  addFloater(`-${Math.round(amount)}`, p.x, p.y - 78, "#ff7f76", 15, { vy: -44, life: 0.7, glow: "#ff3d3d" });
  petalBurst(p.x, p.y - 42, 7, "#c92b43");
  sparkBurst(p.x, p.y - 40, p.facing, 7, 0.9, "#ff8b70");
  requestHitStop(0.07);
  addShake(6.2);
  screenFlash(0.055);
  audio.hurt();
  if (p.hp <= 0) killPlayer();
  return true;
}

function parrySuccess(sourceEnemy) {
  const p = game.player;
  if (!p) return;
  p.parryFlash = 1;
  p.iframes = Math.max(p.iframes, 0.55);
  p.hp = Math.min(p.maxHp, p.hp + 3);
  game.combo += 1;
  game.comboTimer = 2.5;
  game.comboPop = 1;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  if (sourceEnemy) {
    staggerEnemy(sourceEnemy, 1.15);
    sourceEnemy.hp -= 5;
    sourceEnemy.flash = 0.16;
  }
  addFloater("弹", p.x + p.facing * 18, p.y - 98, "#fff2c2", 25, {
    vy: -24, life: 0.85, glow: "#ffcf6a", pop: true,
  });
  addFloater("+3", p.x, p.y - 68, "#b9f0c5", 12, { vy: -40, life: 0.75 });
  addRing(p.x + p.facing * 14, p.y - 40, "#ffe1a0", 58, 0.3, 4, false);
  addRing(p.x + p.facing * 14, p.y - 40, "#9ff4e5", 34, 0.24, 2, false);
  for (let i = 0; i < 22; i++) {
    const a = rand(0, TAU);
    const r = rand(10, 34);
    addParticle({
      kind: "spark",
      x: p.x + p.facing * 14 + Math.cos(a) * r,
      y: p.y - 40 + Math.sin(a) * r,
      vx: Math.cos(a) * rand(120, 420),
      vy: Math.sin(a) * rand(120, 420) - 80,
      life: rand(0.18, 0.5), maxLife: 0.5,
      size: rand(0.9, 2.2), color: chance(0.5) ? "#fff0bd" : "#9ff4e5",
      grav: 500, drag: 0.9, back: false, additive: true,
    });
  }
  screenFlash(0.075);
  addShake(3.6);
  requestHitStop(0.17);
  setSlowmo(0.34, 0.24);
  audio.parry();
}

function parryProjectile(proj) {
  const p = game.player;
  if (!p) return;
  parrySuccess(proj.owner && proj.owner.alive ? proj.owner : null);
  const dir = proj.owner && proj.owner.alive ? sgn(proj.owner.x - p.x) || p.facing : p.facing;
  game.projectiles.push({
    type: "reflect",
    x: p.x + p.facing * 22,
    y: p.y - 42,
    vx: dir * 820,
    vy: 0,
    r: 13,
    life: 1.3,
    damage: 18,
    limb: 22,
    color: "#ffe6ab",
    owner: null,
    reflectDir: dir,
    trail: [],
  });
  addShockwave(p.x, p.y - 38, "#ffe3a0", 90, 0.35, 4);
}

function killPlayer() {
  const p = game.player;
  if (!p || p.dead) return;
  p.dead = true;
  p.state = "dead";
  p.deadT = 0;
  p.hp = 0;
  game.dying = true;
  game.deathTimer = 0;
  game.combo = 0;
  game.comboTimer = 0;
  game.rank = "";
  setSlowmo(1.4, 0.34);
  requestHitStop(0.13);
  addShake(8.5);
  screenFlash(0.1);
  audio.death();
  petalBurst(p.x, p.y - 45, 18, "#b82238");
  sparkBurst(p.x, p.y - 45, -p.facing, 12, 1.2, "#ff7c6a");
  addRing(p.x, p.y - 34, "#ff5d63", 70, 0.5, 4, false);
  audio.chargeStop();
}

/* heal helper */
function healPlayer(amount, show = true) {
  const p = game.player;
  if (!p || p.dead) return;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  const gained = Math.round(p.hp - before);
  if (gained > 0) {
    if (show) addFloater(`+${gained}`, p.x, p.y - 76, "#b8f0bd", 13, { vy: -38, life: 0.8, glow: "#5ecf7a" });
    if (show) {
      addRing(p.x, p.y - 34, "#a5e8ae", 36, 0.35, 2, false);
      for (let i = 0; i < 8; i++) {
        addParticle({
          kind: "ember", x: p.x + rand(-22, 22), y: p.y - rand(4, 56),
          vx: rand(-20, 20), vy: -rand(30, 90), life: rand(0.35, 0.9), maxLife: 0.9,
          size: rand(1, 2.4), color: "#9ff0a8", grav: -20, drag: 0.95, back: false, additive: true,
        });
      }
    }
    audio.heal();
  }
}

/* ===== 45-skills.js ===== */
/* ============================================================
   Four independent skills, bound to 1 / 2 / 3 / 4
   ============================================================ */
const SKILL_DEFS = [
  {
    id: 1,
    key: "1",
    name: "月轮斩",
    glyph: "月",
    color: "#ff6f84",
    cd: 4.5,
    iframes: 0.7,
    duration: 0.64,
    desc: "环身回旋三斩，终结挑空",
  },
  {
    id: 2,
    key: "2",
    name: "影渡",
    glyph: "影",
    color: "#c7b3ff",
    cd: 6.5,
    iframes: 0.66,
    duration: 0.6,
    desc: "瞬身穿过目标，回身十字斩",
  },
  {
    id: 3,
    key: "3",
    name: "千樱葬",
    glyph: "樱",
    color: "#ff9ec4",
    cd: 11.0,
    iframes: 1.6,
    duration: 1.55,
    desc: "全场樱雨，多段斩击并终结",
  },
  {
    id: 4,
    key: "4",
    name: "断界",
    glyph: "界",
    color: "#ffd98a",
    cd: 15.0,
    iframes: 0.92,
    duration: 0.82,
    desc: "蓄势后向前斩出贯穿战场的断界巨浪",
  },
];

const SKILL_NEUTRAL = {
  handR: { x: 10, y: -24 },
  handL: { x: -3, y: -22 },
  angle: 1.15,
  lean: 0.03,
  crouch: 1,
  hipShift: 0,
  footL: { x: -8, y: 0 },
  footR: { x: 9, y: 0 },
  headTilt: 0,
  twoHand: false,
};

function skillDefById(id) {
  return SKILL_DEFS[clamp(id, 1, 4) - 1];
}

function tryStartSkill(p, id) {
  if (!p || p.dead || p.state === "hurt" || p.state === "skill") return false;
  const def = skillDefById(id);
  if (!def) return false;
  if (p.skillCd[id] > 0) {
    p.skillDenyT = 0.32;
    p.skillDenyId = id;
    audio.skillDeny();
    return false;
  }

  const dir = moveDir();
  if (dir) p.facing = dir;
  p.skillCd[id] = def.cd;
  p.state = "skill";
  p.atk = null;
  p.dashT = 0;
  p.parryT = 0;
  p.lightBuffer = 0;
  p.heavyQueued = 0;
  p.dashQueued = 0;
  p.parryQueued = 0;
  p.jumpBuffer = 0;
  if (p.chargeT > 0 || audio.chargeNodes) {
    stopCharge(p);
    audio.chargeStop();
  }
  p.chargeT = 0;
  p.chargeLevel = 0;
  p.chargeFullNotified = false;
  p.vx *= 0.15;
  p.vy = 0;
  p.iframes = Math.max(p.iframes, def.iframes);
  p.skill = {
    id,
    def,
    t: 0,
    started: true,
    ghostT: 0,
    blinkFrom: null,
    destX: p.x,
    destY: p.y,
    travelDir: p.facing,
    afterFacing: p.facing,
    blinked: false,
    struck: false,
    released: false,
    wave: 0,
  };

  if (id === 2) prepareShadowSkill(p);
  if (id === 3) prepareSakuraSkill(p);
  if (id === 4) prepareSunderSkill(p);
  if (id === 1) {
    addSkillFx("rune", {
      x: p.x, y: GROUND_Y, radius: 138, life: 0.68, color: def.color, layer: "back", petals: 10,
    });
    addRing(p.x, p.y - 34, def.color, 54, 0.28, 3, false);
    for (let i = 0; i < 13; i++) {
      addParticle({
        kind: "petal", x: p.x + rand(-46, 46), y: p.y - rand(2, 62),
        vx: rand(-90, 90), vy: rand(-140, -20), life: rand(0.4, 0.9), maxLife: 0.9,
        size: rand(2.5, 5), color: chance(0.4) ? "#ffd6d9" : def.color, grav: 120, drag: 0.96,
        rot: rand(0, TAU), vr: rand(-8, 8), back: false,
      });
    }
  }

  addFloater(def.name, p.x, p.y - 104, def.color, 19, {
    vy: -26, life: 0.9, glow: def.color, pop: true,
  });
  audio.skillStart(id);
  return true;
}

function endSkill(p) {
  if (!p || !p.skill) return;
  p.state = "idle";
  p.skill = null;
  p.vy = Math.min(p.vy, 160);
  p.lightWindow = 0.24;
  p.lightNext = 0;
  // Chain a skill pressed during the previous cast (rapid 1-2-3-4 input).
  if (p.skillQueue && p.skillQueue.length) {
    while (p.skillQueue.length) {
      const q = p.skillQueue.shift();
      if (q.ttl > 0 && tryStartSkill(p, q.id)) break;
    }
  }
}

function updatePlayerSkill(p, dt) {
  const s = p.skill;
  if (!s) {
    p.state = "idle";
    return;
  }
  s.t += dt;
  p.vx = damp(p.vx, 0, 18, dt);
  if (s.id !== 2) p.vy = 0;

  if (s.ghostT != null) {
    s.ghostT += dt;
    if (s.ghostT > 0.035) {
      s.ghostT = 0;
      addAfterimage(snapshotPose(computePlayerPose(p)), s.def.color, 0.2);
    }
  }

  switch (s.id) {
    case 1: updateMoonSkill(p, s, dt); break;
    case 2: updateShadowSkill(p, s, dt); break;
    case 3: updateSakuraSkill(p, s, dt); break;
    case 4: updateSunderSkill(p, s, dt); break;
  }

  if (p.skill === s && s.t >= s.def.duration) endSkill(p);
}

/* ---------------- shared skill helpers ---------------- */
function skillHitRadius(p, radius, opts) {
  const cx = p.x;
  const cy = p.y - 38;
  let count = 0;
  for (const e of [...game.enemies]) {
    if (!e.alive || e.spawnT > 0 || e.invuln > 0) continue;
    const dx = e.x - cx;
    const dy = e.y - 34 * e.scale - cy;
    if (Math.hypot(dx, dy * 0.82) > radius + 18 * e.scale) continue;
    applySkillHit(e, p, opts);
    count++;
  }
  return count;
}

function skillHitForward(p, maxDist, opts) {
  let count = 0;
  for (const e of [...game.enemies]) {
    if (!e.alive || e.spawnT > 0 || e.invuln > 0) continue;
    const rel = (e.x - p.x) * p.facing;
    if (rel < -55 || rel > maxDist) continue;
    applySkillHit(e, p, opts);
    count++;
  }
  return count;
}

function skillHitAll(p, opts) {
  let count = 0;
  for (const e of [...game.enemies]) {
    if (!e.alive || e.spawnT > 0 || e.invuln > 0) continue;
    applySkillHit(e, p, opts);
    count++;
  }
  return count;
}

function applySkillHit(e, p, opts) {
  const contact = {
    x: e.x + rand(-8, 8),
    y: e.y - 36 * e.scale + rand(-10, 10),
  };
  const bias = opts.bias || { arm: 1, leg: 1, head: 1 };
  let part = null;
  if (!opts.aoeParts) {
    part = chooseNearestPartId(e, contact, bias);
  }
  const hit = {
    dmg: opts.dmg,
    limb: opts.limb,
    poise: opts.poise != null ? opts.poise : 40,
    kb: opts.kb != null ? opts.kb : 100,
    launch: opts.launch || 0,
    hitstop: opts.hitstop != null ? opts.hitstop : 0.03,
    shake: opts.shake != null ? opts.shake : 1.5,
    heavy: !!opts.heavy,
    aoeParts: !!opts.aoeParts,
    bias,
    reach: opts.reach || opts.radius || 150,
    sourceX: p.x,
  };
  damageEnemyFromPlayer(e, hit, contact, p, part);

  // skill-coloured slash stamp and petals
  const color = opts.color || "#fff1d8";
  addSlash(
    e.x + rand(-14, 14), e.y - 40 * e.scale + rand(-12, 12),
    opts.slashR || 48, rand(-1.7, -0.5), rand(0.55, 1.5),
    color, 0.16, opts.slashW || 12, sgn(e.x - p.x) || p.facing, 0.62
  );
  if (opts.petals !== false) {
    petalBurst(e.x, e.y - 38 * e.scale, opts.big ? 10 : 4, opts.petalColor || color);
  }
  if (opts.big) {
    addRing(e.x, e.y - 38 * e.scale, color, 46, 0.24, 2.5, false);
    emberBurst(e.x, e.y - 34 * e.scale, 7, color, 0.8, false);
  }
}

/* ---------------- skill 1: 月轮斩 ---------------- */
function updateMoonSkill(p, s, dt) {
  const t = s.t;
  const color = s.def.color;
  if (t >= 0.075 && !s.w1) {
    s.w1 = true;
    skillHitRadius(p, 186, {
      dmg: 13, limb: 15, poise: 20, kb: 130, launch: 40,
      hitstop: 0.03, shake: 1.6, color, slashR: 45, slashW: 12,
      bias: { arm: 0.9, leg: 1.05, head: 1.05 },
    });
    moonWheelVisual(p, color, 0);
    audio.swing(false);
  }
  if (t >= 0.205 && !s.w2) {
    s.w2 = true;
    skillHitRadius(p, 192, {
      dmg: 14, limb: 16, poise: 22, kb: 150, launch: 80,
      hitstop: 0.032, shake: 1.8, color, slashR: 50, slashW: 12,
      bias: { arm: 0.9, leg: 1.0, head: 1.05 },
    });
    moonWheelVisual(p, color, 1.1);
    audio.swing(false);
  }
  if (t >= 0.335 && !s.w3) {
    s.w3 = true;
    skillHitRadius(p, 198, {
      dmg: 15, limb: 18, poise: 26, kb: 170, launch: 130,
      hitstop: 0.035, shake: 2.0, color, slashR: 56, slashW: 14,
      bias: { arm: 1.0, leg: 1.0, head: 1.0 },
    });
    moonWheelVisual(p, color, 2.3);
    audio.swing(false);
  }
  if (t >= 0.46 && !s.final) {
    s.final = true;
    const hits = skillHitRadius(p, 214, {
      dmg: 22, limb: 28, poise: 48, kb: 260, launch: 330,
      hitstop: 0.065, shake: 3.8, heavy: true, color, slashR: 75, slashW: 22,
      big: true, bias: { arm: 1.05, leg: 0.95, head: 0.95 },
    });
    addSlash(p.x, p.y - 40, 102, 0, TAU, color, 0.22, 18, 1, 0.72);
    addRing(p.x, p.y - 38, color, 68, 0.3, 4, false);
    addShockwave(p.x, GROUND_Y, color, 190, 0.45, 5);
    dustBurst(p.x, GROUND_Y, 12, p.facing, 1.2);
    addShake(3.6);
    if (hits > 0) {
      screenFlash(0.025);
      setSlowmo(0.12, 0.45);
    }
  }
}

function moonWheelVisual(p, color, phase) {
  for (let k = 0; k < 4; k++) {
    const a = phase + (k * TAU) / 4 + game.time * 2.2;
    addSlash(p.x, p.y - 40, 66 + (k % 2) * 12, a, a + 1.15, color, 0.18, 15, 1, 0.7);
  }
  addRing(p.x, p.y - 38, color, 58, 0.18, 2, false);
  petalBurst(p.x, p.y - 40, 4, color);
}

/* ---------------- skill 2: 影渡 ---------------- */
function prepareShadowSkill(p) {
  let target = null;
  let best = 565;
  for (const e of game.enemies) {
    if (!e.alive || e.spawnT > 0) continue;
    const d = Math.abs(e.x - p.x);
    if (d < best && d > 8) {
      best = d;
      target = e;
    }
  }
  const s = p.skill;
  s.blinkFrom = { x: p.x, y: p.y };
  if (target) {
    s.travelDir = sgn(target.x - p.x) || p.facing;
    s.destX = clamp(target.x + s.travelDir * 46, 54, WORLD_W - 54);
    s.destY = clamp(target.y, -80, GROUND_Y);
    s.afterFacing = -s.travelDir || -p.facing;
    s.targetId = target.id;
    p.facing = s.travelDir;
  } else {
    s.travelDir = moveDir() || p.facing;
    s.destX = clamp(p.x + s.travelDir * 300, 54, WORLD_W - 54);
    s.destY = p.y;
    s.afterFacing = s.travelDir;
    p.facing = s.travelDir;
  }
  addSkillFx("rift", { x: p.x, y: p.y - 42, height: 92, life: 0.32, color: s.def.color, layer: "front", seed: rand(0, 10) });
  smokeBurst(p.x, p.y - 32, 5, "#17101e", 0.9);
  emberBurst(p.x, p.y - 34, 9, s.def.color, 0.8, false);
}

function updateShadowSkill(p, s, dt) {
  const t = s.t;
  if (!s.blinked && t >= 0.13) {
    s.blinked = true;
    const from = s.blinkFrom;
    const basePose = snapshotPose(computePlayerPose(p));
    for (let i = 1; i <= 4; i++) {
      const q = i / 5;
      const g = { ...basePose, x: lerp(from.x, s.destX, q), y: lerp(from.y, s.destY, q) };
      addAfterimage(g, s.def.color, 0.3);
    }
    p.x = s.destX;
    p.y = s.destY;
    p.facing = s.afterFacing;
    p.vx = 0;
    p.vy = 0;
    addSkillFx("rift", { x: from.x, y: from.y - 42, height: 105, life: 0.3, color: s.def.color, layer: "front", seed: rand(0, 10) });
    addSkillFx("rift", { x: p.x, y: p.y - 42, height: 120, life: 0.36, color: s.def.color, layer: "front", seed: rand(0, 10) });
    addSkillFx("streak", {
      x1: from.x, y1: from.y - 38, x2: p.x, y2: p.y - 38,
      life: 0.3, color: s.def.color, layer: "back",
    });
    addRing(p.x, p.y - 38, s.def.color, 46, 0.26, 3, false);
    smokeBurst(p.x, p.y - 28, 5, "#17101e", 0.9);
    addShake(2.4);
    audio.blinkStep();
  }
  if (!s.struck && t >= 0.25) {
    s.struck = true;
    const hits = skillHitRadius(p, 158, {
      dmg: 58, limb: 72, poise: 140, kb: 300, launch: 260,
      hitstop: 0.13, shake: 6.2, heavy: true, color: s.def.color,
      slashR: 96, slashW: 30, big: true,
      bias: { arm: 0.9, leg: 0.9, head: 0.55 },
    });
    // cross cut
    addSlash(p.x, p.y - 40, 88, -1.55, 1.55, "#fff4ec", 0.22, 12, 1, 0.7);
    addSlash(p.x, p.y - 40, 82, 0.05, -3.05, s.def.color, 0.24, 24, 1, 0.62);
    addRing(p.x, p.y - 38, s.def.color, 64, 0.26, 3.5, false);
    addShockwave(p.x, GROUND_Y, s.def.color, 130, 0.4, 4);
    addShake(4);
    if (hits > 0) {
      screenFlash(0.045);
      setSlowmo(0.2, 0.34);
    }
    audio.swordRift();
  }
  if (t >= 0.6) {
    // nothing extra; end handled by caller
  }
}

/* ---------------- skill 3: 千樱葬 ---------------- */
function prepareSakuraSkill(p) {
  const s = p.skill;
  s.wave = 0;
  p.skillCd[3] = s.def.cd;
  addSkillFx("runecircle", {
    x: p.x, y: p.y - 2, radius: 248, life: 1.55, color: s.def.color, layer: "back", petals: 18,
  });
  addSkillFx("petalDomain", {
    x: p.x, y: p.y - 34, radius: 230, life: 1.55, color: s.def.color, layer: "front",
  });
  addRing(p.x, p.y - 30, s.def.color, 82, 0.45, 4, false);
  petalBurst(p.x, p.y - 38, 16, s.def.color);
  audio.sakuraBloom();
}

function sakuraWave(p, final) {
  const color = p.skill.def.color;
  let count = 0;
  for (const e of [...game.enemies]) {
    if (!e.alive || e.spawnT > 0 || e.invuln > 0) continue;
    applySkillHit(e, p, {
      dmg: final ? 24 : 11,
      limb: final ? 34 : 13,
      poise: final ? 52 : 16,
      kb: final ? 190 : 30,
      launch: final ? 320 : 70,
      hitstop: final ? 0.05 : 0.02,
      shake: final ? 3.2 : 0.8,
      heavy: final,
      color,
      slashR: final ? 68 : 30,
      slashW: final ? 18 : 8,
      big: final,
      aoeParts: final,
      petals: true,
      petalColor: "#ffb7ce",
      bias: { arm: 1, leg: 1, head: 1 },
    });
    count++;
    addParticle({
      kind: "petal", x: e.x + rand(-20, 20), y: e.y - rand(20, 70),
      vx: rand(-110, 110), vy: rand(-170, -30), life: rand(0.5, 1.1), maxLife: 1.1,
      size: rand(3, 6), color: chance(0.5) ? "#fff0f2" : color,
      grav: 80, drag: 0.96, rot: rand(0, TAU), vr: rand(-9, 9),
    });
  }
  if (final) {
    addShockwave(p.x, GROUND_Y, color, 340, 0.6, 6);
    addRing(p.x, p.y - 36, color, 120, 0.5, 4, false);
    screenFlash(0.03);
    addShake(3.2);
    audio.sakuraFinal();
  } else {
    addRing(p.x, p.y - 34, color, 66 + count * 6, 0.2, 2, false);
    audio.sakuraTick();
  }
  return count;
}

function updateSakuraSkill(p, s, dt) {
  const t = s.t;
  const waves = [0.26, 0.5, 0.74, 0.98];
  if (s.wave < waves.length && t >= waves[s.wave]) {
    sakuraWave(p, false);
    s.wave++;
  }
  if (!s.final && t >= 1.22) {
    s.final = true;
    sakuraWave(p, true);
    addSkillFx("petalBurst", { x: p.x, y: p.y - 36, radius: 320, life: 0.55, color: s.def.color, layer: "front" });
  }
}

/* ---------------- skill 4: 断界 ---------------- */
function prepareSunderSkill(p) {
  const s = p.skill;
  s.travelDir = moveDir() || p.facing;
  p.facing = s.travelDir;
  addSkillFx("rune", {
    x: p.x, y: GROUND_Y, radius: 160, life: 0.86, color: s.def.color, layer: "back", petals: 8,
  });
  addRing(p.x, p.y - 36, s.def.color, 62, 0.4, 3, false);
  audio.sunderCharge();
  audio.chargeStart();
}

function updateSunderSkill(p, s, dt) {
  const t = s.t;
  if (!s.released && t < 0.36) {
    // converging sparks around the blade
    if (chance(dt * 36)) {
      const a = rand(0, TAU);
      addParticle({
        kind: "spark",
        x: p.x + Math.cos(a) * rand(45, 90), y: p.y - 34 + Math.sin(a) * rand(30, 70),
        vx: -Math.cos(a) * rand(120, 260), vy: -Math.sin(a) * rand(90, 200),
        life: rand(0.15, 0.35), maxLife: 0.35, size: rand(0.8, 2),
        color: s.def.color, grav: 0, drag: 0.9, additive: true,
      });
    }
  }
  if (!s.released && t >= 0.36) {
    s.released = true;
    audio.chargeStop();
    audio.sunderRelease();
    p.facing = s.travelDir;
    addSkillFx("beam", {
      x: p.x + p.facing * 28, y: p.y - 40, dir: p.facing,
      length: 1280, height: 66, life: 0.55, color: s.def.color, layer: "front",
    });
    addSkillFx("sunderFlash", { x: p.x + p.facing * 420, y: p.y - 40, length: 900, life: 0.38, color: "#fff4dd", layer: "front" });
    const hits = skillHitForward(p, 1250, {
      dmg: 78, limb: 96, poise: 260, kb: 440, launch: 380,
      hitstop: 0.16, shake: 9.0, heavy: true, aoeParts: true,
      color: s.def.color, slashR: 100, slashW: 34, big: true,
      bias: { arm: 1, leg: 1, head: 1 },
    });
    for (const e of game.enemies) {
      if (e.alive && Math.abs(e.x - p.x) < 1250) {
        addSkillFx("rift", { x: e.x, y: e.y - 44, height: 150, life: 0.4, color: s.def.color, layer: "front", seed: rand(0, 10) });
      }
    }
    addShockwave(p.x, GROUND_Y, s.def.color, 260, 0.55, 6);
    for (let i = 1; i <= 5; i++) {
      const dx = p.x + p.facing * i * 150;
      addDecal(clamp(dx, 30, WORLD_W - 30), GROUND_Y, "crack", 1, 1.0 + i * 0.08, "#221311", 8);
    }
    dustBurst(p.x + p.facing * 90, GROUND_Y, 18, p.facing, 1.4);
    addShake(7.5);
    screenFlash(0.065);
    if (hits > 0) setSlowmo(0.24, 0.32);
  }
}

/* ---------------- skill poses ---------------- */
function skillPoseSpec(p) {
  const s = p.skill;
  if (!s) return SKILL_NEUTRAL;
  const t = s.t;
  const id = s.id;

  if (id === 1) {
    const wind = {
      handR: { x: -8, y: -23 }, handL: { x: -5, y: -27 }, angle: -2.6,
      lean: -0.14, crouch: 9, hipShift: -5,
      footL: { x: -17, y: 0 }, footR: { x: 16, y: 0 }, headTilt: -0.05, twoHand: false,
    };
    const strike = {
      handR: { x: 24, y: -31 }, handL: { x: 5, y: -28 }, angle: 0.28,
      lean: 0.24, crouch: 6, hipShift: 8,
      footL: { x: -20, y: 0 }, footR: { x: 19, y: 0 }, headTilt: 0.05, twoHand: false,
    };
    const recover = {
      handR: { x: 14, y: -25 }, handL: { x: 0, y: -23 }, angle: 1.05,
      lean: 0.08, crouch: 3, hipShift: 2,
      footL: { x: -14, y: 0 }, footR: { x: 14, y: 0 }, headTilt: 0.02, twoHand: false,
    };
    if (t < 0.09) return blendPoseSpec(SKILL_NEUTRAL, wind, easeOutCubic(t / 0.09));
    if (t < 0.18) return blendPoseSpec(wind, strike, easeOutQuint((t - 0.09) / 0.09));
    return blendPoseSpec(strike, recover, easeInOutCubic(clamp((t - 0.18) / 0.4, 0, 1)));
  }

  if (id === 2) {
    const wind = {
      handR: { x: -3, y: -31 }, handL: { x: -9, y: -23 }, angle: -2.35,
      lean: -0.06, crouch: 8, hipShift: -4,
      footL: { x: -16, y: 0 }, footR: { x: 15, y: 0 }, headTilt: -0.03, twoHand: false,
    };
    const strike = {
      handR: { x: 25, y: -30 }, handL: { x: 10, y: -27 }, angle: 0.06,
      lean: 0.58, crouch: 7, hipShift: 18,
      footL: { x: -24, y: 0 }, footR: { x: 22, y: 0 }, headTilt: 0.09, twoHand: false,
    };
    const recover = {
      handR: { x: 18, y: -26 }, handL: { x: 4, y: -23 }, angle: 0.8,
      lean: 0.2, crouch: 3, hipShift: 5,
      footL: { x: -16, y: 0 }, footR: { x: 16, y: 0 }, headTilt: 0.02, twoHand: false,
    };
    if (t < 0.12) return blendPoseSpec(SKILL_NEUTRAL, wind, easeOutCubic(t / 0.12));
    if (t < 0.27) return blendPoseSpec(wind, strike, easeOutQuint((t - 0.12) / 0.15));
    return blendPoseSpec(strike, recover, easeInOutCubic(clamp((t - 0.27) / 0.32, 0, 1)));
  }

  if (id === 3) {
    const pulse = Math.sin(t * 9) * 0.6;
    const channel = {
      handR: { x: 14, y: -18 }, handL: { x: 1, y: -39 + pulse }, angle: 1.52,
      lean: 0.06, crouch: 10 + pulse * 0.5, hipShift: 2,
      footL: { x: -15, y: 0 }, footR: { x: 14, y: 0 }, headTilt: -0.02, twoHand: false,
    };
    const start = blendPoseSpec(SKILL_NEUTRAL, channel, easeOutCubic(clamp(t / 0.2, 0, 1)));
    if (t > 1.26) {
      const end = {
        handR: { x: 18, y: -22 }, handL: { x: 5, y: -34 }, angle: 1.08,
        lean: 0.1, crouch: 6, hipShift: 4,
        footL: { x: -15, y: 0 }, footR: { x: 15, y: 0 }, headTilt: 0.03, twoHand: false,
      };
      return blendPoseSpec(start, end, easeInOutCubic(clamp((t - 1.26) / 0.28, 0, 1)));
    }
    return start;
  }

  const charge = {
    handR: { x: -10, y: -22 }, handL: { x: -5, y: -24 }, angle: -2.8,
    lean: -0.15, crouch: 13, hipShift: -6,
    footL: { x: -18, y: 0 }, footR: { x: 16, y: 0 }, headTilt: -0.06, twoHand: true,
  };
  const strike = {
    handR: { x: 26, y: -27 }, handL: { x: 16, y: -28 }, angle: 0.85,
    lean: 0.46, crouch: 8, hipShift: 16,
    footL: { x: -22, y: 0 }, footR: { x: 21, y: 0 }, headTilt: 0.12, twoHand: true,
  };
  const recover = {
    handR: { x: 18, y: -23 }, handL: { x: 8, y: -25 }, angle: 1.12,
    lean: 0.12, crouch: 4, hipShift: 4,
    footL: { x: -16, y: 0 }, footR: { x: 16, y: 0 }, headTilt: 0.03, twoHand: true,
  };
  if (t < 0.1) return blendPoseSpec(SKILL_NEUTRAL, charge, easeOutCubic(t / 0.1));
  if (t < 0.36) return charge;
  if (t < 0.46) return blendPoseSpec(charge, strike, easeOutQuint((t - 0.36) / 0.1));
  return blendPoseSpec(strike, recover, easeInOutCubic(clamp((t - 0.46) / 0.36, 0, 1)));
}

function skillSpinValue(p) {
  if (!p.skill || p.skill.id !== 1) return 0;
  return TAU * easeInOutCubic(clamp(p.skill.t / 0.5, 0, 1));
}

/* ---------------- skill auras / effects ---------------- */
function drawSkillAura(p) {
  if (!p.skill) return;
  const s = p.skill;
  const color = s.def.color;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (s.id === 1) {
    const t = game.time;
    for (let k = 0; k < 3; k++) {
      const a0 = t * 4 + (k * TAU) / 3;
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 38, 54 + k * 17, a0, a0 + 1.5);
      ctx.stroke();
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 38, 54 + k * 17, a0, a0 + 1.5);
      ctx.stroke();
    }
  } else if (s.id === 3) {
    glowCircle(ctx, p.x, p.y - 36, 40 + Math.sin(game.time * 5) * 5, color, 0.13);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 32 + Math.sin(game.time * 3) * 4, 0, TAU);
    ctx.stroke();
  } else if (s.id === 4) {
    const t = clamp(s.t / 0.36, 0, 1);
    glowCircle(ctx, p.x, p.y - 38, 30 + t * 30, color, 0.12 + t * 0.16);
    ctx.globalAlpha = 0.4 + t * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 36, 42 + t * 14, -0.7, 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

function addSkillFx(kind, opts) {
  const fx = {
    kind,
    x: opts.x || 0,
    y: opts.y || 0,
    radius: opts.radius || 100,
    length: opts.length || 400,
    height: opts.height || 80,
    life: opts.life || 0.5,
    maxLife: opts.life || 0.5,
    color: opts.color || "#ff6f84",
    layer: opts.layer || "front",
    petals: opts.petals || 0,
    dir: opts.dir || 1,
    x1: opts.x1,
    y1: opts.y1,
    x2: opts.x2,
    y2: opts.y2,
    seed: opts.seed != null ? opts.seed : rand(0, 100),
  };
  game.skillFx.push(fx);
  if (game.skillFx.length > 36) game.skillFx.shift();
}

function updateSkillFx(dt) {
  for (let i = game.skillFx.length - 1; i >= 0; i--) {
    const fx = game.skillFx[i];
    fx.life -= dt;
    if (fx.life <= 0) game.skillFx.splice(i, 1);
  }
}

function drawSkillFx(layer) {
  for (const fx of game.skillFx) {
    if (fx.layer !== layer) continue;
    const t = 1 - fx.life / fx.maxLife;
    const fade = clamp(fx.life / (fx.maxLife * 0.7), 0, 1);
    ctx.save();
    if (fx.kind === "rune" || fx.kind === "runecircle") {
      ctx.translate(fx.x, fx.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 1.4;
      const r = fx.radius * (fx.kind === "rune" ? 0.55 + t * 0.55 : 1);
      const spin = game.time * 0.8 + fx.seed;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.62 + k * 0.18), spin + k * 0.5, spin + k * 0.5 + TAU * 0.72);
        ctx.stroke();
      }
      ctx.globalAlpha = fade * 0.45;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.27, 0, 0, TAU);
      ctx.stroke();
      const petalN = fx.petals || 0;
      for (let k = 0; k < petalN; k++) {
        const a = spin * 1.4 + (k / petalN) * TAU;
        const rr = r * (0.55 + (k % 3) * 0.14);
        ctx.globalAlpha = fade * 0.5;
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr * 0.3, 5, 1.7, a, 0, TAU);
        ctx.fill();
      }
    } else if (fx.kind === "petalDomain") {
      ctx.translate(fx.x, fx.y);
      ctx.globalCompositeOperation = "lighter";
      const spin = game.time * 0.9 + fx.seed;
      ctx.globalAlpha = fade * 0.55;
      for (let k = 0; k < 22; k++) {
        const a = spin + (k / 22) * TAU + Math.sin(game.time * 1.5 + k) * 0.2;
        const rr = fx.radius * (0.42 + ((k * 37) % 100) / 160);
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr * 0.55 - 55);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = chance(0.25) ? "#fff2f4" : fx.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 5.5, 2.1, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = fade * 0.22;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, fx.radius * 0.82, fx.radius * 0.42, 0, 0, TAU);
      ctx.stroke();
    } else if (fx.kind === "beam") {
      ctx.translate(fx.x, fx.y);
      ctx.scale(fx.dir, 1);
      ctx.globalCompositeOperation = "lighter";
      const grow = easeOutQuint(clamp(t / 0.32, 0, 1));
      const len = fx.length * grow;
      const h0 = fx.height * (1 - t * 0.3);
      const h1 = h0 * 0.12;
      // tapered wave body
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, rgba(fx.color, 0.78 * fade));
      g.addColorStop(0.28, rgba(fx.color, 0.55 * fade));
      g.addColorStop(0.72, rgba(fx.color, 0.24 * fade));
      g.addColorStop(1, rgba(fx.color, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -h0 / 2);
      ctx.quadraticCurveTo(len * 0.35, -h0 * 0.36, len, -h1 / 2);
      ctx.lineTo(len, h1 / 2);
      ctx.quadraticCurveTo(len * 0.35, h0 * 0.3, 0, h0 / 2);
      ctx.closePath();
      ctx.fill();
      // inner white-hot core
      const core = ctx.createLinearGradient(0, 0, len, 0);
      core.addColorStop(0, `rgba(255,250,236,${0.95 * fade})`);
      core.addColorStop(0.55, `rgba(255,238,210,${0.6 * fade})`);
      core.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(1.2, h0 * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      // jagged energy edges
      ctx.globalAlpha = fade * 0.34;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 8; k++) {
        const x = (k / 8) * len;
        const hh = h0 * (0.22 - k * 0.02);
        ctx.beginPath();
        ctx.moveTo(x, -hh);
        ctx.lineTo(x + 22, -hh * 0.4);
        ctx.lineTo(x + 6, hh * 0.4);
        ctx.stroke();
      }
    } else if (fx.kind === "sunderFlash") {
      ctx.translate(fx.x, fx.y);
      ctx.scale(fx.dir, 1);
      ctx.globalCompositeOperation = "lighter";
      const grow = easeOutQuint(clamp(t / 0.26, 0, 1));
      const len = fx.length * grow;
      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = "rgba(255,250,238,0.9)";
      ctx.lineWidth = 4.5 * (1 - t * 0.5);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.globalAlpha = fade * 0.35;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 18 * (1 - t * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
    } else if (fx.kind === "rift") {
      ctx.translate(fx.x, fx.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade * 0.9;
      const h = fx.height;
      const seed = fx.seed;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      for (let k = 1; k <= 5; k++) {
        ctx.lineTo(Math.sin(seed + k * 2.3 + game.time * 18) * 7, -h / 2 + (h * k) / 5);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,248,238,0.9)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      for (let k = 1; k <= 5; k++) {
        ctx.lineTo(Math.sin(seed + k * 2.3 + game.time * 18) * 4, -h / 2 + (h * k) / 5);
      }
      ctx.stroke();
      ctx.globalAlpha = fade * 0.25;
      glowCircle(ctx, 0, 0, h * 0.45, fx.color, 0.5);
    } else if (fx.kind === "streak") {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = fade * 0.9;
      const x1 = fx.x1;
      const y1 = fx.y1;
      const x2 = fx.x2;
      const y2 = fx.y2;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,240,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (fx.kind === "petalBurst") {
      ctx.translate(fx.x, fx.y);
      ctx.globalCompositeOperation = "lighter";
      const rr = fx.radius * easeOutCubic(t);
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3 * (1 - t);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU + fx.seed;
        ctx.globalAlpha = fade * 0.7;
        ctx.fillStyle = k % 3 === 0 ? "#fff4f6" : fx.color;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, 6, 2.2, a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/* ===== 50-enemy.js ===== */
/* ============================================================
   Enemies: segmented puppets, telegraphs, AI, limb destruction
   ============================================================ */

const ENEMY_DIMS = {
  axe: { hipY: 31, chest: 21, headLen: 10, shoulder: 8.5, arm1: 15, arm2: 16, thigh: 16.5, shin: 17.5, stance: 9, hipW: 4.6, bodyW: 20, lean: 0.1 },
  bolt: { hipY: 30, chest: 20, headLen: 9.5, shoulder: 6, arm1: 13, arm2: 14.5, thigh: 15, shin: 16, stance: 8, hipW: 4, bodyW: 12, lean: 0.02 },
  rend: { hipY: 24, chest: 17, headLen: 9, shoulder: 7, arm1: 15, arm2: 16, thigh: 14, shin: 15, stance: 10, hipW: 4.4, bodyW: 15, lean: 0.3 },
};

const ENEMY_INFO = {
  axe: {
    name: "裂斧傀",
    hp: 148, poise: 62, speed: 67, scale: 1.08,
    palette: {
      wood: "#7d5a3a", woodLight: "#b58956", dark: "#221812", armor: "#55504a",
      armorLight: "#9a9081", cloth: "#34241f", accent: "#ffab63", eye: "#ffd47c",
      rope: "#c9a978", core: "#ff7c4a",
    },
    armHp: [31, 26], legHp: [28, 23], headHp: 40,
  },
  bolt: {
    name: "弦弩傀",
    hp: 94, poise: 40, speed: 97, scale: 0.97,
    palette: {
      wood: "#5f5c51", woodLight: "#8f8b79", dark: "#1b1c22", armor: "#3f4652",
      armorLight: "#7d8a95", cloth: "#2a3140", accent: "#87ecdc", eye: "#a6fff2",
      rope: "#a8a08a", core: "#5fe3d0",
    },
    armHp: [22, 18], legHp: [20, 16], headHp: 31,
  },
  rend: {
    name: "疾爪傀",
    hp: 82, poise: 32, speed: 152, scale: 0.88,
    palette: {
      wood: "#6b4a44", woodLight: "#a47a6a", dark: "#1f1518", armor: "#493b36",
      armorLight: "#8d7666", cloth: "#35262b", accent: "#ff8a72", eye: "#ffb491",
      rope: "#bfa07d", core: "#ff6b57",
    },
    armHp: [18, 15], legHp: [19, 15], headHp: 25,
  },
};

const ENEMY_ATTACKS = {
  chop: { windup: 0.6, active: 0.2, recover: 0.62, dmg: 15, reach: 58, r: 52, yOff: 31 },
  leap: { windup: 0.62, active: 0.9, recover: 0.72, dmg: 18, radius: 84 },
  swipe: { windup: 0.46, active: 0.14, recover: 0.48, dmg: 9, reach: 52, r: 44, yOff: 30 },
  headbutt: { windup: 0.5, active: 0.52, recover: 0.72, dmg: 12, reach: 20, r: 40, yOff: 26 },
  aim: { windup: 0.72, active: 0.2, recover: 0.56, dmg: 9 },
  kick: { windup: 0.38, active: 0.16, recover: 0.5, dmg: 9, reach: 48, r: 43, yOff: 28 },
  pounce: { windup: 0.43, active: 0.8, recover: 0.5, dmg: 10, reach: 20, r: 40, yOff: 28 },
  bite: { windup: 0.38, active: 0.24, recover: 0.45, dmg: 8, reach: 34, r: 39, yOff: 26 },
};

function makeEnemyParts(type, scale, elite) {
  const info = ENEMY_INFO[type];
  const hpMul = (elite ? 1.25 : 1) * (1 + Math.max(0, getWaveNumber() - 1) * 0.045);
  const mk = (id, hp) => ({ id, hp: hp * hpMul, maxHp: hp * hpMul, broken: false });
  return {
    armL0: mk("armL0", info.armHp[0]),
    armL1: mk("armL1", info.armHp[1]),
    armR0: mk("armR0", info.armHp[0]),
    armR1: mk("armR1", info.armHp[1]),
    legL0: mk("legL0", info.legHp[0]),
    legL1: mk("legL1", info.legHp[1]),
    legR0: mk("legR0", info.legHp[0]),
    legR1: mk("legR1", info.legHp[1]),
    head: mk("head", info.headHp),
  };
}

function getWaveNumber() {
  return Math.max(1, game.wave || 1);
}

function spawnEnemy(type, x, opts = {}) {
  const info = ENEMY_INFO[type];
  if (!info) return null;
  const elite = !!opts.elite;
  const scale = info.scale * (elite ? 1.16 : 1);
  const hpMul = (1 + Math.max(0, getWaveNumber() - 1) * 0.135) * (elite ? 1.45 : 1);
  const e = {
    id: ++game.enemyId,
    type,
    def: info,
    palette: info.palette,
    x: clamp(x, 70, WORLD_W - 70),
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing: -1,
    grounded: true,
    scale,
    elite,
    hp: info.hp * hpMul,
    maxHp: info.hp * hpMul,
    poise: info.poise * (elite ? 1.35 : 1),
    maxPoise: info.poise * (elite ? 1.35 : 1),
    parts: makeEnemyParts(type, scale, elite),
    alive: true,
    state: "spawn",
    stateT: 0,
    spawnT: 0.55,
    invuln: 0.7,
    stun: 0,
    hurtT: 0,
    flash: 0,
    animTime: rand(0, 10),
    walkPhase: rand(0, TAU),
    cooldown: rand(0.5, 1.2),
    atk: null,
    tele: null,
    targetX: x,
    hasToken: false,
    barTimer: 2.5,
    deathT: 0,
    landLock: 0,
    speedMul: 1,
    arms: 2,
    legsCount: 2,
    canShoot: type === "bolt",
    armLok: true,
    armRok: true,
    legLok: true,
    legRok: true,
    hitFlashT: 0,
    lastCrackle: 0,
    airHitBounce: false,
    inAirFromHit: false,
  };
  e.parts.head.maxHp = info.headHp * (elite ? 1.35 : 1);
  e.parts.head.hp = e.parts.head.maxHp;
  refreshEnemyCaps(e);
  e.facing = game.player ? sgn(game.player.x - e.x) || -1 : -1;
  e.pose = computeEnemyPose(e);
  game.enemies.push(e);

  // entrance effect
  addRing(e.x, GROUND_Y - 2, "#ff5d6c", 48, 0.5, 3, false);
  addRing(e.x, GROUND_Y - 24, e.palette.accent, 32, 0.4, 1.5, false);
  smokeBurst(e.x, GROUND_Y - 10, 8, "#1a1218", 0.9);
  emberBurst(e.x, GROUND_Y - 16, 14, e.palette.accent, 0.8, true);
  return e;
}

function refreshEnemyCaps(e) {
  const P = e.parts;
  e.armLok = !P.armL0.broken && !P.armL1.broken;
  e.armRok = !P.armR0.broken && !P.armR1.broken;
  e.legLok = !P.legL0.broken && !P.legL1.broken;
  e.legRok = !P.legR0.broken && !P.legR1.broken;
  e.arms = (e.armLok ? 1 : 0) + (e.armRok ? 1 : 0);
  e.legsCount = (e.legLok ? 1 : 0) + (e.legRok ? 1 : 0);
  e.speedMul = e.legsCount === 2 ? 1 : e.legsCount === 1 ? 0.52 : 0.16;
  e.canShoot = e.type === "bolt" && e.armRok;
}

function acquireToken(e) {
  if (e.hasToken) return true;
  if (game.attackerCount < 2) {
    e.hasToken = true;
    game.attackerCount++;
    return true;
  }
  return false;
}

function releaseToken(e) {
  if (!e.hasToken) return;
  e.hasToken = false;
  game.attackerCount = Math.max(0, game.attackerCount - 1);
}

function staggerEnemy(e, time) {
  if (!e || !e.alive) return;
  if (e.state === "stagger" && e.stun > time) return;
  e.stun = Math.max(e.stun, time);
  e.state = "stagger";
  e.stateT = time;
  e.poise = 0;
  e.vx *= 0.25;
  e.atk = null;
  e.tele = null;
  releaseToken(e);
  if (e.vy < 0) e.vy *= 0.4;
}

/* ============================================================
   Enemy pose + skeleton
   ============================================================ */
function computeEnemyPose(e) {
  const s = e.scale;
  const B = ENEMY_DIMS[e.type];
  const P = e.parts;
  const pal = e.palette;
  const bothLegs = !e.legLok && !e.legRok;
  const oneLeg = e.legsCount === 1;

  let crouch = 0;
  if (bothLegs) crouch = B.hipY * 0.62 * s;
  else if (oneLeg) crouch = B.hipY * 0.16 * s;
  let lean = B.lean;
  let headTilt = 0;
  let footL = { x: -B.stance * s, y: 0 };
  let footR = { x: B.stance * s, y: 0 };
  let handR = { x: 15 * s, y: -28 * s };
  let handL = { x: 4 * s, y: -29 * s };
  let axeAngle = -0.8;
  let bowAngle = 0;

  const p = game.player;
  const moving = e.grounded && Math.abs(e.vx) > 16 && (e.state === "idle" || e.state === "recover" || e.state === "spawn");
  if (moving) {
    const step = Math.sin(e.walkPhase);
    footL = { x: (-B.stance + step * 10) * s, y: -Math.max(0, step) * 5 * s };
    footR = { x: (B.stance - step * 10) * s, y: -Math.max(0, -step) * 5 * s };
  }
  if (!e.grounded && e.state !== "dead") {
    footL = { x: -8 * s, y: -10 * s };
    footR = { x: 8 * s, y: -7 * s };
  }

  // baseline hand poses per type
  if (e.type === "axe") {
    handR = { x: 15 * s, y: -28 * s };
    handL = { x: 4 * s, y: -29 * s };
    axeAngle = -0.82;
  } else if (e.type === "bolt") {
    handR = { x: 17 * s, y: -31 * s };
    handL = { x: 6 * s, y: -30 * s };
  } else if (e.type === "rend") {
    handR = { x: 15 * s, y: -20 * s };
    handL = { x: 4 * s, y: -19 * s };
  }

  if (!e.alive) {
    const k = clamp(e.deathT / 0.55, 0, 1);
    lean = lerp(B.lean, -1.35, easeOutCubic(k));
    crouch = lerp(crouch, B.hipY * 0.55 * s, easeOutCubic(k));
    headTilt = -0.18 * k;
    handR = { x: lerp(15 * s, 19 * s, k), y: lerp(-28 * s, -4 * s, k) };
    handL = { x: lerp(4 * s, -15 * s, k), y: lerp(-29 * s, -3 * s, k) };
    footR = { x: 9 * s, y: 0 };
    footL = { x: -15 * s, y: 0 };
    axeAngle = lerp(axeAngle, 1.55, k);
  } else if (e.spawnT > 0) {
    lean = 0.34;
    crouch = B.hipY * 0.3 * s;
    headTilt = 0.24;
    handR = { x: 10 * s, y: -18 * s };
    handL = { x: -2 * s, y: -18 * s };
  } else if (e.state === "stagger" || e.stun > 0) {
    lean = -0.5;
    crouch = Math.max(crouch, 5 * s);
    headTilt = -0.22;
    handR = { x: 4 * s, y: -36 * s };
    handL = { x: -9 * s, y: -33 * s };
    footL = { x: -14 * s, y: 0 };
    footR = { x: 12 * s, y: 0 };
    axeAngle = -2.35;
  } else if (e.state === "windup" && e.atk) {
    const kind = e.atk.kind;
    if (kind === "chop") {
      lean = -0.2;
      crouch = 5 * s;
      headTilt = -0.05;
      handR = { x: -4 * s, y: -48 * s };
      handL = { x: 4 * s, y: -44 * s };
      axeAngle = -2.08;
      footL = { x: -13 * s, y: 0 };
      footR = { x: 13 * s, y: 0 };
    } else if (kind === "leap") {
      lean = -0.16;
      crouch = 13 * s;
      handR = { x: -1 * s, y: -35 * s };
      handL = { x: 6 * s, y: -34 * s };
      axeAngle = -2.45;
      footL = { x: -13 * s, y: 0 };
      footR = { x: 12 * s, y: 0 };
    } else if (kind === "headbutt") {
      lean = 0.3;
      crouch = 7 * s;
      headTilt = 0.17;
      handR = { x: -8 * s, y: -24 * s };
      handL = { x: -14 * s, y: -22 * s };
      footL = { x: -14 * s, y: 0 };
      footR = { x: 13 * s, y: 0 };
    } else if (kind === "swipe") {
      lean = 0.16;
      crouch = 4 * s;
      handR = { x: 2 * s, y: -31 * s };
      handL = { x: 10 * s, y: -24 * s };
      footL = { x: -12 * s, y: 0 };
      footR = { x: 12 * s, y: 0 };
    } else if (kind === "aim") {
      lean = 0.03;
      crouch = 2 * s;
      handR = { x: 19 * s, y: -32 * s };
      handL = { x: 9 * s, y: -30 * s };
      footL = { x: -11 * s, y: 0 };
      footR = { x: 11 * s, y: 0 };
    } else if (kind === "kick") {
      lean = -0.12;
      crouch = 9 * s;
      handR = { x: 8 * s, y: -33 * s };
      handL = { x: -2 * s, y: -30 * s };
      footL = { x: -14 * s, y: 0 };
      footR = { x: 9 * s, y: 0 };
    } else if (kind === "pounce") {
      lean = 0.38;
      crouch = 14 * s;
      headTilt = 0.1;
      handR = { x: 2 * s, y: -18 * s };
      handL = { x: -8 * s, y: -17 * s };
      footL = { x: -14 * s, y: 0 };
      footR = { x: 12 * s, y: 0 };
    } else if (kind === "bite") {
      lean = 0.36;
      crouch = 10 * s;
      headTilt = 0.2;
      handR = { x: -6 * s, y: -20 * s };
      handL = { x: -12 * s, y: -18 * s };
    }
  } else if (e.state === "leap") {
    lean = 0.42;
    crouch = 0;
    footL = { x: -6 * s, y: -4 * s };
    footR = { x: 9 * s, y: -12 * s };
    if (e.atk && e.atk.kind === "pounce") {
      handR = { x: 18 * s, y: -23 * s };
      handL = { x: 8 * s, y: -22 * s };
      lean = 0.55;
      headTilt = 0.15;
    } else {
      handR = { x: 14 * s, y: -41 * s };
      handL = { x: 4 * s, y: -38 * s };
      axeAngle = -1.35;
    }
  } else if (e.state === "attack" && e.atk) {
    const kind = e.atk.kind;
    if (kind === "chop") {
      lean = 0.46;
      crouch = 4 * s;
      headTilt = 0.1;
      handR = { x: 22 * s, y: -29 * s };
      handL = { x: 13 * s, y: -31 * s };
      axeAngle = 1.0;
      footL = { x: -15 * s, y: 0 };
      footR = { x: 15 * s, y: 0 };
    } else if (kind === "swipe") {
      lean = 0.38;
      crouch = 4 * s;
      handR = { x: 24 * s, y: -24 * s };
      handL = { x: 14 * s, y: -26 * s };
      footL = { x: -15 * s, y: 0 };
      footR = { x: 15 * s, y: 0 };
    } else if (kind === "headbutt") {
      lean = 0.55;
      crouch = 5 * s;
      headTilt = 0.2;
      handR = { x: -10 * s, y: -20 * s };
      handL = { x: -16 * s, y: -18 * s };
      footL = { x: -17 * s, y: 0 };
      footR = { x: 15 * s, y: 0 };
    } else if (kind === "aim") {
      lean = -0.16;
      crouch = 2 * s;
      handR = { x: 16 * s, y: -35 * s };
      handL = { x: 7 * s, y: -31 * s };
    } else if (kind === "kick") {
      lean = 0.42;
      crouch = 3 * s;
      handR = { x: 1 * s, y: -32 * s };
      handL = { x: -8 * s, y: -29 * s };
      footL = { x: -14 * s, y: 0 };
      footR = { x: 25 * s, y: -16 * s };
    } else if (kind === "pounce") {
      lean = 0.55;
      headTilt = 0.16;
      handR = { x: 20 * s, y: -22 * s };
      handL = { x: 10 * s, y: -21 * s };
    } else if (kind === "bite") {
      lean = 0.5;
      headTilt = 0.24;
      handR = { x: -7 * s, y: -18 * s };
      handL = { x: -13 * s, y: -16 * s };
    }
  } else if (e.state === "recover") {
    lean = 0.18;
    crouch = Math.max(crouch, 3 * s);
    handR = { x: 12 * s, y: -27 * s };
    handL = { x: 2 * s, y: -26 * s };
    axeAngle = 0.9;
  }

  // impact flinch (distinct from poise stagger)
  if (e.alive && e.hurtT > 0 && e.state !== "stagger") {
    const k = clamp(e.hurtT / 0.17, 0, 1);
    lean -= 0.24 * k;
    headTilt -= 0.13 * k;
    crouch += 2.2 * s * k;
    handR = { x: handR.x - 5.5 * s * k, y: handR.y - 2.2 * s * k };
    handL = { x: handL.x - 5.0 * s * k, y: handL.y - 1.4 * s * k };
  }

  // broken legs force the body down and tilt
  if (bothLegs) {
    lean += 0.22;
    headTilt += 0.06;
  } else if (oneLeg) {
    lean += 0.08;
  }
  if (!e.grounded && e.state !== "leap" && e.alive) {
    lean += clamp(e.vy * 0.00025, -0.18, 0.3);
    footL = { x: -9 * s, y: -7 * s };
    footR = { x: 10 * s, y: -11 * s };
  }

  const hipY = Math.max(8, B.hipY * s - crouch);
  const hip = { x: 0, y: -hipY };
  const chest = { x: hip.x + Math.sin(lean) * B.chest * s, y: hip.y - Math.cos(lean) * B.chest * s };
  const head = {
    x: chest.x + Math.sin(lean * 0.6 + headTilt) * B.headLen * s + 0.8 * s,
    y: chest.y - Math.cos(lean * 0.6 + headTilt) * B.headLen * s,
  };
  const shoulderL = { x: chest.x - B.shoulder * s * Math.cos(lean), y: chest.y - B.shoulder * s * Math.sin(lean) - 1 * s };
  const shoulderR = { x: chest.x + B.shoulder * s * Math.cos(lean), y: chest.y + B.shoulder * s * Math.sin(lean) - 1 * s };

  const elbowL = twoBone(shoulderL, handL, B.arm1 * s, B.arm2 * s, 0.9);
  const elbowR = twoBone(shoulderR, handR, B.arm1 * s, B.arm2 * s, 0.9);

  const hipL = { x: hip.x - B.hipW * s, y: hip.y + 1 };
  const hipR = { x: hip.x + B.hipW * s, y: hip.y + 1 };
  const kneeL = twoBone(hipL, footL, B.thigh * s, B.shin * s, -1);
  const kneeR = twoBone(hipR, footR, B.thigh * s, B.shin * s, -1);

  // crossbow aim orientation
  if (e.type === "bolt" && p) {
    const handWorld = { x: e.x + e.facing * handR.x, y: e.y + handR.y };
    const tx = p.x;
    const ty = p.y - 35;
    bowAngle = Math.atan2(ty - handWorld.y, (tx - handWorld.x) * e.facing);
    if (Math.abs(bowAngle) > 0.85) bowAngle = clamp(bowAngle, -0.85, 0.85);
  }

  return {
    s,
    type: e.type,
    x: e.x, y: e.y, facing: e.facing,
    hip, chest, head, headTilt,
    shoulderL, shoulderR, elbowL, elbowR, handL, handR,
    hipL, hipR, kneeL, kneeR, footL, footR,
    axeAngle, bowAngle, lean, crouch,
    bodyW: B.bodyW * s,
  };
}

function localToWorld(e, pt) {
  return { x: e.x + e.facing * pt.x, y: e.y + pt.y };
}

function getEnemySegments(e) {
  const pose = e.pose;
  if (!pose) return [];
  const P = e.parts;
  const segs = [];
  const w = (pt) => localToWorld(e, pt);
  if (!P.armL0.broken) segs.push({ id: "armL0", a: w(pose.shoulderL), b: w(pose.elbowL), r: 5.2 * e.scale, zone: "arm" });
  if (!P.armL0.broken && !P.armL1.broken) segs.push({ id: "armL1", a: w(pose.elbowL), b: w(pose.handL), r: 4.6 * e.scale, zone: "arm" });
  if (!P.armR0.broken) segs.push({ id: "armR0", a: w(pose.shoulderR), b: w(pose.elbowR), r: 5.4 * e.scale, zone: "arm" });
  if (!P.armR0.broken && !P.armR1.broken) segs.push({ id: "armR1", a: w(pose.elbowR), b: w(pose.handR), r: 4.8 * e.scale, zone: "arm" });
  if (!P.legL0.broken) segs.push({ id: "legL0", a: w(pose.hipL), b: w(pose.kneeL), r: 5.2 * e.scale, zone: "leg" });
  if (!P.legL0.broken && !P.legL1.broken) segs.push({ id: "legL1", a: w(pose.kneeL), b: w(pose.footL), r: 4.8 * e.scale, zone: "leg" });
  if (!P.legR0.broken) segs.push({ id: "legR0", a: w(pose.hipR), b: w(pose.kneeR), r: 5.2 * e.scale, zone: "leg" });
  if (!P.legR0.broken && !P.legR1.broken) segs.push({ id: "legR1", a: w(pose.kneeR), b: w(pose.footR), r: 4.8 * e.scale, zone: "leg" });
  if (!P.head.broken) segs.push({ id: "head", a: w(pose.head), b: w(pose.head), r: 9 * e.scale, zone: "head" });
  for (const s of segs) {
    s.mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
  }
  return segs;
}

function getEnemyBody(e) {
  return { x: e.x, y: e.y - 34 * e.scale, r: 20 * e.scale };
}

/* ============================================================
   Player -> enemy damage & limb breaks
   ============================================================ */
function playerAttackHits(p, a, def) {
  if (!def) return;
  const hb = {
    x: p.x + p.facing * def.ox,
    y: p.y - def.oy,
    r: def.r,
  };
  for (const e of game.enemies) {
    if (!e.alive || a.hitSet.has(e.id) || e.invuln > 0 || e.spawnT > 0) continue;
    const segs = getEnemySegments(e);
    const body = getEnemyBody(e);
    let best = null;
    let bestScore = 1e9;
    const bias = def.bias || { arm: 1, leg: 1, head: 1 };
    for (const seg of segs) {
      const d = seg.a === seg.b
        ? Math.hypot(hb.x - seg.a.x, hb.y - seg.a.y)
        : distPointSeg(hb.x, hb.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      if (d > hb.r + seg.r + 2) continue;
      const weight = bias[seg.zone] || 1;
      const score = d * weight + rand(0, 5);
      if (score < bestScore) {
        bestScore = score;
        best = { seg, d };
      }
    }
    const bodyDist = Math.hypot(hb.x - body.x, hb.y - body.y);
    const bodyHit = bodyDist < hb.r + body.r;
    if (!best && !bodyHit) continue;

    a.hitSet.add(e.id);
    a.hasHit = true;
    let contact;
    let targetPartId = null;
    if (best) {
      const seg = best.seg;
      if (seg.a === seg.b) contact = { x: seg.a.x, y: seg.a.y };
      else contact = closestPointOnSegment(hb.x, hb.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      targetPartId = seg.id;
    } else {
      contact = { x: lerp(hb.x, body.x, 0.65), y: lerp(hb.y, body.y, 0.65) };
    }
    damageEnemyFromPlayer(e, {
      dmg: def.dmg,
      limb: def.limb,
      poise: def.poise,
      kb: def.kb,
      launch: def.launch,
      hitstop: def.hitstop,
      shake: def.shake,
      heavy: def.sound === "heavy" || def.kind === "heavy" || def.kind === "airHeavy" || def.kind === "dashAtk",
      charged: !!def.charged || (def.chargeLevel || 0) > 0.55,
      aoeParts: !!def.aoeParts,
      bias: def.bias,
      reach: def.r,
      sourceX: p.x,
      playerFacing: p.facing,
    }, contact, p, targetPartId);
  }
  // cleave incoming bolts out of the air
  const hb2 = { x: p.x + p.facing * def.ox, y: p.y - def.oy, r: def.r + 8 };
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const pr = game.projectiles[i];
    if (pr.type !== "bolt") continue;
    if (Math.hypot(pr.x - hb2.x, pr.y - hb2.y) < hb2.r + pr.r) {
      sparkBurst(pr.x, pr.y, p.facing, 6, 0.7, "#9ff4e5");
      addRing(pr.x, pr.y, "#9ff4e5", 18, 0.16, 1.4, false);
      game.projectiles.splice(i, 1);
      audio.deflect();
    }
  }
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1);
  return { x: ax + vx * t, y: ay + vy * t };
}

function damageEnemyFromPlayer(e, hit, contact, p, targetPartId) {
  if (!e.alive) return;
  const pal = e.palette;
  const dir = sgn(e.x - p.x) || p.facing;
  let dmg = hit.dmg;
  if (targetPartId === "head") dmg *= 1.32;
  dmg *= e.elite ? 0.92 : 1;

  e.hp -= dmg;
  e.hurtT = Math.max(e.hurtT, 0.17);
  e.flash = 0.16;
  e.barTimer = 5;
  e.poise -= hit.poise;
  if (!e.grounded) e.inAirFromHit = true;

  const heavy = !!hit.heavy;
  e.vx += dir * hit.kb * (e.elite ? 0.8 : 1) * (e.grounded ? 1 : 0.7);
  if (hit.launch) {
    if (hit.launch > 0) {
      e.vy = Math.min(e.vy, -hit.launch);
      e.grounded = false;
    } else {
      e.vy = Math.max(e.vy, -hit.launch);
      e.grounded = false;
    }
  } else if (e.grounded) {
    e.vx += dir * 20;
  }

  if (!hit.aoeParts && !targetPartId) {
    targetPartId = chooseNearestPartId(e, contact, hit.bias || { arm: 1, leg: 1, head: 1 });
  }

  // part damage
  let brokeSomething = false;
  let brokeHead = false;
  if (hit.aoeParts) {
    const segs = getEnemySegments(e);
    for (const seg of segs) {
      const d = seg.a === seg.b
        ? Math.hypot(contact.x - seg.a.x, contact.y - seg.a.y)
        : distPointSeg(contact.x, contact.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      if (d <= hit.reach + 46) {
        const part = e.parts[seg.id];
        if (!part || part.broken) continue;
        part.hp -= hit.limb * 1.05;
        e.flash = 0.2;
        if (part.hp <= 0) {
          breakPart(e, seg.id, dir);
          brokeSomething = true;
          if (!e.alive) { brokeHead = true; break; }
        }
      }
    }
  } else if (targetPartId) {
    const part = e.parts[targetPartId];
    if (part && !part.broken) {
      part.hp -= hit.limb;
      if (part.hp <= 0) {
        breakPart(e, targetPartId, dir);
        brokeSomething = true;
        if (!e.alive) brokeHead = true;
      } else if (part.hp < part.maxHp * 0.5) {
        // crackle once in a while
        if (chance(0.55)) {
          cracklePart(e, targetPartId);
        }
      }
    }
  }

  // poise break
  if (e.alive && e.poise <= 0 && e.stun <= 0 && !brokeSomething) {
    staggerEnemy(e, heavy ? 0.72 : 0.52);
    if (game.time - (game.lastPoiseLabelAt || -99) > 0.38) {
      game.lastPoiseLabelAt = game.time;
      addFloater("破", e.x + rand(-6, 6), e.y - 88 * e.scale, "#ffdc9a", 11, { vy: -30, life: 0.5 });
    }
  }

  // impact effects
  const power = clamp(hit.dmg / 22, 0.55, 2.2);
  sparkBurst(contact.x, contact.y, dir, heavy ? 15 : 7, power, chance(0.55) ? "#ffc36d" : "#ff8a6a");
  if (chance(0.5)) metalBurst(contact.x, contact.y, dir, heavy ? 4 : 1);
  if (chance(0.35)) woodBurst(contact.x, contact.y, dir, heavy ? 4 : 1, 0.7, pal.wood);
  addRing(contact.x, contact.y, "#ffd9a6", 13 + power * 8, 0.13, 1.1, false);

  game.hitCount++;
  game.combo += 1;
  game.comboTimer = 2.4;
  game.comboPop = 1;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  updateRank();

  const dmgColor = targetPartId === "head" ? "#ffd57e" : heavy ? "#ffe8b8" : "#fff1d8";
  const numCount = game.floaters.reduce((n, f) => n + (/^[0-9]+$/.test(f.text) ? 1 : 0), 0);
  if (numCount < 6) {
    addFloater(`${Math.round(dmg)}`, contact.x + rand(-18, 18), contact.y - rand(10, 28), dmgColor, heavy ? 13 : 10, {
      vy: -46, life: 0.38, glow: heavy ? "#ff8d58" : null,
    });
  }

  const st = hit.hitstop + (brokeSomething ? 0.02 : 0);
  requestHitStop(st);
  addShake(hit.shake);
  if (heavy) audio.heavyHit();
  else audio.hit(power);
  if (brokeSomething && !brokeHead) audio.breakLimb();
  if (e.grounded && heavy) addShake(hit.shake * 0.2);

  if (e.hp <= 0 && e.alive) {
    killEnemy(e, { cause: brokeHead ? "head" : "hp", dir });
  }
  if (brokeSomething) updateRank();
}

function chooseNearestPartId(e, contact, bias) {
  const segs = getEnemySegments(e);
  let best = null;
  let bestScore = 1e9;
  for (const seg of segs) {
    const d = seg.a === seg.b
      ? Math.hypot(contact.x - seg.a.x, contact.y - seg.a.y)
      : distPointSeg(contact.x, contact.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
    if (d > 42) continue;
    const weight = bias[seg.zone] || 1;
    const score = d * weight + rand(0, 4);
    if (score < bestScore) {
      bestScore = score;
      best = seg.id;
    }
  }
  return best;
}

function cracklePart(e, partId) {
  const segs = getEnemySegments(e);
  const seg = segs.find((s) => s.id === partId);
  if (!seg) return;
  for (let i = 0; i < 3; i++) {
    addParticle({
      kind: "spark",
      x: seg.mid.x + rand(-5, 5), y: seg.mid.y + rand(-5, 5),
      vx: rand(-60, 60), vy: rand(-80, 20),
      life: rand(0.1, 0.25), maxLife: 0.25,
      size: rand(0.6, 1.3), color: e.palette.accent,
      grav: 300, drag: 0.9, additive: true,
    });
  }
  addParticle({
    kind: "smoke", x: seg.mid.x, y: seg.mid.y,
    vx: rand(-10, 10), vy: rand(-28, -10),
    life: rand(0.35, 0.6), maxLife: 0.6,
    size: rand(4, 8), color: "#161116", grav: -15, drag: 0.95, back: true,
  });
}

/* ============================================================
   Break a limb / kill
   ============================================================ */
const PART_NAMES = {
  armL0: "左臂", armL1: "左腕", armR0: "右臂", armR1: "右腕",
  legL0: "左腿", legL1: "左胫", legR0: "右腿", legR1: "右胫",
  head: "首级",
};

function breakPart(e, partId, dir) {
  if (!e.alive) return;
  const part = e.parts[partId];
  if (!part || part.broken) return;
  const pose = e.pose || computeEnemyPose(e);
  const pal = e.palette;
  const s = e.scale;
  const w = (pt) => localToWorld(e, pt);
  const partName = PART_NAMES[partId] || "肢";
  const isHead = partId === "head";
  const isArm = partId.startsWith("arm");
  const isLeg = partId.startsWith("leg");
  const side = partId.includes("R") ? "R" : "L";
  const upper = partId.endsWith("0");

  part.broken = true;

  // auto-sever the child segment if the upper part is destroyed
  let childBroken = false;
  if (upper) {
    const childId = partId.slice(0, -1) + "1";
    const child = e.parts[childId];
    if (child && !child.broken) {
      child.broken = true;
      childBroken = true;
    }
  }

  game.limbBreakCount++;

  // spawn debris for this limb piece
  const pieces = [];
  if (isHead) {
    pieces.push({
      kind: "head",
      x: w(pose.head).x, y: w(pose.head).y,
      weapon: null, len: 11 * s,
    });
  } else if (isArm) {
    const sh = side === "R" ? pose.shoulderR : pose.shoulderL;
    const el = side === "R" ? pose.elbowR : pose.elbowL;
    const hd = side === "R" ? pose.handR : pose.handL;
    if (upper) {
      const a = w(sh);
      const b = w(el);
      pieces.push({
        kind: "armUpper", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        len: 20 * s,
      });
      if (childBroken) {
        const c = w(hd);
        pieces.push({
          kind: "armLower", x: (b.x + c.x) / 2, y: (b.y + c.y) / 2,
          len: 19 * s,
          weapon: weaponForArm(e, side),
        });
      }
    } else {
      const a = w(el);
      const b = w(hd);
      pieces.push({
        kind: "armLower", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        len: 19 * s,
        weapon: weaponForArm(e, side),
      });
    }
  } else if (isLeg) {
    const hipP = side === "R" ? pose.hipR : pose.hipL;
    const kneeP = side === "R" ? pose.kneeR : pose.kneeL;
    const footP = side === "R" ? pose.footR : pose.footL;
    if (upper) {
      const a = w(hipP);
      const b = w(kneeP);
      pieces.push({
        kind: "legUpper", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        len: 19 * s,
      });
      if (childBroken) {
        const c = w(footP);
        pieces.push({
          kind: "legLower", x: (b.x + c.x) / 2, y: (b.y + c.y) / 2,
          len: 18 * s,
        });
      }
    } else {
      const a = w(kneeP);
      const b = w(footP);
      pieces.push({
        kind: "legLower", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        len: 18 * s,
      });
    }
  }

  for (const pc of pieces) {
    spawnDebris({
      kind: pc.kind,
      x: pc.x + rand(-4, 4),
      y: pc.y + rand(-4, 4),
      vx: dir * rand(140, 380) + rand(-70, 70),
      vy: -rand(180, 430),
      rot: rand(0, TAU),
      vr: rand(-11, 11),
      len: pc.len,
      width: (isArm ? 6.4 : 7.4) * s,
      color: pal.wood,
      dark: pal.dark,
      accent: pal.accent,
      weapon: pc.weapon || null,
      scale: s,
      life: rand(4, 5.5),
    });
  }

  // fx
  const mid = pieces.length
    ? { x: pieces[0].x, y: pieces[0].y }
    : { x: e.x, y: e.y - 40 * s };
  woodBurst(mid.x, mid.y, dir, isHead ? 12 : 14, 1.2, pal.wood);
  metalBurst(mid.x, mid.y, dir, 6);
  sparkBurst(mid.x, mid.y, dir, 10, 1.15, pal.accent);
  smokeBurst(mid.x, mid.y, 4, "#191216", 0.9);
  addRing(mid.x, mid.y, pal.accent, 28, 0.24, 2, false);
  addShockwave(e.x, GROUND_Y, "#c7a17a", 80, 0.35, 3);
  addShake(isHead ? 7 : 4.2);
  requestHitStop(isHead ? 0.12 : 0.045);
  screenFlash(isHead ? 0.1 : 0.025);
  audio.breakLimb();
  if (isHead) audio.kill();

  const label = isHead ? "斩首" : isArm ? "断臂" : "断腿";
  if (isHead || game.time - (game.lastLimbLabelAt || -99) > 0.42) {
    if (!isHead) game.lastLimbLabelAt = game.time;
    addFloater(label, e.x + rand(-8, 8), e.y - (isHead ? 94 : 82) * s, isHead ? "#ffd88a" : "#ffb08a", isHead ? 19 : 15, {
      vy: -36, life: 0.68, glow: isHead ? "#ff8a4e" : "#ff6a5c", pop: true,
    });
  }
  e.hp -= isHead ? 0 : 4;
  e.barTimer = 5;
  e.flash = 0.25;
  refreshEnemyCaps(e);

  if (isHead) {
    if (e.hp <= 0) e.hp = 0;
    killEnemy(e, { cause: "head", dir, headless: true });
    return;
  }
  if (e.hp <= 0) {
    killEnemy(e, { cause: "hp", dir });
    return;
  }
  staggerEnemy(e, 0.72);
  game.combo += 1;
  game.comboTimer = 2.4;
  game.comboPop = 1;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  updateRank();
}

function weaponForArm(e, side) {
  if (side === "R") {
    if (e.type === "axe") return "axe";
    if (e.type === "bolt") return "crossbow";
    if (e.type === "rend") return "claw";
  }
  if (e.type === "rend") return "claw";
  return null;
}

function killEnemy(e, opts = {}) {
  if (!e.alive) return;
  e.alive = false;
  e.state = "dead";
  e.deathT = 0;
  e.hp = 0;
  e.tele = null;
  e.atk = null;
  releaseToken(e);
  game.kills++;
  game.combo += opts.cause === "head" ? 2 : 1;
  game.comboTimer = 2.5;
  game.comboPop = 1;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  updateRank();
  healPlayer(opts.cause === "head" ? 5 : 3, true);
  if (opts.cause !== "head") {
    addFloater("斩", e.x, e.y - 88 * e.scale, "#ffedad", 20, {
      vy: -40, life: 0.85, glow: "#ffcf78", pop: true,
    });
  }
  sparkBurst(e.x, e.y - 40, opts.dir || 1, 18, 1.3, "#ffc77a");
  emberBurst(e.x, e.y - 36, 20, e.palette.accent, 1.1, false);
  woodBurst(e.x, e.y - 36, opts.dir || 1, 12, 1, e.palette.wood);
  addRing(e.x, e.y - 36, "#ffd49a", 58, 0.36, 3, false);
  addShockwave(e.x, GROUND_Y, "#d8b07c", 100, 0.4, 4);
  addDecal(e.x, GROUND_Y, "scorch", 1, 0.9, "#180d0b", 6);
  addShake(4.4);
  requestHitStop(opts.cause === "head" ? 0.09 : 0.045);
  if (opts.cause === "head") audio.kill();
}

/* ============================================================
   Enemy AI
   ============================================================ */
function updateEnemy(e, dt) {
  e.animTime += dt;
  e.flash = Math.max(0, e.flash - dt * 5.5);
  e.hurtT = Math.max(0, e.hurtT - dt);
  e.barTimer = Math.max(0, e.barTimer - dt);
  e.cooldown = Math.max(0, e.cooldown - dt);
  e.invuln = Math.max(0, e.invuln - dt);

  if (!e.alive) {
    e.deathT += dt;
    if (e.deathT > 0.35 && chance(dt * 12)) {
      addParticle({
        kind: "ember", x: e.x + rand(-16, 16), y: e.y - rand(4, 40) * e.scale,
        vx: rand(-20, 20), vy: -rand(20, 80), life: rand(0.5, 1.2), maxLife: 1.2,
        size: rand(0.8, 2.2), color: e.palette.accent, grav: -15, drag: 0.95, additive: true,
      });
    }
    if (e.deathT > 1.7) {
      smokeBurst(e.x, e.y - 20, 5, "#171217", 1.1);
      emberBurst(e.x, e.y - 20, 8, e.palette.accent, 0.7);
      e.remove = true;
    }
    applyEnemyPhysics(e, dt);
    e.pose = computeEnemyPose(e);
    return;
  }

  if (e.spawnT > 0) {
    e.spawnT -= dt;
    if (e.spawnT <= 0) {
      e.state = "idle";
      e.invuln = 0;
      smokeBurst(e.x, e.y - 20, 4, "#171217", 0.8);
    }
    applyEnemyPhysics(e, dt);
    e.pose = computeEnemyPose(e);
    return;
  }

  if (e.stun > 0) {
    e.stun -= dt;
    e.vx = damp(e.vx, 0, 4, dt);
    if (e.stun <= 0) {
      e.stun = 0;
      e.poise = e.maxPoise;
      e.state = "idle";
      e.cooldown = 0.35;
    }
    applyEnemyPhysics(e, dt);
    e.pose = computeEnemyPose(e);
    return;
  }

  const p = game.player;
  const playerGone = !p || p.dead || game.dying;

  if (e.grounded) {
    if (e.state === "windup" && e.atk) {
      e.atk.t += dt;
      e.tele = { kind: e.atk.kind, p: clamp(e.atk.t / e.atk.windup, 0, 1), targetX: e.targetX };
      e.vx = damp(e.vx, 0, 9, dt);
      if (e.atk.t >= e.atk.windup) {
        beginEnemyActive(e);
      }
    } else if (e.state === "attack" && e.atk) {
      updateEnemyActive(e, dt);
    } else if (e.state === "recover") {
      e.stateT -= dt;
      e.vx = damp(e.vx, 0, 7, dt);
      if (e.stateT <= 0) {
        e.state = "idle";
        e.atk = null;
        e.cooldown = rand(0.8, 1.5) * (e.elite ? 0.8 : 1);
        releaseToken(e);
      }
    } else if (e.state === "leap") {
      updateEnemyLeap(e, dt);
    } else {
      // idle
      if (!playerGone) {
        e.facing = sgn(p.x - e.x) || e.facing;
        moveEnemyIdle(e, dt);
        if (e.cooldown <= 0) tryEnemyAttack(e);
      } else {
        e.vx = damp(e.vx, 0, 5, dt);
      }
    }
  } else {
    // airborne
    if (e.state === "leap" && e.atk) {
      updateEnemyLeap(e, dt);
    }
    // otherwise simply fall
  }

  applyEnemyPhysics(e, dt);
  e.pose = computeEnemyPose(e);
}

function moveEnemyIdle(e, dt) {
  const p = game.player;
  if (!p) return;
  const dx = p.x - e.x;
  const ad = Math.abs(dx);
  const dir = sgn(dx) || 1;
  let target = 0;
  const chaseBonus = ad > 320 ? 1.6 : ad > 220 ? 1.2 : 1;
  const spd = e.def.speed * e.speedMul * (e.elite ? 1.06 : 1) * chaseBonus;
  if (e.type === "axe") {
    if (ad > 82) target = dir * spd;
    else if (ad < 48) target = -dir * spd * 0.4;
  } else if (e.type === "bolt") {
    if (e.canShoot) {
      if (ad < 225 && e.legsCount > 0) target = -dir * spd * 0.85;
      else if (ad > 345) target = dir * spd * 0.85;
      else target = 0;
    } else {
      if (ad > 62) target = dir * spd * 1.05;
      else if (ad < 42) target = -dir * spd * 0.25;
    }
  } else if (e.type === "rend") {
    if (ad > 68) target = dir * spd;
    else if (ad < 42) target = -dir * spd * 0.3;
  }
  // separation from other enemies
  for (const o of game.enemies) {
    if (o === e || !o.alive) continue;
    const dd = e.x - o.x;
    if (Math.abs(dd) < 34 && Math.abs(e.y - o.y) < 70) {
      target += sgn(dd) * 45;
    }
  }
  e.vx = damp(e.vx, target, 9, dt);
  e.walkPhase += Math.abs(e.vx) * dt * 0.085;
}

function tryEnemyAttack(e) {
  const p = game.player;
  if (!p || p.dead || game.dying) return;
  const ad = Math.abs(p.x - e.x);
  const kind = chooseEnemyAttack(e, ad);
  if (!kind) {
    e.cooldown = 0.2;
    return;
  }
  if (game.attackerCount >= 2 && !e.hasToken) {
    e.cooldown = 0.25;
    return;
  }
  startEnemyAttack(e, kind);
}

function chooseEnemyAttack(e, ad) {
  if (e.type === "axe") {
    if (e.arms === 0) {
      return ad < 350 ? "headbutt" : null;
    }
    if (e.armRok) {
      if (ad < 150) return "chop";
      if (e.legsCount === 2 && ad < 480) return "leap";
      return ad < 300 ? "chop" : null;
    }
    if (e.armLok) {
      return ad < 135 ? "swipe" : null;
    }
  } else if (e.type === "bolt") {
    if (e.canShoot) {
      if (ad < 560) return "aim";
      return null;
    }
    if (ad < 120 && e.legsCount > 0) return "kick";
    return null;
  } else if (e.type === "rend") {
    if (e.arms > 0) {
      if (ad < 100) return "swipe";
      if (e.legsCount === 2 && ad < 390) return "pounce";
      return ad < 150 ? "swipe" : null;
    }
    return ad < 175 ? "bite" : null;
  }
  return null;
}

function startEnemyAttack(e, kind) {
  const base = ENEMY_ATTACKS[kind];
  if (!base) return;
  if (!acquireToken(e)) return;
  const p = game.player;
  const windScale = clamp(1 - (getWaveNumber() - 1) * 0.026, 0.7, 1) * (e.elite ? 0.9 : 1);
  const dmgBonus = Math.min(6, (getWaveNumber() - 1) * 0.55) + (e.elite ? 2 : 0);
  const def = {
    ...base,
    windup: base.windup * windScale,
    recover: base.recover * (e.elite ? 0.92 : 1),
    dmg: Math.round(base.dmg + dmgBonus),
  };
  e.atk = { kind, ...def, t: 0, didHit: false };
  e.state = "windup";
  e.stateT = def.windup;
  e.facing = p ? sgn(p.x - e.x) || e.facing : e.facing;
  e.targetX = p ? p.x : e.x;
  e.tele = { kind, p: 0, targetX: e.targetX };
  e.vx = 0;
  e.barTimer = Math.max(e.barTimer, 1.4);
  audio.telegraph(e.type === "bolt" ? "bolt" : e.type === "rend" ? "rend" : "axe");
  if (e.type === "bolt" && kind === "aim") {
    addRing(e.x + e.facing * 18 * e.scale, e.y - 32 * e.scale, "#8ff0e0", 18, 0.2, 1.2, false);
  }
}

function beginEnemyActive(e) {
  const a = e.atk;
  if (!a) return;
  e.tele = null;
  if (a.kind === "leap") {
    e.state = "leap";
    e.atk.t = 0;
    const p = game.player;
    const targetX = p ? p.x : e.x + e.facing * 120;
    e.vy = -530 * Math.sqrt(e.scale);
    e.vx = clamp((targetX - e.x) / 0.58, -390, 390);
    e.grounded = false;
    e.atk.didHit = false;
    dustBurst(e.x, GROUND_Y, 10, e.facing, 1.1);
    audio.noiseHit(0.1, 0.2, "bandpass", 300, 900, 0.9);
    return;
  }
  e.state = "attack";
  e.atk.t = 0;
  e.atk.didHit = false;
  const legPower = e.legsCount === 2 ? 1 : e.legsCount === 1 ? 0.6 : 0.22;
  audio.noiseHit(a.kind === "headbutt" ? 0.12 : 0.085, 0.16, "bandpass", 320, 1500, 1.1);
  if (a.kind === "aim") {
    fireBolt(e);
    e.atk.didHit = true;
    e.vx = -e.facing * 40;
  } else if (a.kind === "kick") {
    e.vx = e.facing * 340 * legPower;
  } else if (a.kind === "chop") {
    e.vx = e.facing * 230 * legPower;
  } else if (a.kind === "swipe") {
    e.vx = e.facing * 170 * legPower;
  } else if (a.kind === "headbutt") {
    e.vx = e.facing * 420 * legPower;
  } else if (a.kind === "pounce") {
    const p = game.player;
    const targetX = p ? p.x : e.x + e.facing * 150;
    e.state = "leap";
    e.atk.t = 0;
    e.vy = -420 * Math.sqrt(e.scale);
    const airTime = 0.62;
    e.vx = clamp((targetX - e.x) / airTime, -560, 560);
    e.grounded = false;
    dustBurst(e.x, GROUND_Y, 8, e.facing, 1);
  }
}

function updateEnemyActive(e, dt) {
  const a = e.atk;
  a.t += dt;
  const legPower = e.legsCount === 2 ? 1 : e.legsCount === 1 ? 0.6 : 0.22;
  if (a.kind === "chop") {
    if (a.t < 0.09) e.vx = e.facing * 230 * legPower;
    else e.vx = damp(e.vx, 0, 8, dt);
    if (!a.didHit && a.t >= 0.035) enemyMeleeCheck(e, a.reach, a.r, a.yOff, a.dmg, a);
  } else if (a.kind === "swipe") {
    if (a.t < 0.08) e.vx = e.facing * 190 * legPower;
    if (!a.didHit && a.t >= 0.025) enemyMeleeCheck(e, a.reach, a.r, a.yOff, a.dmg, a);
  } else if (a.kind === "kick") {
    if (a.t < 0.12) e.vx = e.facing * 340 * legPower;
    else e.vx = damp(e.vx, 0, 7, dt);
    if (!a.didHit && a.t >= 0.03) enemyMeleeCheck(e, a.reach, a.r, a.yOff, a.dmg, a);
  } else if (a.kind === "headbutt") {
    e.vx = e.facing * 420 * legPower;
    if (!a.didHit) enemyMeleeCheck(e, a.reach, a.r, a.yOff, a.dmg, a);
  }
  if (a.t >= a.active && e.state === "attack") {
    e.state = "recover";
    e.stateT = a.recover;
    e.vx *= 0.25;
    if (a.kind === "headbutt") {
      // overcommitted shoulder rush
      e.stun = 0.18;
      e.state = "stagger";
      e.stateT = 0.32;
      e.atk = null;
      releaseToken(e);
    }
  }
}

function updateEnemyLeap(e, dt) {
  const a = e.atk;
  if (!a) return;
  a.t += dt;
  if (a.kind === "pounce" && !a.didHit) {
    const p = game.player;
    if (p && !p.dead) {
      const dx = p.x - e.x;
      const dy = p.y - 36 - (e.y - 32 * e.scale);
      if (Math.hypot(dx, dy) < 40 * e.scale + 20) {
        a.didHit = true;
        damagePlayer(a.dmg, e.x, { enemy: e });
        sparkBurst(p.x, p.y - 38, sgn(dx) || 1, 8, 0.9, "#ffb078");
      }
    }
  }
  if (e.grounded) {
    onEnemyLeaveAirAfterAttack(e);
  }
}

function onEnemyLeaveAirAfterAttack(e) {
  const a = e.atk;
  if (!a) return;
  if (a.kind === "leap") {
    const p = game.player;
    if (p && !p.dead) {
      const d = Math.abs(p.x - e.x);
      if (d < a.radius * e.scale && p.y > GROUND_Y - 90) {
        damagePlayer(a.dmg, e.x, { enemy: e });
      }
    }
    addShockwave(e.x, GROUND_Y, "#cba57c", 150, 0.4, 5);
    addRing(e.x, GROUND_Y - 2, "#ff9d6c", 80, 0.32, 3, false);
    dustBurst(e.x, GROUND_Y, 16, 0, 1.5);
    addShake(4.2);
    addDecal(e.x, GROUND_Y, "crack", 1, 1.1, "#221311", 6);
    audio.land(true);
  } else if (a.kind === "pounce") {
    dustBurst(e.x, GROUND_Y, 9, e.facing, 1);
    addRing(e.x, GROUND_Y - 2, "#ff9a7c", 40, 0.25, 2, false);
    addShake(2.2);
    audio.land(false);
  }
  if (e.state === "stagger" || e.stun > 0) {
    e.atk = null;
    return;
  }
  e.state = "recover";
  e.stateT = a.recover;
  e.vx *= 0.2;
}

function enemyMeleeCheck(e, reach, radius, yOff, dmg, atk) {
  if (!atk || atk.didHit) return;
  const p = game.player;
  if (!p || p.dead) return;
  const hx = e.x + e.facing * reach * e.scale;
  const hy = e.y - yOff * e.scale;
  const px = p.x;
  const py = p.y - 35;
  const d = Math.hypot(px - hx, (py - hy) * 0.85);
  if (d < radius * e.scale + 16) {
    atk.didHit = true;
    const hit = damagePlayer(dmg, e.x, { enemy: e });
    const dir = sgn(p.x - e.x) || 1;
    if (hit) {
      sparkBurst(p.x, p.y - 38, dir, 10, 1, "#ffb070");
      addRing(p.x, p.y - 36, "#ff8d72", 24, 0.18, 1.5, false);
    } else {
      sparkBurst(hx, hy, dir, 4, 0.5, "#9fe8e0");
    }
    // telegraph slash flash from the enemy weapon
    addSlash(hx, hy, 40 * e.scale, -1.4, 1.2, "#ff7468", 0.14, 12, e.facing, 0.55);
  }
}

function fireBolt(e) {
  const p = game.player;
  if (!p) return;
  const sx = e.x + e.facing * 18 * e.scale;
  const sy = e.y - 33 * e.scale;
  const tx = p.x;
  const ty = p.y - 35;
  const ang = Math.atan2(ty - sy, tx - sx);
  game.projectiles.push({
    type: "bolt",
    x: sx,
    y: sy,
    vx: Math.cos(ang) * 555,
    vy: Math.sin(ang) * 555,
    r: 7,
    life: 2.6,
    damage: e.atk ? e.atk.dmg : 9,
    owner: e,
    color: "#8ff2e0",
    angle: ang,
    trail: [],
  });
  addRing(sx, sy, "#8ff2e0", 18, 0.18, 2, false);
  for (let i = 0; i < 6; i++) {
    addParticle({
      kind: "spark", x: sx, y: sy,
      vx: Math.cos(ang) * rand(80, 260) + rand(-60, 60),
      vy: Math.sin(ang) * rand(80, 260) + rand(-60, 60),
      life: rand(0.1, 0.25), maxLife: 0.25, size: rand(0.8, 1.8),
      color: "#a8fff1", grav: 100, drag: 0.9, additive: true,
    });
  }
  audio.shoot();
}

/* ============================================================
   Enemy physics + projectile updates
   ============================================================ */
function applyEnemyPhysics(e, dt) {
  const wasGrounded = e.grounded;
  if (e.state !== "leap" || !e.atk) {
    // normal gravity
  }
  e.vy += 1950 * dt;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  if (e.state === "leap") {
    e.vx *= Math.pow(0.55, dt);
  } else if (e.grounded) {
    e.vx *= Math.pow(0.02, dt);
  } else {
    e.vx *= Math.pow(0.9, dt);
  }
  e.x = clamp(e.x, 50, WORLD_W - 50);
  if (e.y >= GROUND_Y) {
    e.y = GROUND_Y;
    e.vy = 0;
    if (!wasGrounded) {
      e.grounded = true;
      if (e.alive) {
        if (e.state === "leap") {
          onEnemyLeaveAirAfterAttack(e);
        } else if (e.inAirFromHit) {
          e.inAirFromHit = false;
          dustBurst(e.x, GROUND_Y, 7, 0, 1);
          addRing(e.x, GROUND_Y - 2, "#d8c4a6", 28, 0.2, 1.5, true);
          if (e.state !== "stagger") {
            e.state = "recover";
            e.stateT = 0.32;
          }
          audio.land(false);
        }
      }
    }
  } else {
    e.grounded = false;
  }
}

function updateProjectiles(dt) {
  const p = game.player;
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const pr = game.projectiles[i];
    pr.life -= dt;
    let dead = pr.life <= 0;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    if (!pr.trail) pr.trail = [];
    if (pr.trail) {
      pr.trail.push({ x: pr.x, y: pr.y, life: 0.18 });
      if (pr.trail.length > 10) pr.trail.shift();
      for (const t of pr.trail) t.life -= dt;
      pr.trail = pr.trail.filter((t) => t.life > 0);
    }
    if (pr.type === "bolt") {
      if (pr.y > GROUND_Y - 2 || pr.x < 20 || pr.x > WORLD_W - 20) {
        sparkBurst(pr.x, Math.min(pr.y, GROUND_Y - 2), sgn(pr.vx), 5, 0.6, "#8ff2e0");
        dead = true;
      }
      if (!dead && p && !p.dead) {
        const px = p.x;
        const py = p.y - 35;
        const rr = 17 + pr.r;
        if (Math.hypot(px - pr.x, py - pr.y) < rr) {
          if (isParryActive(p)) {
            parryProjectile(pr);
            dead = true;
          } else if (p.state === "dash" && p.iframes > 0) {
            sparkBurst(pr.x, pr.y, -sgn(pr.vx), 7, 0.8, "#9ff4e5");
            addFloater("闪", p.x, p.y - 70, "#cfe9e6", 13, { vy: -30, life: 0.5 });
            dead = true;
          } else if (p.iframes <= 0) {
            damagePlayer(pr.damage, pr.x - pr.vx * 0.02, { enemy: pr.owner });
            sparkBurst(pr.x, pr.y, -sgn(pr.vx), 8, 1, "#ff9c72");
            dead = true;
          } else {
            dead = true;
          }
        }
      }
    } else if (pr.type === "reflect") {
      if (pr.y > GROUND_Y - 2 || pr.x < 20 || pr.x > WORLD_W - 20) {
        sparkBurst(pr.x, Math.min(pr.y, GROUND_Y - 2), sgn(pr.vx), 8, 0.9, "#ffe3a0");
        dead = true;
      }
      if (!dead && p) {
        for (const e of game.enemies) {
          if (!e.alive || e.spawnT > 0) continue;
          const ex = e.x;
          const ey = e.y - 34 * e.scale;
          if (Math.hypot(ex - pr.x, ey - pr.y) < 30 * e.scale + pr.r) {
            const contact = { x: pr.x, y: pr.y };
            damageEnemyFromPlayer(e, {
              dmg: pr.damage, limb: pr.limb, poise: 40, kb: 220, launch: 150,
              hitstop: 0.06, shake: 3.5, heavy: false, aoeParts: false,
              bias: { arm: 1, leg: 1, head: 1 }, reach: 20, sourceX: p.x,
            }, contact, p, null);
            addShockwave(pr.x, pr.y, "#ffe3a0", 80, 0.3, 3);
            audio.deflect();
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) game.projectiles.splice(i, 1);
  }
}

function updateEnemyList(dt) {
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    updateEnemy(e, dt);
    if (e.remove) game.enemies.splice(i, 1);
  }
}

/* ===== 60-game.js ===== */
/* ============================================================
   Game flow, waves, camera, main fixed-step update
   ============================================================ */
let accumulator = 0;

function startGame() {
  audio.init();
  audio.chargeStop();
  audio.startChime();

  game.mode = "play";
  game.time = 0;
  game.hitStop = 0;
  game.timeScale = 1;
  game.slowmo = 0;
  game.flash = 0;
  game.hurtVignette = 0;
  game.lowHpPulse = 0;
  game.dying = false;
  game.deathTimer = 0;
  game.deathHold = 0;
  game.overTimer = 0;
  game.introFade = 1;

  game.player = createPlayer(WORLD_W / 2);
  game.enemies = [];
  game.projectiles = [];
  game.debris = [];
  game.particles = [];
  game.particlesBack = [];
  game.decals = [];
  game.afterimages = [];
  game.floaters = [];
  game.slashes = [];
  game.skillFx = [];
  game.portals = [];
  game.pendingSpawns = [];
  game.banners = [];
  game.attackerCount = 0;

  game.kills = 0;
  game.hitCount = 0;
  game.limbBreakCount = 0;
  game.combo = 0;
  game.comboTimer = 0;
  game.comboPop = 0;
  game.maxCombo = 0;
  game.rank = "";
  game.rankPop = 0;
  game.wave = 0;
  game.wavePhase = "none";
  game.waveTimer = 0;
  game.clearTimer = 0;
  game.waveRemaining = 0;
  game.hintTimer = 9;
  game.lastPlayerHitAt = -99;
  game.lastLimbLabelAt = -99;
  game.lastPoiseLabelAt = -99;

  game.camera.shakeAmp = 0;
  game.camera.shakeT = 0;
  game.camera.x = clamp(game.player.x - view.viewW / 2, cameraMinX(), cameraMaxX());
  game.camera.targetX = game.camera.x;

  clearInputState();
  accumulator = 0;

  startWave(1);
}

function cameraMinX() {
  return view.viewW >= WORLD_W ? (WORLD_W - view.viewW) / 2 : 0;
}

function cameraMaxX() {
  return view.viewW >= WORLD_W ? (WORLD_W - view.viewW) / 2 : WORLD_W - view.viewW;
}

function aliveEnemies() {
  let n = 0;
  for (const e of game.enemies) if (e.alive) n++;
  return n;
}

function buildWaveList(n) {
  let list;
  if (n === 1) list = ["axe", "axe"];
  else if (n === 2) list = ["axe", "bolt"];
  else if (n === 3) list = ["rend", "axe", "bolt"];
  else if (n === 4) list = ["axe", "axe", "bolt", "rend"];
  else {
    const count = Math.min(6, 3 + Math.floor(n / 3));
    const pool = ["axe", "bolt", "rend"];
    list = [];
    for (let i = 0; i < count; i++) list.push(pick(pool));
    if (!list.includes("bolt")) list[randInt(0, list.length - 1)] = "bolt";
    if (!list.includes("rend")) list[randInt(0, list.length - 1)] = "rend";
  }
  return list;
}

function waveSubtitle(n) {
  if (n === 1) return "裂斧傀 · 重劈可弹";
  if (n === 2) return "弦弩傀 · 弩矢可弹反";
  if (n === 3) return "疾爪傀 · 扑击有隙";
  if (n === 4) return "四面皆傀 · 斩其关节";
  return "月下无尽 · 斩之";
}

function startWave(n) {
  game.wave = n;
  game.wavePhase = "fight";
  game.waveTimer = 0;
  game.clearTimer = 0;
  const list = buildWaveList(n);
  const eliteIndex = n % 4 === 0 ? list.length - 1 : -1;
  game.pendingSpawns = list.map((type, i) => ({
    type,
    delay: 0.35 + i * 0.72,
    side: i % 2 === 0 ? 1 : -1,
    elite: i === eliteIndex,
  }));
  game.waveRemaining = list.length;
  addBanner(`第${cnNum(n)}阵`, waveSubtitle(n), 2.0, n % 4 === 0 ? "#ffd37a" : "#f0dcb4");
  audio.waveStart();
  game.hintTimer = Math.max(game.hintTimer || 0, n === 1 ? 8 : 0);
}

function updateWaves(dt) {
  if (game.mode !== "play") return;
  if (!game.dying) {
    for (const sp of game.pendingSpawns) {
      sp.delay -= dt;
      if (sp.delay <= 0) {
        if (aliveEnemies() < 4) {
          spawnWaveEnemy(sp);
          sp.done = true;
        } else {
          sp.delay = 0.45;
        }
      }
    }
    game.pendingSpawns = game.pendingSpawns.filter((s) => !s.done);
  }

  const alive = aliveEnemies();
  game.waveRemaining = alive + game.pendingSpawns.length;

  if (game.wavePhase === "fight" && !game.dying) {
    if (alive === 0 && game.pendingSpawns.length === 0) {
      game.wavePhase = "clear";
      game.clearTimer = 1.9;
      healPlayer(14, true);
      addBanner("阵破", "月华入息 · 命息回复", 1.8, "#bfe9c9");
      audio.waveClear();
      screenFlash(0.025);
    }
  } else if (game.wavePhase === "clear") {
    game.clearTimer -= dt;
    if (game.clearTimer <= 0) {
      startWave(game.wave + 1);
    }
  }
}

function spawnWaveEnemy(sp) {
  const p = game.player;
  if (!p) return;
  const baseDist = rand(285, 345);
  let x = p.x + sp.side * baseDist;
  x = clamp(x, 90, WORLD_W - 90);
  if (Math.abs(x - p.x) < 190) {
    x = clamp(p.x - sp.side * 230, 90, WORLD_W - 90);
  }
  spawnEnemy(sp.type, x, { elite: sp.elite });
}

function addBanner(text, sub, life = 1.6, color = "#f0dcb4") {
  game.banners.push({ text, sub, life, maxLife: life, color });
  if (game.banners.length > 3) game.banners.shift();
}

function updateBanners(dt) {
  for (let i = game.banners.length - 1; i >= 0; i--) {
    game.banners[i].life -= dt;
    if (game.banners[i].life <= 0) game.banners.splice(i, 1);
  }
}

const RANK_TABLE = [
  [22, "SS", "#ffe08a"],
  [15, "S", "#ffd070"],
  [10, "A", "#ff9a72"],
  [6, "B", "#ffb4c0"],
  [3, "C", "#cfe0d8"],
  [1, "D", "#9fb4b8"],
];
function updateRank() {
  let rank = "";
  for (const [threshold, letter] of RANK_TABLE) {
    if (game.combo >= threshold) {
      rank = letter;
      break;
    }
  }
  if (rank !== game.rank) {
    if (rank) game.rankPop = 1;
    game.rank = rank;
  }
}

function updateComboTimers(dt) {
  if (game.combo > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) {
      game.combo = 0;
      game.rank = "";
      game.comboTimer = 0;
    }
  }
  game.comboPop = Math.max(0, game.comboPop - dt * 5.5);
  game.rankPop = Math.max(0, game.rankPop - dt * 4);
  updateBanners(dt);
}

function updateCamera(dt, snap = false) {
  const p = game.player;
  if (!p) return;
  let target;
  if (game.mode === "title") {
    target = p.x - view.viewW * 0.90;
  } else {
    target = p.x + p.facing * 46 + clamp(p.vx * 0.18, -90, 90) - view.viewW / 2;
  }
  target = clamp(target, cameraMinX(), cameraMaxX());
  game.camera.targetX = target;
  if (snap) {
    game.camera.x = target;
  } else {
    const lam = p.state === "dash" ? 10 : 6.5;
    game.camera.x = damp(game.camera.x, target, lam, dt);
  }
  game.camera.x = clamp(game.camera.x, cameraMinX(), cameraMaxX());
}

function updateRealTime(dt) {
  game.realTime += dt;
  const cam = game.camera;
  cam.shakeT += dt;
  if (cam.shakeAmp > 0.02) {
    cam.shakeAmp *= Math.exp(-dt * 9.5);
    if (cam.shakeAmp < 0.02) cam.shakeAmp = 0;
  } else {
    cam.shakeAmp = 0;
  }
  const t = cam.shakeT;
  cam.shakeX = (Math.sin(t * 111) * 0.62 + Math.sin(t * 73 + 1.7) * 0.38) * cam.shakeAmp;
  cam.shakeY = (Math.sin(t * 97 + 2.1) * 0.55 + Math.sin(t * 61 + 0.4) * 0.3) * cam.shakeAmp;

  game.flash = Math.max(0, game.flash - dt * 4.8);
  game.introFade = Math.max(0, game.introFade - dt * 4.5);
  game.hurtVignette = Math.max(0, game.hurtVignette - dt * 2.2);
  game.lowHpPulse += dt;
  if (game.slowmo > 0) {
    game.slowmo -= dt;
    game.timeScale = Math.min(game.timeScale, 0.34);
  } else {
    game.timeScale = damp(game.timeScale, 1, 7, dt);
    if (game.timeScale > 0.995) game.timeScale = 1;
  }
  if (game.mode === "over") game.overTimer = (game.overTimer || 0) + dt;
}

function stepGame(dt) {
  game.time += dt;

  if (game.mode === "title") {
    const p = game.player;
    if (p) {
      p.animTime += dt;
      updateScarf(p, dt);
    }
    updateEffects(dt);
    updateCamera(dt);
  } else if (game.mode === "over") {
    const p = game.player;
    if (p) {
      p.animTime += dt;
      p.deadT += dt;
      updateScarf(p, dt);
    }
    updateEffects(dt);
    updateCamera(dt);
  } else {
    // ---------- play ----------
    if (game.player) updatePlayer(game.player, dt);
    updateEnemyList(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updateWaves(dt);
    updateComboTimers(dt);
    game.hintTimer = Math.max(0, (game.hintTimer || 0) - dt);
    updateCamera(dt);

    if (game.dying) {
      game.deathTimer += dt;
      if (game.deathTimer >= 1.55) {
        game.mode = "over";
        game.overTimer = 0;
      }
    } else if (game.player && game.player.dead) {
      game.dying = true;
      game.deathTimer = 0;
    }

    if (game.player) {
      if (game.player.hp > 0 && game.player.comboTimer > 0) {
        // combo timer bookkeeping handled above
      }
    }
  }

  // clean up any dead projectiles removed out of bounds already handled
  // consume discrete press flags
  for (const k in input.pressed) input.pressed[k] = false;
}

/* ===== 70-scene.js ===== */
/* ============================================================
   Scene rendering: sky, moon, parallax, stage, player figure
   ============================================================ */

const PC = {
  coat: "#1b2030",
  coatLight: "#272e44",
  coatDark: "#0e111b",
  lining: "#8e2036",
  liningLight: "#d34152",
  skin: "#e5d8c2",
  mask: "#f0e7d5",
  maskShadow: "#c8b99f",
  hair: "#14131a",
  scarf: "#cb2e49",
  scarfLight: "#ff6f75",
  gold: "#c7a45e",
  goldLight: "#f3d58e",
  boot: "#17161d",
  blade: "#e7eef0",
  bladeDim: "#aebec4",
  glow: "#ff596a",
};

const BG = makeScenery();

function makeScenery() {
  const rng = mulberry32(0x5eed9a1);
  const stars = [];
  for (let i = 0; i < 110; i++) {
    stars.push({
      x: rng(),
      y: rng() * 0.62,
      r: 0.4 + rng() * 1.5,
      phase: rng() * TAU,
      speed: 0.4 + rng() * 1.2,
      warm: rng() < 0.18,
    });
  }
  const bamboo = [];
  for (let i = 0; i < 46; i++) {
    bamboo.push({
      x: rng(),
      depth: 0.22 + rng() * 0.4,
      h: 150 + rng() * 260,
      w: 1.2 + rng() * 2.3,
      phase: rng() * TAU,
      sway: 2 + rng() * 5,
      leaves: 2 + Math.floor(rng() * 4),
      leafSeed: rng() * 100,
    });
  }
  const grass = [];
  for (let i = 0; i < 60; i++) {
    grass.push({ x: rng(), h: 12 + rng() * 34, w: 1 + rng() * 2, phase: rng() * TAU, lean: (rng() - 0.5) * 6 });
  }
  const groundCracks = [];
  const grng = mulberry32(0x1234abcd);
  for (let i = 0; i < 130; i++) {
    groundCracks.push({
      x: grng() * WORLD_W,
      y: GROUND_Y + 8 + grng() * 80,
      len: 10 + grng() * 38,
      ang: -0.6 + grng() * 1.2,
      branches: grng() < 0.4 ? 1 : 0,
      seed: grng() * 10,
    });
  }
  const slabs = [];
  for (let i = 0; i < 60; i++) {
    slabs.push({ x: grng() * WORLD_W, w: 30 + grng() * 80, y: 6 + grng() * 60, a: 0.02 + grng() * 0.04 });
  }
  const pagodas = [];
  for (let i = 0; i < 4; i++) {
    pagodas.push({
      x: 0.06 + i * 0.29 + (i === 1 ? 0.1 : 0) + (i === 3 ? -0.08 : 0),
      base: 0.78 + (i % 2) * 0.04,
      scale: 0.55 + i * 0.08,
      depth: 0.06 + (i % 3) * 0.035,
      windows: i === 1 || i === 2,
    });
  }
  const mistBands = [];
  for (let i = 0; i < 5; i++) {
    mistBands.push({ y: 0.72 + i * 0.045, h: 10 + rng() * 22, speed: 0.3 + rng() * 0.7, phase: rng() * TAU, alpha: 0.02 + rng() * 0.035 });
  }
  const embers = [];
  for (let i = 0; i < 28; i++) {
    embers.push({ x: rng(), y: 0.3 + rng() * 0.7, speed: 0.006 + rng() * 0.02, phase: rng() * TAU, size: 0.6 + rng() * 1.8, drift: 0.2 + rng() * 0.7 });
  }
  return { stars, bamboo, grass, groundCracks, slabs, pagodas, mistBands, embers };
}

function screenBackground() {
  const w = view.w;
  const h = view.h;
  const sc = view.scale;
  const camFrac = game.camera.x / Math.max(1, WORLD_W);
  const groundY = (GROUND_Y - view.camY) * sc;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#04050d");
  sky.addColorStop(0.35, "#080817");
  sky.addColorStop(0.62, "#160b17");
  sky.addColorStop(0.82, "#28111c");
  sky.addColorStop(1, "#160c12");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // faint red nebula wash
  const neb = ctx.createRadialGradient(w * 0.72, h * 0.3, 0, w * 0.72, h * 0.3, w * 0.55);
  neb.addColorStop(0, "rgba(128,26,44,0.12)");
  neb.addColorStop(0.55, "rgba(70,16,32,0.05)");
  neb.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, w, h);

  // stars
  for (const st of BG.stars) {
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(game.realTime * st.speed + st.phase));
    const x = ((st.x - camFrac * 0.02) % 1 + 1) % 1 * w;
    const y = st.y * (groundY * 0.92);
    ctx.globalAlpha = tw * (st.warm ? 0.6 : 0.42);
    ctx.fillStyle = st.warm ? "#e6a28c" : "#d9e2ef";
    ctx.beginPath();
    ctx.arc(x, y, st.r * Math.max(0.7, sc * 0.85), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // moon
  const moonX = w * 0.735 - (camFrac - 0.5) * w * 0.09;
  const moonY = h * 0.225;
  const moonR = Math.min(w, h) * 0.155;
  const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.55, moonX, moonY, moonR * 2.7);
  halo.addColorStop(0, "rgba(255,120,100,0.18)");
  halo.addColorStop(0.35, "rgba(200,64,80,0.08)");
  halo.addColorStop(1, "rgba(120,20,40,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  const mg = ctx.createRadialGradient(moonX - moonR * 0.25, moonY - moonR * 0.3, moonR * 0.08, moonX, moonY, moonR);
  mg.addColorStop(0, "#ffe3ca");
  mg.addColorStop(0.28, "#f4b39d");
  mg.addColorStop(0.62, "#c85a60");
  mg.addColorStop(0.86, "#8b2d40");
  mg.addColorStop(1, "#5a1a2c");
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, TAU);
  ctx.fill();

  // moon blotches
  ctx.save();
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, TAU);
  ctx.clip();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#6c2635";
  ctx.beginPath();
  ctx.ellipse(moonX - moonR * 0.3, moonY - moonR * 0.2, moonR * 0.28, moonR * 0.14, -0.4, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(moonX + moonR * 0.18, moonY + moonR * 0.33, moonR * 0.34, moonR * 0.16, 0.3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(moonX + moonR * 0.3, moonY - moonR * 0.35, moonR * 0.2, moonR * 0.09, 0.7, 0, TAU);
  ctx.fill();
  ctx.restore();
  // moon rim
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(255,196,160,0.28)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR - 0.5, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // soft cloud haze crossing the moon
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const cy = moonY - moonR * 0.34 + i * moonR * 0.33;
    const cw = moonR * (1.35 + i * 0.3);
    const grad = ctx.createRadialGradient(
      moonX + Math.sin(game.realTime * 0.035 + i * 2.1) * moonR * 0.12, cy, 0,
      moonX + Math.sin(game.realTime * 0.035 + i * 2.1) * moonR * 0.12, cy, cw
    );
    grad.addColorStop(0, "rgba(14,10,18,0.18)");
    grad.addColorStop(0.55, "rgba(14,10,18,0.11)");
    grad.addColorStop(1, "rgba(14,10,18,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(moonX + (i - 1) * moonR * 0.12, cy, cw, moonR * (0.09 + i * 0.03), -0.06 + i * 0.05, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  const horizon = groundY - 92 * sc;

  // distant mountains
  ridge(horizon + 6 * sc, h, 120 * sc, 0.011, camFrac, 0.035, 0.35, "#0a0b18", 0);
  ridge(horizon + 18 * sc, h, 90 * sc, 0.016, camFrac, 0.07, 1.7, "#0d0d1c", 0.06);
  ridge(horizon + 34 * sc, h, 60 * sc, 0.023, camFrac, 0.12, 3.4, "#110f1d", 0.1);

  // pagodas
  for (const pg of BG.pagodas) {
    const px = ((pg.x - camFrac * pg.depth * 4) % 1.2 + 1.2) % 1.2 * w - w * 0.08;
    if (px < -w * 0.15 || px > w * 1.1) continue;
    drawPagoda(px, groundY - 48 * sc, pg.scale * sc * Math.min(w / 960, 1.6), pg.windows);
  }

  // bamboo forest
  drawBamboo(camFrac, groundY, horizon, sc);

  // mist
  for (const mb of BG.mistBands) {
    const y = h * mb.y;
    const off = (game.realTime * mb.speed * 12 + Math.sin(mb.phase + game.realTime * 0.2) * 20) % (w + 300);
    const grad = ctx.createLinearGradient(0, y - mb.h, 0, y + mb.h);
    grad.addColorStop(0, "rgba(190,140,140,0)");
    grad.addColorStop(0.5, `rgba(180,120,130,${mb.alpha})`);
    grad.addColorStop(1, "rgba(190,140,140,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(-100 + off * 0.1, y - mb.h, w + 200, mb.h * 2);
  }

  // ambient drifting embers in screen space
  for (const em of BG.embers) {
    const t = game.realTime;
    const x = ((em.x + Math.sin(t * 0.13 + em.phase) * 0.03 - camFrac * 0.06 * em.drift) % 1 + 1) % 1 * w;
    const y = ((em.y - t * em.speed * 0.06) % 1 + 1) % 1 * (groundY + 20);
    const a = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + em.phase));
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, x, y, em.size * 4 * Math.max(0.7, sc), "#ffb27a", 0.7);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.globalAlpha = 1;
}

function ridge(baseY, h, amp, freq, camFrac, speed, phase, color, rim) {
  const w = view.w;
  const off = camFrac * w * speed;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 12; x += 12) {
    const xx = x + off;
    const y = baseY
      - Math.sin(xx * freq + phase) * amp
      - Math.sin(xx * freq * 2.37 + phase * 1.7) * amp * 0.34
      - Math.sin(xx * freq * 0.47 + phase * 0.6) * amp * 0.5
      - amp * 0.35;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (rim > 0) {
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#b27a84";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPagoda(x, baseY, s, windows) {
  ctx.save();
  ctx.translate(x, baseY);
  const col = "rgba(10,9,16,0.92)";
  ctx.fillStyle = col;
  // base
  ctx.fillRect(-18 * s, -8 * s, 36 * s, 10 * s);
  for (let i = 0; i < 4; i++) {
    const y = -8 * s - i * 22 * s;
    const width = (34 - i * 6) * s;
    ctx.fillRect(-5 * s, y - 16 * s, 10 * s, 18 * s);
    // roof
    ctx.beginPath();
    ctx.moveTo(-width * 0.7, y - 14 * s);
    ctx.quadraticCurveTo(-width * 0.25, y - 20 * s, 0, y - 24 * s);
    ctx.quadraticCurveTo(width * 0.25, y - 20 * s, width * 0.7, y - 14 * s);
    ctx.quadraticCurveTo(width * 0.45, y - 11 * s, width * 0.3, y - 12 * s);
    ctx.lineTo(-width * 0.3, y - 12 * s);
    ctx.quadraticCurveTo(-width * 0.45, y - 11 * s, -width * 0.7, y - 14 * s);
    ctx.closePath();
    ctx.fill();
    if (windows) {
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(game.realTime * 1.2 + i);
      ctx.fillStyle = "#d98a5c";
      ctx.fillRect(-1.8 * s, y - 8 * s, 1.6 * s, 2.2 * s);
      ctx.fillRect(1.0 * s, y - 8 * s, 1.6 * s, 2.2 * s);
      ctx.fillStyle = col;
      ctx.globalAlpha = 1;
    }
  }
  // finial
  ctx.fillStyle = col;
  ctx.fillRect(-0.8 * s, -116 * s, 1.6 * s, 18 * s);
  ctx.beginPath();
  ctx.arc(0, -118 * s, 2 * s, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBamboo(camFrac, groundY, horizon, sc) {
  const w = view.w;
  for (const b of BG.bamboo) {
    const parallax = b.depth;
    let x = (((b.x - camFrac * parallax * 0.9) % 1) + 1) % 1 * w;
    if (x < -40 || x > w + 40) continue;
    const sway = Math.sin(game.realTime * 0.55 + b.phase) * b.sway * (0.6 + parallax);
    const topY = groundY - b.h * (0.5 + parallax * 0.65) * Math.max(0.75, sc);
    const alpha = 0.18 + parallax * 0.5;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#0c0b13";
    ctx.lineWidth = b.w * Math.max(0.7, sc);
    ctx.beginPath();
    ctx.moveTo(x, groundY + 4);
    ctx.quadraticCurveTo(x + sway * 0.4, (groundY + topY) / 2, x + sway, topY);
    ctx.stroke();
    // nodes
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      const nx = x + sway * t * t;
      const ny = lerp(groundY + 4, topY, t);
      ctx.beginPath();
      ctx.moveTo(nx - 2.2 * sc, ny);
      ctx.lineTo(nx + 2.2 * sc, ny);
      ctx.stroke();
    }
    // leaves
    const lrng = mulberry32(b.leafSeed * 1000);
    for (let i = 0; i < b.leaves; i++) {
      const t = 0.45 + lrng() * 0.5;
      const nx = x + sway * t * t;
      const ny = lerp(groundY, topY, t);
      const dir = i % 2 === 0 ? 1 : -1;
      ctx.save();
      ctx.translate(nx, ny);
      ctx.rotate(dir * 0.55 + Math.sin(game.realTime * 0.7 + i + b.phase) * 0.12);
      ctx.fillStyle = "#0d0c14";
      ctx.beginPath();
      ctx.ellipse(dir * 5 * Math.max(0.7, sc), 0, 8 * Math.max(0.7, sc), 1.6 * Math.max(0.7, sc), dir * 0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function worldTransform() {
  const s = view.scale * view.dpr;
  const cam = game.camera;
  ctx.setTransform(s, 0, 0, s, (-cam.x + cam.shakeX) * s, (-view.camY + cam.shakeY) * s);
}

function screenTransform() {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

/* ---------------- stage ---------------- */
function drawStage() {
  const x0 = game.camera.x - 160;
  const x1 = game.camera.x + view.viewW + 160;
  const bottom = view.camY + view.viewH + 120;

  // torii gates at the arena edges
  drawTorii(78, GROUND_Y + 2, 1.08);
  drawTorii(WORLD_W - 78, GROUND_Y + 2, 1.08);

  // ground body
  const g = ctx.createLinearGradient(0, GROUND_Y - 2, 0, bottom);
  g.addColorStop(0, "#211a18");
  g.addColorStop(0.16, "#191416");
  g.addColorStop(0.55, "#0e0c11");
  g.addColorStop(1, "#07060a");
  ctx.fillStyle = g;
  ctx.fillRect(x0, GROUND_Y - 2, x1 - x0, bottom - GROUND_Y + 2);

  // top stone lip
  ctx.fillStyle = "#33291f";
  ctx.fillRect(x0, GROUND_Y - 3, x1 - x0, 4);
  ctx.fillStyle = "rgba(205,180,140,0.25)";
  ctx.fillRect(x0, GROUND_Y - 3, x1 - x0, 1);
  ctx.fillStyle = "rgba(255,120,90,0.07)";
  ctx.fillRect(x0, GROUND_Y + 1, x1 - x0, 2);

  // stone slabs
  const startX = Math.floor(x0 / 92) * 92;
  for (let x = startX; x < x1; x += 92) {
    ctx.strokeStyle = "rgba(180,155,120,0.055)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 2);
    ctx.lineTo(x + 3, GROUND_Y + 30);
    ctx.lineTo(x - 2, GROUND_Y + 72);
    ctx.lineTo(x + 4, bottom);
    ctx.stroke();
  }
  const s0 = Math.floor(x0 / 140) * 140;
  for (let x = s0; x < x1; x += 140) {
    ctx.strokeStyle = "rgba(180,155,120,0.04)";
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 38);
    ctx.lineTo(x + 110, GROUND_Y + 40);
    ctx.stroke();
  }

  // cracks / moss
  for (const c of BG.groundCracks) {
    if (c.x < x0 - 40 || c.x > x1 + 40) continue;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.ang);
    ctx.strokeStyle = "rgba(8,7,10,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-c.len / 2, 0);
    ctx.lineTo(-c.len * 0.15, 1.5);
    ctx.lineTo(c.len * 0.2, -1);
    ctx.lineTo(c.len / 2, 1);
    ctx.stroke();
    if (c.branches) {
      ctx.beginPath();
      ctx.moveTo(-c.len * 0.1, 0);
      ctx.lineTo(c.len * 0.05, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // subtle slab shading & pebbles
  for (const sl of BG.slabs) {
    if (sl.x < x0 || sl.x > x1) continue;
    ctx.fillStyle = `rgba(120,104,84,${sl.a})`;
    ctx.beginPath();
    ctx.ellipse(sl.x, GROUND_Y + sl.y, sl.w * 0.5, 3.5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(205,180,145,0.09)";
  for (let i = 0; i < 24; i++) {
    const px = ((i * 137.3) % (x1 - x0)) + x0;
    ctx.beginPath();
    ctx.ellipse(px, GROUND_Y + 9 + (i % 5) * 13, 2 + (i % 3), 1, 0, 0, TAU);
    ctx.fill();
  }
  // pale moonlight streak on the stone
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const sheen = ctx.createLinearGradient(x0, 0, x1, 0);
  sheen.addColorStop(0, "rgba(255,160,130,0)");
  sheen.addColorStop(0.42, "rgba(255,160,130,0.025)");
  sheen.addColorStop(0.6, "rgba(255,180,140,0.05)");
  sheen.addColorStop(1, "rgba(255,160,130,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(x0, GROUND_Y + 1, x1 - x0, 2);
  ctx.restore();

  // lantern light pools
  for (const lx of [255, WORLD_W - 255]) {
    if (lx < x0 - 80 || lx > x1 + 80) continue;
    drawStoneLantern(lx, GROUND_Y);
  }
}

function drawTorii(x, baseY, s) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(s, s);
  const dark = "rgba(12,10,15,0.96)";
  ctx.fillStyle = dark;
  // pillars
  ctx.fillRect(-54, -160, 8, 160);
  ctx.fillRect(46, -160, 8, 160);
  // lower beam
  ctx.fillRect(-68, -142, 136, 7);
  // upper curved beam
  ctx.beginPath();
  ctx.moveTo(-82, -172);
  ctx.quadraticCurveTo(0, -158, 82, -172);
  ctx.quadraticCurveTo(0, -148, -82, -172);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-68, -162, 136, 4);
  // plaque
  ctx.fillRect(-9, -164, 18, 12);
  ctx.fillStyle = "rgba(120,30,40,0.22)";
  ctx.fillRect(-54, -160, 8, 4);
  ctx.fillRect(46, -160, 8, 4);
  ctx.restore();
}

function drawStoneLantern(x, baseY) {
  const flicker = 0.7 + 0.3 * Math.sin(game.realTime * 7.3 + x) * Math.sin(game.realTime * 2.1 + x * 0.03);
  ctx.save();
  ctx.translate(x, baseY);
  // post & housing silhouettes
  ctx.fillStyle = "rgba(8,7,10,0.94)";
  ctx.fillRect(-5, -54, 10, 54);
  ctx.fillRect(-12, -66, 24, 6);
  ctx.fillRect(-9, -88, 18, 20);
  ctx.beginPath();
  ctx.moveTo(-18, -88);
  ctx.lineTo(0, -102);
  ctx.lineTo(18, -88);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-2, -102, 4, 8);
  // glow
  ctx.globalCompositeOperation = "lighter";
  glowCircle(ctx, 0, -78, 30, "#ff9a55", 0.28 * flicker);
  ctx.fillStyle = `rgba(255,168,96,${0.55 * flicker})`;
  ctx.fillRect(-5, -82, 10, 10);
  // light pool
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 100);
  pool.addColorStop(0, `rgba(255,126,70,${0.13 * flicker})`);
  pool.addColorStop(1, "rgba(255,126,70,0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(0, 0, 100, 18, 0, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function drawShadowAt(x, groundY, width, alpha) {
  const g = ctx.createRadialGradient(x, groundY, 0, x, groundY, width);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.55})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, groundY - 1, width, width * 0.28, 0, 0, TAU);
  ctx.fill();
}

/* ---------------- player draw ---------------- */
function drawScarf(p) {
  const pts = p.scarf;
  if (!pts || pts.length < 3) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  const n = pts.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const w = lerp(5.6, 0.8, i / (n - 1));
    left.push({ x: pts[i].x - dy * w, y: pts[i].y + dx * w });
    right.push({ x: pts[i].x + dy * w, y: pts[i].y - dx * w });
  }
  const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[n - 1].x, pts[n - 1].y);
  grad.addColorStop(0, "#e33a52");
  grad.addColorStop(0.35, "#b8213c");
  grad.addColorStop(1, "rgba(84,10,24,0.55)");
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.shadowColor = "rgba(255,60,80,0.5)";
  ctx.shadowBlur = 7;
  ctx.fill();
  ctx.shadowBlur = 0;
  // bright edge
  ctx.strokeStyle = "rgba(255,140,140,0.45)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const p = game.player;
  if (!p) return;
  const alt = Math.max(0, GROUND_Y - p.y);
  const shadowAlpha = clamp(0.36 - alt * 0.0009, 0.08, 0.36);
  const shadowW = clamp(27 - alt * 0.03, 12, 27);
  drawShadowAt(p.x, GROUND_Y, shadowW, shadowAlpha);

  // air slash winds
  if (!p.grounded && Math.abs(p.vy) > 500) {
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = "#d6e4ea";
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(p.x - 9 + i * 12, p.y - 50 + i * 7);
      ctx.lineTo(p.x - 5 + i * 12, p.y - 12 + i * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawScarf(p);
  if (p.state === "skill") drawSkillAura(p);
  const pose = computePlayerPose(p);

  // dash speed lines
  if (p.state === "dash") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const yy = p.y - 12 - i * 11;
      const len = 34 + Math.random() * 30;
      ctx.globalAlpha = 0.12 + Math.random() * 0.12;
      ctx.strokeStyle = "#ff7d86";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.dashDir * (18 + Math.random() * 10), yy);
      ctx.lineTo(p.x - p.dashDir * (18 + len), yy - 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // charge aura
  if (p.state === "charge") {
    const lv = p.chargeLevel;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pulse = 0.7 + 0.3 * Math.sin(game.time * 18);
    glowCircle(ctx, p.x, p.y - 36, 42 + lv * 28, lv > 0.8 ? "#ffc06a" : "#ff5c58", (0.1 + lv * 0.16) * pulse);
    ctx.globalAlpha = 0.35 + lv * 0.3;
    ctx.strokeStyle = lv > 0.8 ? "#ffe0a0" : "#ff7a68";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 28 + lv * 20, -0.4 + game.time * 2, 0.7 + game.time * 2);
    ctx.stroke();
    ctx.restore();
  }

  // parry flash
  if (p.parryFlash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, p.x + p.facing * 14, p.y - 40, 40, "#ffe3a2", p.parryFlash * 0.3);
    ctx.globalAlpha = p.parryFlash * 0.8;
    ctx.strokeStyle = "#fff2c8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x + p.facing * 14, p.y - 40, 34 + (1 - p.parryFlash) * 32, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  let alpha = 1;
  if (p.hurtFlash > 0.6 && p.iframes > 0.1) {
    alpha = 0.72 + 0.28 * Math.sin(game.realTime * 55);
  }
  if (p.state === "skill" && p.skill && p.skill.id === 2) {
    if (p.skill.t < 0.13) alpha = 0.08;
    else if (p.skill.t < 0.23) alpha = 0.7;
  }
  drawPlayerFigure(pose, {
    alpha,
    animTime: p.animTime,
    flash: p.hurtFlash,
    chargeLevel: p.chargeLevel,
    state: p.state,
  });

  // interaction hint glint at first sight
  if (game.mode === "title") {
    // subtle idle glow
  }
}

function drawPlayerFigure(pose, opts = {}) {
  const ghost = !!opts.ghost;
  const alpha = (opts.alpha != null ? opts.alpha : 1) * (ghost ? 0.52 : 1);
  const t = opts.animTime != null ? opts.animTime : game.time;
  const flash = opts.flash || 0;
  const C = ghost ? null : PC;
  const col = (c) => {
    if (ghost) return "rgba(255,82,102,0.9)";
    if (flash > 0.01) return mixHex(c, "#ffffff", Math.min(0.7, flash * 0.8));
    return c;
  };
  const dark = ghost ? "rgba(130,22,42,0.75)" : col(PC.coatDark);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pose.x, pose.y);
  ctx.scale(pose.facing, 1);
  if (pose.spin) {
    ctx.translate(0, -32);
    ctx.rotate(pose.spin);
    ctx.translate(0, 32);
  }

  // coat tails (behind)
  drawPlayerCoatTails(pose, ghost, t, col);

  // back leg
  drawPlayerLeg(pose, "L", ghost, col, dark);
  // back arm
  drawPlayerArm(pose, "L", ghost, col, dark);

  // torso
  drawPlayerTorso(pose, ghost, col, dark);

  // head
  drawPlayerHead(pose, ghost, t, col, dark, flash);

  // front leg
  drawPlayerLeg(pose, "R", ghost, col, dark);

  // front arm + sword
  drawPlayerArm(pose, "R", ghost, col, dark);
  drawPlayerSword(pose, ghost, opts, col, dark, t);

  ctx.restore();
}

function drawPlayerCoatTails(pose, ghost, t, col) {
  const hip = pose.hip;
  const sway = Math.sin(t * 3.1) * 2.5 + (pose.state === "dash" ? -7 : 0);
  const sway2 = Math.cos(t * 2.3 + 1) * 2;
  const baseY = hip.y + 2;
  const tail1 = [
    { x: hip.x - 4, y: baseY - 2 },
    { x: hip.x - 15 + sway * 0.2, y: baseY + 16 },
    { x: hip.x - 30 + sway, y: baseY + 34 + sway2 },
    { x: hip.x - 20 + sway * 0.5, y: baseY + 22 },
    { x: hip.x + 2, y: baseY + 6 },
  ];
  const tail2 = [
    { x: hip.x - 2, y: baseY - 1 },
    { x: hip.x - 8 + sway2 * 0.2, y: baseY + 17 },
    { x: hip.x - 17 + sway * 0.7, y: baseY + 30 + sway },
    { x: hip.x - 8, y: baseY + 20 },
    { x: hip.x + 3, y: baseY + 6 },
  ];
  ctx.fillStyle = col(PC.coatDark);
  poly(ctx, tail1, col(PC.coatDark));
  poly(ctx, tail2, col(PC.coat));
  // red lining
  ctx.save();
  ctx.globalAlpha *= 0.85;
  poly(ctx, [
    { x: tail1[1].x + 1, y: tail1[1].y - 2 },
    { x: tail1[2].x + 1, y: tail1[2].y - 3 },
    { x: tail1[2].x + 7, y: tail1[2].y - 5 },
    { x: tail1[1].x + 6, y: tail1[1].y - 1 },
  ], ghost ? "rgba(255,120,130,0.3)" : PC.lining);
  ctx.restore();
}

function drawPlayerLeg(pose, side, ghost, col, dark) {
  const hip = side === "R" ? pose.hipR : pose.hipL;
  const knee = side === "R" ? pose.kneeR : pose.kneeL;
  const foot = side === "R" ? pose.footR : pose.footL;
  const back = side === "L";
  const cloth = back ? col(PC.coatDark) : col(PC.coat);
  const inner = back ? dark : col(PC.boot);
  // thigh
  lineRod(ctx, hip, knee, 10.5, dark);
  lineRod(ctx, hip, knee, 7.8, cloth);
  // shin
  lineRod(ctx, knee, foot, 7.6, dark);
  lineRod(ctx, knee, foot, 5.4, inner);
  // knee highlight
  if (!ghost) {
    ctx.globalAlpha *= 0.5;
    circle(ctx, knee.x, knee.y, 1.6, "#8090a0");
    ctx.globalAlpha /= 0.5;
  }
  // foot / boot
  const dir = foot.x - knee.x >= 0 ? 1 : 1;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(foot.x + 4.4, foot.y - 2.2, 7.2, 3.4, 0, 0, TAU);
  ctx.fill();
  if (!ghost) {
    ctx.fillStyle = col(PC.boot);
    ctx.beginPath();
    ctx.ellipse(foot.x + 4.2, foot.y - 2.6, 6.2, 2.6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(200,170,110,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(foot.x + 1, foot.y - 4);
    ctx.lineTo(foot.x + 8, foot.y - 4);
    ctx.stroke();
  }
}

function drawPlayerArm(pose, side, ghost, col, dark) {
  const sh = side === "R" ? pose.shoulderR : pose.shoulderL;
  const el = side === "R" ? pose.elbowR : pose.elbowL;
  const hand = side === "R" ? pose.handR : pose.handL;
  const back = side === "L";
  // sleeve from shoulder to elbow
  lineRod(ctx, sh, el, 9.2, dark);
  lineRod(ctx, sh, el, 6.6, back ? col(PC.coatDark) : col(PC.coatLight));
  // forearm
  lineRod(ctx, el, hand, 5.8, dark);
  lineRod(ctx, el, hand, 3.9, back ? col(PC.coatDark) : col(PC.coat));
  // cuff
  if (!ghost) {
    ctx.globalAlpha *= 0.6;
    lineRod(ctx, pointAlong(el, hand, 0.82), pointAlong(el, hand, 0.9), 5.2, PC.gold);
    ctx.globalAlpha /= 0.6;
  }
  // hand
  ctx.fillStyle = dark;
  circle(ctx, hand.x, hand.y, 3.6, dark);
  if (!ghost) {
    circle(ctx, hand.x, hand.y, 2.4, col(PC.skin));
    ctx.fillStyle = "rgba(74,52,44,0.8)";
    ctx.beginPath();
    ctx.ellipse(hand.x + 0.4, hand.y, 2.1, 1.1, 0, 0, TAU);
    ctx.fill();
  }
  // shoulder pad (front side only)
  if (!back) {
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(-0.2);
    poly(ctx, [
      { x: -5.2, y: -3.4 },
      { x: 5.4, y: -2.4 },
      { x: 5.8, y: 2.4 },
      { x: -4.2, y: 3.2 },
    ], dark);
    poly(ctx, [
      { x: -3.6, y: -2.4 },
      { x: 3.4, y: -1.7 },
      { x: 3.8, y: 1.2 },
      { x: -3, y: 1.8 },
    ], ghost ? "rgba(255,90,110,0.5)" : PC.coatLight);
    ctx.strokeStyle = ghost ? "rgba(255,120,130,0.4)" : "rgba(199,164,94,0.55)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayerTorso(pose, ghost, col, dark) {
  const hip = pose.hip;
  const chest = pose.chest;
  const sL = pose.shoulderL;
  const sR = pose.shoulderR;
  const torso = [
    { x: sL.x - 1.5, y: sL.y - 2 },
    { x: sR.x + 2, y: sR.y - 2 },
    { x: chest.x + 7.2, y: chest.y + 5 },
    { x: hip.x + 8, y: hip.y + 1 },
    { x: hip.x - 7.4, y: hip.y + 2 },
    { x: chest.x - 7.6, y: chest.y + 7 },
  ];
  // dark under-coat
  poly(ctx, torso, dark);
  // main wrap
  const inner = ghost ? "rgba(255,82,102,0.8)" : col(PC.coat);
  poly(ctx, [
    { x: sL.x, y: sL.y - 0.5 },
    { x: sR.x + 0.5, y: sR.y - 0.5 },
    { x: chest.x + 5.8, y: chest.y + 6 },
    { x: hip.x + 6.4, y: hip.y },
    { x: hip.x - 5.6, y: hip.y + 1 },
    { x: chest.x - 6.2, y: chest.y + 6 },
  ], inner);
  // exposed crimson lining down the front
  ctx.save();
  ctx.globalAlpha *= 0.9;
  poly(ctx, [
    { x: chest.x + 2.4, y: chest.y + 2 },
    { x: chest.x + 6.2, y: chest.y + 7 },
    { x: hip.x + 6.4, y: hip.y - 2 },
    { x: hip.x + 2.2, y: hip.y - 2 },
    { x: chest.x - 1, y: chest.y + 9 },
  ], ghost ? "rgba(255,150,150,0.35)" : PC.lining);
  ctx.restore();
  // sash
  ctx.fillStyle = ghost ? "rgba(180,40,60,0.7)" : PC.lining;
  ctx.save();
  ctx.translate(hip.x, hip.y - 2);
  ctx.rotate(pose.lean * 0.4);
  ctx.fillRect(-9, -2.4, 18, 4.4);
  ctx.fillStyle = ghost ? "rgba(255,120,130,0.5)" : PC.gold;
  ctx.fillRect(-1.6, -3.2, 3.2, 6);
  ctx.restore();
  // diagonal chest strap
  ctx.strokeStyle = ghost ? "rgba(255,120,130,0.35)" : "rgba(151,70,55,0.65)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(chest.x - 5, chest.y + 3);
  ctx.lineTo(chest.x + 5, chest.y + 15);
  ctx.stroke();
  // moonlight rim
  if (!ghost) {
    ctx.save();
    ctx.globalAlpha *= 0.55;
    ctx.strokeStyle = "rgba(174,205,225,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chest.x - 6.4, chest.y + 4);
    ctx.quadraticCurveTo(chest.x - 8, hip.y - 6, hip.x - 7, hip.y - 1);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayerHead(pose, ghost, t, col, dark, flash) {
  const h = pose.head;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(pose.headTilt + pose.lean * 0.25);
  // hair mass
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-1.4, 0.8, 8.8, 9.2, -0.15, 0, TAU);
  ctx.fill();
  // topknot / tied hair
  ctx.fillStyle = ghost ? "rgba(255,100,110,0.8)" : PC.hair;
  ctx.beginPath();
  ctx.ellipse(-4.5, -8.4, 5.6, 2.8, -0.55, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, -8);
  ctx.quadraticCurveTo(-14, -13, -9, -4);
  ctx.quadraticCurveTo(-7, -5, -5, -6);
  ctx.closePath();
  ctx.fill();
  // mask
  const maskGrad = ctx.createLinearGradient(0, -6, 0, 8);
  if (ghost) {
    maskGrad.addColorStop(0, "rgba(255,160,160,0.5)");
    maskGrad.addColorStop(1, "rgba(255,90,100,0.35)");
  } else {
    maskGrad.addColorStop(0, flash > 0.01 ? "#ffffff" : "#f2ead9");
    maskGrad.addColorStop(1, flash > 0.01 ? "#ffffff" : "#cdbfa7");
  }
  ctx.fillStyle = maskGrad;
  ctx.beginPath();
  ctx.ellipse(2.2, 0.4, 6.4, 7.6, -0.06, 0, TAU);
  ctx.fill();
  // mask brow / snout shading
  ctx.strokeStyle = "rgba(74,58,48,0.5)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(5.2, -4.4);
  ctx.quadraticCurveTo(7.4, -1.8, 6.2, 1.2);
  ctx.stroke();
  // eye slits
  if (!ghost) {
    ctx.fillStyle = "#1a1518";
    ctx.beginPath();
    ctx.ellipse(2.2, -1.4, 3.1, 0.9, -0.08, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-1.9, -1.1, 1.9, 0.8, 0.08, 0, TAU);
    ctx.fill();
    // glowing eye
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 3.4, -1, 4.5, "#ff5964", 0.5);
    ctx.fillStyle = "rgba(255,190,160,0.95)";
    ctx.beginPath();
    ctx.ellipse(3.4, -1.4, 1.15, 0.65, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // red marking
    ctx.strokeStyle = "rgba(160,30,48,0.8)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(4.6, 0.2);
    ctx.lineTo(6.4, 3.4);
    ctx.lineTo(5.2, 6.2);
    ctx.stroke();
    // mouth line
    ctx.strokeStyle = "rgba(70,54,48,0.45)";
    ctx.beginPath();
    ctx.moveTo(2.2, 4.2);
    ctx.lineTo(4.4, 4.5);
    ctx.stroke();
  }
  // hood shadow / rim
  ctx.save();
  ctx.globalAlpha *= 0.6;
  ctx.strokeStyle = "rgba(190,215,235,0.5)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(0, -1, 8.2, -2.4, -0.6);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawPlayerSword(pose, ghost, opts, col, dark, t) {
  const hand = pose.handR;
  const ang = pose.bladeAngle;
  const len = pose.bladeLen;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const px = -dy;
  const py = dx;
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(ang);
  // handle
  ctx.strokeStyle = dark;
  ctx.lineWidth = 4.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(3, 0);
  ctx.stroke();
  if (!ghost) {
    ctx.strokeStyle = "#51302f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();
    ctx.strokeStyle = PC.gold;
    ctx.lineWidth = 0.8;
    for (let i = -7; i < 2; i += 2.2) {
      ctx.beginPath();
      ctx.moveTo(i, -1.2);
      ctx.lineTo(i + 1.2, 1.2);
      ctx.stroke();
    }
    // pommel
    circle(ctx, -9, 0, 2.1, PC.gold);
  }
  // guard
  ctx.strokeStyle = ghost ? "rgba(255,140,150,0.6)" : PC.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(3, -4.2);
  ctx.lineTo(3, 4.2);
  ctx.stroke();
  // blade
  const base = 5;
  const tip = len;
  const baseW = 2.1;
  const tipW = 0.55;
  if (ghost) {
    ctx.strokeStyle = "rgba(255,110,120,0.8)";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(base, 0);
    ctx.lineTo(tip, 0);
    ctx.stroke();
  } else {
    ctx.save();
    const glow = (opts.state === "attack" || opts.state === "charge" || opts.state === "skill")
      ? 0.55 + (opts.chargeLevel || 0) * 0.4
      : 0.2 + 0.08 * Math.sin(t * 2.5);
    ctx.shadowColor = `rgba(255,74,92,${glow})`;
    ctx.shadowBlur = 8 + (opts.chargeLevel || 0) * 12;
    const bg = ctx.createLinearGradient(base, -baseW, tip, baseW * 0.4);
    bg.addColorStop(0, PC.bladeDim);
    bg.addColorStop(0.35, "#f5fbfb");
    bg.addColorStop(0.7, "#cfdde0");
    bg.addColorStop(1, "#f2f8f8");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(base, -baseW);
    ctx.lineTo(tip, -tipW);
    ctx.lineTo(tip + 1.4, 0);
    ctx.lineTo(tip, tipW * 1.4);
    ctx.lineTo(base, baseW);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // crimson edge
    ctx.strokeStyle = "rgba(255,72,88,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(base, baseW * 0.8);
    ctx.lineTo(tip - 1, tipW * 1.3);
    ctx.stroke();
    // cold highlight
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(base + 2, -baseW * 0.42);
    ctx.lineTo(tip - 2, -tipW * 0.4);
    ctx.stroke();
    // glint travelling down blade
    const glint = ((t * 1.6) % 3) / 3;
    if (glint < 0.24) {
      ctx.globalAlpha = Math.sin((glint / 0.24) * PI) * 0.8;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.8;
      const gx = lerp(base + 4, tip - 2, glint / 0.24);
      ctx.beginPath();
      ctx.moveTo(gx, -1.6);
      ctx.lineTo(gx + 5, 1.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  ctx.restore();
}

/* ---------------- afterimages ---------------- */
function drawAfterimages() {
  for (const a of game.afterimages) {
    const alpha = clamp(a.life / a.maxLife, 0, 1) * 0.42;
    if (alpha <= 0.01) continue;
    drawPlayerFigure(a.pose, { ghost: true, alpha, animTime: 0 });
  }
}

/* ---------------- projectiles ---------------- */
function drawProjectiles() {
  for (const pr of game.projectiles) {
    ctx.save();
    if (pr.type === "bolt") {
      // trail
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < (pr.trail || []).length; i++) {
        const tp = pr.trail[i];
        const al = clamp(tp.life / 0.18, 0, 1) * 0.35;
        ctx.globalAlpha = al;
        circle(ctx, tp.x, tp.y, pr.r * (0.35 + al * 0.5), pr.color);
      }
      ctx.globalAlpha = 1;
      glowCircle(ctx, pr.x, pr.y, 26, pr.color, 0.5);
      ctx.translate(pr.x, pr.y);
      ctx.rotate(pr.angle);
      // bolt
      ctx.fillStyle = "#c9fff6";
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-3, -3.6);
      ctx.lineTo(-1, 0);
      ctx.lineTo(-3, 3.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // energy tails
      ctx.strokeStyle = "rgba(143,242,224,0.7)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-14 - Math.random() * 4, -2);
      ctx.moveTo(-4, 0);
      ctx.lineTo(-12 - Math.random() * 4, 2);
      ctx.stroke();
    } else {
      // reflected blade wave (golden crescent)
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < (pr.trail || []).length; i++) {
        const tp = pr.trail[i];
        const al = clamp(tp.life / 0.18, 0, 1) * 0.22;
        ctx.globalAlpha = al;
        circle(ctx, tp.x, tp.y, 12, "#ffe3a0");
      }
      ctx.globalAlpha = 1;
      glowCircle(ctx, pr.x, pr.y, 30, "#ffca72", 0.5);
      ctx.translate(pr.x, pr.y);
      ctx.scale(pr.reflectDir, 1);
      ctx.fillStyle = "rgba(255,230,171,0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, 16, -1.2, 1.2);
      ctx.arc(0, 0, 9, 1.2, -1.2, true);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,240,0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/* ===== 72-enemy-draw.js ===== */
/* ============================================================
   Enemy rendering: segmented puppets, telegraphs, health pips
   ============================================================ */
function ec(e, color, extra = 0) {
  const f = clamp(e.flash * 1.25 + extra, 0, 1);
  if (f <= 0.02) return color;
  return mixHex(color, "#fff4e6", f * 0.72);
}

function drawEnemyShadows() {
  for (const e of game.enemies) {
    if (e.remove) continue;
    const alt = Math.max(0, GROUND_Y - e.y);
    const alpha = clamp(0.32 - alt * 0.0008, 0.05, 0.32) * (e.alive ? 1 : 0.5);
    drawShadowAt(e.x, GROUND_Y, clamp(25 * e.scale - alt * 0.02, 10, 30), alpha);
  }
}

function drawEnemies() {
  const dead = game.enemies.filter((e) => !e.alive).sort((a, b) => a.y - b.y);
  const alive = game.enemies.filter((e) => e.alive).sort((a, b) => a.y - b.y);
  for (const e of dead) drawEnemy(e);
  for (const e of alive) drawEnemy(e);
}

function drawEnemy(e) {
  if (!e.pose) e.pose = computeEnemyPose(e);
  const pose = e.pose;
  let alpha = 1;
  if (e.spawnT > 0) alpha = clamp(1 - e.spawnT / 0.55, 0, 1);
  if (!e.alive) {
    alpha = e.deathT < 0.9 ? 1 : clamp(1 - (e.deathT - 0.9) / 0.85, 0, 1);
    if (alpha <= 0.01) return;
  }
  if (e.invuln > 0 && e.spawnT <= 0 && e.alive) alpha *= 0.9;
  ctx.save();
  ctx.globalAlpha = alpha;

  // elite aura
  if (e.elite && e.alive) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, e.x, e.y - 34 * e.scale, 55 * e.scale, "#ffc95e", 0.09 + 0.03 * Math.sin(game.time * 3));
    ctx.restore();
  }

  ctx.translate(e.x, e.y);
  ctx.scale(e.facing, 1);

  const pal = e.palette;
  const s = e.scale;

  drawEnemyBackDecor(e, pose, pal, s);
  drawEnemyLeg(e, pose, "L", false, pal, s, alpha);
  drawEnemyArm(e, pose, "L", false, pal, s, alpha);
  drawEnemyTorso(e, pose, pal, s);
  drawEnemyHead(e, pose, pal, s);
  drawEnemyLeg(e, pose, "R", true, pal, s, alpha);
  drawEnemyArm(e, pose, "R", true, pal, s, alpha);
  drawEnemyWeapon(e, pose, pal, s);

  ctx.restore();

  // spawn glow
  if (e.spawnT > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const a = 0.2 + 0.25 * Math.sin(game.time * 30);
    glowCircle(ctx, e.x, e.y - 34 * e.scale, 50 * e.scale, e.palette.accent, a);
    ctx.restore();
  }
}

function drawEnemyBackDecor(e, pose, pal, s) {
  if (e.type === "axe") {
    // tattered back banner (sashimono)
    const sway = Math.sin(e.animTime * 2.1) * 2.5 * s;
    ctx.save();
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(-9 * s, pose.hip.y + 4);
    ctx.lineTo(-14 * s + sway, pose.hip.y - 64 * s);
    ctx.stroke();
    ctx.fillStyle = e.elite ? "#7c3426" : "#44231f";
    ctx.beginPath();
    ctx.moveTo(-13 * s + sway, pose.hip.y - 62 * s);
    ctx.lineTo(-1 * s + sway * 0.8, pose.hip.y - 58 * s);
    ctx.lineTo(-4 * s + sway * 0.6, pose.hip.y - 40 * s);
    ctx.lineTo(-15 * s + sway * 0.7, pose.hip.y - 44 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(pal.rope, 0.5);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // emblem
    ctx.globalAlpha *= 0.7;
    ctx.strokeStyle = e.elite ? "#ffd77e" : "#c5a887";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(-9 * s + sway, pose.hip.y - 53 * s, 3.2 * s, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9 * s + sway, pose.hip.y - 56 * s);
    ctx.lineTo(-9 * s + sway, pose.hip.y - 50 * s);
    ctx.stroke();
    ctx.restore();
  } else if (e.type === "bolt") {
    // quiver on the back
    ctx.save();
    ctx.translate(-9 * s, pose.chest.y + 14 * s);
    ctx.rotate(0.35);
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-3.5 * s, -8 * s, 7 * s, 22 * s);
    ctx.fillStyle = pal.wood;
    ctx.fillRect(-2.4 * s, -7 * s, 4.8 * s, 18 * s);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = "#b9b49a";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-1.8 * s + i * 1.8 * s, -8 * s);
      ctx.lineTo(-1.8 * s + i * 1.8 * s + 2 * s, -17 * s);
      ctx.stroke();
    }
    ctx.restore();
  } else if (e.type === "rend") {
    // whipping tail
    const t = e.animTime * 2.5;
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.moveTo(-5 * s, pose.hip.y + 2);
    ctx.quadraticCurveTo(-24 * s, pose.hip.y + 8 + Math.sin(t) * 4, -34 * s, pose.hip.y - 6 + Math.sin(t * 1.3) * 7);
    ctx.stroke();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 0.7 * s;
    ctx.beginPath();
    ctx.moveTo(-31 * s, pose.hip.y - 4 + Math.sin(t * 1.3) * 7);
    ctx.lineTo(-40 * s, pose.hip.y - 9 + Math.sin(t * 1.3) * 8);
    ctx.stroke();
  }
}

function drawEnemyJoint(e, pt, r, pal, isCore = false) {
  circle(ctx, pt.x, pt.y, r + 0.7, ec(e, pal.dark));
  circle(ctx, pt.x, pt.y, r, ec(e, pal.wood));
  circle(ctx, pt.x, pt.y, r * 0.48, ec(e, pal.accent, 0.2));
  if (isCore) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, pt.x, pt.y, r * 2.4, pal.accent, 0.3);
    ctx.restore();
  }
}

function crackSegment(e, part, a, b) {
  if (!part || part.broken) return;
  const ratio = part.hp / part.maxHp;
  if (ratio > 0.55) return;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha *= ratio < 0.28 ? 0.85 : 0.55;
  ctx.strokeStyle = e.palette.accent;
  ctx.lineWidth = 0.8;
  const n = ratio < 0.28 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const t = 0.3 + i * 0.18;
    const px = lerp(a.x, b.x, t);
    const py = lerp(a.y, b.y, t);
    const off = (i % 2 === 0 ? 1 : -1) * (2 + i);
    ctx.beginPath();
    ctx.moveTo(px + nx * off, py + ny * off);
    ctx.lineTo(px + dx / len * 4 - nx * 2, py + dy / len * 4 - ny * 2);
    ctx.lineTo(px - dx / len * 3 + nx * 1.5, py - dy / len * 3 + ny * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStump(e, pt, size, pal, angle = 0) {
  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.rotate(angle);
  circle(ctx, 0, 0, size * 0.9, ec(e, pal.dark));
  circle(ctx, 0, 0, size * 0.62, ec(e, pal.wood));
  // jagged shards
  ctx.fillStyle = ec(e, pal.woodLight);
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, -size * 0.55);
  ctx.lineTo(size * 0.25, -size * 0.9);
  ctx.lineTo(size * 0.35, -size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-size * 0.4, size * 0.4);
  ctx.lineTo(-size * 0.1, size * 0.95);
  ctx.lineTo(size * 0.3, size * 0.5);
  ctx.closePath();
  ctx.fill();
  // exposed glowing core
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glowCircle(ctx, 0, 0, size * 2.5, pal.accent, 0.35 + 0.12 * Math.sin(game.time * 9 + e.id));
  circle(ctx, 0, 0, size * 0.33, rgba("#fff4dd", 0.85));
  ctx.restore();
  ctx.restore();
}

function drawEnemyLeg(e, pose, side, front, pal, s, alpha) {
  const P = e.parts;
  const hip = side === "R" ? pose.hipR : pose.hipL;
  const knee = side === "R" ? pose.kneeR : pose.kneeL;
  const foot = side === "R" ? pose.footR : pose.footL;
  const upId = side === "R" ? "legR0" : "legL0";
  const lowId = side === "R" ? "legR1" : "legL1";
  const up = P[upId];
  const low = P[lowId];
  const baseCol = front ? ec(e, pal.armor) : ec(e, pal.wood);
  const dark = ec(e, pal.dark);
  if (up.broken) {
    drawStump(e, hip, 4.4 * s, pal, -0.4);
    return;
  }
  // thigh
  lineRod(ctx, hip, knee, 9.4 * s, dark);
  lineRod(ctx, hip, knee, 6.8 * s, front ? baseCol : ec(e, pal.wood));
  drawEnemyJoint(e, hip, 3.2 * s, pal);
  crackSegment(e, up, hip, knee);
  if (low.broken) {
    drawStump(e, knee, 3.5 * s, pal, 0.5);
    return;
  }
  // shin
  lineRod(ctx, knee, foot, 7.4 * s, dark);
  lineRod(ctx, knee, foot, 5 * s, front ? ec(e, pal.woodLight) : ec(e, pal.wood));
  drawEnemyJoint(e, knee, 3.3 * s, pal);
  crackSegment(e, low, knee, foot);
  // foot
  ctx.fillStyle = dark;
  if (e.type === "rend") {
    ctx.beginPath();
    ctx.moveTo(foot.x - 1, foot.y - 2.4 * s);
    ctx.lineTo(foot.x + 9 * s, foot.y - 1);
    ctx.lineTo(foot.x + 11 * s, foot.y + 2);
    ctx.lineTo(foot.x - 2, foot.y + 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ec(e, pal.accent);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(foot.x + 9 * s, foot.y + 1);
    ctx.lineTo(foot.x + 13 * s, foot.y + 3);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(foot.x + 4.6 * s, foot.y - 1.5, 6.6 * s, 3.5 * s, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.armorLight, 0.45);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(foot.x + 4.6 * s, foot.y - 1.5, 5.1 * s, PI * 0.9, PI * 1.9);
    ctx.stroke();
  }
  drawEnemyJoint(e, foot, 2.4 * s, pal);
}

function drawEnemyArm(e, pose, side, front, pal, s, alpha) {
  const P = e.parts;
  const sh = side === "R" ? pose.shoulderR : pose.shoulderL;
  const el = side === "R" ? pose.elbowR : pose.elbowL;
  const hand = side === "R" ? pose.handR : pose.handL;
  const upId = side === "R" ? "armR0" : "armL0";
  const lowId = side === "R" ? "armR1" : "armL1";
  const up = P[upId];
  const low = P[lowId];
  const dark = ec(e, pal.dark);
  const main = front ? ec(e, pal.woodLight) : ec(e, pal.wood);
  if (up.broken) {
    drawStump(e, sh, 4.6 * s, pal, -0.6);
    return;
  }
  // upper arm
  lineRod(ctx, sh, el, 8.2 * s, dark);
  lineRod(ctx, sh, el, 5.6 * s, main);
  drawEnemyJoint(e, sh, 3.5 * s, pal);
  crackSegment(e, up, sh, el);
  // shoulder plate for axe
  if (e.type === "axe" && front) {
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(-0.1);
    poly(ctx, [
      { x: -5 * s, y: -4 * s },
      { x: 6 * s, y: -3 * s },
      { x: 5 * s, y: 3.5 * s },
      { x: -4.5 * s, y: 4 * s },
    ], ec(e, pal.armor));
    ctx.strokeStyle = rgba(pal.armorLight, 0.6);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // spike
    poly(ctx, [
      { x: -4 * s, y: -3.6 * s },
      { x: -10 * s, y: -8 * s },
      { x: -3 * s, y: -1.4 * s },
    ], ec(e, pal.armorLight));
    ctx.restore();
  }
  if (low.broken) {
    drawStump(e, el, 3.4 * s, pal, 0.7);
    return;
  }
  // forearm
  lineRod(ctx, el, hand, 6.4 * s, dark);
  lineRod(ctx, el, hand, 4.4 * s, front ? ec(e, pal.woodLight) : ec(e, pal.wood));
  drawEnemyJoint(e, el, 3.1 * s, pal);
  crackSegment(e, low, el, hand);
  // hand
  drawEnemyJoint(e, hand, 2.8 * s, pal, true);
  // rend claws
  if (e.type === "rend") {
    const dir = 1;
    ctx.strokeStyle = ec(e, pal.woodLight);
    ctx.lineWidth = 1.2 * s;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y + i * 2 * s);
      ctx.quadraticCurveTo(hand.x + 9 * s, hand.y + i * 4.2 * s, hand.x + 17 * s, hand.y + i * 3.6 * s + 3 * s);
      ctx.stroke();
    }
    ctx.strokeStyle = ec(e, pal.accent);
    ctx.lineWidth = 0.7 * s;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(hand.x + 9 * s, hand.y + i * 3.8 * s);
      ctx.lineTo(hand.x + 17 * s, hand.y + i * 3.6 * s + 3 * s);
      ctx.stroke();
    }
  }
}

function drawEnemyTorso(e, pose, pal, s) {
  const chest = pose.chest;
  const hip = pose.hip;
  const sL = pose.shoulderL;
  const sR = pose.shoulderR;
  const dark = ec(e, pal.dark);
  const cloth = ec(e, pal.cloth);
  const armor = ec(e, pal.armor);
  const bodyW = pose.bodyW;

  if (e.type === "axe") {
    // broad lacquered carapace
    poly(ctx, [
      { x: sL.x - 2 * s, y: sL.y - 1 * s },
      { x: sR.x + 2 * s, y: sR.y - 1 * s },
      { x: chest.x + bodyW * 0.6, y: chest.y + 8 * s },
      { x: hip.x + bodyW * 0.5, y: hip.y + 2 },
      { x: hip.x - bodyW * 0.5, y: hip.y + 2 },
      { x: chest.x - bodyW * 0.62, y: chest.y + 8 * s },
    ], dark);
    poly(ctx, [
      { x: sL.x - 0.5 * s, y: sL.y },
      { x: sR.x + 0.5 * s, y: sR.y },
      { x: chest.x + bodyW * 0.47, y: chest.y + 8 * s },
      { x: hip.x + bodyW * 0.4, y: hip.y },
      { x: hip.x - bodyW * 0.4, y: hip.y },
      { x: chest.x - bodyW * 0.48, y: chest.y + 8 * s },
    ], ec(e, pal.wood));
    // chest armor plates
    poly(ctx, [
      { x: chest.x - bodyW * 0.42, y: chest.y + 1 * s },
      { x: chest.x + bodyW * 0.46, y: chest.y + 1 * s },
      { x: chest.x + bodyW * 0.36, y: chest.y + 14 * s },
      { x: chest.x - bodyW * 0.38, y: chest.y + 14 * s },
    ], armor);
    ctx.strokeStyle = rgba(pal.armorLight, 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(chest.x - bodyW * 0.34, chest.y + 5 * s);
    ctx.lineTo(chest.x + bodyW * 0.36, chest.y + 5 * s);
    ctx.moveTo(chest.x - bodyW * 0.32, chest.y + 9.5 * s);
    ctx.lineTo(chest.x + bodyW * 0.3, chest.y + 9.5 * s);
    ctx.stroke();
    // rope belt
    ctx.strokeStyle = rgba(pal.rope, 0.8);
    ctx.lineWidth = 2.3 * s;
    ctx.beginPath();
    ctx.moveTo(hip.x - bodyW * 0.5, hip.y - 1);
    ctx.lineTo(hip.x + bodyW * 0.46, hip.y - 1);
    ctx.stroke();
    ctx.strokeStyle = rgba(pal.rope, 0.5);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(hip.x + 3 * s, hip.y + 1);
    ctx.quadraticCurveTo(hip.x + 8 * s, hip.y + 12 * s, hip.x + 2 * s, hip.y + 20 * s);
    ctx.stroke();
    // tassets
    poly(ctx, [
      { x: hip.x - bodyW * 0.5, y: hip.y },
      { x: hip.x - bodyW * 0.1, y: hip.y + 1 },
      { x: hip.x - 2 * s, y: hip.y + 17 * s },
      { x: hip.x - bodyW * 0.55, y: hip.y + 13 * s },
    ], ec(e, pal.cloth));
    poly(ctx, [
      { x: hip.x + bodyW * 0.1, y: hip.y },
      { x: hip.x + bodyW * 0.5, y: hip.y },
      { x: hip.x + bodyW * 0.48, y: hip.y + 13 * s },
      { x: hip.x + 2 * s, y: hip.y + 17 * s },
    ], ec(e, pal.cloth));
    // exposed neck core
    drawChestCore(e, chest, pal, s);
  } else if (e.type === "bolt") {
    // tattered cloak
    poly(ctx, [
      { x: sL.x - 1 * s, y: sL.y - 1 * s },
      { x: sR.x + 1 * s, y: sR.y - 1 * s },
      { x: chest.x + bodyW * 0.55, y: chest.y + 8 * s },
      { x: hip.x + bodyW * 0.7, y: hip.y + 18 * s },
      { x: hip.x + 6 * s, y: hip.y + 12 * s },
      { x: hip.x + 1 * s, y: hip.y + 20 * s },
      { x: hip.x - 5 * s, y: hip.y + 12 * s },
      { x: hip.x - bodyW * 0.65, y: hip.y + 19 * s },
      { x: chest.x - bodyW * 0.56, y: chest.y + 8 * s },
    ], cloth);
    // inner wrap
    poly(ctx, [
      { x: chest.x - bodyW * 0.4, y: chest.y + 2 },
      { x: chest.x + bodyW * 0.42, y: chest.y + 2 },
      { x: hip.x + 5 * s, y: hip.y + 1 },
      { x: hip.x - 5 * s, y: hip.y + 1 },
    ], ec(e, pal.dark));
    // chest straps
    ctx.strokeStyle = rgba(pal.rope, 0.65);
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(chest.x - 6 * s, chest.y + 2);
    ctx.lineTo(chest.x + 5 * s, hip.y - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chest.x + 6 * s, chest.y + 2);
    ctx.lineTo(chest.x - 5 * s, hip.y - 2);
    ctx.stroke();
    // belt
    ctx.strokeStyle = rgba(pal.rope, 0.7);
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(hip.x - bodyW * 0.55, hip.y);
    ctx.lineTo(hip.x + bodyW * 0.55, hip.y);
    ctx.stroke();
    // hood collar
    poly(ctx, [
      { x: sL.x - 3 * s, y: sL.y - 2 * s },
      { x: sL.x + 1 * s, y: sL.y - 7 * s },
      { x: sR.x - 1 * s, y: sR.y - 7 * s },
      { x: sR.x + 3 * s, y: sR.y - 2 * s },
      { x: chest.x + 4 * s, y: chest.y + 4 * s },
      { x: chest.x - 4 * s, y: chest.y + 4 * s },
    ], ec(e, pal.dark));
    drawChestCore(e, chest, pal, s);
  } else {
    // rend: exposed wooden frame
    poly(ctx, [
      { x: sL.x - 1 * s, y: sL.y },
      { x: sR.x + 1 * s, y: sR.y },
      { x: chest.x + bodyW * 0.42, y: chest.y + 7 * s },
      { x: hip.x + bodyW * 0.46, y: hip.y + 4 * s },
      { x: hip.x - bodyW * 0.46, y: hip.y + 4 * s },
      { x: chest.x - bodyW * 0.42, y: chest.y + 7 * s },
    ], ec(e, pal.dark));
    // ribs
    ctx.strokeStyle = ec(e, pal.woodLight);
    ctx.lineWidth = 1.6 * s;
    for (let i = 0; i < 3; i++) {
      const yy = chest.y + (5 + i * 4.5) * s;
      const ww = bodyW * (0.46 - i * 0.08);
      ctx.beginPath();
      ctx.moveTo(chest.x - ww, yy);
      ctx.quadraticCurveTo(chest.x, yy + 4 * s, chest.x + ww, yy);
      ctx.stroke();
    }
    // ragged waist cloth
    poly(ctx, [
      { x: hip.x - bodyW * 0.5, y: hip.y - 1 },
      { x: hip.x + bodyW * 0.5, y: hip.y - 1 },
      { x: hip.x + bodyW * 0.4, y: hip.y + 14 * s },
      { x: hip.x + 2 * s, y: hip.y + 8 * s },
      { x: hip.x - 3 * s, y: hip.y + 16 * s },
      { x: hip.x - bodyW * 0.42, y: hip.y + 10 * s },
    ], ec(e, pal.cloth));
    // spine spikes
    ctx.strokeStyle = ec(e, pal.woodLight);
    ctx.lineWidth = 1.2 * s;
    for (let i = 0; i < 3; i++) {
      const yy = chest.y + (3 + i * 6) * s;
      ctx.beginPath();
      ctx.moveTo(chest.x - bodyW * 0.28, yy);
      ctx.lineTo(chest.x - bodyW * 0.62, yy - 3 * s);
      ctx.stroke();
    }
    drawChestCore(e, chest, pal, s);
  }
}

function drawChestCore(e, chest, pal, s) {
  const pulse = 0.55 + 0.3 * Math.sin(game.time * 4.2 + e.id);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glowCircle(ctx, chest.x, chest.y + 8 * s, 9 * s, pal.accent, 0.28 * pulse);
  circle(ctx, chest.x, chest.y + 8 * s, 1.5 * s, rgba("#fff4da", 0.75));
  ctx.restore();
}

function drawEnemyHead(e, pose, pal, s) {
  if (e.parts.head.broken) {
    drawStump(e, pose.head, 4.2 * s, pal, 0);
    return;
  }
  const h = pose.head;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(pose.headTilt + pose.lean * 0.45);
  const dark = ec(e, pal.dark);
  const armor = ec(e, pal.armor);
  if (e.type === "axe") {
    // horned helm
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.4 * s, 8 * s, 0, 0, TAU);
    ctx.fill();
    // faceplate
    poly(ctx, [
      { x: -5.5 * s, y: -4 * s },
      { x: 5.5 * s, y: -4.5 * s },
      { x: 4.4 * s, y: 5 * s },
      { x: -3.6 * s, y: 5.4 * s },
    ], armor);
    // helm top
    poly(ctx, [
      { x: -6 * s, y: -4 * s },
      { x: -4 * s, y: -9 * s },
      { x: 0, y: -11 * s },
      { x: 5 * s, y: -8 * s },
      { x: 6 * s, y: -3.6 * s },
      { x: 0, y: -6 * s },
    ], ec(e, pal.armorLight));
    // horns
    ctx.fillStyle = ec(e, pal.woodLight);
    poly(ctx, [
      { x: -5.4 * s, y: -7 * s },
      { x: -13 * s, y: -16 * s },
      { x: -8.5 * s, y: -4.4 * s },
    ], ec(e, pal.woodLight));
    poly(ctx, [
      { x: 5.6 * s, y: -7 * s },
      { x: 12.5 * s, y: -15.5 * s },
      { x: 8 * s, y: -3.8 * s },
    ], ec(e, pal.woodLight));
    // eye slit
    ctx.fillStyle = dark;
    ctx.fillRect(-4.2 * s, -1.4 * s, 8.6 * s, 2.4 * s);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 1 * s, 0, 8 * s, pal.eye, 0.55);
    ctx.fillStyle = rgba("#fff1c4", 0.95);
    ctx.fillRect(-2.8 * s, -0.9 * s, 5.6 * s, 1.1 * s);
    ctx.restore();
    // jaw
    ctx.fillStyle = dark;
    ctx.fillRect(-3.4 * s, 3.4 * s, 7 * s, 2 * s);
    if (e.elite) drawEliteCrown(h, s);
  } else if (e.type === "bolt") {
    // pointed hood
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(-9 * s, 3 * s);
    ctx.quadraticCurveTo(-10 * s, -9 * s, -3 * s, -11 * s);
    ctx.quadraticCurveTo(6 * s, -12 * s, 10 * s, -2 * s);
    ctx.quadraticCurveTo(11 * s, 5 * s, 4 * s, 7 * s);
    ctx.lineTo(-7 * s, 7 * s);
    ctx.closePath();
    ctx.fill();
    // mask
    ctx.fillStyle = ec(e, pal.wood);
    ctx.beginPath();
    ctx.ellipse(2 * s, 1 * s, 6.2 * s, 6.8 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ec(e, pal.armor);
    ctx.beginPath();
    ctx.ellipse(1.8 * s, 0.6 * s, 4.6 * s, 5.2 * s, 0, 0, TAU);
    ctx.fill();
    // single lens
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 3.6 * s, -0.6 * s, 7 * s, pal.eye, 0.6);
    circle(ctx, 3.6 * s, -0.6 * s, 2.1 * s, "#d9fff9");
    ctx.fillStyle = rgba("#0c2a2a", 0.9);
    ctx.beginPath();
    ctx.arc(4.2 * s, -0.4 * s, 0.9 * s, 0, TAU);
    ctx.fill();
    ctx.restore();
    // antenna
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(-4 * s, -8 * s);
    ctx.quadraticCurveTo(-8 * s, -15 * s, -3 * s, -20 * s);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, -3 * s, -20 * s, 3.4 * s, pal.accent, 0.6);
    ctx.restore();
    // hood rim
    ctx.strokeStyle = rgba(pal.rope, 0.35);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(1 * s, 1 * s, 8.2 * s, -2.5, 0.7);
    ctx.stroke();
    if (e.elite) drawEliteCrown(h, s);
  } else {
    // rend wooden skull
    ctx.fillStyle = ec(e, pal.wood);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.6 * s, 7.2 * s, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ec(e, pal.woodLight);
    ctx.beginPath();
    ctx.ellipse(1 * s, 1.4 * s, 5.6 * s, 5 * s, 0, 0, TAU);
    ctx.fill();
    // horns
    ctx.fillStyle = dark;
    poly(ctx, [
      { x: -5 * s, y: -6 * s },
      { x: -10 * s, y: -15 * s },
      { x: -2 * s, y: -7 * s },
    ], dark);
    poly(ctx, [
      { x: 6 * s, y: -5 * s },
      { x: 11 * s, y: -13 * s },
      { x: 8 * s, y: -3 * s },
    ], dark);
    // eye sockets
    ctx.fillStyle = "#1b1114";
    ctx.beginPath();
    ctx.ellipse(2.6 * s, -1.4 * s, 2.3 * s, 1.7 * s, -0.1, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-2.4 * s, -1.2 * s, 1.9 * s, 1.5 * s, 0.1, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 2.6 * s, -1.2 * s, 5 * s, pal.eye, 0.55);
    glowCircle(ctx, -2.4 * s, -1 * s, 4 * s, pal.eye, 0.5);
    ctx.restore();
    // jaw
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(-4 * s, 4 * s);
    ctx.lineTo(4.6 * s, 4.4 * s);
    ctx.stroke();
    ctx.lineWidth = 0.8 * s;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-2.5 * s + i * 2.6 * s, 4.1 * s);
      ctx.lineTo(-2.2 * s + i * 2.6 * s, 6.2 * s);
      ctx.stroke();
    }
    if (e.elite) drawEliteCrown(h, s);
  }
  ctx.restore();
}

function drawEliteCrown(h, s) {
  ctx.save();
  ctx.translate(0, -12 * s);
  ctx.fillStyle = "#ffd46e";
  ctx.beginPath();
  ctx.moveTo(-5 * s, 2 * s);
  ctx.lineTo(-4 * s, -4 * s);
  ctx.lineTo(-1 * s, -1 * s);
  ctx.lineTo(0, -5 * s);
  ctx.lineTo(2 * s, -1 * s);
  ctx.lineTo(5 * s, -4 * s);
  ctx.lineTo(5 * s, 2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  glowCircle(ctx, 0, -1, 9 * s, "#ffd46e", 0.28);
  ctx.restore();
}

function drawEnemyWeapon(e, pose, pal, s) {
  if (!e.parts.armR0.broken && !e.parts.armR1.broken) {
    const hand = pose.handR;
    if (e.type === "axe") {
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.rotate(pose.axeAngle);
      // handle
      ctx.strokeStyle = ec(e, pal.dark);
      ctx.lineWidth = 4.2 * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-12 * s, 0);
      ctx.lineTo(34 * s, 0);
      ctx.stroke();
      ctx.strokeStyle = ec(e, pal.wood);
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath();
      ctx.moveTo(-11 * s, 0);
      ctx.lineTo(33 * s, 0);
      ctx.stroke();
      // grip wrap
      ctx.strokeStyle = rgba(pal.rope, 0.8);
      ctx.lineWidth = 0.8 * s;
      for (let i = -8; i < 4; i += 2.4) {
        ctx.beginPath();
        ctx.moveTo(i * s, -1.2 * s);
        ctx.lineTo((i + 1.3) * s, 1.2 * s);
        ctx.stroke();
      }
      // socket and blade
      ctx.fillStyle = ec(e, pal.armor);
      ctx.beginPath();
      ctx.ellipse(31 * s, 0, 3.6 * s, 4.8 * s, 0, 0, TAU);
      ctx.fill();
      const bg = ctx.createLinearGradient(30 * s, -18 * s, 48 * s, 16 * s);
      bg.addColorStop(0, "#f0f5f3");
      bg.addColorStop(0.35, ec(e, pal.armorLight));
      bg.addColorStop(0.7, ec(e, pal.armor));
      bg.addColorStop(1, "#3e4346");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(31 * s, -3 * s);
      ctx.quadraticCurveTo(40 * s, -20 * s, 54 * s, -22 * s);
      ctx.quadraticCurveTo(49 * s, -8 * s, 45 * s, 1 * s);
      ctx.quadraticCurveTo(52 * s, 10 * s, 55 * s, 22 * s);
      ctx.quadraticCurveTo(40 * s, 18 * s, 31 * s, 4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(pal.accent, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(52 * s, -19 * s);
      ctx.quadraticCurveTo(43 * s, 0, 53 * s, 19 * s);
      ctx.stroke();
      // red hot core near socket
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      glowCircle(ctx, 34 * s, 0, 6 * s, pal.core, 0.4);
      ctx.restore();
      ctx.restore();
    } else if (e.type === "bolt") {
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.rotate(pose.bowAngle);
      // stock
      ctx.fillStyle = ec(e, pal.wood);
      ctx.fillRect(-6 * s, -1.8 * s, 32 * s, 3.6 * s);
      ctx.fillStyle = ec(e, pal.dark);
      ctx.fillRect(-7 * s, -2.6 * s, 8 * s, 5.2 * s);
      // limbs
      ctx.strokeStyle = ec(e, pal.armorLight);
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(24 * s, -1 * s);
      ctx.quadraticCurveTo(31 * s, -14 * s, 23 * s, -19 * s);
      ctx.moveTo(24 * s, 1 * s);
      ctx.quadraticCurveTo(31 * s, 14 * s, 23 * s, 19 * s);
      ctx.stroke();
      // string
      ctx.strokeStyle = rgba("#d8f5ef", 0.6);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(23 * s, -19 * s);
      ctx.lineTo(14 * s, 0);
      ctx.lineTo(23 * s, 19 * s);
      ctx.stroke();
      // loaded bolt
      if (e.state === "windup" || e.state === "attack") {
        ctx.strokeStyle = "#bafff4";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(12 * s, 0);
        ctx.lineTo(36 * s, 0);
        ctx.stroke();
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        glowCircle(ctx, 36 * s, 0, 7 * s, pal.accent, 0.35);
        ctx.restore();
      }
      ctx.restore();
    }
  }
}

/* ===== 74-render.js ===== */
/* ============================================================
   Telegraphs, enemy HUD, master render
   ============================================================ */

function drawEnemyTelegraphZones() {
  for (const e of game.enemies) {
    if (!e.alive || !e.tele || e.state !== "windup") continue;
    const t = e.tele;
    const p = clamp(t.p || 0, 0, 1);
    const s = e.scale;
    const pulse = 0.62 + 0.38 * Math.sin(game.time * 22 + e.id);
    const alpha = 0.09 + p * 0.13;
    const edge = 0.3 + p * 0.42;
    const kind = t.kind;

    if (kind === "chop" || kind === "swipe" || kind === "kick" || kind === "bite") {
      const reach = (e.atk.reach + e.atk.r * 0.7 + 22) * s;
      ctx.save();
      ctx.translate(e.x, GROUND_Y);
      ctx.scale(e.facing, 1);
      // ground fan
      ctx.save();
      ctx.scale(1, 0.26);
      const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, reach);
      grad.addColorStop(0, `rgba(255,70,74,${alpha * 0.45})`);
      grad.addColorStop(0.7, `rgba(255,66,72,${alpha})`);
      grad.addColorStop(1, "rgba(255,66,72,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, -0.72, 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,120,100,${edge * 0.85})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, reach * 0.98, -0.72, 0.72);
      ctx.stroke();
      ctx.restore();
      // arcing danger line at body height
      ctx.globalAlpha = edge * 0.55;
      ctx.strokeStyle = "#ff6c60";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, -34 * s, (e.atk.reach + 26) * s, -0.7, 0.7);
      ctx.stroke();
      // leading sparkle
      const t0 = -0.7 + ((game.time * 1.8) % 1.4);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,190,140,0.85)";
      ctx.beginPath();
      ctx.arc(Math.cos(t0) * (e.atk.reach + 26) * s, -34 * s + Math.sin(t0) * (e.atk.reach + 26) * s, 1.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (kind === "headbutt") {
      ctx.save();
      ctx.translate(e.x, GROUND_Y);
      ctx.scale(e.facing, 1);
      const len = 195 * s;
      const grad = ctx.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, `rgba(255,80,70,${alpha * 1.8})`);
      grad.addColorStop(0.8, `rgba(255,60,60,${alpha * 0.9})`);
      grad.addColorStop(1, "rgba(255,60,60,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(16, -16, len, 16);
      ctx.strokeStyle = `rgba(255,120,100,${edge * 0.7})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(16, -16, len, 16);
      // chevrons
      ctx.globalAlpha = edge;
      ctx.strokeStyle = "#ffb094";
      for (let i = 0; i < 3; i++) {
        const x = 40 + i * 42 + (p * 30);
        ctx.beginPath();
        ctx.moveTo(x, -13);
        ctx.lineTo(x + 8, -8);
        ctx.lineTo(x, -3);
        ctx.stroke();
      }
      ctx.restore();
    } else if (kind === "leap" || kind === "pounce") {
      const targetX = t.targetX;
      const radius = (kind === "leap" ? 86 : 58) * s;
      ctx.save();
      ctx.translate(targetX, GROUND_Y);
      // target circle
      ctx.save();
      ctx.scale(1, 0.3);
      const g = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
      g.addColorStop(0, `rgba(255,80,70,${alpha * 0.4})`);
      g.addColorStop(0.72, `rgba(255,66,66,${alpha * 1.2})`);
      g.addColorStop(1, "rgba(255,66,66,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fill();
      ctx.restore();
      // rotating crosshair ring
      ctx.globalAlpha = edge * 0.85;
      ctx.strokeStyle = "#ff806e";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = -game.time * 28;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.72, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.stroke();
      // trajectory line
      ctx.globalAlpha = edge * 0.3;
      ctx.strokeStyle = "#ff8c74";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x, GROUND_Y - 30 * s);
      ctx.lineTo(targetX, GROUND_Y);
      ctx.stroke();
      ctx.restore();
    } else if (kind === "aim") {
      const pose = e.pose;
      if (pose) {
        const hand = localToWorld(e, pose.handR);
        const pTarget = game.player ? { x: game.player.x, y: game.player.y - 36 } : null;
        if (pTarget) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.22 + p * 0.3;
          ctx.strokeStyle = "#ff8b78";
          ctx.lineWidth = 1.1;
          ctx.setLineDash([4, 6]);
          ctx.lineDashOffset = -game.time * 40;
          ctx.beginPath();
          ctx.moveTo(hand.x, hand.y);
          ctx.lineTo(pTarget.x, pTarget.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = edge * 0.9;
          ctx.strokeStyle = "#ffb39b";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(pTarget.x, pTarget.y, 11 + p * 5, 0, TAU);
          ctx.moveTo(pTarget.x - 16, pTarget.y);
          ctx.lineTo(pTarget.x - 7, pTarget.y);
          ctx.moveTo(pTarget.x + 7, pTarget.y);
          ctx.lineTo(pTarget.x + 16, pTarget.y);
          ctx.moveTo(pTarget.x, pTarget.y - 16);
          ctx.lineTo(pTarget.x, pTarget.y - 7);
          ctx.moveTo(pTarget.x, pTarget.y + 7);
          ctx.lineTo(pTarget.x, pTarget.y + 16);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }
}

function drawEnemyHealthBars() {
  for (const e of game.enemies) {
    if (!e.alive || e.barTimer <= 0) continue;
    const pose = e.pose;
    const s = e.scale;
    const headY = pose ? e.y + pose.head.y : e.y - 70 * s;
    const w = 58 * s;
    const x = e.x - w / 2;
    const y = headY - 22 * s;
    const pct = clamp(e.hp / e.maxHp, 0, 1);
    ctx.save();
    // name
    ctx.font = `600 ${Math.max(8, 8.5 * s)}px "CombatSerif","Songti SC","STSong","Noto Serif CJK SC",serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha *= 0.75;
    ctx.fillStyle = e.elite ? "#ffd982" : "#e7d7b4";
    ctx.fillText(e.elite ? `${e.def.name} · 精` : e.def.name, e.x, y - 5);
    ctx.globalAlpha /= 0.75;
    // bar frame
    ctx.fillStyle = "rgba(8,6,10,0.78)";
    ctx.fillRect(x - 1, y, w + 2, 5);
    ctx.strokeStyle = "rgba(220,190,145,0.28)";
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x - 1, y, w + 2, 5);
    // hp fill
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    if (pct > 0.5) {
      grad.addColorStop(0, "#9e2833");
      grad.addColorStop(1, "#e05458");
    } else {
      grad.addColorStop(0, "#7c1e2a");
      grad.addColorStop(1, "#ff8d68");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + 1, w * pct, 3);
    if (e.flash > 0.02) {
      ctx.globalAlpha *= clamp(e.flash * 1.5, 0, 0.8);
      ctx.fillStyle = "#fff6ea";
      ctx.fillRect(x, y + 1, w * pct, 3);
      ctx.globalAlpha /= clamp(e.flash * 1.5, 0, 0.8);
    }
    if (e.elite) {
      ctx.strokeStyle = "rgba(255,211,123,0.75)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x - 1.5, y - 0.5, w + 3, 6);
    }
    // limb pips: L arm / R arm / head / L leg / R leg
    const pipY = y + 10;
    const pips = [
      e.armLok,
      e.armRok,
      !e.parts.head.broken,
      e.legLok,
      e.legRok,
    ];
    const pw = 4.2 * s;
    const gap = 3.2 * s;
    const total = pips.length * pw + (pips.length - 1) * gap;
    let px = e.x - total / 2;
    for (const ok of pips) {
      ctx.beginPath();
      ctx.moveTo(px + pw / 2, pipY - 2.2 * s);
      ctx.lineTo(px + pw, pipY);
      ctx.lineTo(px + pw / 2, pipY + 2.2 * s);
      ctx.lineTo(px, pipY);
      ctx.closePath();
      if (ok) {
        ctx.fillStyle = e.palette.accent;
        ctx.globalAlpha *= 0.7;
      } else {
        ctx.fillStyle = "rgba(90,28,38,0.8)";
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      px += pw + gap;
    }
    ctx.restore();
  }
}

function drawEnemyWarnings() {
  for (const e of game.enemies) {
    if (!e.alive || e.state !== "windup" || !e.tele) continue;
    const pose = e.pose;
    const s = e.scale;
    const p = clamp(e.tele.p || 0, 0, 1);
    const headY = (pose ? e.y + pose.head.y : e.y - 70 * s) - 31 * s;
    const pulse = 0.75 + 0.25 * Math.sin(game.time * 20);
    const scale = 0.75 + easeOutBack(clamp(p * 2.4, 0, 1)) * 0.45;
    ctx.save();
    ctx.translate(e.x, headY);
    ctx.scale(scale * pulse, scale * pulse);
    // diamond backing
    ctx.fillStyle = "rgba(16,7,10,0.82)";
    ctx.beginPath();
    ctx.moveTo(0, -12.5);
    ctx.lineTo(11, 0);
    ctx.lineTo(0, 12.5);
    ctx.lineTo(-11, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,110,90,${0.5 + p * 0.45})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, 0, 0, 18, "#ff5a4c", 0.22 + p * 0.2);
    ctx.restore();
    ctx.fillStyle = `rgba(255,${Math.floor(160 - p * 60)},110,${0.85 + p * 0.15})`;
    ctx.font = '700 17px "CombatSerif","Songti SC","STSong",serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 0, 1);
    ctx.restore();
  }
}

function drawForeground() {
  const w = view.w;
  const h = view.h;
  const sc = view.scale;
  const camFrac = game.camera.x / Math.max(1, WORLD_W);
  // bottom dark gradient
  const g = ctx.createLinearGradient(0, h - 110 * sc, 0, h);
  g.addColorStop(0, "rgba(4,4,8,0)");
  g.addColorStop(1, "rgba(2,2,5,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h - 110 * sc, w, 110 * sc);
  // grass silhouettes
  ctx.save();
  ctx.strokeStyle = "rgba(4,4,8,0.75)";
  for (const gr of BG.grass) {
    let x = (((gr.x - camFrac * 0.35) % 1) + 1) % 1 * w;
    const baseY = h - 2;
    const hh = gr.h * sc * 0.8;
    const sway = Math.sin(game.realTime * 1.6 + gr.phase) * 3 * sc;
    ctx.lineWidth = gr.w * sc;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + sway + gr.lean * sc, baseY - hh * 0.55, x + sway * 1.8 + gr.lean * 2 * sc, baseY - hh);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScreenFX() {
  const w = view.w;
  const h = view.h;
  // vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(0.72, "rgba(0,0,0,0.18)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // hurt vignette
  if (game.hurtVignette > 0.01) {
    const hv = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    hv.addColorStop(0, "rgba(120,10,20,0)");
    hv.addColorStop(0.72, `rgba(130,14,24,${0.14 * game.hurtVignette})`);
    hv.addColorStop(1, `rgba(180,20,32,${0.55 * game.hurtVignette})`);
    ctx.fillStyle = hv;
    ctx.fillRect(0, 0, w, h);
  }

  // low health pulse
  if (game.mode === "play" && game.player && game.player.hp > 0 && game.player.hp / game.player.maxHp < 0.3) {
    const pulse = 0.5 + 0.5 * Math.sin(game.realTime * 5.2);
    const lv = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    lv.addColorStop(0, "rgba(100,8,18,0)");
    lv.addColorStop(1, `rgba(170,16,30,${0.1 + pulse * 0.15})`);
    ctx.fillStyle = lv;
    ctx.fillRect(0, 0, w, h);
  }

  // start-of-run fade
  if (game.introFade > 0.001) {
    ctx.fillStyle = `rgba(2,2,5,${Math.min(0.82, game.introFade * 0.82)})`;
    ctx.fillRect(0, 0, w, h);
  }

  // impact flash
  if (game.flash > 0.003) {
    ctx.fillStyle = `rgba(255,235,218,${game.flash})`;
    ctx.fillRect(0, 0, w, h);
  }

  // parry slow-mo tint
  if (game.timeScale < 0.82) {
    ctx.fillStyle = `rgba(40,90,96,${(0.82 - game.timeScale) * 0.16})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function render() {
  screenTransform();
  screenBackground();

  worldTransform();
  drawStage();
  drawEnemyTelegraphZones();
  drawDecals();
  drawSkillFx("back");
  drawParticlesBack();
  drawEnemyShadows();
  drawAfterimages();
  drawEnemies();
  drawPlayer();
  drawDebris();
  drawProjectiles();
  drawSlashes();
  drawSkillFx("front");
  drawParticlesFront();
  drawEnemyHealthBars();
  drawEnemyWarnings();
  drawFloaters();

  screenTransform();
  drawForeground();
  drawUI();
  drawScreenFX();
}

/* ===== 80-ui.js ===== */
/* ============================================================
   HUD, title, death screen, banners
   ============================================================ */
const UI_SANS = '"CombatSerif","Songti SC","STSong","Noto Serif CJK SC","Noto Serif SC","SimSun",serif';

function drawUI() {
  if (game.mode === "title") {
    drawTitleScreen();
    return;
  }
  drawHud();
  drawBanners();
  if (game.mode === "play" && !game.player.dead) drawTutorialHint();
  if (game.mode === "over") drawDeathScreen();
}

function drawHud() {
  const w = view.w;
  const h = view.h;
  const p = game.player;
  if (!p) return;

  // ----- health -----
  const barW = Math.min(252, w * 0.3);
  const x = 24;
  const y = 22;
  // diamond + label
  ctx.save();
  ctx.fillStyle = "rgba(8,7,12,0.55)";
  ctx.beginPath();
  ctx.moveTo(x + 7, y);
  ctx.lineTo(x + 16, y + 9);
  ctx.lineTo(x + 7, y + 18);
  ctx.lineTo(x - 2, y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(224,183,120,0.65)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#f0dcb6";
  ctx.font = `600 13px ${UI_SANS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("命", x + 24, y + 9);
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(218,199,166,0.55)";
  ctx.fillText("绯 刃", x + 48, y + 10);

  // numeric
  ctx.font = `600 11px ${UI_SANS}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(245,230,202,0.85)";
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, x + barW, y + 10);
  ctx.restore();

  const by = y + 20;
  // frame
  ctx.save();
  ctx.fillStyle = "rgba(5,5,9,0.72)";
  angledBar(x - 2, by - 2, barW + 4, 17, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(218,183,126,0.38)";
  ctx.lineWidth = 1;
  angledBar(x - 2, by - 2, barW + 4, 17, 3);
  ctx.stroke();

  // residual (slow-following) bar
  const dispPct = clamp(p.displayHp / p.maxHp, 0, 1);
  const hpPct = clamp(p.hp / p.maxHp, 0, 1);
  ctx.fillStyle = "rgba(255,220,190,0.28)";
  angledBar(x, by, barW * dispPct, 13, 2);
  ctx.fill();

  const low = hpPct < 0.3;
  const pulse = low ? 0.7 + 0.3 * Math.sin(game.realTime * 7.5) : 1;
  const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
  if (low) {
    grad.addColorStop(0, "#8b1625");
    grad.addColorStop(0.6, "#ef3d44");
    grad.addColorStop(1, "#ff8a68");
  } else {
    grad.addColorStop(0, "#701725");
    grad.addColorStop(0.45, "#b42a3b");
    grad.addColorStop(0.8, "#e0555a");
    grad.addColorStop(1, "#ff8f74");
  }
  ctx.globalAlpha = pulse;
  ctx.fillStyle = grad;
  angledBar(x, by, barW * hpPct, 13, 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // glass highlight
  ctx.fillStyle = "rgba(255,240,220,0.18)";
  ctx.fillRect(x + 2, by + 1, Math.max(0, barW * hpPct - 4), 2.2);
  // ticks
  ctx.strokeStyle = "rgba(15,10,14,0.35)";
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 10; i++) {
    const tx = x + (barW * i) / 10;
    ctx.beginPath();
    ctx.moveTo(tx, by + 1);
    ctx.lineTo(tx, by + 12);
    ctx.stroke();
  }
  ctx.restore();

  // ----- wave -----
  if (game.wave > 0) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 15px ${UI_SANS}`;
    ctx.fillStyle = "rgba(238,218,178,0.9)";
    const label = game.wavePhase === "clear" ? "阵  破" : `第 ${cnNum(game.wave)} 阵`;
    const tx = w / 2;
    ctx.fillText(label, tx, 28);
    // ornamental lines
    const tw = ctx.measureText(label).width;
    ctx.strokeStyle = "rgba(206,168,105,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx - tw / 2 - 70, 28);
    ctx.lineTo(tx - tw / 2 - 12, 28);
    ctx.moveTo(tx + tw / 2 + 12, 28);
    ctx.lineTo(tx + tw / 2 + 70, 28);
    ctx.stroke();
    // little diamonds at ends
    ctx.fillStyle = "rgba(220,180,112,0.55)";
    for (const dx of [-tw / 2 - 74, tw / 2 + 74]) {
      ctx.beginPath();
      ctx.moveTo(tx + dx, 25);
      ctx.lineTo(tx + dx + 3, 28);
      ctx.lineTo(tx + dx, 31);
      ctx.lineTo(tx + dx - 3, 28);
      ctx.closePath();
      ctx.fill();
    }
    // remaining enemies
    const rem = game.waveRemaining;
    if (game.wavePhase === "fight") {
      const maxDots = 8;
      const n = Math.min(maxDots, rem);
      const gap = 12;
      const start = tx - ((n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        const px = start + i * gap;
        const py = 46;
        ctx.moveTo(px, py - 3);
        ctx.lineTo(px + 3.2, py);
        ctx.lineTo(px, py + 3);
        ctx.lineTo(px - 3.2, py);
        ctx.closePath();
        ctx.fillStyle = i < aliveEnemies() ? "rgba(255,126,100,0.8)" : "rgba(202,170,124,0.4)";
        ctx.fill();
      }
      if (rem > maxDots) {
        ctx.font = `9px ${UI_SANS}`;
        ctx.fillStyle = "rgba(220,190,140,0.6)";
        ctx.fillText(`+${rem - maxDots}`, tx + (n * gap) / 2 + 10, 46);
      }
    }
    ctx.restore();
  }

  // ----- combo / rank -----
  if (game.combo > 0) {
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const pop = 1 + game.comboPop * 0.22;
    const cx = w - 28;
    const cy = 94;
    // rank
    if (game.rank) {
      const rc = rankColor(game.rank);
      const rs = 1 + game.rankPop * 0.3;
      ctx.save();
      ctx.translate(cx - 102, cy - 6);
      ctx.scale(rs, rs);
      ctx.font = `italic 700 30px Georgia,"Times New Roman",serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = rc;
      ctx.shadowColor = rc;
      ctx.shadowBlur = 12;
      ctx.fillText(game.rank, 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
      // slash
      ctx.strokeStyle = "rgba(230,200,140,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 83, cy - 19);
      ctx.lineTo(cx - 79, cy + 9);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(cx, cy - 8);
    ctx.scale(pop, pop);
    ctx.font = `700 34px ${UI_SANS}`;
    ctx.fillStyle = "#fff1d2";
    ctx.shadowColor = "rgba(255,90,80,0.55)";
    ctx.shadowBlur = 10;
    ctx.textAlign = "right";
    ctx.fillText(String(game.combo), 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.font = `600 12px ${UI_SANS}`;
    ctx.fillStyle = "rgba(238,214,176,0.8)";
    ctx.fillText("连", cx - 2, cy + 16);
    // timer
    const tw = 96;
    const tPct = clamp(game.comboTimer / 2.4, 0, 1);
    ctx.fillStyle = "rgba(8,6,10,0.45)";
    ctx.fillRect(cx - tw, cy + 27, tw, 2);
    ctx.fillStyle = game.rank ? rankColor(game.rank) : "rgba(255,180,140,0.8)";
    ctx.globalAlpha = 0.7;
    ctx.fillRect(cx - tw * tPct, cy + 27, tw * tPct, 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ----- run stats -----
  if (game.limbBreakCount > 0 || game.kills > 0) {
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = `10px ${UI_SANS}`;
    ctx.fillStyle = "rgba(215,188,150,0.5)";
    const sx = w - 24;
    const sy = h - 24;
    ctx.fillText(`断肢 ${game.limbBreakCount}   ·   斩 ${game.kills}`, sx, sy);
    ctx.restore();
  }

  // ----- skills (1-4) -----
  drawSkillBar();

  // ----- controls -----
  drawControlsPanel();
}

function drawSkillBar() {
  const p = game.player;
  if (!p || !p.skillCd) return;
  const w = view.w;
  const h = view.h;
  const n = SKILL_DEFS.length;
  const slotW = 66;
  const gap = 6;
  const slotH = 46;
  const totalW = n * slotW + (n - 1) * gap;
  const x = w - 22 - totalW;
  const y = h - 46 - 14 - 12 - slotH;

  ctx.save();
  // backing panel keeps the four inputs legible over the battlefield
  roundRect(ctx, x - 8, y - 17, totalW + 16, slotH + 25, 4);
  const backing = ctx.createLinearGradient(x, y - 17, x, y + slotH + 8);
  backing.addColorStop(0, "rgba(11,8,13,0.72)");
  backing.addColorStop(1, "rgba(6,5,9,0.84)");
  ctx.fillStyle = backing;
  ctx.fill();
  ctx.strokeStyle = "rgba(203,167,107,0.22)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `9px ${UI_SANS}`;
  ctx.fillStyle = "rgba(226,192,136,0.62)";
  ctx.fillText("技能  ·  1—4", x, y - 7);

  for (let i = 0; i < n; i++) {
    const def = SKILL_DEFS[i];
    const sx = x + i * (slotW + gap);
    const cd = p.skillCd[def.id] || 0;
    const ready = cd <= 0.001;
    const active = p.skill && p.skill.id === def.id;
    const deny = p.skillDenyT > 0 && p.skillDenyId === def.id;
    const pulse = 0.72 + 0.28 * Math.sin(game.realTime * 3.4 + i * 1.7);

    roundRect(ctx, sx, y, slotW, slotH, 3);
    const bg = ctx.createLinearGradient(sx, y, sx, y + slotH);
    bg.addColorStop(0, active ? "rgba(34,21,26,0.92)" : "rgba(12,9,14,0.78)");
    bg.addColorStop(1, "rgba(6,5,9,0.86)");
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = deny
      ? `rgba(255,80,80,${0.5 + 0.4 * Math.sin(game.realTime * 30)})`
      : ready
        ? rgba(def.color, active ? 0.95 : 0.42 + 0.22 * pulse)
        : "rgba(170,150,125,0.18)";
    ctx.lineWidth = ready || active ? 1.2 : 0.8;
    ctx.stroke();

    // top colour strip
    ctx.fillStyle = rgba(def.color, ready ? 0.55 : 0.16);
    ctx.fillRect(sx + 1, y + 1, slotW - 2, 1.6);

    // keycap
    drawKeycap(sx + 5, y + 6, def.key, {
      fontSize: 10, height: 15,
      fill: "rgba(24,18,26,0.9)",
      stroke: rgba(def.color, ready ? 0.7 : 0.25),
      color: ready ? "#f4e7cc" : "#9b8e7d",
    });

    // name
    ctx.font = `600 10px ${UI_SANS}`;
    ctx.textAlign = "left";
    ctx.fillStyle = ready ? "rgba(244,230,205,0.92)" : "rgba(190,172,148,0.55)";
    ctx.fillText(def.name, sx + 25, y + 14);

    // cooldown
    if (!ready) {
      const frac = clamp(cd / def.cd, 0, 1);
      ctx.fillStyle = "rgba(5,4,8,0.34)";
      ctx.fillRect(sx + 1, y + 2, slotW - 2, slotH - 4);
      // thin recharge line along the bottom
      ctx.fillStyle = rgba(def.color, 0.55);
      ctx.fillRect(sx + 1, y + slotH - 3.5, (slotW - 2) * (1 - frac), 2);
      ctx.textAlign = "center";
      if (active) {
        ctx.font = `600 10px ${UI_SANS}`;
        ctx.fillStyle = "rgba(255,236,206,0.94)";
        ctx.fillText("施放中", sx + slotW / 2, y + slotH - 11);
      } else {
        ctx.font = `600 11px ${UI_SANS}`;
        ctx.fillStyle = "rgba(10,7,10,0.75)";
        ctx.fillText(cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1), sx + slotW / 2 + 0.6, y + slotH - 10.4);
        ctx.fillStyle = "rgba(255,230,198,0.92)";
        ctx.fillText(cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1), sx + slotW / 2, y + slotH - 11);
      }
    } else {
      ctx.textAlign = "center";
      ctx.font = `9px ${UI_SANS}`;
      ctx.fillStyle = rgba(def.color, 0.55 + 0.25 * pulse);
      ctx.fillText(active ? "施放中" : "可用", sx + slotW / 2, y + slotH - 10);
    }
  }
  ctx.restore();
}

function rankColor(rank) {
  switch (rank) {
    case "SS": return "#ffe59a";
    case "S": return "#ffd273";
    case "A": return "#ffa07c";
    case "B": return "#ffc0cc";
    case "C": return "#cfe2da";
    default: return "#a8bcc0";
  }
}

function angledBar(x, y, w, h, cut) {
  const c = Math.min(cut, w / 3, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

function drawKeycap(x, y, label, opts = {}) {
  const fs = opts.fontSize || 10;
  ctx.font = `600 ${fs}px ${UI_SANS}`;
  const tw = ctx.measureText(label).width;
  const padX = 5;
  const h = opts.height || 16;
  const w = tw + padX * 2;
  roundRect(ctx, x, y, w, h, 2.5);
  ctx.fillStyle = opts.fill || "rgba(23,18,24,0.78)";
  ctx.fill();
  ctx.strokeStyle = opts.stroke || "rgba(215,181,121,0.4)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = opts.color || "#e9d7b4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  return w;
}

function keycapWidth(label, fs) {
  ctx.font = `600 ${fs}px ${UI_SANS}`;
  return ctx.measureText(label).width + 10;
}

function drawControlItems(x, y, items, opts = {}) {
  const fs = opts.fontSize || 10;
  const gapBetweenKeys = 2;
  const gapAfterKeys = 4;
  const gapItems = opts.gapItems || 13;
  let cx = x;
  ctx.textBaseline = "middle";
  for (const [keys, desc] of items) {
    for (let k = 0; k < keys.length; k++) {
      const w = drawKeycap(cx, y, keys[k], { fontSize: fs, fill: opts.fill, stroke: opts.stroke, color: opts.color });
      cx += w + gapBetweenKeys;
    }
    cx -= gapBetweenKeys;
    cx += gapAfterKeys;
    ctx.font = `${fs}px ${UI_SANS}`;
    ctx.textAlign = "left";
    ctx.fillStyle = opts.labelColor || "rgba(221,204,174,0.72)";
    ctx.fillText(desc, cx, y + (opts.height || 16) / 2 + 0.5);
    cx += ctx.measureText(desc).width + gapItems;
  }
  return cx;
}

function drawControlsPanel() {
  const w = view.w;
  const h = view.h;
  const fs = 10;
  const rowH = 18;
  const panelW = Math.min(690, w - 40);
  const panelH = 46;
  const x = 22;
  const y = h - panelH - 14;
  ctx.save();
  roundRect(ctx, x, y, panelW, panelH, 3);
  const g = ctx.createLinearGradient(x, y, x, y + panelH);
  g.addColorStop(0, "rgba(11,9,14,0.62)");
  g.addColorStop(1, "rgba(6,5,9,0.78)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(200,164,107,0.2)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // top accent
  ctx.fillStyle = "rgba(190,42,58,0.5)";
  ctx.fillRect(x + 1, y, 2, panelH - 2);

  const row1 = [
    [["A", "D"], "移动 · ←→"],
    [["SPACE"], "跳跃 / 二段"],
    [["J"], "连斩"],
    [["K"], "重斩 · 按住蓄力"],
  ];
  const row2 = [
    [["L"], "疾闪"],
    [["I"], "见切弹反"],
    [["R"], "重来"],
    [["ENTER"], "开始 / 再战"],
  ];
  drawControlItems(x + 14, y + 5, row1, { fontSize: fs, gapItems: 14 });
  drawControlItems(x + 14, y + 5 + rowH, row2, { fontSize: fs, gapItems: 14 });
  // small flavor on the right
  ctx.font = `9px ${UI_SANS}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(210,178,130,0.38)";
  ctx.fillText("斩其肢体 · 断其锋芒", x + panelW - 12, y + panelH - 10);
  ctx.restore();
}

function drawTutorialHint() {
  const w = view.w;
  const h = view.h;
  if (game.wave !== 1) return;
  const t = game.time;
  if (t > 17) return;
  let text = "";
  if (t < 4.6) text = "J 连斩命中后，按 L 疾闪可取消后摇";
  else if (t < 9) text = "I 见切：在敌人攻击命中前一瞬按下，弹反并令其失衡";
  else if (t < 13) text = "按住 K 蓄力，重斩可直接斩断肢体；断肢会改变敌人的行动";
  else text = "1-4 独立技能：月轮斩 · 影渡 · 千樱葬 · 断界";
  const fadeIn = clamp(t / 0.5, 0, 1);
  const fadeOut = clamp((17 - t) / 1.2, 0, 1);
  const alpha = Math.min(fadeIn, fadeOut) * 0.85;
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `13px ${UI_SANS}`;
  const tw = ctx.measureText(text).width;
  const bx = w / 2 - tw / 2 - 18;
  const by = 74;
  roundRect(ctx, bx, by - 13, tw + 36, 26, 13);
  ctx.fillStyle = "rgba(8,7,12,0.62)";
  ctx.fill();
  ctx.strokeStyle = "rgba(218,180,112,0.22)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = "rgba(240,222,188,0.88)";
  ctx.fillText(text, w / 2, by + 0.5);
  ctx.restore();
}

function drawBanners() {
  const w = view.w;
  const h = view.h;
  for (let i = 0; i < game.banners.length; i++) {
    const b = game.banners[i];
    const t = 1 - b.life / b.maxLife; // 0..1
    const fadeIn = clamp(t / 0.12, 0, 1);
    const fadeOut = clamp(b.life / 0.35, 0, 1);
    const a = Math.min(fadeIn, fadeOut);
    if (a <= 0.01) continue;
    const yy = h * 0.24 + i * 58;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // band
    const bandW = Math.min(430, w * 0.56);
    const bg = ctx.createLinearGradient(w / 2 - bandW / 2, 0, w / 2 + bandW / 2, 0);
    bg.addColorStop(0, "rgba(10,8,13,0)");
    bg.addColorStop(0.18, "rgba(12,9,14,0.55)");
    bg.addColorStop(0.82, "rgba(12,9,14,0.55)");
    bg.addColorStop(1, "rgba(10,8,13,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(w / 2 - bandW / 2, yy - 30, bandW, 58);
    // lines
    ctx.strokeStyle = rgba(b.color, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - bandW * 0.36, yy - 20);
    ctx.lineTo(w / 2 + bandW * 0.36, yy - 20);
    ctx.moveTo(w / 2 - bandW * 0.36, yy + 19);
    ctx.lineTo(w / 2 + bandW * 0.36, yy + 19);
    ctx.stroke();
    // text with spacing
    const spaced = b.text.split("").join(" ");
    ctx.font = `600 30px ${UI_SANS}`;
    ctx.fillStyle = b.color;
    ctx.shadowColor = rgba(b.color, 0.45);
    ctx.shadowBlur = 14;
    ctx.fillText(spaced, w / 2, yy - 1);
    ctx.shadowBlur = 0;
    if (b.sub) {
      ctx.font = `11px ${UI_SANS}`;
      ctx.fillStyle = "rgba(228,209,177,0.68)";
      ctx.fillText(b.sub, w / 2, yy + 25);
    }
    // flanking diamonds
    ctx.fillStyle = rgba(b.color, 0.55);
    for (const dx of [-bandW * 0.39, bandW * 0.39]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + dx, yy - 23);
      ctx.lineTo(w / 2 + dx + 3, yy - 20);
      ctx.lineTo(w / 2 + dx, yy - 17);
      ctx.lineTo(w / 2 + dx - 3, yy - 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------- title ---------------- */
function drawTitleScreen() {
  const w = view.w;
  const h = view.h;
  const t = game.realTime;
  ctx.save();
  // vignette / darkening
  const g = ctx.createRadialGradient(w * 0.64, h * 0.4, Math.min(w, h) * 0.08, w * 0.55, h * 0.5, Math.max(w, h) * 0.8);
  g.addColorStop(0, "rgba(4,4,10,0.08)");
  g.addColorStop(0.55, "rgba(4,4,10,0.42)");
  g.addColorStop(1, "rgba(3,3,7,0.84)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const titleY = h * 0.26;

  // small eyebrow
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(220,191,145,0.55)";
  ctx.fillText("月 下 无 尽 · 一 骑 斩 傀", cx, titleY - 63);

  // big title
  const tg = ctx.createLinearGradient(0, titleY - 42, 0, titleY + 38);
  tg.addColorStop(0, "#fff1d0");
  tg.addColorStop(0.35, "#ffb9a0");
  tg.addColorStop(0.62, "#e34d5c");
  tg.addColorStop(1, "#8f1c31");
  ctx.font = `700 ${Math.min(92, w * 0.09)}px ${UI_SANS}`;
  ctx.fillStyle = tg;
  ctx.shadowColor = "rgba(220,52,66,0.55)";
  ctx.shadowBlur = 26;
  ctx.fillText("绯 刃", cx, titleY);
  ctx.shadowBlur = 0;

  // subtitle
  ctx.font = `600 ${Math.min(24, w * 0.025)}px ${UI_SANS}`;
  ctx.fillStyle = "rgba(242,218,178,0.92)";
  ctx.fillText("月 下 斩", cx, titleY + 56);
  ctx.font = `11px ${UI_SANS}`;
  ctx.fillStyle = "rgba(211,190,160,0.55)";
  ctx.fillText("斩其肢体 · 断其锋芒 · 于刀锋之上求生", cx, titleY + 84);

  // ornamental line
  ctx.strokeStyle = "rgba(211,166,102,0.38)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 150, titleY + 100);
  ctx.lineTo(cx - 22, titleY + 100);
  ctx.moveTo(cx + 22, titleY + 100);
  ctx.lineTo(cx + 150, titleY + 100);
  ctx.stroke();
  ctx.fillStyle = "rgba(230,186,116,0.7)";
  ctx.beginPath();
  ctx.moveTo(cx, titleY + 96);
  ctx.lineTo(cx + 5, titleY + 100);
  ctx.lineTo(cx, titleY + 104);
  ctx.lineTo(cx - 5, titleY + 100);
  ctx.closePath();
  ctx.fill();

  // start prompt
  const pulse = 0.68 + 0.32 * Math.sin(t * 2.6);
  ctx.globalAlpha = pulse;
  ctx.font = `600 17px ${UI_SANS}`;
  ctx.fillStyle = "#f7e5bc";
  ctx.shadowColor = "rgba(255,110,90,0.5)";
  ctx.shadowBlur = 10;
  ctx.fillText("按  ENTER  开 始", cx, h * 0.575);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.7;
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(224,204,172,0.6)";
  ctx.fillText("或 点 击 任 意 处", cx, h * 0.575 + 24);
  ctx.globalAlpha = 1;

  // controls panel
  const panelW = Math.min(700, w - 48);
  const panelH = 132;
  const px = cx - panelW / 2;
  const py = Math.min(h - panelH - 32, h * 0.68);
  roundRect(ctx, px, py, panelW, panelH, 4);
  const pg = ctx.createLinearGradient(px, py, px, py + panelH);
  pg.addColorStop(0, "rgba(13,10,16,0.74)");
  pg.addColorStop(1, "rgba(7,6,10,0.82)");
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.strokeStyle = "rgba(203,167,107,0.3)";
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.fillStyle = "rgba(192,45,60,0.55)";
  ctx.fillRect(px + 1, py + 1, 2, panelH - 2);

  ctx.textAlign = "left";
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(224,198,154,0.66)";
  ctx.fillText("操 作", px + 18, py + 17);

  const fs = 11;
  const gap = 16;
  const rowY = (n) => py + 27 + n * 28;
  drawControlItems(px + 18, rowY(0), [
    [["A", "D / ← →"], "移动"],
    [["SPACE"], "跳跃 / 二段"],
    [["J"], "连斩（三段）"],
    [["K"], "重斩 / 按住蓄力"],
  ], { fontSize: fs, gapItems: gap, labelColor: "rgba(235,219,190,0.82)" });
  drawControlItems(px + 18, rowY(1), [
    [["L"], "疾闪（无敌帧）"],
    [["I"], "见切弹反"],
    [["R"], "立即重来"],
    [["ENTER"], "开始 / 再战"],
  ], { fontSize: fs, gapItems: gap, labelColor: "rgba(235,219,190,0.82)" });

  // skills row
  ctx.textAlign = "left";
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(230,185,120,0.7)";
  ctx.fillText("技能", px + 18, rowY(2) + 8);
  drawControlItems(px + 52, rowY(2), [
    [["1"], "月轮斩"],
    [["2"], "影渡"],
    [["3"], "千樱葬"],
    [["4"], "断界"],
  ], { fontSize: fs, gapItems: 12, labelColor: "rgba(240,214,176,0.9)" });

  ctx.textAlign = "center";
  ctx.font = `9px ${UI_SANS}`;
  ctx.fillStyle = "rgba(205,183,151,0.42)";
  ctx.fillText("1–4 为独立技能，冷却结束后可再次施放 · 技能可打断攻击后摇", cx, py + panelH - 12);

  ctx.restore();
}

/* ---------------- death ---------------- */
function drawDeathScreen() {
  const w = view.w;
  const h = view.h;
  const a = clamp((game.overTimer || 0) / 0.5, 0, 1);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(3,3,7,0.68)";
  ctx.fillRect(0, 0, w, h);
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.08, w / 2, h * 0.45, Math.max(w, h) * 0.7);
  vg.addColorStop(0, "rgba(90,10,18,0.1)");
  vg.addColorStop(0.6, "rgba(55,6,12,0.15)");
  vg.addColorStop(1, "rgba(20,2,6,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.min(66, w * 0.07)}px ${UI_SANS}`;
  ctx.fillStyle = "#e8cdb0";
  ctx.shadowColor = "rgba(180,30,40,0.6)";
  ctx.shadowBlur = 22;
  ctx.fillText("力 竭", cx, cy);
  ctx.shadowBlur = 0;
  ctx.font = `11px ${UI_SANS}`;
  ctx.fillStyle = "rgba(219,196,164,0.55)";
  ctx.fillText("月 影 吞 锋 · 刃 未 折", cx, cy + 46);

  // stat block
  const bw = Math.min(500, w - 80);
  const bh = 90;
  const bx = cx - bw / 2;
  const by = cy + 78;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fillStyle = "rgba(10,8,13,0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(200,160,105,0.24)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const stats = [
    ["抵达", `第 ${cnNum(game.wave)} 阵`],
    ["斩击", `${game.hitCount} 次`],
    ["断肢", `${game.limbBreakCount} 处`],
    ["最高连击", `${game.maxCombo}`],
  ];
  const sw = bw / stats.length;
  for (let i = 0; i < stats.length; i++) {
    const sx = bx + sw * i + sw / 2;
    if (i > 0) {
      ctx.strokeStyle = "rgba(200,165,110,0.14)";
      ctx.beginPath();
      ctx.moveTo(bx + sw * i, by + 16);
      ctx.lineTo(bx + sw * i, by + bh - 16);
      ctx.stroke();
    }
    ctx.font = `10px ${UI_SANS}`;
    ctx.fillStyle = "rgba(202,178,143,0.55)";
    ctx.fillText(stats[i][0], sx, by + 28);
    ctx.font = `600 19px ${UI_SANS}`;
    ctx.fillStyle = i === 3 ? "#ffd88c" : "#f2e2c6";
    ctx.fillText(stats[i][1], sx, by + 55);
  }

  // prompt
  const pulse = 0.65 + 0.35 * Math.sin(game.realTime * 3.2);
  ctx.globalAlpha = a * pulse;
  ctx.font = `600 16px ${UI_SANS}`;
  ctx.fillStyle = "#f6e3b9";
  ctx.shadowColor = "rgba(255,120,90,0.4)";
  ctx.shadowBlur = 8;
  ctx.fillText("按  R  或  ENTER  再 战", cx, by + bh + 52);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = a * 0.65;
  ctx.font = `10px ${UI_SANS}`;
  ctx.fillStyle = "rgba(215,194,163,0.55)";
  ctx.fillText("点 击 任 意 处 也 可 重 新 开 始", cx, by + bh + 76);
  ctx.restore();
}

/* ===== 90-boot.js ===== */
/* ============================================================
   Boot: sizing, read-only state API, main loop
   ============================================================ */
function resize() {
  const w = Math.max(1, window.innerWidth || 960);
  const h = Math.max(1, window.innerHeight || 540);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxDpr = Math.sqrt(MAX_DPR_PIXELS / Math.max(1, w * h));
  dpr = Math.min(dpr, Math.max(0.75, maxDpr));
  view.w = w;
  view.h = h;
  view.dpr = dpr;
  view.scale = Math.min(h / DESIGN_H, w / DESIGN_W);
  view.viewW = w / view.scale;
  view.viewH = h / view.scale;
  view.camY = DESIGN_H - view.viewH;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.imageSmoothingEnabled = true;
  if (game.player) {
    game.camera.x = clamp(game.camera.x, cameraMinX(), cameraMaxX());
    game.camera.targetX = clamp(game.camera.targetX, cameraMinX(), cameraMaxX());
  }
}

function boot() {
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("load", resize);
  // Layout can settle after the script runs in embedded/iframe contexts.
  setTimeout(resize, 80);
  setTimeout(resize, 500);

  game.player = createPlayer(WORLD_W / 2);
  game.player.facing = -1;
  game.camera.x = clamp(
    game.player.x - view.viewW * 0.90,
    cameraMinX(),
    cameraMaxX()
  );
  game.camera.targetX = game.camera.x;
  game.ready = true;

  if (game.pendingStart) {
    game.pendingStart = false;
    startGame();
  }

  requestAnimationFrame(frame);
}

let lastFrameTime = 0;
let firstFrame = true;

function frame(now) {
  if (firstFrame) {
    lastFrameTime = now;
    firstFrame = false;
  }
  let raw = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (!isFinite(raw) || raw < 0) raw = 0;
  raw = Math.min(raw, 0.05);

  updateRealTime(raw);

  if (game.hitStop > 0.0001) {
    game.hitStop = Math.max(0, game.hitStop - raw);
  } else {
    const sdt = raw * game.timeScale;
    accumulator += sdt;
    let steps = 0;
    while (accumulator >= STEP && steps < 8) {
      stepGame(STEP);
      accumulator -= STEP;
      steps++;
    }
    if (steps >= 8) accumulator = 0;
  }

  render();
  requestAnimationFrame(frame);
}

/* opt-in read-only debug snapshot for automated playtests (?debug=1) */
if (typeof location !== "undefined" && /[?&]debug=1(?:&|$)/.test(location.search)) {
  try {
    Object.defineProperty(window, "__combatDebug", {
      value: function () {
        const p = game.player;
        return {
          mode: game.mode,
          time: game.time,
          wave: game.wave,
          wavePhase: game.wavePhase,
          waveRemaining: game.waveRemaining,
          pending: game.pendingSpawns.length,
          player: p
            ? {
                x: p.x, y: p.y, hp: p.hp, state: p.state, facing: p.facing,
                grounded: p.grounded, iframes: p.iframes, dead: p.dead,
                jumpCount: p.jumpCount, airDashUsed: p.airDashUsed,
                atk: p.atk ? { kind: p.atk.kind, t: p.atk.t, def: p.atk.def.pose } : null,
                charge: p.state === "charge" ? p.chargeLevel : 0,
                parryT: p.state === "parry" ? p.parryT : null,
                skill: p.skill ? { id: p.skill.id, t: p.skill.t, released: !!p.skill.released, blinked: !!p.skill.blinked } : null,
                skillCd: p.skillCd ? { 1: p.skillCd[1], 2: p.skillCd[2], 3: p.skillCd[3], 4: p.skillCd[4] } : null,
              }
            : null,
          enemies: game.enemies.map((e) => ({
            id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, alive: e.alive,
            state: e.state, stun: e.stun, spawnT: e.spawnT,
            windup: e.state === "windup" && e.atk ? e.atk.t / Math.max(0.001, e.atk.windup) : null,
            atkKind: e.atk ? e.atk.kind : null,
            broken: Object.keys(e.parts).filter((k) => e.parts[k].broken),
            arms: e.arms, legs: e.legsCount, canShoot: e.canShoot,
          })),
          projectiles: game.projectiles.map((pr) => ({ type: pr.type, x: pr.x, y: pr.y, vx: pr.vx })),
          skillFxCount: game.skillFx.length,
          hitStop: game.hitStop,
          timeScale: game.timeScale,
        };
      },
      writable: false,
      configurable: false,
    });
  } catch (e) {}
}

/* read-only telemetry API */
function combatBenchState() {
  const p = game.player;
  return {
    ready: game.ready === true,
    playerAlive: game.mode !== "title" && !!(p && !p.dead && p.hp > 0),
    enemyCount: aliveEnemies(),
    hitCount: game.hitCount | 0,
    limbBreakCount: game.limbBreakCount | 0,
    playing: game.mode === "play" && !!(p && !p.dead && p.hp > 0),
  };
}
try {
  Object.defineProperty(window, "combatBenchState", {
    value: combatBenchState,
    writable: false,
    configurable: false,
    enumerable: true,
  });
} catch (err) {
  window.combatBenchState = combatBenchState;
}

/*
 * Boot immediately so window.combatBenchState() is usable as soon as the
 * script has parsed. The embedded font is warm-loaded in parallel; canvas
 * text falls back gracefully for the first frames if decoding is slow.
 */
let bootStarted = false;
function startBoot() {
  if (bootStarted) return;
  bootStarted = true;
  try {
    boot();
  } catch (err) {
    bootStarted = false;
    // A transient first-frame failure (font/canvas warm-up) should not leave
    // the player on a blank screen or permanently un-ready game.
    setTimeout(() => {
      try {
        startBoot();
      } catch (e2) {}
    }, 250);
  }
}
try {
  if (document.fonts && typeof document.fonts.load === "function") {
    try {
      const fontPromise = document.fonts.load('600 16px "CombatSerif"');
      if (fontPromise && typeof fontPromise.catch === "function") {
        fontPromise.catch(() => {});
      }
    } catch (e) {}
  }
} catch (e) {}
setTimeout(() => {
  // Redundant kick: guarantees a live scene even if a font promise stalls.
  startBoot();
}, 1800);
startBoot();

})();
