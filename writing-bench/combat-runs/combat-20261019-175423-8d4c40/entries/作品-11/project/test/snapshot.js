// snapshot.js — 纯 Node 软件光栅化器：拦截 Canvas 调用渲染成 PNG，用于人工检查画面
'use strict';
const fs = require('fs');
const vm = require('vm');
const zlib = require('zlib');
const path = require('path');

// ---------------- PNG 编码 ----------------
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------- 颜色解析 ----------------
function parseColor(c) {
  if (!c) return [0, 0, 0, 1];
  if (Array.isArray(c)) return c;
  if (c.stops) { // gradient → 加权平均
    let r = 0, g = 0, b = 0, a = 0, tw = 0;
    for (const [off, col] of c.stops) { const q = parseColor(col); r += q[0] * off; g += q[1] * off; b += q[2] * off; a += q[3] * off; tw += off; }
    if (tw <= 0) return [0, 0, 0, 1];
    return [r / tw, g / tw, b / tw, Math.min(1, a / tw)];
  }
  c = String(c).trim();
  if (c[0] === '#') {
    if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16), 1];
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  }
  let m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map(s => parseFloat(s));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return [120, 120, 120, 1];
}

// ---------------- 光栅化 Canvas ----------------
class Raster {
  constructor(w, h) {
    this.width = w; this.height = h;
    this.w = w; this.h = h;
    this.buf = Buffer.alloc(w * h * 4); // 透明起始（与真实 canvas 一致）
    this.bw = w; this.bh = h;
    this.t = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.alpha = 1; this.comp = 'source-over';
    this.path = []; this.cur = null;
    this.fillStyle = '#000'; this.strokeStyle = '#000';
    this.lineWidth = 1; this.font = '10px sans-serif'; this.textAlign = 'left';
    this.ops = 0;
  }
  apply(x, y) {
    const [a, b, c, d, e, f] = this.t;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  scaleOf() { const [a, b, c, d] = this.t; return Math.sqrt(Math.abs(a * d - b * c)) || 1; }
  setTransform(a, b, c, d, e, f) { this.t = [a, b, c, d, e, f]; }
  save() { this.stack.push({ t: [...this.t], alpha: this.alpha, fill: this.fillStyle, stroke: this.strokeStyle, lw: this.lineWidth }); }
  restore() { const s = this.stack.pop(); if (s) { this.t = s.t; this.alpha = s.alpha; this.fillStyle = s.fill; this.strokeStyle = s.stroke; this.lineWidth = s.lw; } }
  translate(x, y) { const [a, b, c, d, e, f] = this.t; this.t = [a, b, c, d, a * x + c * y + e, b * x + d * y + f]; }
  rotate(r) {
    const co = Math.cos(r), si = Math.sin(r);
    const [a, b, c, d, e, f] = this.t;
    this.t = [a * co + c * si, b * co + d * si, c * co - a * si, d * co - b * si, e, f];
  }
  scale(sx, sy) { const [a, b, c, d, e, f] = this.t; this.t = [a * sx, b * sx, c * sy, d * sy, e, f]; }
  beginPath() { this.path = []; this.cur = null; }
  moveTo(x, y) { this.cur = [this.apply(x, y)]; this.path.push(this.cur); }
  lineTo(x, y) { if (this.cur) this.cur.push(this.apply(x, y)); }
  closePath() { if (this.cur && this.cur.length) this.cur.push(this.cur[0]); }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this.cur) return;
    const p0 = this.cur[this.cur.length - 1];
    const c0 = this.apply(cx, cy), p1 = this.apply(x, y);
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, u = 1 - t;
      this.cur.push([u * u * p0[0] + 2 * u * t * c0[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c0[1] + t * t * p1[1]]);
    }
  }
  arc(x, y, r, a0, a1) {
    const c = this.apply(x, y);
    const rr = r * this.scaleOf();
    const pts = [];
    const n = (a1 - a0) >= TAU - 0.01 ? 26 : 14;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      pts.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
    }
    this.cur = pts; this.path.push(this.cur);
  }
  rect(x, y, w, h) {
    this.cur = [this.apply(x, y), this.apply(x + w, y), this.apply(x + w, y + h), this.apply(x, y + h), this.apply(x, y)];
    this.path.push(this.cur);
  }
  ensure() {
    const w = Math.max(1, this.width | 0), h = Math.max(1, this.height | 0);
    if (!this.buf || this.bw !== w || this.bh !== h) {
      this.w = w; this.h = h; this.bw = w; this.bh = h;
      this.buf = Buffer.alloc(w * h * 4);
    }
  }
  px(x, y, r, g, b, a) {
    this.ensure();
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const da = this.buf[i + 3] / 255;
    const outA = a + da * (1 - a);
    if (outA <= 0) return;
    if (this.comp === 'lighter') {
      this.buf[i] = Math.min(255, this.buf[i] + r * a);
      this.buf[i + 1] = Math.min(255, this.buf[i + 1] + g * a);
      this.buf[i + 2] = Math.min(255, this.buf[i + 2] + b * a);
    } else {
      this.buf[i] = (r * a + this.buf[i] * da * (1 - a)) / outA;
      this.buf[i + 1] = (g * a + this.buf[i + 1] * da * (1 - a)) / outA;
      this.buf[i + 2] = (b * a + this.buf[i + 2] * da * (1 - a)) / outA;
    }
    this.buf[i + 3] = outA * 255;
  }
  segThick(x1, y1, x2, y2, w, col) {
    if (typeof global.__oplog !== 'undefined' && (Math.max(x1,x2) > 1050 && Math.min(y1,y2) < 220) && (Math.abs(x2-x1) + Math.abs(y2-y1) > 40)) {
      global.__oplog.push('seg (' + x1.toFixed(0) + ',' + y1.toFixed(0) + ')->(' + x2.toFixed(0) + ',' + y2.toFixed(0) + ') w' + w.toFixed(1) + ' rgb' + col.slice(0,3).map(v => v.toFixed(0)) + ' comp=' + this.comp);
    }
    const [r, g, b, a0] = col;
    const rad = Math.max(0.5, w / 2);
    const minX = Math.max(0, Math.floor(Math.min(x1, x2) - rad - 1));
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(x1, x2) + rad + 1));
    const minY = Math.max(0, Math.floor(Math.min(y1, y2) - rad - 1));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(y1, y2) + rad + 1));
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy || 1e-6;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let t = ((x - x1) * dx + (y - y1) * dy) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = x1 + dx * t, py = y1 + dy * t;
        const d2 = (x - px) * (x - px) + (y - py) * (y - py);
        if (d2 <= rad * rad) {
          const edge = rad - Math.sqrt(d2);
          const aa = Math.min(1, a0 * (edge < 1 ? edge + 0.5 : 1));
          this.px(x, y, r, g, b, aa);
        }
      }
    }
    this.ops++;
  }
  gradAt(g, lx, ly) {
    // lx,ly: 未变换的局部坐标
    let t = 0;
    if (g.rad) {
      const { x0, y0, r0, x1, y1, r1 } = g.rad;
      const dx = lx - x1, dy = ly - y1;
      t = Math.hypot(dx, dy) / (r1 || 1);
    } else if (g.lin) {
      const { x0, y0, x1, y1 } = g.lin;
      const dx = x1 - x0, dy = y1 - y0;
      const l2 = dx * dx + dy * dy || 1e-6;
      t = ((lx - x0) * dx + (ly - y0) * dy) / l2;
    }
    t = clamp(t, 0, 1);
    const st = g.stops;
    if (!st.length) return [0, 0, 0, 0];
    if (t <= st[0][0]) return parseColor(st[0][1]);
    for (let i = 1; i < st.length; i++) {
      if (t <= st[i][0]) {
        const k = (t - st[i - 1][0]) / (st[i][0] - st[i - 1][0] || 1e-6);
        const c0 = parseColor(st[i - 1][1]), c1 = parseColor(st[i][1]);
        return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k), lerp(c0[3], c1[3], k)];
      }
    }
    return parseColor(st[st.length - 1][1]);
  }
  stroke() {
    this.ensure();
    const col = parseColor(this.strokeStyle);
    col[3] *= this.alpha;
    const w = this.lineWidth * this.scaleOf();
    for (const sub of this.path) {
      for (let i = 1; i < sub.length; i++) this.segThick(sub[i - 1][0], sub[i - 1][1], sub[i][0], sub[i][1], w, col);
    }
  }
  fillPoly(sub, col) {
    if (typeof global.__oplog !== 'undefined') {
      const mx = Math.max(...sub.map(p => p[0])), my = Math.min(...sub.map(p => p[1]));
      if (mx > 1050 && my < 220) global.__oplog.push('fill ' + sub.length + 'pts [' + sub.slice(0,3).map(p => '(' + p[0].toFixed(0) + ',' + p[1].toFixed(0) + ')').join(' ') + '] rgb' + col.slice(0,3).map(v => v.toFixed(0)) + ' a' + col[3].toFixed(2) + ' comp=' + this.comp);
    }
    let minY = 1e9, maxY = -1e9;
    for (const p of sub) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    minY = Math.max(0, Math.floor(minY)); maxY = Math.min(this.h - 1, Math.ceil(maxY));
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0; i < sub.length; i++) {
        const a = sub[i], b = sub[(i + 1) % sub.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.max(0, Math.ceil(xs[i])), x1 = Math.min(this.w - 1, Math.floor(xs[i + 1]));
        for (let x = x0; x <= x1; x++) this.px(x, y, col[0], col[1], col[2], col[3]);
      }
    }
    this.ops++;
  }
  fill() {
    this.ensure();
    const fs = this.fillStyle;
    if (fs && fs.__g) {
      // 逐像素渐变填充（含 alpha 衰减），局部坐标逆变换求值
      const [ia, ib, ic, id2, ie, if_] = this.t;
      const det = ia * id2 - ib * ic || 1e-6;
      for (const sub of this.path) {
        if (sub.length <= 2) continue;
        let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
        for (const p of sub) {
          if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
          if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        }
        minY = Math.max(0, Math.floor(minY)); maxY = Math.min(this.h - 1, Math.ceil(maxY));
        minX = Math.max(0, Math.floor(minX)); maxX = Math.min(this.w - 1, Math.ceil(maxX));
        for (let y = minY; y <= maxY; y++) {
          const xs = [];
          for (let i = 0; i < sub.length; i++) {
            const a = sub[i], b = sub[(i + 1) % sub.length];
            if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
          }
          xs.sort((p, q) => p - q);
          for (let i = 0; i + 1 < xs.length; i += 2) {
            const xa = Math.max(minX, Math.ceil(xs[i])), xb = Math.min(maxX, Math.floor(xs[i + 1]));
            for (let x = xa; x <= xb; x++) {
              // 屏幕坐标 → 局部坐标
              const sx = x + 0.5, sy = y + 0.5;
              const rx = sx - ie, ry = sy - if_;
              const lx = (rx * id2 - ry * ic) / det;
              const ly = (ry * ia - rx * ib) / det;
              const cc = this.gradAt(fs, lx, ly);
              this.px(x, y, cc[0], cc[1], cc[2], cc[3] * this.alpha);
            }
          }
        }
        this.ops += (maxX - minX) * (maxY - minY) / 50;
      }
      return;
    }
    const col = parseColor(fs);
    col[3] *= this.alpha;
    for (const sub of this.path) if (sub.length > 2) this.fillPoly(sub, col);
  }
  fillRect(x, y, w, h) {
    this.beginPath(); this.rect(x, y, w, h); this.fill();
  }
  strokeRect(x, y, w, h) {
    this.beginPath(); this.rect(x, y, w, h);
    const c0 = this.strokeStyle; this.stroke();
  }
  drawImage(srcImg, a1, a2, a3, a4, a5, a6, a7, a8) {
    if (!srcImg || !srcImg.ensure) throw new TypeError('drawImage: invalid source canvas');
    srcImg.ensure();
    if (!srcImg.buf) return;
    let sx = 0, sy = 0, sw, sh, dx, dy, dw, dh;
    if (a5 !== undefined) { sx = a1; sy = a2; sw = a3; sh = a4; dx = a5; dy = a6; dw = a7; dh = a8; }
    else if (a3 !== undefined) { dx = a1; dy = a2; dw = a3; dh = a4; sw = srcImg.width; sh = srcImg.height; }
    else { dx = a1; dy = a2; sw = srcImg.width; sh = srcImg.height; dw = sw; dh = sh; }
    if (![dx, dy, dw, dh].every(Number.isFinite)) return;
    const p0 = this.apply(dx, dy);
    const s = this.scaleOf();
    const W = dw * s, H = dh * s;
    if (W < 1 || H < 1) return;
    const x0 = p0[0], y0 = p0[1];
    // 旋转/缩放分解
    const [ma, mb, mc, md] = [this.t[0] * s / s, this.t[1] * s / s, this.t[2] * s / s, this.t[3] * s / s];
    const ia = this.t[0], ib = this.t[1], ic = this.t[2], id2 = this.t[3], ie = this.t[4], if_ = this.t[5];
    const det = ia * id2 - ib * ic || 1e-6;
    const x0i = Math.max(0, Math.floor(x0)), y0i = Math.max(0, Math.floor(y0));
    const x1i = Math.min(this.w - 1, Math.ceil(x0 + W)), y1i = Math.min(this.h - 1, Math.ceil(y0 + H));
    this.ops += (x1i - x0i) * (y1i - y0i) / 50;
    for (let y = y0i; y <= y1i; y++) {
      for (let x = x0i; x <= x1i; x++) {
        const sxp = x + 0.5, syp = y + 0.5;
        const rx = sxp - ie, ry = syp - if_;
        const lx = (rx * id2 - ry * ic) / det;   // 目标坐标 → 源像素坐标（源在自身 1:1 空间）
        const ly = (ry * ia - rx * ib) / det;
        const sxx = Math.floor(sx + (lx - dx) * (sw / dw));
        const syy = Math.floor(sy + (ly - dy) * (sh / dh));
        if (sxx < 0 || syy < 0 || sxx >= srcImg.width || syy >= srcImg.height) continue;
        const i = (syy * srcImg.width + sxx) * 4;
        const a = srcImg.buf[i + 3] / 255;
        if (a <= 0.01) continue;
        this.px(x, y, srcImg.buf[i], srcImg.buf[i + 1], srcImg.buf[i + 2], a * this.alpha);
      }
    }
  }
  fillText(s, x, y) {
    const col = parseColor(this.fillStyle); col[3] *= this.alpha * 0.85;
    const m = String(this.font).match(/(\d+(?:\.\d+)?)px/);
    const size = m ? parseFloat(m[1]) : 12;
    const w = String(s).length * size * 0.6;
    const p1 = this.apply(x, y - size);
    const p2 = this.apply(x + (this.textAlign === 'center' ? w / 2 : this.textAlign === 'right' ? w : 0), y);
    this.segThick(p1[0], p1[1], p2[0], p2[1], size * 0.8, [col[0], col[1], col[2], col[3] * 0.5]);
  }
  strokeText() {}
  measureText(s) { return { width: String(s).length * 8 }; }
  createLinearGradient(x0, y0, x1, y1) {
    const g = { stops: [], __g: 1, lin: { x0, y0, x1, y1 } };
    g.addColorStop = (o, c) => g.stops.push([o, c]);
    return g;
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const g = { stops: [], __g: 1, rad: { x0, y0, r0, x1, y1, r1 } };
    g.addColorStop = (o, c) => g.stops.push([o, c]);
    return g;
  }
  setLineDash() {}
  getContext() { return this; }
}
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------- 场景桩 ----------------
function makeEl(id) {
  const L = {};
  return { id, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    textContent: '', addEventListener(t, f) { (L[t] = L[t] || []).push(f); }, click() {} };
}
const winL = {};
const elReg = {};
const doc = {
  readyState: 'complete', hidden: false, body: makeEl('body'),
  getElementById(id) { return elReg[id] || (elReg[id] = makeEl(id)); },
  createElement: (t) => {
    if (t === 'canvas') { return new Raster(8, 8); }
    return makeEl('el');
  },
  addEventListener() {},
};
const sandbox = { console, performance: { now: () => simT }, devicePixelRatio: 1,
  addEventListener(t, f) { (winL[t] = winL[t] || []).push(f); }, removeEventListener() {} };
sandbox.window = sandbox; sandbox.document = doc;
const rafQ = [];
sandbox.requestAnimationFrame = f => { rafQ.push(f); };
let simT = 0;
const key = (t, c) => (winL[t] || []).forEach(f => f({ code: c, repeat: false, preventDefault() {} }));
function step(n) { for (let i = 0; i < n; i++) { simT += 16.6667; const q = rafQ.splice(0); for (const f of q) f(simT); } }

const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

vm.createContext(sandbox);
const raster = new Raster(1280, 720);
raster.canvas = { width: 1280, height: 720 };
elReg.game = raster;
sandbox.__raster = raster;
let dumpN = 0;
sandbox.__dumpHook = { dumpMain: (tag) => {
  const png = encodePNG(1280, 720, raster.buf);
  fs.mkdirSync('/workspace/shots', { recursive: true });
  fs.writeFileSync('/workspace/shots/dump-' + (tag || 'x') + '-' + (dumpN++) + '.png', png);
} };
const patched = code.replace('boot();', "boot(); window.__render = () => render(); lastT = 0;");
sandbox.__dumpHook.dumpMain('direct-test');
console.log('direct dump done, files:', require('fs').readdirSync('/workspace/shots').join(','));
vm.runInContext(patched, sandbox, { filename: 'g.js' });
vm.runInContext('CTX = window.__raster; RS = 1;', sandbox);
console.log('hook in vm:', vm.runInContext('typeof window.__dumpHook', sandbox));
try { vm.runInContext('window.__dumpHook("vm-direct")', sandbox); console.log('vm-direct dump ok'); } catch (e) { console.log('vm-direct ERR:', e.message); }
function snap(name) {
  vm.runInContext('window.__render()', sandbox);
  fs.mkdirSync('/workspace/shots', { recursive: true });
  const png = encodePNG(1280, 720, raster.buf);
  fs.writeFileSync('/workspace/shots/' + name + '.png', png);
  let lit = 0, n = 0;
  for (let i = 0; i < raster.buf.length; i += 4000) { n++; if (raster.buf[i] + raster.buf[i+1] + raster.buf[i+2] > 40) lit++; }
  console.log('shot:', name, '| lit%', (lit/n*100).toFixed(1));
}

{
  const G = sandbox.__G;
  const p = G.player;
  key('keydown', 'Enter'); key('keyup', 'Enter');
  step(30);
  // 手动布置战斗场景：禁用波次，放置敌人
  G.waveActive = true; G.pending.length = 0; G.enemies.length = 0; G.spawnT = 9999;
  G.maxAlive = 99;
  function put(type, x, opts = {}) {
    G.pending.push({ type }); G.spawnT = 0;
    step(1);
    const e = G.enemies[G.enemies.length - 1];
    e.x = x; e.y = 596 - 38 * e.scale; e.state = 'chase'; e.onGround = true; e.airborne = false;
    e.cool = 99;
    Object.assign(e, opts);
    return e;
  }
  const g1 = put('grunt', p.x + 90);
  const h1 = put('heavy', p.x + 300);
  step(5);

  // 镜头1：idle 对峙
  snap('1-idle');

  // 镜头2：J 连斩第一段命中瞬间（带刀光/火花/顿帧）
  p.x = g1.x - 70; p.facing = 1; p.state = 'idle';
  key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
  for (let i = 0; i < 10; i++) step(1);
  snap('2-slash');

  // 镜头3：三段旋斩 + 断肢（强制破坏手臂）
  for (let i = 0; i < 12; i++) step(1);
  key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
  for (let i = 0; i < 11; i++) step(1);
  key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
  for (let i = 0; i < 13; i++) step(1);
  g1.breakPart('armF', 1);
  step(6);
  snap('3-spin-break');

  // 镜头4：蓄力重斩满蓄力
  p.state = 'idle'; p.atkName = null; p.x = h1.x - 90; p.facing = 1;
  key('keydown', 'KeyK');
  for (let i = 0; i < 34; i++) step(1);
  snap('4-charge');
  key('keyup', 'KeyK');
  for (let i = 0; i < 22; i++) step(1);
  snap('5-heavyhit');

  // 镜头6：挑空浮空追击
  p.state = 'idle'; p.atkName = null; p.iframes = 0; p.hp = 100;
  const g2 = put('grunt', p.x + 46);
  key('keydown', 'KeyI'); key('keyup', 'KeyI');
  for (let i = 0; i < 16; i++) step(1);
  key('keydown', 'Space'); step(6); key('keyup', 'Space');
  key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
  for (let i = 0; i < 8; i++) step(1);
  snap('6-juggle');

  // 镜头7：铁锤蓄力前兆 + 冲击波（可观察的攻击预警）
  p.state = 'idle'; p.atkName = null; p.iframes = 0; p.hp = 100; p.x = 1120; p.y = 596 - 38; p.vx = 0; p.vy = 0; p.facing = -1;
  G.enemies.length = 0; G.shocks.length = 0; G.needles.length = 0;
  const h2 = put('heavy', p.x + 220);
  h2.state = 'windup'; h2.atkKind = 'smash'; h2.windupT = 0.85; h2.st = 0.5; h2.cool = 99;
  G.shocks.push({ x: p.x - 80, dir: -1, spd: 430, life: 1.2 });
  for (let i = 0; i < 20; i++) step(1);
  snap('7-telegraph');

  // 镜头8：瞬步残影
  p.state = 'idle'; p.x = 900; p.facing = 1;
  key('keydown', 'KeyL'); key('keyup', 'KeyL');
  for (let i = 0; i < 6; i++) step(1);
  snap('8-dash');

  // 镜头9：千丝乱舞辐条
  G.enemies.length = 0; G.skillFx.length = 0; G.crescents.length = 0; G.ultFx = null;
  p.state = 'idle'; p.atkName = null; p.x = 1120; p.y = 596 - 38; p.facing = 1; p.hp = 100; p.iframes = 0; p.vx = 0; p.vy = 0; p.onGround = true;
  G.energy = 100;
  key('keydown', 'KeyU'); key('keyup', 'KeyU');
  for (let i = 0; i < 14; i++) step(1);
  snap('9-strings');

  // 镜头10：裂空新月飞行
  G.enemies.length = 0; G.skillFx.length = 0;
  p.state = 'idle'; p.x = 900; p.facing = 1; p.hp = 100; p.iframes = 0;
  G.energy = 100;
  key('keydown', 'KeyP'); key('keyup', 'KeyP');
  for (let i = 0; i < 16; i++) step(1);
  snap('10-crescent');

  // 镜头11：谢幕爆发
  G.enemies.length = 0; G.pending.length = 0; G.waveActive = true; G.interT = 999; G.wave = 5;
  put('grunt', p.x + 200); put('grunt', p.x + 320); put('heavy', p.x + 420);
  p.state = 'idle'; p.x = 1120; p.y = 596 - 38; p.facing = 1; p.hp = 100; p.iframes = 0; p.vx = 0; p.vy = 0; p.onGround = true;
  G.energy = 100;
  key('keydown', 'KeyH'); key('keyup', 'KeyH');
  for (let i = 0; i < 22; i++) step(1); // 0.37s 临近爆发
  snap('11-ult-charge');
  for (let i = 0; i < 6; i++) step(1); // 爆发瞬间
  snap('12-ult-burst');
}
console.log('done');
