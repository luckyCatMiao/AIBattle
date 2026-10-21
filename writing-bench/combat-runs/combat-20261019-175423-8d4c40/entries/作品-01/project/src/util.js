/* =========================================================
   util.js — math, input, camera, vector drawing helpers
   ========================================================= */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sign = (v) => (v < 0 ? -1 : 1);
const approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
const easeInQuad = (t) => t * t;
const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/* ---- rect / arc overlap ---- */
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
// distance from point to line segment
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

/* =========================================================
   Input
   ========================================================= */
const KEY_ACTIONS = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  KeyJ: 'attack',
  KeyK: 'heavy',
  KeyL: 'dash',
  KeyI: 'special',
  KeyR: 'restart',
  Enter: 'confirm',
  KeyP: 'pause',
  Digit1: 'skill1', Numpad1: 'skill1',
  Digit2: 'skill2', Numpad2: 'skill2',
  Digit3: 'skill3', Numpad3: 'skill3',
  Digit4: 'skill4', Numpad4: 'skill4'
};

class Input {
  constructor() {
    this.down = Object.create(null);       // action -> bool
    this.pressed = Object.create(null);    // action -> frames since press (for buffer)
    this.released = Object.create(null);
    this.bufferFrames = 9;
    this.anyKeyThisFrame = false;
    this.attach();
  }
  attach() {
    window.addEventListener('keydown', (e) => {
      const a = KEY_ACTIONS[e.code];
      if (a) {
        e.preventDefault();
        if (!e.repeat) {
          this.down[a] = true;
          this.pressed[a] = 0;
          this.anyKeyThisFrame = true;
        }
      }
      // also block page scroll on space/arrows even if unmapped
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    }, { passive: false });
    window.addEventListener('keyup', (e) => {
      const a = KEY_ACTIONS[e.code];
      if (a) { this.down[a] = false; this.released[a] = true; e.preventDefault(); }
    }, { passive: false });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
  }
  clear() {
    for (const k in this.down) this.down[k] = false;
    for (const k in this.pressed) delete this.pressed[k];
    for (const k in this.released) delete this.released[k];
  }
  // call at end of each sim step
  step() {
    for (const k in this.pressed) {
      this.pressed[k]++;
      if (this.pressed[k] > this.bufferFrames) delete this.pressed[k];
    }
    for (const k in this.released) delete this.released[k];
    this.anyKeyThisFrame = false;
  }
  // consume a buffered press (returns true once)
  consume(action) {
    if (this.pressed[action] !== undefined) { delete this.pressed[action]; return true; }
    return false;
  }
  buffered(action) { return this.pressed[action] !== undefined; }
  held(action) { return !!this.down[action]; }
  clearBuffer(action) { delete this.pressed[action]; }
}

/* =========================================================
   Camera — follow with lookahead, clamp to arena, shake, zoom punch
   ========================================================= */
class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.vw = 960; this.vh = 540;
    this.shakeMag = 0; this.shakeT = 0; this.shakeDur = 0.2;
    this.offX = 0; this.offY = 0;
    this.zoom = 1; this.zoomTarget = 1;
    this.zoomKick = 0;
    this._seed = Math.random() * 1000;
  }
  resize(vw, vh) { this.vw = vw; this.vh = vh; }
  shake(mag, dur) {
    // never stack into endless rumble: take the strongest, keep it short
    if (mag >= this.shakeMag || this.shakeT <= 0) { this.shakeMag = Math.min(mag, 11); }
    this.shakeDur = dur || 0.18;
    this.shakeT = Math.max(this.shakeT, this.shakeDur);
  }
  punch(amount) { this.zoomKick = Math.max(this.zoomKick, amount); }
  update(dt, world) {
    const p = world.player;
    let tx = p ? p.x + p.facing * 40 : 0;
    let ty = (p ? p.y : 400) - 60;
    // lookahead toward nearest living enemy in front/behind
    let nearest = null, nd = 1e9;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = Math.abs(e.x - (p ? p.x : 0));
      if (d < nd) { nd = d; nearest = e; }
    }
    if (nearest && p) {
      const t = clamp(1 - nd / 620, 0, 1) * 0.55;
      tx = lerp(tx, (p.x * 0.45 + nearest.x * 0.55), t);
      ty = lerp(ty, Math.min(p.y, nearest.y) - 80, t * 0.8);
    }
    // keep player (and fight) roughly in frame
    tx = clamp(tx, p ? p.x - 150 : -1e9, p ? p.x + 150 : 1e9);
    const halfW = this.vw / 2, halfH = this.vh / 2;
    const arenaMin = world.arena.x1 + halfW * 0.72;
    const arenaMax = world.arena.x2 - halfW * 0.72;
    if (arenaMin <= arenaMax) tx = clamp(tx, arenaMin, arenaMax);
    else tx = (world.arena.x1 + world.arena.x2) / 2;
    ty = clamp(ty, -260, 300);
    const k = 1 - Math.pow(0.001, dt);
    this.x = lerp(this.x, tx, k * 0.9);
    this.y = lerp(this.y, ty, k * 0.75);

    // shake decay
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const t = this.shakeT / this.shakeDur;
      const mag = this.shakeMag * t * t;
      this._seed += dt * 61;
      this.offX = Math.sin(this._seed * 37.1) * mag;
      this.offY = Math.cos(this._seed * 27.7) * mag * 0.7;
      if (this.shakeT === 0) { this.shakeMag = 0; this.offX = 0; this.offY = 0; }
    } else { this.offX = 0; this.offY = 0; }

    this.zoomKick = Math.max(0, this.zoomKick - dt * 3.2);
    this.zoom = 1 + easeOutQuad(this.zoomKick) * 0.03;
  }
  apply(ctx) {
    ctx.translate(this.vw / 2, this.vh / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.vw / 2, -this.vh / 2);
    ctx.translate(Math.round(-this.x + this.vw / 2 + this.offX), Math.round(-this.y + this.vh / 2 + this.offY));
  }
}

/* =========================================================
   Shape helpers
   ========================================================= */
function capsule(ctx, x1, y1, x2, y2, w1, w2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(x1 + nx * w1, y1 + ny * w1);
  ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
  ctx.arc(x2, y2, w2, a + Math.PI / 2, a - Math.PI / 2, true);
  ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
  ctx.arc(x1, y1, w1, a - Math.PI / 2, a + Math.PI / 2, true);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// crescent slash ribbon: inner radius arc + outer radius arc
function crescent(ctx, cx, cy, r0, r1, a0, a1) {
  ctx.beginPath();
  ctx.arc(cx, cy, r1, a0, a1, false);
  ctx.arc(cx, cy, r0, a1, a0, true);
  ctx.closePath();
}

function glowCircle(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}

function hexColor(h, a) { return 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',' + a + ')'; }

/* =========================================================
   Screen-space text helper (drawn without camera transform)
   ========================================================= */
function gameFont(ctx, size, weight) {
  ctx.font = (weight || 700) + ' ' + size + 'px "Trebuchet MS", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
}
