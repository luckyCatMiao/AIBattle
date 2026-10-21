'use strict';
// Shared helpers for local self-play testing (not used by the submitted agent).
const catalog = require('../catalog');

const W = 40, H = 24;
const SQ = Math.SQRT1_2;
const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-SQ, -SQ], UR: [SQ, -SQ], DL: [-SQ, SQ], DR: [SQ, SQ],
};

function dirTo(dx, dy) {
  if (!dx && !dy) return 'N';
  const a = Math.atan2(dy, dx);
  let best = 'N', bd = 9;
  for (const k of ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR']) {
    const ang = Math.atan2(DIRS[k][1], DIRS[k][0]);
    let d = Math.abs(((a - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

class Grid {
  constructor(tiles) { this.tiles = tiles; }
  wall(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    return this.tiles[ty * W + tx] === 1;
  }
  hits(x, y, r = 0.3) {
    const minx = Math.floor(x - r), maxx = Math.floor(x + r);
    const miny = Math.floor(y - r), maxy = Math.floor(y + r);
    for (let ty = miny; ty <= maxy; ty++) for (let tx = minx; tx <= maxx; tx++) {
      if (this.wall(tx, ty)) continue;
      const cx = Math.max(tx, Math.min(tx + 1, x));
      const cy = Math.max(ty, Math.min(ty + 1, y));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  }
  los(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return true;
    const steps = Math.max(1, Math.ceil(dist / 0.1));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.wall(Math.floor(x1 + dx * t), Math.floor(y1 + dy * t))) return false;
    }
    return true;
  }
  // clear walking corridor of radius r
  clear(x1, y1, x2, y2, r = 0.31) {
    const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 0.12));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.hits(x1 + dx * t, y1 + dy * t, r)) return false;
    }
    return true;
  }
  step(x, y, dir, speed = 3.0, dt = 0.05) {
    const [dx, dy] = DIRS[dir];
    const l = Math.hypot(dx, dy) || 1;
    const mx = dx / l * speed * dt, my = dy / l * speed * dt;
    let nx = x + mx;
    if (!this.hits(nx, y)) x = nx;
    let ny = y + my;
    if (!this.hits(x, ny)) y = ny;
    return [x, y];
  }
  astar(sx, sy, gx, gy) {
    const s = [Math.floor(sx), Math.floor(sy)], t = [Math.floor(gx), Math.floor(gy)];
    if (this.wall(t[0], t[1])) return null;
    const key = (x, y) => y * W + x;
    const open = [[0, s[0], s[1]]];
    const gs = new Float64Array(W * H).fill(Infinity);
    const from = new Int32Array(W * H).fill(-1);
    gs[key(s[0], s[1])] = 0;
    const h = (x, y) => Math.hypot(x - t[0], y - t[1]);
    const closed = new Uint8Array(W * H);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, y] = open.splice(bi, 1)[0];
      const k = key(x, y);
      if (closed[k]) continue;
      closed[k] = 1;
      if (x === t[0] && y === t[1]) {
        const path = [];
        let cur = k;
        while (cur !== -1) { path.push([cur % W + 0.5, Math.floor(cur / W) + 0.5]); cur = from[cur]; }
        path.reverse();
        return path.slice(1);
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (this.wall(nx, ny)) continue;
        if (dx && dy && (this.wall(x + dx, y) || this.wall(x, y + dy))) continue;
        const nk = key(nx, ny);
        if (closed[nk]) continue;
        const ng = gs[k] + (dx && dy ? 1.4142 : 1);
        if (ng < gs[nk]) { gs[nk] = ng; from[nk] = k; open.push([ng + h(nx, ny), nx, ny]); }
      }
    }
    return null;
  }
}

module.exports = { W, H, DIRS, dirTo, Grid };
