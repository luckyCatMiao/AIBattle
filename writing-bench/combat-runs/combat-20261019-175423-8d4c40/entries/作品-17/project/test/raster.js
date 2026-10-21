/* 极简 Canvas 2D 软件光栅化器（测试用）：支持本游戏用到的 API 子集，输出 PNG。
 * 仅用于开发自测，不是游戏的一部分。
 */
'use strict';
const zlib = require('zlib');

/* ---------- PNG 编码 ---------- */
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 颜色解析 ---------- */
function parseColor(c) {
  if (typeof c !== 'string') return [255, 0, 255, 1];
  c = c.trim();
  if (c[0] === '#') {
    let r, g, b;
    if (c.length === 4) {
      r = parseInt(c[1] + c[1], 16); g = parseInt(c[2] + c[2], 16); b = parseInt(c[3] + c[3], 16);
    } else {
      r = parseInt(c.slice(1, 3), 16); g = parseInt(c.slice(3, 5), 16); b = parseInt(c.slice(5, 7), 16);
    }
    return [r, g, b, 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map(s => parseFloat(s));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  }
  return [255, 255, 255, 1]; // 命名色等兜底
}

/* ---------- 光栅化器 ---------- */
class Raster {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.buf = new Float32Array(w * h * 4);
    this.reset2D();
    this._stack = [];
    this._path = [];
    this._gradients = new Set();
  }

  reset2D() {
    this.m = [1, 0, 0, 1, 0, 0];
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.font = '10px sans-serif';
    this.textAlign = 'start';
  }

  clear() { this.buf.fill(0); }

  save() { this._stack.push({ m: [...this.m], a: this.globalAlpha, co: this.globalCompositeOperation, fs: this.fillStyle, ss: this.strokeStyle, lw: this.lineWidth, lc: this.lineCap }); }
  restore() {
    const s = this._stack.pop();
    if (!s) return;
    this.m = s.m; this.globalAlpha = s.a; this.globalCompositeOperation = s.co;
    this.fillStyle = s.fs; this.strokeStyle = s.ss; this.lineWidth = s.lw; this.lineCap = s.lc;
  }

  translate(x, y) { this._mul([1, 0, 0, 1, x, y]); }
  scale(x, y) { this._mul([x, 0, 0, y, 0, 0]); }
  rotate(r) { const c = Math.cos(r), s = Math.sin(r); this._mul([c, s, -s, c, 0, 0]); }
  _mul(n) {
    const m = this.m;
    this.m = [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  }
  _pt(x, y) { return [this.m[0] * x + this.m[2] * y + this.m[4], this.m[1] * x + this.m[3] * y + this.m[5]]; }

  beginPath() { this._path = []; this._sub = null; }
  moveTo(x, y) { this._sub = [this._pt(x, y)]; this._path.push(this._sub); }
  lineTo(x, y) { if (!this._sub) this.moveTo(x, y); else this._sub.push(this._pt(x, y)); }
  closePath() { if (this._sub && this._sub.length) this._sub.push(this._sub[0]); }
  arc(x, y, r, a0, a1, ccw) {
    let d = a1 - a0;
    if (ccw) { while (d > 0) d -= Math.PI * 2; } else { while (d < 0) d += Math.PI * 2; }
    const n = Math.max(6, Math.ceil(Math.abs(d) / (Math.PI / 14)));
    for (let i = 0; i <= n; i++) {
      const a = a0 + d * (i / n);
      const p = [x + Math.cos(a) * r, y + Math.sin(a) * r];
      if (i === 0) { if (!this._sub) this.moveTo(p[0], p[1]); else this.lineTo(p[0], p[1]); }
      else this.lineTo(p[0], p[1]);
    }
  }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
    let d = a1 - a0;
    if (ccw) { while (d > 0) d -= Math.PI * 2; } else { while (d < 0) d += Math.PI * 2; }
    const n = Math.max(8, Math.ceil(Math.abs(d) / (Math.PI / 16)));
    for (let i = 0; i <= n; i++) {
      const a = a0 + d * (i / n);
      const cx = Math.cos(a), sy = Math.sin(a);
      const p = [x + cx * rx * Math.cos(rot) - sy * ry * Math.sin(rot), y + cx * rx * Math.sin(rot) + sy * ry * Math.cos(rot)];
      if (i === 0) { if (!this._sub) this.moveTo(p[0], p[1]); else this.lineTo(p[0], p[1]); }
      else this.lineTo(p[0], p[1]);
    }
  }
  quadraticCurveTo(cx, cy, x, y) {
    if (!this._sub) return;
    const [x0, y0] = this._sub[this._sub.length - 1];
    const [x1, y1] = this._pt(cx, cy);
    const [x2, y2] = this._pt(x, y);
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, u = 1 - t;
      this._sub.push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]);
    }
  }

  _styleColor(style, x, y) {
    if (style && style.__grad) {
      // 渐变取点
      const g = style;
      let t;
      if (g.type === 'linear') {
        const dx = g.x1 - g.x0, dy = g.y1 - g.y0;
        const len2 = dx * dx + dy * dy || 1;
        // 注意：渐变坐标定义在“当前变换下”的空间——近似用逆变换后投影
        t = ((x - g.x0) * dx + (y - g.y0) * dy) / len2;
      } else {
        const d = Math.hypot(x - g.x1, y - g.y1);
        t = (d - g.r0) / ((g.r1 - g.r0) || 1);
      }
      t = Math.max(0, Math.min(1, t));
      const stops = g.stops;
      if (!stops.length) return [0, 0, 0, 0];
      let a = stops[0], b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
      }
      const span = (b[0] - a[0]) || 1;
      const k = Math.max(0, Math.min(1, (t - a[0]) / span));
      return [
        a[1][0] + (b[1][0] - a[1][0]) * k,
        a[1][1] + (b[1][1] - a[1][1]) * k,
        a[1][2] + (b[1][2] - a[1][2]) * k,
        a[1][3] + (b[1][3] - a[1][3]) * k,
      ];
    }
    return parseColor(style);
  }

  _put(x, y, r, g, b, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    a *= this.globalAlpha;
    if (this.globalCompositeOperation === 'lighter') {
      this.buf[i] = Math.min(255, this.buf[i] + r * a);
      this.buf[i + 1] = Math.min(255, this.buf[i + 1] + g * a);
      this.buf[i + 2] = Math.min(255, this.buf[i + 2] + b * a);
      this.buf[i + 3] = Math.min(255, this.buf[i + 3] + 255 * a);
    } else {
      const ia = 1 - a;
      this.buf[i] = r * a + this.buf[i] * ia;
      this.buf[i + 1] = g * a + this.buf[i + 1] * ia;
      this.buf[i + 2] = b * a + this.buf[i + 2] * ia;
      this.buf[i + 3] = Math.max(this.buf[i + 3], a * 255);
    }
  }

  fill() {
    // 扫描线 even-odd 填充（子路径隐式闭合，与 canvas 行为一致）
    for (const poly of this._path) {
      if (poly.length < 3) continue;
      let minY = 1e9, maxY = -1e9;
      for (const p of poly) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
      const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
      for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5;
        const xs = [];
        const n = poly.length;
        for (let i = 0; i < n; i++) {
          const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n];
          if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
            xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
          }
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const xa = Math.max(0, Math.floor(xs[i])), xb = Math.min(this.w - 1, Math.ceil(xs[i + 1]));
          for (let x = xa; x <= xb; x++) {
            const [r, g, b, a] = this._styleColor(this.fillStyle, x, y);
            this._put(x, y, r, g, b, a);
          }
        }
      }
    }
  }

  stroke() {
    const lw = Math.max(1, this.lineWidth * Math.hypot(this.m[0], this.m[1]));
    const half = lw / 2;
    for (const poly of this._path) {
      for (let i = 0; i < poly.length - 1; i++) {
        const [ax, ay] = poly[i], [bx, by] = poly[i + 1];
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (len < 0.01) continue;
        const steps = Math.ceil(len * 1.4);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = ax + dx * t, y = ay + dy * t;
          const [r, g, b, a] = this._styleColor(this.strokeStyle, x, y);
          const rr = Math.ceil(half);
          for (let oy = -rr; oy <= rr; oy++) {
            for (let ox = -rr; ox <= rr; ox++) {
              if (ox * ox + oy * oy <= half * half) this._put(x + ox, y + oy, r, g, b, a);
            }
          }
        }
      }
    }
  }

  fillRect(x, y, w, h) {
    const pts = [this._pt(x, y), this._pt(x + w, y), this._pt(x + w, y + h), this._pt(x, y + h)];
    this._path = [pts];
    this.fill();
  }
  strokeRect(x, y, w, h) {
    const pts = [this._pt(x, y), this._pt(x + w, y), this._pt(x + w, y + h), this._pt(x, y + h), this._pt(x, y)];
    this._path = [pts];
    this.stroke();
  }

  fillText(str, x, y) {
    // 文本用细条近似占位（只验证位置/存在性）
    const size = parseFloat((this.font.match(/(\d+(?:\.\d+)?)px/) || [0, 12])[1]);
    const w = String(str).length * size * 0.55;
    let x0 = x;
    if (this.textAlign === 'center') x0 = x - w / 2;
    else if (this.textAlign === 'right') x0 = x - w;
    const [r, g, b, a] = parseColor(this.fillStyle);
    const [ax, ay] = this._pt(x0, y - size * 0.8);
    const [bx, by] = this._pt(x0 + w, y);
    const xa = Math.max(0, Math.min(ax, bx) | 0), xb = Math.min(this.w - 1, Math.max(ax, bx) | 0);
    const ya = Math.max(0, Math.min(ay, by) | 0), yb = Math.min(this.h - 1, Math.max(ay, by) | 0);
    for (let yy = ya; yy <= yb; yy += 2) {
      for (let xx = xa; xx <= xb; xx += 2) this._put(xx, yy, r, g, b, a * 0.85);
    }
  }
  strokeText() {}

  createLinearGradient(x0, y0, x1, y1) {
    const g = { __grad: true, type: 'linear', x0, y0, x1, y1, stops: [],
      addColorStop(t, c) { g.stops.push([t, parseColor(c)]); g.stops.sort((a, b) => a[0] - b[0]); } };
    return g;
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const g = { __grad: true, type: 'radial', x0, y0, r0, x1, y1, r1, stops: [],
      addColorStop(t, c) { g.stops.push([t, parseColor(c)]); g.stops.sort((a, b) => a[0] - b[0]); } };
    return g;
  }
  measureText() { return { width: 10 }; }
  getImageData() { return { data: [] }; }

  toPNG() {
    const rgba = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h * 4; i++) rgba[i] = Math.max(0, Math.min(255, Math.round(this.buf[i])));
    return encodePNG(this.w, this.h, rgba);
  }
}

module.exports = { Raster };
